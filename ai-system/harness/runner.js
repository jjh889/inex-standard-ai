/**
 * AI Dev Standard - Harness Runner v2.1
 *
 * 3-Agent 아키텍처 + AI Audit Log + Smart Retry 통합.
 *
 * Claude (설계 + 코드 생성)
 *    ↓
 * Codex (실행 + 수정)
 *    ↓
 * Harness (테스트 + 검증)
 *
 * v2.1 추가:
 *   - AuditLogger: Agent 간 전체 입출력 추적
 *   - SmartRetryManager: 실패 패턴 분석 + 자동 에스컬레이션
 *     → 같은 에러 2회 반복 시 Codex→Claude 에스컬레이션
 */

require('dotenv').config();

const { SmartRetryManager } = require('./smart-retry');
const { FeedbackInjector } = require('./feedback-injector');
const { Validator } = require('./validator');
const { AuditLogger } = require('./audit-logger');
const flow = require('../flows/feature-flow.json');

class HarnessRunner {
  constructor(config = {}) {
    this.maxRetries = config.maxRetries || flow.retryPolicy.maxRetries;
    this.retryManager = new SmartRetryManager(this.maxRetries);
    this.feedbackInjector = new FeedbackInjector();
    this.validator = new Validator();
    this.audit = new AuditLogger({ enableFileLog: config.enableFileLog ?? true });
    this.currentState = 'TODO';
    this.taskLog = [];
  }

  /**
   * 3-Agent 워크플로우를 실행한다.
   *
   * @param {Object} task - 실행할 Task 객체
   * @param {Object} agents - { claude, codex }
   */
  async run(task, agents) {
    console.log(`[Harness] Task ${task.id} 실행 시작`);
    this.audit.startTask(task.id, task);
    this.log(task.id, 'START', { state: this.currentState });

    try {
      // ── Step 1: Claude — 설계 + 코드 생성 ──
      this.transition(task.id, 'DESIGN');
      const claudeResult = await this.executeClaude(task, agents.claude);

      // ── Step 2: Codex — 실행 + 수정 ──
      this.transition(task.id, 'CODEX_EXEC');
      const codexResult = await this.executeCodex(task, agents.codex, claudeResult);

      if (!codexResult.success) {
        return this.handleFailure(task, agents, 'codex_exec', codexResult.error);
      }

      // ── Step 3: Harness — CI 테스트 검증 ──
      this.transition(task.id, 'CI_TEST');
      const ciResult = await this.executeCI(task, codexResult);

      if (!ciResult.passed) {
        return this.handleFailure(task, agents, 'ci', ciResult.error);
      }

      // ── Step 4: Codex — 코드 리뷰 (검증) ──
      this.transition(task.id, 'REVIEW');
      const reviewResult = await this.executeReview(task, agents.codex, codexResult);

      if (reviewResult.verdict === 'REJECT') {
        return this.handleFailure(task, agents, 'review', reviewResult);
      }

      // ── Step 5: 성공 ──
      this.transition(task.id, 'DONE');
      console.log(`[Harness] Task ${task.id} 전체 파이프라인 통과. Human 승인 대기 중.`);
      this.log(task.id, 'AWAITING_HUMAN_APPROVAL');

      const result = { success: true, state: 'DONE', task: task.id };
      this.audit.endTask(result);
      return result;
    } catch (error) {
      console.error(`[Harness] Task ${task.id} 실행 중 오류:`, error.message);
      this.transition(task.id, 'FAILED');
      const result = { success: false, state: 'FAILED', error: error.message };
      this.audit.endTask(result);
      return result;
    }
  }

  /**
   * Claude를 실행하여 설계 + 코드를 생성한다.
   */
  async executeClaude(task, claudeAgent) {
    const prompt = this.feedbackInjector.buildDevPrompt(task);
    console.log(`[Harness] Claude 호출 — 설계 + 코드 생성 (Task: ${task.id})`);

    this.audit.logClaude('generate', {
      promptLength: prompt.length,
      promptSnippet: prompt.substring(0, 500),
      hasReviewFeedback: !!task.reviewFeedback,
    });

    const result = await claudeAgent.generate(prompt);

    this.audit.logClaude('output', {
      codeLength: result.code?.length || 0,
      fileCount: result.files?.length || 0,
      hasTestCode: !!result.testCode,
    });

    this.log(task.id, 'CLAUDE_COMPLETE', { files: result.files?.length || 0 });
    return result;
  }

  /**
   * Codex를 실행하여 Claude의 코드를 실제 실행/수정한다.
   */
  async executeCodex(task, codexAgent, claudeResult) {
    console.log(`[Harness] Codex 호출 — 실행 + 수정 (Task: ${task.id})`);

    const result = await codexAgent.execute({
      taskId: task.id,
      code: claudeResult.code,
      testCode: claudeResult.testCode,
      files: claudeResult.files,
      instruction: '빌드하고 테스트를 실행하세요. 오류가 있으면 수정하세요.',
      errorLog: task.codexFeedback || null,
    });

    this.audit.logCodex('execute', {
      success: result.success,
      diff: result.diff,
      buildPassed: result.buildResult?.passed,
      testPassed: result.testResult?.passed,
      coverage: result.testResult?.coverage,
      errorMessage: result.error?.message || result.error,
    });

    this.log(task.id, 'CODEX_EXEC_COMPLETE', { success: result.success });
    return result;
  }

  /**
   * Harness가 CI 파이프라인을 실행하여 최종 검증한다.
   */
  async executeCI(task, codexResult) {
    console.log(`[Harness] CI 파이프라인 실행 — 테스트 + 검증 (Task: ${task.id})`);

    const ciResult = await this.validator.runCI(task, codexResult);

    this.audit.logHarness('ci_test', {
      passed: ciResult.passed,
      coverage: ciResult.coverage,
      duration: ciResult.duration,
      failedTests: ciResult.failedTests?.length || 0,
    });

    this.log(task.id, 'CI_COMPLETE', { passed: ciResult.passed });
    return ciResult;
  }

  /**
   * Codex가 코드 리뷰(검증)를 수행한다.
   */
  async executeReview(task, codexAgent, codexResult) {
    console.log(`[Harness] Codex 호출 — 코드 리뷰 (Task: ${task.id})`);

    const result = await codexAgent.review({
      taskId: task.id,
      diff: codexResult.diff || codexResult.code,
      tags: task.tags,
    });

    this.audit.logCodex('review', {
      verdict: result.verdict,
      issueCount: result.issues?.length || 0,
      criticalCount: result.issues?.filter((i) => i.severity === 'CRITICAL').length || 0,
      summary: result.summary,
    });

    this.log(task.id, 'REVIEW_COMPLETE', { verdict: result.verdict });
    return result;
  }

  /**
   * 실패 시 Smart Retry를 실행한다.
   *
   * 핵심: 단순 재시도가 아닌 실패 패턴 분석 후 피드백 라우팅을 결정한다.
   *   - 같은 에러 2회 반복 → Codex 대신 Claude에게 에스컬레이션
   *   - 기본 경로: 실행/CI 실패 → Codex, 리뷰 실패 → Claude
   */
  async handleFailure(task, agents, failureType, failureData) {
    const canRetry = this.retryManager.canRetry(task.id);

    if (!canRetry) {
      console.error(`[Harness] Task ${task.id} 최대 재시도 횟수(${this.maxRetries}) 초과. FAILED 처리.`);

      this.audit.logFeedbackRouting({
        failureType,
        routedTo: 'NONE',
        reason: `최대 재시도 횟수(${this.maxRetries}) 초과`,
        retryCount: this.retryManager.getCount(task.id),
        escalated: false,
      });

      this.transition(task.id, 'FAILED');
      this.log(task.id, 'MAX_RETRY_EXCEEDED', { retries: this.maxRetries });

      const stats = this.retryManager.getStats(task.id);
      const result = { success: false, state: 'FAILED', reason: 'max_retry_exceeded', stats };
      this.audit.endTask(result);
      return result;
    }

    // Smart Retry: 실패 패턴 분석 + 에스컬레이션 판단
    const { retryCount, escalation } = this.retryManager.recordFailure(
      task.id, failureType, failureData
    );

    // ── 에스컬레이션 발생: 기존 대상이 아닌 다른 Agent로 피드백 라우팅 ──
    if (escalation) {
      console.log(`[Harness] ⚡ 에스컬레이션 발생: ${escalation.originalTarget} → ${escalation.escalatedTarget}`);
      console.log(`[Harness]    사유: ${escalation.reason}`);

      this.audit.logFeedbackRouting({
        failureType,
        routedTo: escalation.escalatedTarget,
        reason: escalation.reason,
        retryCount,
        escalated: true,
      });

      // Codex 실패가 반복 → Claude에게 재설계 요청
      if (escalation.escalatedTarget === 'claude') {
        task.reviewFeedback = this.feedbackInjector.extractFeedback(failureType, failureData)
          + '\n\n[에스컬레이션] ' + escalation.reason;
        task.codexFeedback = null; // Codex 피드백 초기화
      }
    } else {
      // ── 기본 피드백 라우팅 ──
      let routedTo;
      if (failureType === 'review') {
        task.reviewFeedback = this.feedbackInjector.extractFeedback('review', failureData);
        routedTo = 'claude';
      } else {
        task.codexFeedback = this.feedbackInjector.extractFeedback(failureType, failureData);
        routedTo = 'codex';
      }

      console.log(`[Harness] Task ${task.id} ${failureType} 실패. 재시도 ${retryCount}/${this.maxRetries} → ${routedTo}`);

      this.audit.logFeedbackRouting({
        failureType,
        routedTo,
        reason: `기본 라우팅: ${failureType} → ${routedTo}`,
        retryCount,
        escalated: false,
      });
    }

    this.log(task.id, 'RETRY', { attempt: retryCount, type: failureType, escalated: !!escalation });
    return this.run(task, agents);
  }

  /**
   * 상태 전이를 수행한다.
   */
  transition(taskId, newState) {
    const validStates = Object.keys(flow.states);
    if (!validStates.includes(newState)) {
      throw new Error(`Invalid state: ${newState}`);
    }

    const oldState = this.currentState;
    this.currentState = newState;
    this.audit.logTransition(oldState, newState, `${taskId}`);
    console.log(`[Harness] Task ${taskId}: ${oldState} → ${newState}`);
  }

  log(taskId, event, data = {}) {
    this.taskLog.push({
      timestamp: new Date().toISOString(),
      taskId,
      event,
      state: this.currentState,
      ...data,
    });
  }

  getLogs() {
    return this.taskLog;
  }

  /**
   * 감사 보고서를 반환한다.
   */
  getAuditReport() {
    return this.audit.getReport();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const taskIdArg = args.find((a) => a.startsWith('--task-id='));
  const taskId = taskIdArg ? taskIdArg.split('=')[1] : null;

  if (!taskId) {
    console.log('AI Dev Standard Harness Runner v2.1');
    console.log('');
    console.log('3-Agent + Audit Log + Smart Retry');
    console.log('  Claude  → 설계 + 코드 생성');
    console.log('  Codex   → 실행 + 수정 + 리뷰');
    console.log('  Harness → 테스트 + 검증 + 피드백 라우팅');
    console.log('');
    console.log('  Smart Retry: 같은 에러 2회 반복 → 에스컬레이션');
    console.log('  Audit Log:   logs/audit/ 에 전체 추적 로그 저장');
    console.log('');
    console.log('Usage: node runner.js --task-id=TASK-001');
    process.exit(0);
  }
}

module.exports = { HarnessRunner };
