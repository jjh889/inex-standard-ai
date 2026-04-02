/**
 * 예제 07: GitLab + Jira + Slack 통합 데모 (3-Agent 아키텍처)
 *
 * 3-Agent 워크플로우의 각 단계에서 외부 시스템이 어떻게 연동되는지
 * 타임라인으로 시각화합니다.
 *
 * 실행:
 *   node examples/07-integration-demo.js
 */

class IntegrationSim {
  constructor() { this.logs = []; }
  log(sys, action, detail) {
    this.logs.push({ sys, action, detail });
    const icon = { gitlab: '🦊', jira: '📋', slack: '💬', claude: '🧠', codex: '⚡', harness: '🔧' }[sys] || '📢';
    console.log(`  ${icon} [${sys.toUpperCase().padEnd(7)}] ${action}: ${detail}`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 07: 3-Agent + GitLab/Jira/Slack 통합 데모         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const sim = new IntegrationSim();
  const taskId = 'TASK-200';

  // ── Step 1: Planner → Jira ──
  console.log('━━ Step 1: Planner → Task 분해 + Jira 생성 ━━━━━━━━━━━━━\n');
  sim.log('jira', '서브태스크 생성', `${taskId}-1: API 설계`);
  sim.log('jira', '서브태스크 생성', `${taskId}-2: 서비스 로직`);

  // ── Step 2: Claude → 설계 + 코드 생성 ──
  console.log('\n━━ Step 2: Claude → 설계 + 코드 생성 ━━━━━━━━━━━━━━━━━━\n');
  sim.log('jira', '상태 전이', `${taskId} → DESIGN`);
  sim.log('claude', '설계', '잔액 조회 서비스 아키텍처 설계');
  sim.log('claude', '코드 생성', 'BalanceService.java + BalanceServiceTest.java');

  // ── Step 3: Codex → 실행 + 수정 ──
  console.log('\n━━ Step 3: Codex → 빌드/실행/수정 ━━━━━━━━━━━━━━━━━━━━━\n');
  sim.log('jira', '상태 전이', `${taskId} → CODEX_EXEC`);
  sim.log('codex', '빌드 실행', 'gradle build → 성공');
  sim.log('codex', '테스트 실행', 'JUnit 3/3 통과 (coverage: 87%)');
  sim.log('gitlab', '브랜치 생성', `feature/AI-${taskId}`);
  sim.log('gitlab', '커밋', '2개 파일 커밋');
  sim.log('gitlab', 'MR 생성', `!42 "[AI] ${taskId}: 잔액 조회 서비스"`);
  sim.log('slack', '알림', `PR 생성 → MR !42`);

  // ── Step 4: Harness → CI 테스트 + 검증 ──
  console.log('\n━━ Step 4: Harness → CI 테스트 + 검증 ━━━━━━━━━━━━━━━━━\n');
  sim.log('jira', '상태 전이', `${taskId} → CI_TEST`);
  sim.log('harness', 'CI 실행', 'GitLab CI 파이프라인 트리거');
  sim.log('harness', 'CI 결과', '모든 테스트 통과 (87% coverage)');
  sim.log('slack', '알림', 'CI 테스트 통과');

  // ── Step 5: Codex → 코드 리뷰 ──
  console.log('\n━━ Step 5: Codex → 코드 리뷰 (검증) ━━━━━━━━━━━━━━━━━━━\n');
  sim.log('jira', '상태 전이', `${taskId} → REVIEW`);
  sim.log('codex', '코드 리뷰', '표준 리뷰 수행');
  sim.log('codex', '리뷰 결과', 'APPROVE (LOW 이슈 1건 코멘트)');
  sim.log('gitlab', '리뷰 코멘트', 'MR !42에 Codex 리뷰 결과 추가');
  sim.log('slack', '알림', '코드 리뷰 APPROVE');

  // ── Step 6: Human 승인 대기 ──
  console.log('\n━━ Step 6: Human 승인 대기 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  sim.log('jira', '상태 전이', `${taskId} → DONE`);
  sim.log('slack', '알림', '🔔 Human 승인 대기 중');

  // ── Step 7: 배포 ──
  console.log('\n━━ Step 7: 배포 완료 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  sim.log('jira', '상태 전이', `${taskId} → MERGED`);
  sim.log('slack', '알림', '🚀 배포 완료');

  // ── 타임라인 ──
  console.log('\n┌─── 3-Agent 타임라인 요약 ─────────────────────────────┐');
  console.log('│                                                        │');
  console.log('│  1. Planner    → Jira 서브태스크 생성                   │');
  console.log('│  2. Claude     → 설계 + 코드 생성                      │');
  console.log('│  3. Codex      → 빌드 + 실행 + 수정 → GitLab 커밋/MR   │');
  console.log('│  4. Harness    → CI 파이프라인 테스트 + 검증             │');
  console.log('│  5. Codex      → 코드 리뷰 → GitLab 코멘트             │');
  console.log('│  6. Human      → 최종 승인                             │');
  console.log('│  7. Harness    → Merge + 배포 + Slack/Jira 알림        │');
  console.log('│                                                        │');
  console.log('└────────────────────────────────────────────────────────┘');
}

main().catch(console.error);
