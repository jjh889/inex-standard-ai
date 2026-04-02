/**
 * 예제 04: 3회 반복 실패 → FAILED
 *
 * Codex가 실행 오류를 수정하지 못하고 3회 연속 실패하여
 * FAILED 상태로 전환되는 시나리오입니다.
 *
 * 실행:
 *   node examples/04-max-retry-failure.js
 */

const { HarnessRunner } = require('../ai-system/harness/runner');
const { SlackNotifier } = require('../ai-system/integration/slack');

const claude = {
  async generate() {
    console.log('  [Claude] 외부 결제 API 연동 코드 생성\n');
    return {
      code: '// 동기 방식 외부 API 호출 (아키텍처 문제)',
      files: [{ path: 'PaymentService.java', content: '...' }],
      diff: '+ PaymentService.java',
    };
  },
};

let codexAttempt = 0;
const codex = {
  async execute({ taskId, errorLog }) {
    codexAttempt++;
    console.log(`  [Codex] ${codexAttempt}차 실행: 근본적 아키텍처 문제 해결 불가`);
    console.log('  [Codex] → 실패 (타임아웃 미처리)\n');
    return {
      success: false,
      error: {
        message: `${codexAttempt}차 실행 실패: 외부 API 타임아웃. Codex 실행 레벨에서 해결 불가한 아키텍처 문제.`,
      },
    };
  },
  async review() {
    return { verdict: 'APPROVE', issues: [], summary: '' };
  },
};

const task = {
  id: 'TASK-077',
  description: '외부 결제 게이트웨이 연동',
  tags: ['FINANCIAL'],
  context: '외부 PG사 API 호출',
};

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 04: 3회 반복 실패 → FAILED                        ║');
  console.log('║  Codex가 해결 불가 → 개발자 수동 개입 필요               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const runner = new HarnessRunner();
  const slack = new SlackNotifier();
  const result = await runner.run(task, { claude, codex });

  console.log('\n┌─── 실행 결과 ───────────────────────────────────────┐');
  console.log(`│ 성공: ${result.success}  상태: ${result.state}  Codex 시도: ${codexAttempt}회`);
  console.log('├────────────────────────────────────────────────────┤');
  console.log('│ [원인] 아키텍처 레벨 문제 → Codex 실행 수정으로 불가 ');
  console.log('│ [조치] 개발자가 아키텍처 재설계 후 재시도            ');
  console.log('└────────────────────────────────────────────────────┘');

  await slack.notifyFailed({
    taskId: task.id,
    reason: '아키텍처 레벨 문제. 비동기 처리 또는 Circuit Breaker 도입 필요.',
  });

  console.log('\n┌─── 실행 로그 ───────────────────────────────────────┐');
  runner.getLogs().forEach((log, i) => {
    const time = new Date(log.timestamp).toLocaleTimeString('ko-KR');
    console.log(`│ ${String(i + 1).padStart(2)}. [${time}] ${log.event.padEnd(25)} ${log.state}`);
  });
  console.log('└────────────────────────────────────────────────────┘');
}

main().catch(console.error);
