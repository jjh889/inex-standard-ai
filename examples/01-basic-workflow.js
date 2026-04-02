/**
 * 예제 01: 기본 3-Agent 워크플로우 (성공 시나리오)
 *
 * Claude(설계+생성) → Codex(실행+수정) → Harness(테스트+검증) → Codex(리뷰)
 * 전체 파이프라인이 한 번에 통과하는 정상 흐름입니다.
 *
 * 실행:
 *   node examples/01-basic-workflow.js
 *
 * 상태 전이:
 *   TODO → DESIGN → CODEX_EXEC → CI_TEST → REVIEW → DONE
 */

const { HarnessRunner } = require('../ai-system/harness/runner');

// ============================================================
// 1. Claude Agent — 설계 + 코드 생성
// ============================================================

const claude = {
  async generate(prompt) {
    console.log('  [Claude] 잔액 조회 서비스를 설계하고 코드를 생성합니다...\n');

    return {
      code: `
@Service
@RequiredArgsConstructor
public class BalanceService {
    private final WalletRepository walletRepository;

    @Transactional(readOnly = true)
    public BalanceResponse getBalance(String userId, String currency) {
        Wallet wallet = walletRepository
            .findByUserIdAndCurrency(userId, currency)
            .orElseThrow(() -> new WalletNotFoundException(userId, currency));
        return BalanceResponse.of(wallet);
    }
}`,
      testCode: `
@SpringBootTest
class BalanceServiceTest {
    @Test void getBalance_성공() { /* ... */ }
    @Test void getBalance_지갑없음_예외() { /* ... */ }
    @Test void getBalance_통화없음_예외() { /* ... */ }
}`,
      files: [
        { path: 'src/main/java/com/example/service/BalanceService.java', content: '...' },
        { path: 'src/test/java/com/example/service/BalanceServiceTest.java', content: '...' },
      ],
      diff: '+ BalanceService.java\n+ BalanceServiceTest.java',
    };
  },
};

// ============================================================
// 2. Codex Agent — 실행 + 수정 + 리뷰
// ============================================================

const codex = {
  async execute({ taskId, code, instruction }) {
    console.log('  [Codex] Claude의 코드를 빌드하고 테스트를 실행합니다...');
    console.log('  [Codex] → 빌드 성공, 테스트 3/3 통과\n');

    return {
      success: true,
      code: code,
      diff: '(수정 없음 - Claude 코드가 바로 동작)',
      buildResult: { passed: true },
      testResult: { passed: true, total: 3, failed: 0, coverage: 87 },
    };
  },

  async review({ taskId, diff, tags }) {
    console.log('  [Codex] 코드 리뷰를 수행합니다...');
    console.log('  [Codex] → APPROVE\n');

    return {
      verdict: 'APPROVE',
      issues: [
        {
          severity: 'LOW',
          category: 'performance',
          file: 'BalanceService.java',
          line: '8',
          description: '복합 인덱스 존재 여부 확인 권장',
          suggestion: 'wallet(user_id, currency) 인덱스 확인',
        },
      ],
      summary: '코드 품질 양호. 트랜잭션 처리 적절. LOW 이슈 1건 코멘트.',
    };
  },
};

// ============================================================
// 3. 실행
// ============================================================

const task = {
  id: 'TASK-001',
  description: 'XKRW 잔액 조회 API 구현',
  tags: ['business-logic'],
  context: 'wallet(id, user_id, currency, balance)\nGET /api/v1/balance',
};

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 01: 3-Agent 기본 워크플로우                        ║');
  console.log('║  Claude(설계) → Codex(실행) → Harness(검증) → 리뷰     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const runner = new HarnessRunner();
  const result = await runner.run(task, { claude, codex });

  console.log('\n┌─── 실행 결과 ───────────────────────────────────────┐');
  console.log(`│ Task: ${result.task}  상태: ${result.state}  성공: ${result.success}`);
  console.log('└────────────────────────────────────────────────────┘');

  console.log('\n┌─── 실행 로그 ───────────────────────────────────────┐');
  runner.getLogs().forEach((log) => {
    const time = new Date(log.timestamp).toLocaleTimeString('ko-KR');
    console.log(`│ [${time}] ${log.event.padEnd(25)} ${log.state}`);
  });
  console.log('└────────────────────────────────────────────────────┘');
}

main().catch(console.error);
