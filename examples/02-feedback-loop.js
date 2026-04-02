/**
 * 예제 02: 피드백 루프 — Codex 실행 실패 → 재수정 → 성공
 *
 * Claude가 생성한 코드에 import 누락이 있어 Codex 1차 실행이 실패하고,
 * 피드백을 받아 Codex가 2차에서 수정하여 성공하는 시나리오입니다.
 *
 * 실행:
 *   node examples/02-feedback-loop.js
 *
 * 핵심:
 *   - 실행/CI 실패 → Codex에게 피드백 (실행 레벨 수정)
 *   - 리뷰 실패 → Claude에게 피드백 (설계 레벨 수정)
 */

const { HarnessRunner } = require('../ai-system/harness/runner');

let claudeAttempt = 0;
const claude = {
  async generate(prompt) {
    claudeAttempt++;
    console.log(`  [Claude] ${claudeAttempt}차 설계 + 코드 생성\n`);
    return {
      code: `@Service public class OrderService { /* 주문 조회 로직 */ }`,
      testCode: `@SpringBootTest class OrderServiceTest { /* 테스트 */ }`,
      files: [{ path: 'OrderService.java', content: '...' }],
      diff: '+ OrderService.java',
    };
  },
};

let codexExecAttempt = 0;
const codex = {
  async execute({ taskId, code, instruction, errorLog }) {
    codexExecAttempt++;

    if (codexExecAttempt === 1) {
      console.log('  [Codex] 1차 실행: 빌드 실패 (import 누락)');
      console.log('  [Codex] → 실패\n');
      return {
        success: false,
        error: {
          message: 'Compilation failed: cannot find symbol',
          buildErrors: [
            { file: 'OrderService.java', line: '3', message: 'cannot find symbol: class OrderRepository' },
            { file: 'OrderService.java', line: '7', message: 'cannot find symbol: class OrderResponse' },
          ],
        },
      };
    }

    console.log('  [Codex] 2차 실행: 피드백 반영 → import 추가 → 빌드 성공');
    if (errorLog) {
      console.log('  [Codex] ✓ 이전 실행 오류 피드백이 주입된 것을 확인했습니다.');
    }
    console.log('  [Codex] → 성공 (빌드 OK, 테스트 3/3 통과)\n');

    return {
      success: true,
      code: code + '\n// import 추가: OrderRepository, OrderResponse',
      diff: '+ import com.example.repository.OrderRepository;\n+ import com.example.dto.OrderResponse;',
      buildResult: { passed: true },
      testResult: { passed: true, total: 3, failed: 0, coverage: 82 },
    };
  },

  async review({ taskId }) {
    console.log('  [Codex] 코드 리뷰 → APPROVE\n');
    return { verdict: 'APPROVE', issues: [], summary: 'Codex 실행 수정 후 코드 품질 양호.' };
  },
};

const task = {
  id: 'TASK-015',
  description: '주문 내역 조회 API 구현',
  tags: ['business-logic'],
  context: 'orders(id, user_id, status)\norder_items(id, order_id, product, amount)',
};

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 02: 피드백 루프 — Codex 실행 실패 → 재수정         ║');
  console.log('║  실행 실패 피드백 → Codex에게 전달 (실행 레벨 수정)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const runner = new HarnessRunner();
  const result = await runner.run(task, { claude, codex });

  console.log('\n┌─── 실행 결과 ───────────────────────────────────────┐');
  console.log(`│ 성공: ${result.success}  상태: ${result.state}  Claude: ${claudeAttempt}회  Codex: ${codexExecAttempt}회`);
  console.log('├────────────────────────────────────────────────────┤');
  console.log('│ [핵심] 실행/CI 실패 → Codex가 수정 (설계는 Claude 유지)');
  console.log('└────────────────────────────────────────────────────┘');

  console.log('\n┌─── 실행 로그 ───────────────────────────────────────┐');
  runner.getLogs().forEach((log, i) => {
    const time = new Date(log.timestamp).toLocaleTimeString('ko-KR');
    console.log(`│ ${String(i + 1).padStart(2)}. [${time}] ${log.event.padEnd(25)} ${log.state}`);
  });
  console.log('└────────────────────────────────────────────────────┘');
}

main().catch(console.error);
