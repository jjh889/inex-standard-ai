/**
 * AI Dev Standard - Smart Retry Manager
 *
 * 단순 횟수 카운팅이 아닌, 실패 패턴을 분석하여
 * 자동 에스컬레이션을 수행하는 지능형 재시도 관리자.
 *
 * 핵심 로직:
 *   1. 에러 히스토리를 축적하여 패턴 분석
 *   2. 같은 에러가 2회 반복되면 → 다른 Agent로 에스컬레이션
 *   3. Codex가 같은 빌드 에러를 못 고치면 → Claude에게 재설계 요청
 *   4. 실패 유형별 통계를 제공하여 디버깅 지원
 */

class SmartRetryManager {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
    this.retryMap = new Map();     // taskId → retryCount
    this.errorHistory = new Map(); // taskId → Array<ErrorEntry>
  }

  /**
   * 재시도 가능 여부를 확인한다.
   */
  canRetry(taskId) {
    const count = this.retryMap.get(taskId) || 0;
    return count < this.maxRetries;
  }

  /**
   * 재시도 횟수를 증가시키고, 에러를 히스토리에 기록한다.
   *
   * @param {string} taskId
   * @param {string} failureType - 'codex_exec' | 'ci' | 'review'
   * @param {Object|string} errorData - 에러 상세 데이터
   * @returns {Object} { retryCount, escalation }
   */
  recordFailure(taskId, failureType, errorData) {
    // 횟수 증가
    const count = (this.retryMap.get(taskId) || 0) + 1;
    this.retryMap.set(taskId, count);

    // 에러 히스토리 기록
    const history = this.errorHistory.get(taskId) || [];
    const errorSignature = this.extractErrorSignature(failureType, errorData);

    history.push({
      attempt: count,
      timestamp: new Date().toISOString(),
      failureType,
      errorSignature,
      errorData: typeof errorData === 'string' ? errorData : errorData?.message || JSON.stringify(errorData).substring(0, 200),
    });
    this.errorHistory.set(taskId, history);

    // 에스컬레이션 판단
    const escalation = this.analyzeEscalation(taskId, failureType, errorSignature);

    return { retryCount: count, escalation };
  }

  /**
   * 에러 패턴을 분석하여 에스컬레이션 여부를 결정한다.
   *
   * 규칙:
   *   1. 같은 에러 시그니처가 2회 반복 → 에스컬레이션
   *   2. Codex 실행 실패가 2회 연속 → Claude에게 재설계 요청
   *   3. CI 실패가 2회 연속 (같은 테스트) → Claude에게 재설계 요청
   *
   * @returns {Object|null} 에스컬레이션 정보 또는 null
   */
  analyzeEscalation(taskId, currentFailureType, currentSignature) {
    const history = this.errorHistory.get(taskId) || [];

    if (history.length < 2) return null;

    // ── 규칙 1: 같은 에러 시그니처 2회 반복 ──
    const sameSignatureCount = history.filter(
      (h) => h.errorSignature === currentSignature
    ).length;

    if (sameSignatureCount >= 2) {
      // Codex가 같은 문제를 못 고침 → Claude에게 보내야 함
      if (currentFailureType === 'codex_exec' || currentFailureType === 'ci') {
        return {
          type: 'ESCALATE_TO_CLAUDE',
          reason: `동일 에러 ${sameSignatureCount}회 반복. Codex 실행 수정으로 해결 불가 → Claude 재설계 필요.`,
          originalTarget: 'codex',
          escalatedTarget: 'claude',
          repeatedError: currentSignature,
        };
      }
    }

    // ── 규칙 2: 같은 failureType 연속 2회 ──
    const lastTwo = history.slice(-2);
    if (
      lastTwo.length === 2 &&
      lastTwo[0].failureType === lastTwo[1].failureType &&
      lastTwo[0].failureType !== 'review' // review는 항상 Claude로 가므로 에스컬레이션 불필요
    ) {
      const consecutiveType = lastTwo[0].failureType;

      // Codex 실행이 연속 2회 실패 → 설계 문제일 가능성
      if (consecutiveType === 'codex_exec') {
        return {
          type: 'ESCALATE_TO_CLAUDE',
          reason: `Codex 실행이 연속 2회 실패. 실행 레벨이 아닌 설계 레벨 문제 가능성 → Claude 재설계 요청.`,
          originalTarget: 'codex',
          escalatedTarget: 'claude',
          consecutiveFailures: 2,
        };
      }

      // CI가 연속 2회 실패 → 테스트/로직 설계 문제
      if (consecutiveType === 'ci') {
        return {
          type: 'ESCALATE_TO_CLAUDE',
          reason: `CI 테스트가 연속 2회 실패. 테스트 또는 로직 설계 재검토 필요 → Claude 재설계 요청.`,
          originalTarget: 'codex',
          escalatedTarget: 'claude',
          consecutiveFailures: 2,
        };
      }
    }

    return null; // 에스컬레이션 없음 → 기존 Agent에게 피드백
  }

  /**
   * 에러에서 비교 가능한 시그니처를 추출한다.
   * 같은 종류의 에러인지 판별하는 핵심 로직.
   */
  extractErrorSignature(failureType, errorData) {
    if (!errorData) return `${failureType}:unknown`;

    if (typeof errorData === 'string') {
      // 에러 메시지에서 핵심 패턴 추출 (줄번호, 변수명 등 제거)
      return `${failureType}:${this.normalizeError(errorData)}`;
    }

    // 구조화된 에러
    if (errorData.message) {
      return `${failureType}:${this.normalizeError(errorData.message)}`;
    }

    // Review 에러: 카테고리 기반 시그니처
    if (errorData.issues && errorData.issues.length > 0) {
      const categories = errorData.issues
        .filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH')
        .map((i) => `${i.severity}:${i.category}`)
        .sort()
        .join(',');
      return `${failureType}:${categories || 'general'}`;
    }

    return `${failureType}:${JSON.stringify(errorData).substring(0, 100)}`;
  }

  /**
   * 에러 메시지를 정규화하여 비교 가능하게 만든다.
   * 줄번호, 파일 경로 등 변하는 부분을 제거한다.
   */
  normalizeError(message) {
    return message
      .replace(/line \d+/gi, 'line N')
      .replace(/:\d+/g, ':N')
      .replace(/\b\d+\b/g, 'N')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  /**
   * 해당 Task의 에러 히스토리를 반환한다.
   */
  getHistory(taskId) {
    return this.errorHistory.get(taskId) || [];
  }

  /**
   * 해당 Task의 실패 통계를 반환한다.
   */
  getStats(taskId) {
    const history = this.getHistory(taskId);
    const byType = {};
    const bySignature = {};

    history.forEach((h) => {
      byType[h.failureType] = (byType[h.failureType] || 0) + 1;
      bySignature[h.errorSignature] = (bySignature[h.errorSignature] || 0) + 1;
    });

    const repeatedErrors = Object.entries(bySignature)
      .filter(([, count]) => count >= 2)
      .map(([sig, count]) => ({ signature: sig, count }));

    return {
      totalFailures: history.length,
      byType,
      repeatedErrors,
      hasRepeatedPattern: repeatedErrors.length > 0,
    };
  }

  /**
   * 현재 재시도 횟수를 반환한다.
   */
  getCount(taskId) {
    return this.retryMap.get(taskId) || 0;
  }

  /**
   * 초기화한다.
   */
  reset(taskId) {
    this.retryMap.delete(taskId);
    this.errorHistory.delete(taskId);
  }
}

module.exports = { SmartRetryManager };
