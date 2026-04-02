/**
 * AI Dev Standard - Validator
 *
 * CI 파이프라인 실행 및 코드 검증을 담당한다.
 * 실제 환경에서는 GitLab CI API를 호출하여 파이프라인을 트리거한다.
 */

class Validator {
  constructor(config = {}) {
    this.ciTimeout = config.ciTimeout || 300000; // 5분 기본 타임아웃
    this.minCoverage = config.minCoverage || 80;
  }

  /**
   * CI 파이프라인을 실행하고 결과를 반환한다.
   *
   * @param {Object} task - Task 객체
   * @param {Object} devResult - Dev Agent의 출력 결과
   * @returns {Object} { passed: boolean, error?: string, coverage?: number, failedTests?: Array }
   */
  async runCI(task, devResult) {
    console.log(`[Validator] CI 파이프라인 실행 - Task: ${task.id}`);

    // --- 실제 구현 시 아래를 GitLab CI API 호출로 교체 ---
    // const gitlab = require('../integration/gitlab');
    // const pipeline = await gitlab.triggerPipeline(task.branchName);
    // return await gitlab.waitForPipeline(pipeline.id, this.ciTimeout);

    // 샘플: 검증 로직 시뮬레이션
    return this.simulateCI(task, devResult);
  }

  /**
   * CI 실행 결과를 검증한다.
   */
  validateResult(ciResult) {
    const issues = [];

    if (!ciResult.passed) {
      issues.push({ type: 'test_failure', message: '테스트 실패' });
    }

    if (ciResult.coverage && ciResult.coverage < this.minCoverage) {
      issues.push({
        type: 'low_coverage',
        message: `테스트 커버리지 ${ciResult.coverage}% (최소 ${this.minCoverage}% 필요)`,
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * [샘플용] CI 실행을 시뮬레이션한다.
   * 실제 환경에서는 이 메서드를 제거하고 runCI에서 GitLab API를 직접 호출한다.
   */
  async simulateCI(task, devResult) {
    console.log(`[Validator] (시뮬레이션) CI 실행 중...`);

    // 시뮬레이션: 항상 통과
    return {
      passed: true,
      coverage: 85,
      duration: 12000,
      failedTests: [],
    };
  }
}

// CLI 실행
if (require.main === module) {
  console.log('AI Dev Standard - Validator');
  console.log('CI 파이프라인 검증 모듈');
  console.log('');
  console.log('설정:');
  console.log(`  최소 테스트 커버리지: 80%`);
  console.log(`  CI 타임아웃: 300초`);
}

module.exports = { Validator };
