/**
 * 예제 05: Planner Agent — Goal → Task 분해
 *
 * 3-Agent 아키텍처에서 각 Task가 Claude/Codex에 어떻게 할당되는지 보여줍니다.
 *
 * 실행:
 *   node examples/05-planner-decompose.js
 */

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 05: Planner Agent — Goal → Task 분해              ║');
  console.log('║  3-Agent 할당: Claude(설계) / Codex(실행) / Harness(검증)║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const goal = '가상자산(BTC, ETH) 입금 기능 구현';

  const tasks = [
    {
      id: 'TASK-100-1', title: 'API 명세 및 DTO 설계',
      tags: ['api-design'], dependencies: [],
      agentFlow: 'Claude(설계) → Codex(빌드검증) → Harness(CI)',
    },
    {
      id: 'TASK-100-2', title: 'DB 스키마 및 마이그레이션',
      tags: ['db-design'], dependencies: ['TASK-100-1'],
      agentFlow: 'Claude(SQL생성) → Codex(마이그레이션실행) → Harness(롤백검증)',
    },
    {
      id: 'TASK-100-3', title: '입금 서비스 로직 구현',
      tags: ['FINANCIAL', 'business-logic'], dependencies: ['TASK-100-2'],
      agentFlow: 'Claude(설계) → Codex(실행+수정) → Harness(CI) → Codex(적대적리뷰)',
    },
    {
      id: 'TASK-100-4', title: '입금 알림 및 이력 API',
      tags: ['business-logic'], dependencies: ['TASK-100-3'],
      agentFlow: 'Claude(설계) → Codex(실행) → Harness(CI) → Codex(리뷰)',
    },
    {
      id: 'TASK-100-5', title: '통합 테스트',
      tags: ['integration-test'], dependencies: ['TASK-100-3', 'TASK-100-4'],
      agentFlow: 'Claude(시나리오설계) → Codex(테스트실행) → Harness(결과검증)',
    },
  ];

  console.log(`  Goal: "${goal}"\n`);

  tasks.forEach((t, i) => {
    const fin = t.tags.includes('FINANCIAL') ? ' [FINANCIAL]' : '';
    const deps = t.dependencies.length ? t.dependencies.join(', ') : '없음';
    console.log(`  Task ${i + 1}: ${t.title}${fin}`);
    console.log(`  ├─ ID:      ${t.id}`);
    console.log(`  ├─ 의존:    ${deps}`);
    console.log(`  └─ 3-Agent: ${t.agentFlow}`);
    console.log('');
  });

  console.log('┌─── 3-Agent 역할 분담 ─────────────────────────────────┐');
  console.log('│                                                        │');
  console.log('│  Claude   "무엇을 만들지"  → 설계, 코드 생성, 테스트 설계  │');
  console.log('│  Codex    "돌아가게"       → 빌드, 실행, 오류 수정, 리뷰 │');
  console.log('│  Harness  "맞는지 확인"    → CI 테스트, 검증, 피드백 라우팅│');
  console.log('│                                                        │');
  console.log('│  [FINANCIAL] Task → Codex 적대적 리뷰 + Human 2인 승인  │');
  console.log('└────────────────────────────────────────────────────────┘');
}

main().catch(console.error);
