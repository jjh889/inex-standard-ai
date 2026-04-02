/**
 * AI Dev Standard - Retry Manager
 *
 * 피드백 루프의 재시도 횟수를 관리한다.
 * 최대 3회까지 자동 재시도하며, 초과 시 FAILED 상태로 전환한다.
 */

class RetryManager {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
    this.retryMap = new Map(); // taskId → retryCount
  }

  /**
   * 해당 Task가 재시도 가능한지 확인한다.
   * @param {string} taskId
   * @returns {boolean}
   */
  canRetry(taskId) {
    const count = this.retryMap.get(taskId) || 0;
    return count < this.maxRetries;
  }

  /**
   * 재시도 횟수를 1 증가시키고 현재 횟수를 반환한다.
   * @param {string} taskId
   * @returns {number} 현재 재시도 횟수
   */
  increment(taskId) {
    const count = (this.retryMap.get(taskId) || 0) + 1;
    this.retryMap.set(taskId, count);
    return count;
  }

  /**
   * 해당 Task의 현재 재시도 횟수를 반환한다.
   * @param {string} taskId
   * @returns {number}
   */
  getCount(taskId) {
    return this.retryMap.get(taskId) || 0;
  }

  /**
   * 해당 Task의 재시도 카운터를 초기화한다.
   * @param {string} taskId
   */
  reset(taskId) {
    this.retryMap.delete(taskId);
  }

  /**
   * 전체 재시도 상태를 반환한다.
   * @returns {Object}
   */
  getStatus() {
    const status = {};
    for (const [taskId, count] of this.retryMap) {
      status[taskId] = {
        retryCount: count,
        maxRetries: this.maxRetries,
        canRetry: count < this.maxRetries,
      };
    }
    return status;
  }
}

module.exports = { RetryManager };
