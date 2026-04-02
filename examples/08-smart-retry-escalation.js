/**
 * 예제 08: Smart Retry + 에스컬레이션
 *
 * Codex가 같은 빌드 에러를 2회 연속 수정하지 못하면
 * Smart Retry가 자동으로 Claude에게 에스컬레이션하여 재설계를 요청한다.
 *
 * 실행:
 *   node examples/08-smart-retry-escalation.js
 *
 * 흐름:
 *   1차: Claude 설계 → Codex 실행 실패 (import 오류)
 *   2차: 같은 Codex 실행 실패 (동일 import 오류)
 *   ⚡ 에스컬레이션: Codex→Claude (설계 레벨 문제로 판단)
 *   3차: Claude 재설계 → Codex 실행 성공 → 리뷰 통과
 */

const { HarnessRunner } = require('../ai-system/harness/runner');

// ============================================================
// Claude: 1~2차는 문제있는 설계, 에스컬레이션 후 3차에 수정
// ============================================================

let claudeAttempt = 0;
const claude = {
  async generate(prompt) {
    claudeAttempt++;

    if (claudeAttempt <= 2) {
      console.log(`  [Claude] ${claudeAttempt}차 설계: 존재하지 않는 내부 모듈 의존\n`);
      return {
        code: '// import com.example.legacy.DeprecatedUtil ← 삭제된 모듈 참조',
        files: [{ path: 'TransferService.java', content: '...' }],
        diff: '+ TransferService.java',
      };
    }

    // 에스컬레이션 후: 피드백을 반영하여 재설계
    const wasEscalated = prompt.includes('에스컬레이션');
    console.log(`  [Claude] 3차 재설계${wasEscalated ? ' (⚡ 에스컬레이션 피드백 반영)' : ''}`);
    console.log('  [Claude] → 삭제된 모듈 대신 현재 모듈 사용으로 변경\n');
    return {
      code: '// import com.example.common.TransferUtil ← 현재 모듈 사용',
      files: [{ path: 'TransferService.java', content: '...' }],
      diff: '+ TransferService.java (v3 - 재설계)',
    };
  },
};

// ============================================================
// Codex: 1~2차는 같은 에러, 3차(Claude 재설계 후)는 성공
// ============================================================

let codexAttempt = 0;
const codex = {
  async execute({ taskId, code }) {
    codexAttempt++;

    if (code.includes('DeprecatedUtil')) {
      console.log(`  [Codex] ${codexAttempt}차 실행: 빌드 실패 (삭제된 모듈 참조)`);
      console.log('  [Codex] → 실행 레벨에서 해결 불가 (모듈 자체가 없음)\n');
      return {
        success: false,
        error: {
          message: 'Compilation failed: package com.example.legacy does not exist',
          buildErrors: [
            { file: 'TransferService.java', line: '1', message: 'package com.example.legacy does not exist' },
          ],
        },
      };
    }

    console.log(`  [Codex] ${codexAttempt}차 실행: 빌드 성공! (재설계된 코드)\n`);
    return {
      success: true,
      code: code,
      diff: '(정상 빌드)',
      buildResult: { passed: true },
      testResult: { passed: true, coverage: 88 },
    };
  },

  async review() {
    console.log('  [Codex] 코드 리뷰 → APPROVE\n');
    return { verdict: 'APPROVE', issues: [], summary: '재설계 후 코드 품질 양호.' };
  },
};

// ============================================================
// Task 정의
// ============================================================

const task = {
  id: 'TASK-088',
  description: '자산 이체 서비스 구현',
  tags: ['FINANCIAL'],
  context: '내부 이체 로직',
};

// ============================================================
// 실행
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 08: Smart Retry + 자동 에스컬레이션               ║');
  console.log('║  같은 에러 2회 반복 → Codex→Claude 에스컬레이션         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const runner = new HarnessRunner({ enableFileLog: false }); // 예제에서는 파일 저장 비활성화
  const result = await runner.run(task, { claude, codex });

  console.log('\n┌─── 실행 결과 ───────────────────────────────────────┐');
  console.log(`│ 성공: ${result.success}  상태: ${result.state}`);
  console.log(`│ Claude: ${claudeAttempt}회  Codex: ${codexAttempt}회`);
  console.log('├────────────────────────────────────────────────────┤');

  // Smart Retry 통계
  const stats = runner.retryManager.getStats(task.id);
  if (stats.totalFailures > 0) {
    console.log('│ [Smart Retry 통계]');
    console.log(`│   총 실패: ${stats.totalFailures}회`);
    console.log(`│   실패 유형: ${JSON.stringify(stats.byType)}`);
    if (stats.hasRepeatedPattern) {
      console.log(`│   ⚡ 반복 패턴 감지: ${stats.repeatedErrors.map((e) => `${e.signature}(${e.count}회)`).join(', ')}`);
    }
  }
  console.log('└────────────────────────────────────────────────────┘');

  // Audit 보고서 요약
  const audit = runner.getAuditReport();
  console.log('\n┌─── Audit Log 요약 ─────────────────────────────────┐');
  console.log(`│ Session: ${audit.sessionId}`);
  console.log(`│ Claude 호출: ${audit.summary.claudeCalls}회`);
  console.log(`│ Codex 호출:  ${audit.summary.codexCalls}회`);
  console.log(`│ 피드백 라우팅: ${audit.summary.feedbackRoutings}회`);
  console.log(`│ 에스컬레이션: ${audit.summary.escalations}회`);
  console.log('├────────────────────────────────────────────────────┤');

  // 피드백 라우팅 추적
  const routings = audit.entries.filter((e) => e.event === 'FEEDBACK_ROUTING');
  routings.forEach((r, i) => {
    const esc = r.escalated ? ' ⚡ ESCALATED' : '';
    console.log(`│ ${i + 1}. [${r.failureType}] → ${r.routedTo}${esc}`);
    console.log(`│    ${r.reason}`);
  });
  console.log('└────────────────────────────────────────────────────┘');

  console.log('\n[핵심]');
  console.log('  • 같은 에러 2회 반복 → Smart Retry가 패턴 감지');
  console.log('  • Codex가 못 고침 → Claude에게 에스컬레이션 (재설계)');
  console.log('  • Audit Log로 전체 흐름 추적 가능');
}

main().catch(console.error);
