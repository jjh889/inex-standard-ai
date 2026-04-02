/**
 * AI Dev Standard - AI Audit Logger
 *
 * Agent 간 전체 입출력을 구조화하여 추적하는 감사 로거.
 * 문제 발생 시 "Claude 문제인지 / Codex 문제인지 / Harness 문제인지"를
 * 즉시 파악할 수 있도록 모든 단계의 입출력을 기록한다.
 *
 * 기록 항목:
 *   - Claude: 입력 프롬프트 + 생성된 코드
 *   - Codex: 입력 코드 + 실행 결과 + 수정 diff
 *   - Harness: CI 테스트 결과 + 피드백 라우팅 결정
 *   - 피드백: 어떤 에러가 어떤 Agent에게 전달되었는지
 */

const fs = require('fs');
const path = require('path');

class AuditLogger {
  constructor(config = {}) {
    this.logDir = config.logDir || path.join(process.cwd(), 'logs', 'audit');
    this.entries = [];
    this.taskId = null;
    this.sessionId = this.generateSessionId();
    this.enableFileLog = config.enableFileLog !== false;
  }

  /**
   * Task 실행 시작을 기록한다.
   */
  startTask(taskId, task) {
    this.taskId = taskId;
    this.record('TASK_START', 'harness', {
      taskId,
      description: task.description,
      tags: task.tags,
      hasContext: !!task.context,
    });
  }

  /**
   * Claude의 입출력을 기록한다.
   *
   * @param {string} phase - 'generate'
   * @param {Object} data
   * @param {string} data.promptSnippet - 프롬프트 앞 500자 (전체 저장 시 민감정보 위험)
   * @param {number} data.promptLength - 전체 프롬프트 길이
   * @param {number} data.codeLength - 생성된 코드 길이
   * @param {number} data.fileCount - 생성된 파일 수
   * @param {boolean} data.hasReviewFeedback - 이전 리뷰 피드백 포함 여부
   */
  logClaude(phase, data) {
    this.record(`CLAUDE_${phase.toUpperCase()}`, 'claude', {
      ...data,
      // 민감 정보 보호: 프롬프트 전체가 아닌 메타데이터만 기록
      promptSnippet: data.promptSnippet
        ? data.promptSnippet.substring(0, 500) + '...'
        : undefined,
    });
  }

  /**
   * Codex의 입출력을 기록한다.
   *
   * @param {string} phase - 'execute' | 'review'
   * @param {Object} data
   * @param {boolean} data.success
   * @param {string} data.diff - 수정 diff (앞 1000자)
   * @param {Object} data.buildResult
   * @param {Object} data.testResult
   * @param {string} data.verdict - 리뷰 판정 (review phase)
   * @param {Array} data.issues - 발견된 이슈 목록 (review phase)
   * @param {string} data.errorMessage - 실패 시 에러 메시지
   */
  logCodex(phase, data) {
    this.record(`CODEX_${phase.toUpperCase()}`, 'codex', {
      ...data,
      diff: data.diff ? data.diff.substring(0, 1000) : undefined,
    });
  }

  /**
   * Harness의 CI 검증 결과를 기록한다.
   */
  logHarness(phase, data) {
    this.record(`HARNESS_${phase.toUpperCase()}`, 'harness', data);
  }

  /**
   * 피드백 라우팅 결정을 기록한다.
   * 디버깅 시 가장 중요한 로그 — 왜 이 Agent에게 피드백이 갔는지 추적.
   *
   * @param {Object} data
   * @param {string} data.failureType - 실패 유형
   * @param {string} data.routedTo - 피드백 대상 Agent
   * @param {string} data.reason - 라우팅 사유
   * @param {number} data.retryCount - 현재 재시도 횟수
   * @param {boolean} data.escalated - 에스컬레이션 여부
   */
  logFeedbackRouting(data) {
    this.record('FEEDBACK_ROUTING', 'harness', data);
  }

  /**
   * 상태 전이를 기록한다.
   */
  logTransition(fromState, toState, trigger) {
    this.record('STATE_TRANSITION', 'harness', {
      from: fromState,
      to: toState,
      trigger,
    });
  }

  /**
   * Task 종료를 기록하고 감사 로그를 파일로 저장한다.
   */
  endTask(result) {
    this.record('TASK_END', 'harness', {
      success: result.success,
      finalState: result.state,
      reason: result.reason || null,
      totalEntries: this.entries.length,
    });

    if (this.enableFileLog) {
      this.saveToFile();
    }

    return this.getReport();
  }

  // ============================
  // Internal
  // ============================

  record(event, agent, data = {}) {
    const entry = {
      seq: this.entries.length + 1,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      taskId: this.taskId,
      event,
      agent,
      ...data,
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * 전체 감사 보고서를 생성한다.
   * 디버깅 시 이 보고서만 보면 전체 흐름을 파악할 수 있다.
   */
  getReport() {
    const claudeEntries = this.entries.filter((e) => e.agent === 'claude');
    const codexEntries = this.entries.filter((e) => e.agent === 'codex');
    const routingEntries = this.entries.filter((e) => e.event === 'FEEDBACK_ROUTING');
    const escalations = routingEntries.filter((e) => e.escalated);

    return {
      sessionId: this.sessionId,
      taskId: this.taskId,
      totalEvents: this.entries.length,
      summary: {
        claudeCalls: claudeEntries.length,
        codexCalls: codexEntries.length,
        feedbackRoutings: routingEntries.length,
        escalations: escalations.length,
      },
      timeline: this.entries.map((e) => ({
        seq: e.seq,
        time: e.timestamp,
        event: e.event,
        agent: e.agent,
      })),
      entries: this.entries,
    };
  }

  /**
   * 감사 로그를 JSON 파일로 저장한다.
   */
  saveToFile() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const filename = `${this.taskId}_${this.sessionId}.json`;
      const filePath = path.join(this.logDir, filename);

      fs.writeFileSync(filePath, JSON.stringify(this.getReport(), null, 2));
      console.log(`[AuditLog] 감사 로그 저장: ${filePath}`);
    } catch (error) {
      console.error('[AuditLog] 파일 저장 실패:', error.message);
    }
  }

  generateSessionId() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8);
    return `${date}_${rand}`;
  }
}

module.exports = { AuditLogger };
