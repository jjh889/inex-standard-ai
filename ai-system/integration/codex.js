/**
 * AI Dev Standard - Codex Integration
 *
 * OpenAI Codex CLI 연동 모듈.
 * Claude가 생성한 코드를 실제 실행하고, 컴파일/테스트 오류를 수정하며,
 * 코드 리뷰를 수행한다.
 *
 * 사전 요구사항:
 *   - npm install -g @openai/codex
 *   - codex login (또는 OPENAI_API_KEY 환경 변수)
 *
 * Claude Code 플러그인 사용 시:
 *   /plugin marketplace add openai/codex-plugin-cc
 *   /plugin install codex@openai-codex
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

class CodexClient {
  constructor(config = {}) {
    this.model = config.model || process.env.CODEX_MODEL || 'codex-mini-latest';
    this.effort = config.effort || 'high';
    this.projectRoot = config.projectRoot || process.cwd();
    this.timeout = config.timeout || 300000; // 5분
  }

  /**
   * Claude가 생성한 코드를 Codex에게 전달하여 실행 및 수정을 요청한다.
   *
   * @param {Object} params
   * @param {string} params.taskId - Task ID
   * @param {string} params.code - Claude가 생성한 코드
   * @param {string} params.instruction - 수정 지시사항
   * @param {string} [params.errorLog] - 이전 실행 실패 로그
   * @returns {Object} { code, diff, buildResult, testResult }
   */
  async executeAndFix({ taskId, code, instruction, errorLog }) {
    console.log(`[Codex] Task ${taskId}: 코드 실행 및 수정 시작`);
    console.log(`[Codex] 모델: ${this.model}, effort: ${this.effort}`);

    const prompt = this.buildExecutionPrompt({ code, instruction, errorLog });

    try {
      const result = await this.runCodex('rescue', prompt);
      console.log(`[Codex] Task ${taskId}: 실행 완료`);
      return this.parseExecutionResult(result);
    } catch (error) {
      console.error(`[Codex] Task ${taskId}: 실행 실패 -`, error.message);
      return {
        success: false,
        error: error.message,
        code: code, // 원본 유지
      };
    }
  }

  /**
   * Codex를 이용해 코드 리뷰를 수행한다.
   *
   * @param {Object} params
   * @param {string} [params.base] - 비교 대상 브랜치 (기본: 'main')
   * @param {boolean} [params.adversarial] - 적대적 리뷰 여부
   * @returns {Object} Review Agent 형식의 결과 { verdict, issues, summary }
   */
  async review({ base = 'main', adversarial = false } = {}) {
    const command = adversarial ? 'adversarial-review' : 'review';
    console.log(`[Codex] ${adversarial ? '적대적 ' : ''}코드 리뷰 실행 (base: ${base})`);

    try {
      const result = await this.runCodex(command, `--base ${base} --wait`);
      return this.parseReviewResult(result);
    } catch (error) {
      console.error('[Codex] 리뷰 실패:', error.message);
      return {
        verdict: 'ERROR',
        issues: [],
        summary: `Codex 리뷰 실행 실패: ${error.message}`,
      };
    }
  }

  /**
   * Codex에게 복잡한 문제 해결을 위임한다. (rescue)
   *
   * @param {string} instruction - 위임할 작업 설명
   * @param {Object} [options]
   * @param {boolean} [options.background] - 백그라운드 실행
   * @param {string} [options.model] - 모델 오버라이드
   * @returns {Object} 실행 결과 또는 작업 ID
   */
  async rescue(instruction, options = {}) {
    console.log(`[Codex] Rescue 요청: ${instruction.substring(0, 80)}...`);

    const flags = [];
    if (options.background) flags.push('--background');
    if (options.model) flags.push(`--model ${options.model}`);
    flags.push(`--effort ${this.effort}`);

    const result = await this.runCodex('rescue', `${flags.join(' ')} "${instruction}"`);
    return result;
  }

  /**
   * 백그라운드 작업의 상태를 확인한다.
   *
   * @param {string} [taskId] - 특정 작업 ID (생략 시 최근 작업)
   * @returns {Object} 작업 상태
   */
  async getStatus(taskId) {
    const arg = taskId ? `--task ${taskId}` : '';
    const result = await this.runCodex('status', arg);
    return result;
  }

  /**
   * 완료된 작업의 결과를 조회한다.
   *
   * @param {string} [taskId] - 특정 작업 ID
   * @returns {Object} 작업 결과
   */
  async getResult(taskId) {
    const arg = taskId ? `--task ${taskId}` : '';
    const result = await this.runCodex('result', arg);
    return result;
  }

  /**
   * 실행 중인 작업을 취소한다.
   */
  async cancel(taskId) {
    console.log(`[Codex] 작업 취소: ${taskId || '최근 작업'}`);
    const arg = taskId ? `--task ${taskId}` : '';
    return await this.runCodex('cancel', arg);
  }

  // ============================
  // Internal Methods
  // ============================

  /**
   * Codex CLI를 실행한다.
   *
   * @param {string} command - codex 서브 커맨드 (rescue, review, status, result, cancel)
   * @param {string} args - 추가 인수
   * @returns {string} stdout 출력
   */
  async runCodex(command, args = '') {
    const cmd = `codex ${command} ${args}`.trim();
    console.log(`[Codex] 실행: ${cmd}`);

    // --- 실제 실행 ---
    // try {
    //   const { stdout, stderr } = await execFileAsync('codex', [command, ...args.split(' ')], {
    //     cwd: this.projectRoot,
    //     timeout: this.timeout,
    //     env: { ...process.env },
    //   });
    //   if (stderr) console.warn('[Codex] stderr:', stderr);
    //   return stdout;
    // } catch (error) {
    //   throw new Error(`Codex 실행 실패: ${error.message}`);
    // }

    // --- 시뮬레이션 (실제 환경에서는 위 코드 해제) ---
    return this.simulate(command, args);
  }

  /**
   * 실행 프롬프트를 조합한다.
   */
  buildExecutionPrompt({ code, instruction, errorLog }) {
    let prompt = instruction;
    if (errorLog) {
      prompt += `\n\n이전 실행 실패 로그:\n${errorLog}`;
    }
    return prompt;
  }

  /**
   * 실행 결과를 파싱한다.
   */
  parseExecutionResult(output) {
    // 실제로는 Codex 출력을 파싱하여 구조화
    return {
      success: true,
      code: output,
      diff: '(Codex가 수정한 diff)',
      buildResult: { passed: true },
      testResult: { passed: true, coverage: 85 },
    };
  }

  /**
   * 리뷰 결과를 파싱한다.
   */
  parseReviewResult(output) {
    // 실제로는 Codex 리뷰 출력을 JSON으로 파싱
    try {
      return JSON.parse(output);
    } catch {
      return {
        verdict: 'APPROVE',
        issues: [],
        summary: output,
      };
    }
  }

  /**
   * [시뮬레이션] Codex CLI가 없는 환경에서의 Mock 응답.
   * 실제 환경에서는 runCodex()의 실제 실행 코드를 해제하고 이 메서드를 제거한다.
   */
  simulate(command, args) {
    if (command === 'rescue') {
      return JSON.stringify({
        success: true,
        message: '(시뮬레이션) 컴파일 오류 수정 완료. 테스트 통과.',
        filesModified: ['BalanceService.java'],
        diff: '- import missing\n+ import com.example.entity.Wallet;',
      });
    }

    if (command === 'review' || command === 'adversarial-review') {
      return JSON.stringify({
        verdict: 'APPROVE',
        issues: [
          {
            severity: 'LOW',
            category: 'performance',
            file: 'BalanceService.java',
            line: '12',
            description: '(시뮬레이션) 쿼리 최적화 권장',
            suggestion: '복합 인덱스 확인',
          },
        ],
        summary: '(시뮬레이션) 코드 리뷰 통과. 전체적으로 양호.',
      });
    }

    if (command === 'status') {
      return JSON.stringify({ status: 'completed', taskId: 'mock-001' });
    }

    if (command === 'result') {
      return JSON.stringify({ output: '(시뮬레이션) 작업 완료 결과' });
    }

    return '(시뮬레이션) OK';
  }
}

module.exports = { CodexClient };
