/**
 * AI Dev Standard Dashboard - Server v2.0
 *
 * 상태 흐름:
 *   TODO → PLAN_REVIEW → DESIGN → CODEX_EXEC → CI_TEST → REVIEW → DONE → MERGED
 *         (AI 실행 계획)  (Claude)   (Codex)    (Harness)  (Codex)  (Human)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============================================================
// Task 상태 관리
// ============================================================

const tasks = new Map();
let taskCounter = 0;

function createTask(description, tags = []) {
  taskCounter++;
  const id = `TASK-${String(taskCounter).padStart(3, '0')}`;
  const task = {
    id, description, tags,
    state: 'TODO', logs: [], retryCount: 0, maxRetries: 3,
    createdAt: new Date().toISOString(),
    claudeOutput: null, codexOutput: null, reviewResult: null,
    plan: null, planApproved: false, scenario: null, approvedCount: 0,
  };
  tasks.set(id, task);
  return task;
}

function addLog(taskId, agent, event, detail = '', level = 'info') {
  const task = tasks.get(taskId);
  if (!task) return;
  const entry = { seq: task.logs.length + 1, timestamp: new Date().toISOString(), agent, event, detail, level, state: task.state };
  task.logs.push(entry);
  io.emit('log', { taskId, ...entry });
}

function updateState(taskId, newState) {
  const task = tasks.get(taskId);
  if (!task) return;
  const oldState = task.state;
  task.state = newState;
  io.emit('stateChange', { taskId, oldState, newState, task });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// AI 실행 계획 생성
// ============================================================

function generatePlan(task) {
  const fin = task.tags.includes('FINANCIAL');
  return {
    taskId: task.id,
    description: task.description,
    tags: task.tags,
    steps: [
      { step: 1, title: 'API 명세 분석 + DTO 설계', agent: 'Claude', detail: '요구사항 기반 엔드포인트/스키마 정의' },
      { step: 2, title: 'DB 스키마 확인 + 쿼리 설계', agent: 'Claude', detail: '관련 테이블 구조 및 최적 쿼리' },
      { step: 3, title: '비즈니스 로직 코드 생성', agent: 'Claude', detail: 'Service 레이어 + 예외 처리' },
      { step: 4, title: '단위 테스트 코드 생성', agent: 'Claude', detail: 'JUnit (성공/실패/엣지케이스)' },
      { step: 5, title: '빌드 + 테스트 실행', agent: 'Codex', detail: 'gradle build → 오류 수정 → 테스트' },
      { step: 6, title: 'CI 파이프라인 검증', agent: 'Harness', detail: 'compile → test → lint' },
      { step: 7, title: fin ? '적대적 코드 리뷰 (adversarial)' : '표준 코드 리뷰', agent: 'Codex', detail: fin ? '트랜잭션 격리, 동시성, Double Spending' : '로직, 보안, 성능' },
      { step: 8, title: fin ? 'Human 2인 승인' : 'Human 승인', agent: 'Human', detail: fin ? '금융 로직 크로스 체크' : '최종 Merge 승인' },
    ],
    risks: fin
      ? ['트랜잭션 격리 수준 검증', 'Race Condition 방어', '일일 한도 검증']
      : ['N+1 쿼리 가능성', '입력값 검증 누락'],
    retryPolicy: '최대 3회 | 같은 에러 2회 → Claude 에스컬레이션',
  };
}

// ============================================================
// 시나리오 정의
// ============================================================

const SCENARIOS = {
  success: {
    name: '정상 성공', desc: '잔액 조회 API 구현', icon: '✅', color: '#3fb950', tags: [],
    summary: '전체 파이프라인이 한 번에 통과하는 정상 흐름',
    steps: [
      { delay: 600, agent: 'system', event: 'PLAN_GENERATED', detail: 'AI 실행 계획 생성 완료', level: 'info', genPlan: true },
      { delay: 0, state: 'PLAN_REVIEW', awaitPlan: true },
      { delay: 800, state: 'DESIGN', agent: 'claude', event: 'GENERATE_START', detail: 'API 설계 분석 중...', level: 'info' },
      { delay: 1200, agent: 'claude', event: 'DESIGN_DECISION', detail: '패턴: Repository → Service → Controller', level: 'info' },
      { delay: 1500, agent: 'claude', event: 'GENERATE_COMPLETE', detail: '파일 3개 생성: BalanceService, Controller, Test', level: 'success',
        claudeOutput: { code: '@Service\n@RequiredArgsConstructor\npublic class BalanceService {\n\n    private final WalletRepository walletRepository;\n\n    @Transactional(readOnly = true)\n    public BalanceResponse getBalance(\n            String userId, String currency) {\n        Wallet wallet = walletRepository\n            .findByUserIdAndCurrency(userId, currency)\n            .orElseThrow(() ->\n                new WalletNotFoundException(userId));\n        return BalanceResponse.builder()\n            .userId(wallet.getUserId())\n            .currency(wallet.getCurrency())\n            .balance(wallet.getBalance())\n            .build();\n    }\n}', files: ['BalanceService.java', 'BalanceController.java', 'BalanceServiceTest.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'EXEC_START', detail: 'gradle build...', level: 'info' },
      { delay: 1200, agent: 'codex', event: 'BUILD_SUCCESS', detail: 'BUILD SUCCESSFUL in 4s', level: 'success' },
      { delay: 1500, agent: 'codex', event: 'EXEC_COMPLETE', detail: '빌드 성공 | 테스트 3/3 | 커버리지 87%', level: 'success',
        codexOutput: { buildPassed: true, testsPassed: 3, testsFailed: 0, coverage: 87, diff: '(수정 없음)' }
      },
      { delay: 800, state: 'CI_TEST', agent: 'harness', event: 'CI_START', detail: 'GitLab CI 파이프라인', level: 'info' },
      { delay: 600, agent: 'harness', event: 'CI_STAGE', detail: 'compile ✓ → test ✓ → lint ✓', level: 'info' },
      { delay: 500, agent: 'harness', event: 'CI_COMPLETE', detail: 'CI 통과 (32초)', level: 'success' },
      { delay: 800, state: 'REVIEW', agent: 'codex', event: 'REVIEW_START', detail: '표준 코드 리뷰...', level: 'info' },
      { delay: 600, agent: 'codex', event: 'REVIEW_CHECK', detail: '✓ 로직 · ✓ 예외처리 · ✓ 보안', level: 'info' },
      { delay: 1000, agent: 'codex', event: 'REVIEW_APPROVE', detail: '→ APPROVE', level: 'success',
        reviewResult: { verdict: 'APPROVE', issues: [{ severity: 'LOW', category: 'performance', description: '복합 인덱스 확인 권장' }], summary: '코드 품질 양호. LOW 1건.' }
      },
      { delay: 500, state: 'DONE', agent: 'harness', event: 'AWAITING_APPROVAL', detail: 'Human 승인 대기 (1명)', level: 'warn', approval: { required: 1 } },
    ],
  },
  buildFail: {
    name: 'Codex 빌드 실패 → 재수정', desc: '주문 조회 API 구현', icon: '🔄', color: '#d29922', tags: [],
    summary: 'Codex 빌드 실패 → 피드백 반영 → 자동 수정 후 통과',
    steps: [
      { delay: 600, agent: 'system', event: 'PLAN_GENERATED', detail: 'AI 실행 계획 생성', level: 'info', genPlan: true },
      { delay: 0, state: 'PLAN_REVIEW', awaitPlan: true },
      { delay: 800, state: 'DESIGN', agent: 'claude', event: 'GENERATE_COMPLETE', detail: 'OrderService.java (import 누락 포함)', level: 'success',
        claudeOutput: { code: '@Service\npublic class OrderService {\n    private final OrderRepository orderRepo;\n\n    public List<OrderResponse> getUserOrders(String userId) {\n        var orders = orderRepo.findByUserId(userId);\n        return orders.stream().map(o -> {\n            // ❌ itemRepo 미주입\n            var items = itemRepo.findByOrderId(o.getId());\n            return OrderResponse.of(o, items);\n        }).collect(Collectors.toList());\n    }\n}', files: ['OrderService.java', 'OrderServiceTest.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'EXEC_START', detail: 'gradle build...', level: 'info' },
      { delay: 2000, agent: 'codex', event: 'BUILD_FAILED', detail: 'cannot find symbol: itemRepo (import 누락)', level: 'error' },
      { delay: 800, agent: 'harness', event: 'FEEDBACK_ROUTING', detail: '실행 실패 → Codex에게 피드백 (1/3)', level: 'warn',
        feedback: { from: 'codex_exec', to: 'codex', reason: 'import 누락', retryCount: 1, escalated: false }
      },
      { delay: 1000, agent: 'codex', event: 'FIX_APPLIED', detail: '+ import OrderItemRepository\n+ @RequiredArgsConstructor', level: 'info' },
      { delay: 1500, agent: 'codex', event: 'EXEC_COMPLETE', detail: '빌드 성공 | 테스트 4/4 | 커버리지 82%', level: 'success',
        codexOutput: { buildPassed: true, testsPassed: 4, testsFailed: 0, coverage: 82, diff: '+ import OrderItemRepository\n+ @RequiredArgsConstructor' }
      },
      { delay: 800, state: 'CI_TEST', agent: 'harness', event: 'CI_COMPLETE', detail: 'CI 통과 | 82%', level: 'success' },
      { delay: 800, state: 'REVIEW', agent: 'codex', event: 'REVIEW_APPROVE', detail: '→ APPROVE | N+1 주의', level: 'success',
        reviewResult: { verdict: 'APPROVE', issues: [{ severity: 'MEDIUM', category: 'performance', description: 'N+1 쿼리 → Fetch Join 권장' }], summary: 'MEDIUM 1건.' }
      },
      { delay: 500, state: 'DONE', agent: 'harness', event: 'AWAITING_APPROVAL', detail: 'Human 승인 대기', level: 'warn', approval: { required: 1 } },
    ],
  },
  financialReject: {
    name: '금융 리뷰 REJECT → 재설계', desc: 'KRW 출금 API 구현', icon: '💰', color: '#f85149', tags: ['FINANCIAL'],
    summary: '적대적 리뷰에서 금융 무결성 위반 → Claude 재설계 → 2인 승인',
    steps: [
      { delay: 600, agent: 'system', event: 'PLAN_GENERATED', detail: '[FINANCIAL] 실행 계획 생성', level: 'info', genPlan: true },
      { delay: 0, state: 'PLAN_REVIEW', awaitPlan: true },
      { delay: 800, state: 'DESIGN', agent: 'claude', event: 'GENERATE_COMPLETE', detail: 'WithdrawService (READ_COMMITTED)', level: 'success',
        claudeOutput: { code: '@Service\npublic class WithdrawService {\n    @Transactional // ❌ READ_COMMITTED\n    public WithdrawResponse withdraw(\n            String userId, BigDecimal amount) {\n        Wallet w = walletRepo.findByUserId(userId);\n        if (w.getBalance().compareTo(amount) < 0)\n            throw new InsufficientBalanceException();\n        w.setBalance(w.getBalance().subtract(amount));\n        walletRepo.save(w);\n        return WithdrawResponse.of(w);\n    }\n}', files: ['WithdrawService.java', 'WithdrawServiceTest.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'EXEC_COMPLETE', detail: '빌드 OK | 3/3 | 85%', level: 'success', codexOutput: { buildPassed: true, testsPassed: 3, testsFailed: 0, coverage: 85, diff: '(수정 없음)' } },
      { delay: 600, state: 'CI_TEST', agent: 'harness', event: 'CI_COMPLETE', detail: 'CI 통과', level: 'success' },
      { delay: 800, state: 'REVIEW', agent: 'codex', event: 'REVIEW_START', detail: '🔥 적대적 리뷰 [FINANCIAL]', level: 'info' },
      { delay: 800, agent: 'codex', event: 'REVIEW_CHECK', detail: '✗ READ_COMMITTED → Dirty Read 위험', level: 'error' },
      { delay: 600, agent: 'codex', event: 'REVIEW_CHECK', detail: '✗ Race Condition → Double Spending', level: 'error' },
      { delay: 600, agent: 'codex', event: 'REVIEW_CHECK', detail: '✗ 출금 한도 미검증', level: 'error' },
      { delay: 1000, agent: 'codex', event: 'REVIEW_REJECT', detail: '→ REJECT | CRITICAL 1, HIGH 2', level: 'error',
        reviewResult: { verdict: 'REJECT', issues: [
          { severity: 'CRITICAL', category: 'financial', description: 'READ_COMMITTED → REPEATABLE_READ 필요' },
          { severity: 'HIGH', category: 'financial', description: 'Race Condition → SELECT FOR UPDATE' },
          { severity: 'HIGH', category: 'logic', description: '출금 한도 검증 누락' },
        ], summary: '금융 무결성 위반. 재설계 필요.' }
      },
      { delay: 800, agent: 'harness', event: 'FEEDBACK_ROUTING', detail: 'REJECT → Claude 재설계 (1/3)', level: 'warn',
        feedback: { from: 'review', to: 'claude', reason: '금융 무결성 위반', retryCount: 1, escalated: false }
      },
      { delay: 1000, state: 'DESIGN', agent: 'claude', event: 'REDESIGN_START', detail: '피드백 반영: REPEATABLE_READ + 비관적 락 + 한도', level: 'info' },
      { delay: 2000, agent: 'claude', event: 'GENERATE_COMPLETE', detail: '재설계 완료', level: 'success',
        claudeOutput: { code: '@Service\n@RequiredArgsConstructor\npublic class WithdrawService {\n    @Transactional(\n        isolation = Isolation.REPEATABLE_READ) // ✅\n    public WithdrawResponse withdraw(\n            String userId, BigDecimal amount) {\n        // ✅ 비관적 락\n        Wallet w = walletRepo\n            .findByUserIdForUpdate(userId, "KRW");\n        // ✅ 한도 검증\n        validateDailyLimit(userId, amount);\n        if (w.getBalance().compareTo(amount) < 0)\n            throw new InsufficientBalanceException();\n        w.setBalance(w.getBalance().subtract(amount));\n        walletRepo.save(w);\n        return WithdrawResponse.of(w);\n    }\n}', files: ['WithdrawService.java', 'WithdrawServiceTest.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'EXEC_COMPLETE', detail: '5/5 (동시성 포함) | 91%', level: 'success', codexOutput: { buildPassed: true, testsPassed: 5, testsFailed: 0, coverage: 91, diff: '+ REPEATABLE_READ\n+ FOR UPDATE\n+ validateDailyLimit\n+ 동시성 테스트' } },
      { delay: 600, state: 'CI_TEST', agent: 'harness', event: 'CI_COMPLETE', detail: 'CI 통과 | 91%', level: 'success' },
      { delay: 800, state: 'REVIEW', agent: 'codex', event: 'REVIEW_START', detail: '적대적 리뷰 재수행', level: 'info' },
      { delay: 600, agent: 'codex', event: 'REVIEW_CHECK', detail: '✓ REPEATABLE_READ · ✓ 비관적 락 · ✓ 한도', level: 'success' },
      { delay: 1000, agent: 'codex', event: 'REVIEW_APPROVE', detail: '→ APPROVE | 금융 무결성 통과', level: 'success',
        reviewResult: { verdict: 'APPROVE', issues: [], summary: '금융 무결성 검증 통과.' }
      },
      { delay: 500, state: 'DONE', agent: 'harness', event: 'AWAITING_APPROVAL', detail: '⚠️ [FINANCIAL] 2인 승인 대기', level: 'warn', approval: { required: 2 } },
    ],
  },
  escalation: {
    name: '에스컬레이션 Codex→Claude', desc: '자산 이체 서비스 구현', icon: '⚡', color: '#bc8cff', tags: ['FINANCIAL'],
    summary: '같은 에러 2회 → Smart Retry가 Codex→Claude 자동 에스컬레이션',
    steps: [
      { delay: 600, agent: 'system', event: 'PLAN_GENERATED', detail: '[FINANCIAL] 실행 계획 생성', level: 'info', genPlan: true },
      { delay: 0, state: 'PLAN_REVIEW', awaitPlan: true },
      { delay: 800, state: 'DESIGN', agent: 'claude', event: 'GENERATE_COMPLETE', detail: '레거시 모듈 참조 포함', level: 'success',
        claudeOutput: { code: '@Service\npublic class TransferService {\n    // ❌ 삭제된 모듈\n    import com.example.legacy.DeprecatedUtil;\n\n    public TransferResponse transfer(\n            String from, String to, BigDecimal amt) {\n        DeprecatedUtil.validate(from, to);\n        // ...\n    }\n}', files: ['TransferService.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'BUILD_FAILED', detail: 'package com.example.legacy does not exist', level: 'error' },
      { delay: 800, agent: 'harness', event: 'FEEDBACK_ROUTING', detail: '→ Codex (1/3)', level: 'warn', feedback: { from: 'codex_exec', to: 'codex', reason: '삭제 패키지', retryCount: 1, escalated: false } },
      { delay: 1000, agent: 'codex', event: 'EXEC_RETRY', detail: '대체 모듈 탐색...', level: 'info' },
      { delay: 1500, agent: 'codex', event: 'BUILD_FAILED', detail: '동일 에러 반복', level: 'error' },
      { delay: 800, agent: 'harness', event: 'SMART_RETRY', detail: '🔍 동일 에러 2회 감지', level: 'warn' },
      { delay: 500, agent: 'harness', event: 'ESCALATION', detail: '⚡ Codex → Claude 에스컬레이션', level: 'error', feedback: { from: 'codex_exec', to: 'claude', reason: '⚡ 에스컬레이션', retryCount: 2, escalated: true } },
      { delay: 1000, state: 'DESIGN', agent: 'claude', event: 'REDESIGN_START', detail: '⚡ 레거시 대체 설계', level: 'info' },
      { delay: 2000, agent: 'claude', event: 'GENERATE_COMPLETE', detail: 'DeprecatedUtil → TransferValidator', level: 'success',
        claudeOutput: { code: '@Service\n@RequiredArgsConstructor\npublic class TransferService {\n    // ✅ 현재 모듈\n    private final TransferValidator validator;\n\n    @Transactional(\n        isolation = Isolation.REPEATABLE_READ)\n    public TransferResponse transfer(\n            String from, String to, BigDecimal amt) {\n        validator.validate(from, to, amt);\n        // ...\n    }\n}', files: ['TransferService.java', 'TransferServiceTest.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'EXEC_COMPLETE', detail: '빌드 성공 | 4/4 | 88%', level: 'success', codexOutput: { buildPassed: true, testsPassed: 4, testsFailed: 0, coverage: 88, diff: '- DeprecatedUtil\n+ TransferValidator' } },
      { delay: 600, state: 'CI_TEST', agent: 'harness', event: 'CI_COMPLETE', detail: 'CI 통과', level: 'success' },
      { delay: 800, state: 'REVIEW', agent: 'codex', event: 'REVIEW_APPROVE', detail: '→ APPROVE', level: 'success', reviewResult: { verdict: 'APPROVE', issues: [], summary: '재설계 검증 통과.' } },
      { delay: 500, state: 'DONE', agent: 'harness', event: 'AWAITING_APPROVAL', detail: '⚠️ [FINANCIAL] 2인 승인 대기', level: 'warn', approval: { required: 2 } },
    ],
  },
  maxRetryFail: {
    name: '3회 실패 → FAILED', desc: '외부 결제 게이트웨이 연동', icon: '🚨', color: '#f85149', tags: ['FINANCIAL'],
    summary: '아키텍처 레벨 문제 → 3회 모두 실패 → 개발자 수동 개입',
    steps: [
      { delay: 600, agent: 'system', event: 'PLAN_GENERATED', detail: '실행 계획 생성', level: 'info', genPlan: true },
      { delay: 0, state: 'PLAN_REVIEW', awaitPlan: true },
      { delay: 800, state: 'DESIGN', agent: 'claude', event: 'GENERATE_COMPLETE', detail: 'PaymentService (동기, 타임아웃 없음)', level: 'success',
        claudeOutput: { code: '@Service\npublic class PaymentService {\n    // ❌ 동기 + 타임아웃 없음\n    public PaymentResponse process(PaymentRequest req) {\n        String result = restTemplate\n            .postForObject(pgApiUrl, req, String.class);\n        return PaymentResponse.parse(result);\n    }\n}', files: ['PaymentService.java'] }
      },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'TEST_FAILED', detail: 'Connection timed out (30s)', level: 'error' },
      { delay: 800, agent: 'harness', event: 'FEEDBACK_ROUTING', detail: '→ Codex (1/3)', level: 'warn', feedback: { from: 'codex_exec', to: 'codex', reason: '타임아웃', retryCount: 1, escalated: false } },
      { delay: 1500, agent: 'codex', event: 'TEST_FAILED', detail: '동일 타임아웃', level: 'error' },
      { delay: 800, agent: 'harness', event: 'ESCALATION', detail: '⚡ Codex → Claude', level: 'error', feedback: { from: 'codex_exec', to: 'claude', reason: '⚡ 타임아웃 2회', retryCount: 2, escalated: true } },
      { delay: 1000, state: 'DESIGN', agent: 'claude', event: 'GENERATE_COMPLETE', detail: 'timeout 추가 (근본 해결 아님)', level: 'success' },
      { delay: 800, state: 'CODEX_EXEC', agent: 'codex', event: 'TEST_FAILED', detail: 'PG API 불안정 — Circuit Breaker 필요', level: 'error' },
      { delay: 800, agent: 'harness', event: 'MAX_RETRY_EXCEEDED', detail: '🚨 최대 재시도(3) 초과', level: 'error' },
      { delay: 500, state: 'FAILED', agent: 'harness', event: 'FAILED', detail: '🚨 FAILED — Circuit Breaker + 비동기 큐 필요', level: 'error' },
      { delay: 300, agent: 'harness', event: 'SLACK_ALERT', detail: '🚨 @here 개발자 수동 개입 필요', level: 'error' },
    ],
  },
};

// ============================================================
// 시나리오 실행 엔진
// ============================================================

async function runScenario(taskId, scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  const task = tasks.get(taskId);
  if (!scenario || !task) return;
  task.plan = generatePlan(task);

  for (const step of scenario.steps) {
    if (step.awaitPlan) {
      if (step.state) updateState(taskId, step.state);
      addLog(taskId, 'harness', 'PLAN_AWAITING', '실행 계획 Human 확인 대기', 'warn');
      io.emit('awaitingPlan', { taskId, task, plan: task.plan });
      await waitFor(taskId, 'planApproved');
      if (task.state === 'FAILED') return;
      addLog(taskId, 'human', 'PLAN_APPROVED', '실행 계획 승인', 'success');
      continue;
    }
    await sleep(step.delay);
    if (step.state) updateState(taskId, step.state);
    if (step.agent && step.event) addLog(taskId, step.agent, step.event, step.detail, step.level);
    if (step.genPlan) io.emit('planGenerated', { taskId, plan: task.plan });
    if (step.claudeOutput) { task.claudeOutput = step.claudeOutput; io.emit('claudeOutput', { taskId, output: step.claudeOutput }); }
    if (step.codexOutput) { task.codexOutput = step.codexOutput; io.emit('codexOutput', { taskId, output: step.codexOutput }); }
    if (step.reviewResult) { task.reviewResult = step.reviewResult; io.emit('reviewResult', { taskId, result: step.reviewResult }); }
    if (step.feedback) io.emit('feedbackRouting', { taskId, ...step.feedback });
    if (step.approval) io.emit('awaitingApproval', { taskId, task, requiredApprovals: step.approval.required });
  }
}

function waitFor(taskId, field) {
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      const t = tasks.get(taskId);
      if (!t || t[field] || t.state === 'FAILED') { clearInterval(iv); resolve(); }
    }, 200);
  });
}

// ============================================================
// API
// ============================================================

app.get('/api/tasks', (req, res) => res.json([...tasks.values()]));
app.get('/api/scenarios', (req, res) => {
  res.json(Object.entries(SCENARIOS).map(([k, s]) => ({ key: k, name: s.name, desc: s.desc, icon: s.icon, color: s.color, tags: s.tags, summary: s.summary })));
});
app.post('/api/scenarios/:key/run', (req, res) => {
  const s = SCENARIOS[req.params.key];
  if (!s) return res.status(404).json({ error: 'Not found' });
  const task = createTask(s.desc, s.tags);
  task.scenario = req.params.key;
  res.json(task);
  setTimeout(() => runScenario(task.id, req.params.key), 300);
});
app.post('/api/tasks/:id/plan/approve', (req, res) => {
  const t = tasks.get(req.params.id);
  if (t) t.planApproved = true;
  res.json({ ok: true });
});
app.post('/api/tasks/:id/plan/reject', (req, res) => {
  const t = tasks.get(req.params.id);
  if (t) { t.planApproved = true; updateState(t.id, 'FAILED'); addLog(t.id, 'human', 'PLAN_REJECTED', '실행 계획 거부', 'error'); }
  res.json({ ok: true });
});
app.post('/api/tasks/:id/approve', (req, res) => {
  const t = tasks.get(req.params.id);
  if (!t || t.state !== 'DONE') return res.status(400).json({ error: 'Invalid' });
  t.approvedCount = (t.approvedCount || 0) + 1;
  const req2 = t.tags.includes('FINANCIAL') ? 2 : 1;
  addLog(t.id, 'human', 'APPROVED', `승인 ${t.approvedCount}/${req2}`, 'success');
  if (t.approvedCount >= req2) { updateState(t.id, 'MERGED'); addLog(t.id, 'harness', 'DEPLOYED', '🚀 배포 완료', 'success'); }
  res.json(t);
});
app.post('/api/tasks/:id/reject', (req, res) => {
  const t = tasks.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  addLog(t.id, 'human', 'REJECTED', '거부됨', 'error');
  updateState(t.id, 'FAILED');
  res.json(t);
});

io.on('connection', (socket) => { socket.emit('init', [...tasks.values()]); });

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
  console.log(`\n  AI Dev Standard Dashboard v2.0\n  🌐 http://localhost:${PORT}\n`);
  Object.keys(SCENARIOS).forEach((k) => console.log(`  → http://localhost:${PORT}?scenario=${k}`));
  console.log('');
});
