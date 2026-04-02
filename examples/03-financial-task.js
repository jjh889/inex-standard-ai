/**
 * 예제 03: 금융 로직 [FINANCIAL] — Codex 적대적 리뷰 포함
 *
 * Claude가 출금 로직을 설계 → Codex가 실행 → Codex 적대적 리뷰(adversarial)에서
 * 트랜잭션 격리 수준 문제로 REJECT → Claude가 재설계 → 최종 통과
 *
 * 실행:
 *   node examples/03-financial-task.js
 *
 * 핵심:
 *   - 리뷰 REJECT → Claude에게 설계 수정 피드백 (설계 레벨)
 *   - [FINANCIAL] → Codex adversarial review + Human 2인 승인
 */

const { HarnessRunner } = require('../ai-system/harness/runner');
const { SlackNotifier } = require('../ai-system/integration/slack');

let claudeAttempt = 0;
const claude = {
  async generate(prompt) {
    claudeAttempt++;
    if (claudeAttempt === 1) {
      console.log('  [Claude] 1차 설계: KRW 출금 서비스 (READ_COMMITTED)\n');
      return {
        code: '// v1: @Transactional (기본 격리 수준)',
        testCode: '// 기본 테스트 3개',
        files: [{ path: 'WithdrawService.java', content: '...' }],
        diff: '+ WithdrawService.java (v1)',
      };
    }
    console.log('  [Claude] 2차 재설계: 피드백 반영 → REPEATABLE_READ + 비관적 락');
    if (prompt.includes('트랜잭션 격리')) {
      console.log('  [Claude] ✓ Codex 리뷰 피드백이 프롬프트에 주입됨\n');
    }
    return {
      code: '// v2: @Transactional(isolation = REPEATABLE_READ) + @Lock(PESSIMISTIC_WRITE)',
      testCode: '// 기본 테스트 3개 + 동시성 테스트',
      files: [{ path: 'WithdrawService.java', content: '...' }],
      diff: '+ WithdrawService.java (v2)',
    };
  },
};

let codexReviewAttempt = 0;
const codex = {
  async execute({ taskId }) {
    console.log('  [Codex] 빌드 + 테스트 실행 → 성공\n');
    return {
      success: true,
      code: '...',
      diff: '...',
      buildResult: { passed: true },
      testResult: { passed: true, coverage: 85 },
    };
  },

  async review({ taskId, tags }) {
    codexReviewAttempt++;
    const isFinancial = tags?.includes('FINANCIAL');
    const reviewType = isFinancial ? '적대적 리뷰 (adversarial)' : '표준 리뷰';

    if (codexReviewAttempt === 1) {
      console.log(`  [Codex] ${reviewType}: CRITICAL 이슈 발견`);
      console.log('  [Codex] → REJECT (금융 무결성 위반)\n');
      return {
        verdict: 'REJECT',
        issues: [
          {
            severity: 'CRITICAL',
            category: 'financial',
            file: 'WithdrawService.java',
            line: '10',
            description: 'READ_COMMITTED 격리 수준. 동시 출금 시 Double Spending 가능.',
            suggestion: 'REPEATABLE_READ + SELECT FOR UPDATE 적용',
          },
        ],
        summary: '금융 로직 무결성 위반. 트랜잭션 격리 수준 및 동시성 제어 필요.',
      };
    }

    console.log(`  [Codex] ${reviewType}: 이전 이슈 해결 확인`);
    console.log('  [Codex] → APPROVE\n');
    return {
      verdict: 'APPROVE',
      issues: [],
      summary: '금융 로직 무결성 검증 통과. REPEATABLE_READ + 비관적 락 적용 확인.',
    };
  },
};

const task = {
  id: 'TASK-042',
  description: 'KRW 출금 API 구현',
  tags: ['FINANCIAL', 'business-logic'],
  context: 'wallet(id, user_id, currency, balance, locked_balance)',
};

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 03: 금융 로직 [FINANCIAL]                          ║');
  console.log('║  리뷰 REJECT → Claude 재설계 (설계 레벨 피드백)          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const runner = new HarnessRunner();
  const slack = new SlackNotifier();
  const result = await runner.run(task, { claude, codex });

  console.log('\n┌─── 실행 결과 ───────────────────────────────────────┐');
  console.log(`│ 성공: ${result.success}  Claude: ${claudeAttempt}회  Codex리뷰: ${codexReviewAttempt}회`);
  console.log('├────────────────────────────────────────────────────┤');
  console.log('│ [핵심] 리뷰 실패 → Claude에게 설계 수정 피드백       ');
  console.log('│        실행 실패 → Codex에게 실행 수정 피드백        ');
  console.log('│ [FINANCIAL] Human 2인 이상 승인 필요                 ');
  console.log('└────────────────────────────────────────────────────┘');

  if (result.success) {
    await slack.notifyAwaitingApproval({
      taskId: task.id,
      mrUrl: 'https://gitlab.example.com/example/project/-/merge_requests/42',
      isFinancial: true,
    });
  }
}

main().catch(console.error);
