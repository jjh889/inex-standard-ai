/**
 * AI Dev Standard - Feedback Injector
 *
 * 실패 사유를 프롬프트에 주입(Context Injection)하여
 * Dev Agent가 이전 실패를 반영한 코드를 재생성하도록 한다.
 */

const fs = require('fs');
const path = require('path');

class FeedbackInjector {
  constructor() {
    this.promptsDir = path.join(__dirname, '..', 'prompts');
  }

  /**
   * Dev Agent용 프롬프트를 생성한다.
   * Task에 reviewFeedback이 있으면 이전 실패 사유를 포함한다.
   *
   * @param {Object} task
   * @param {string} task.id - Task ID
   * @param {string} task.description - Task 설명
   * @param {string} task.context - 시스템 컨텍스트 (DB 스키마, API 명세 등)
   * @param {string} [task.reviewFeedback] - 이전 리뷰 실패 사유
   * @returns {string} 조합된 프롬프트
   */
  buildDevPrompt(task) {
    const template = this.loadTemplate('dev-prompt.md');
    const systemContext = task.context || '(컨텍스트 없음)';
    const feedback = task.reviewFeedback || '(최초 실행 - 이전 피드백 없음)';

    // 템플릿의 변수를 실제 값으로 치환
    const prompt = template
      .replace(/\{\{system_context\}\}/g, systemContext)
      .replace(/\{\{task\}\}/g, task.description)
      .replace(/\{\{review_feedback\}\}/g, feedback);

    return prompt;
  }

  /**
   * Review Agent용 프롬프트를 생성한다.
   *
   * @param {Object} task
   * @param {Object} devResult - Dev Agent의 출력 결과
   * @returns {string} 조합된 프롬프트
   */
  buildReviewPrompt(task, devResult) {
    const template = this.loadTemplate('review-prompt.md');
    const prDiff = devResult.diff || devResult.code || '(diff 없음)';
    const tags = task.tags ? task.tags.join(', ') : '(태그 없음)';

    const prompt = template
      .replace(/\{\{branch_name\}\}/g, `feature/AI-${task.id}`)
      .replace(/\{\{task_id\}\}/g, task.id)
      .replace(/\{\{task_tags\}\}/g, tags)
      .replace(/\{\{pr_diff\}\}/g, prDiff)
      .replace(/\{\{system_context\}\}/g, task.context || '(컨텍스트 없음)');

    return prompt;
  }

  /**
   * 실패 유형에 따라 피드백 메시지를 추출한다.
   *
   * 피드백 라우팅:
   *   - codex_exec / ci 실패 → Codex에게 전달 (실행 레벨 수정)
   *   - review 실패 → Claude에게 전달 (설계 레벨 수정)
   *
   * @param {string} failureType - 'codex_exec' | 'ci' | 'review'
   * @param {Object} failureData - 실패 상세 데이터
   * @returns {string} 피드백 메시지
   */
  extractFeedback(failureType, failureData) {
    if (failureType === 'codex_exec') {
      return this.formatCodexExecFeedback(failureData);
    }

    if (failureType === 'ci') {
      return this.formatCIFeedback(failureData);
    }

    if (failureType === 'review') {
      return this.formatReviewFeedback(failureData);
    }

    return `알 수 없는 실패 유형: ${failureType}`;
  }

  /**
   * Codex 실행 실패 사유를 포맷팅한다.
   * → Codex에게 전달되어 실행 레벨 수정에 활용
   */
  formatCodexExecFeedback(execError) {
    const lines = [
      '[Codex 실행 실패 — 실행 레벨 수정 필요]',
      `에러 메시지: ${execError.message || execError}`,
    ];

    if (execError.buildErrors) {
      lines.push('빌드 오류:');
      execError.buildErrors.forEach((err) => {
        lines.push(`  - ${err.file}:${err.line} ${err.message}`);
      });
    }

    if (execError.runtimeErrors) {
      lines.push('런타임 오류:');
      execError.runtimeErrors.forEach((err) => {
        lines.push(`  - ${err}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * CI 실패 사유를 포맷팅한다.
   * → Codex에게 전달되어 테스트 수정에 활용
   */
  formatCIFeedback(ciError) {
    const lines = [
      '[CI 테스트 실패]',
      `에러 메시지: ${ciError.message || ciError}`,
    ];

    if (ciError.failedTests) {
      lines.push('실패한 테스트:');
      ciError.failedTests.forEach((test) => {
        lines.push(`  - ${test.name}: ${test.error}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Codex Review 거절 사유를 포맷팅한다.
   * → Claude에게 전달되어 설계 레벨 수정에 활용
   */
  formatReviewFeedback(reviewResult) {
    const lines = [
      '[Review Agent 거절 사유]',
      `요약: ${reviewResult.summary}`,
      '',
      '발견된 이슈:',
    ];

    if (reviewResult.issues) {
      reviewResult.issues.forEach((issue, i) => {
        lines.push(`  ${i + 1}. [${issue.severity}][${issue.category}] ${issue.description}`);
        if (issue.file) lines.push(`     파일: ${issue.file}:${issue.line}`);
        if (issue.suggestion) lines.push(`     수정 방향: ${issue.suggestion}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 프롬프트 템플릿 파일을 로드한다.
   */
  loadTemplate(filename) {
    const filePath = path.join(this.promptsDir, filename);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.warn(`[FeedbackInjector] 템플릿 로드 실패: ${filename}. 기본 템플릿 사용.`);
      return this.getDefaultTemplate(filename);
    }
  }

  /**
   * 템플릿 파일이 없을 경우 기본 템플릿을 반환한다.
   */
  getDefaultTemplate(filename) {
    if (filename.includes('dev')) {
      return '요구사항: {{task}}\n이전 피드백: {{review_feedback}}\n컨텍스트: {{system_context}}';
    }
    if (filename.includes('review')) {
      return 'PR Diff: {{pr_diff}}\nTask: {{task_id}}\n태그: {{task_tags}}';
    }
    return '';
  }
}

module.exports = { FeedbackInjector };
