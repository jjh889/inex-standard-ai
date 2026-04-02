# AI Dev Standard - 사용 설명서

> 본 문서는 AI 개발 표준 프레임워크의 설치, 설정, 실행, 커스터마이징 방법을 단계별로 안내합니다.

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [설치 및 환경 설정](#2-설치-및-환경-설정)
3. [프레임워크 구조 이해](#3-프레임워크-구조-이해)
4. [Task 실행하기](#4-task-실행하기)
5. [Agent 연동 가이드](#5-agent-연동-가이드)
6. [프롬프트 커스터마이징](#6-프롬프트-커스터마이징)
7. [워크플로우 커스터마이징](#7-워크플로우-커스터마이징)
8. [외부 시스템 연동](#8-외부-시스템-연동)
9. [보안 정책 체크리스트](#9-보안-정책-체크리스트)
10. [트러블슈팅](#10-트러블슈팅)

---

## 1. 사전 요구사항

| 항목 | 최소 버전 | 용도 |
|------|-----------|------|
| Node.js | 18.0+ | Harness 실행 런타임 |
| npm | 9.0+ | 패키지 관리 |
| Git | 2.30+ | 브랜치 관리 |

**외부 서비스 계정** (선택 - 실제 연동 시 필요):

| 서비스 | 필요 항목 | 발급 방법 |
|--------|-----------|-----------|
| Anthropic | API Key | [console.anthropic.com](https://console.anthropic.com) — Claude (설계+생성) |
| OpenAI Codex | Codex CLI + 계정 | `npm install -g @openai/codex` + `codex login` — Codex (실행+수정+리뷰) |
| GitLab | Personal Access Token | Settings > Access Tokens > `api` scope |
| Jira | API Token | [id.atlassian.com](https://id.atlassian.com) > Security > API tokens |
| Slack | Webhook URL | Slack App > Incoming Webhooks |

**Codex CLI 설치 (3-Agent 아키텍처 필수):**

```bash
# Codex CLI 설치
npm install -g @openai/codex

# Codex 로그인
codex login

# Claude Code에서 플러그인으로 사용 시
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

---

## 2. 설치 및 환경 설정

### 2.1 프로젝트 클론 및 의존성 설치

```bash
git clone <repository-url>
cd ai-standard
npm install
```

### 2.2 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 실제 값을 입력합니다:

```bash
# 필수: AI Agent API Key (최소 하나 이상)
ANTHROPIC_API_KEY=sk-ant-xxxxx    # Dev Agent용
OPENAI_API_KEY=sk-xxxxx           # Review Agent용

# 선택: 외부 시스템 연동
GITLAB_URL=https://gitlab.your-company.com
GITLAB_TOKEN=glpat-xxxxx
GITLAB_PROJECT_ID=123

JIRA_URL=https://your-company.atlassian.net
JIRA_EMAIL=dev@company.com
JIRA_API_TOKEN=xxxxx
JIRA_PROJECT_KEY=PROJ

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx
```

### 2.3 설정 검증

```bash
# 환경 변수 로드 확인
node -e "require('dotenv').config(); console.log('ENV loaded:', !!process.env.ANTHROPIC_API_KEY)"

# 예제 실행으로 프레임워크 동작 확인
node examples/01-basic-workflow.js
```

---

## 3. 프레임워크 구조 이해

```
ai-standard/
├── ai-system/
│   ├── agents/                    # Agent 역할 정의서
│   │   ├── planner.md             #   Goal → Task 분해 담당
│   │   ├── dev.md                 #   Claude: 설계 + 코드 생성
│   │   ├── codex.md               #   Codex: 실행 + 수정 + 리뷰
│   │   └── review.md              #   리뷰 검증 항목 참조
│   ├── prompts/                   # 프롬프트 템플릿
│   │   ├── planner-prompt.md      #   Planner Agent 프롬프트
│   │   ├── dev-prompt.md          #   Claude용 프롬프트
│   │   ├── codex-prompt.md        #   Codex용 프롬프트
│   │   └── review-prompt.md       #   리뷰 프롬프트
│   ├── flows/                     # 워크플로우 정의
│   │   └── feature-flow.json      #   상태 머신 + 재시도 + 승인 정책
│   ├── harness/                   # Control Layer (핵심 엔진)
│   │   ├── runner.js              #   메인 실행기 (상태 전이 제어)
│   │   ├── retry.js               #   재시도 관리 (최대 3회)
│   │   ├── feedback-injector.js   #   실패 사유 → 프롬프트 주입
│   │   └── validator.js           #   CI 파이프라인 검증
│   ├── integration/               # 외부 시스템 연동
│   │   ├── codex.js               #   Codex CLI (실행, 리뷰, rescue)
│   │   ├── gitlab.js              #   GitLab API (브랜치, MR, CI)
│   │   ├── jira.js                #   Jira API (티켓, 상태 전이)
│   │   └── slack.js               #   Slack Webhook (알림)
│   └── config/                    # 설정 파일
│       ├── agents.json            #   Agent 모델, 파라미터
│       └── security-policy.json   #   보안 정책 정의
├── examples/                      # 실행 가능한 예제
│   ├── 01-basic-workflow.js       #   기본 워크플로우 (성공 시나리오)
│   ├── 02-feedback-loop.js        #   피드백 루프 (REJECT → 재시도 → APPROVE)
│   ├── 03-financial-task.js       #   금융 로직 Task ([FINANCIAL] 태그)
│   ├── 04-max-retry-failure.js    #   3회 반복 실패 시나리오
│   ├── 05-planner-decompose.js    #   Planner Agent Task 분해 예제
│   ├── 06-custom-agent.js         #   커스텀 Agent 연동 예제
│   └── 07-integration-demo.js     #   GitLab + Jira + Slack 통합 예제
├── docs/
│   ├── USAGE.md                   #   사용 설명서 (이 문서)
│   └── STANDARD.md                #   AI 개발 표준 원문 v1.1
├── .env.example                   # 환경 변수 템플릿
├── package.json
└── README.md
```

### 3-Agent 아키텍처 관계도

```
                    ┌─────────────────┐
                    │   HarnessRunner  │  ← 오케스트레이션 + 테스트 + 검증
                    │   (runner.js)    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ↓                   ↓                   ↓
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │    Claude     │   │    Codex     │   │   Harness    │
  │  (설계+생성)  │   │ (실행+수정)  │   │ (테스트+검증) │
  │              │   │   + 리뷰     │   │              │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         │                   │                   │
         ↓                   ↓                   ↓
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ dev-prompt.md│   │codex-prompt  │   │  Validator    │
  │              │   │  .md         │   │ + RetryMgr    │
  └──────────────┘   └──────────────┘   │ + FeedbackInj│
                                        └──────────────┘

  피드백 라우팅:
    리뷰 REJECT    → Claude (설계 수정)
    실행/CI 실패   → Codex  (실행 수정)
```

---

## 4. Task 실행하기

### 4.1 Task 객체 구조

모든 Task는 다음 구조를 따릅니다:

```javascript
const task = {
  // 필수 필드
  id: 'TASK-001',              // Jira Task ID
  description: 'Task 설명',     // 구체적인 요구사항

  // 권장 필드
  tags: ['business-logic'],     // 태그 (금융 로직: 'FINANCIAL' 포함)
  context: `
    DB Schema:
      wallet (id, user_id, currency, balance)
    API Spec:
      GET /api/v1/balance
  `,

  // 자동 관리 필드 (Harness가 관리)
  reviewFeedback: null,         // 리뷰 실패 시 자동 주입됨
};
```

### 4.2 Agent 인터페이스 (3-Agent)

Harness에 연동하는 Agent는 다음 인터페이스를 구현해야 합니다:

```javascript
// Claude Agent 인터페이스 — 설계 + 코드 생성
const claude = {
  async generate(prompt) {
    // prompt: FeedbackInjector가 조합한 최종 프롬프트 (string)
    // 실제로는 Anthropic API를 호출하여 코드를 생성
    return {
      code: '생성된 코드',
      testCode: '테스트 코드',
      files: [
        { path: 'src/main/.../MyService.java', content: '...' },
        { path: 'src/test/.../MyServiceTest.java', content: '...' },
      ],
      diff: 'git diff 형식의 변경 내용',
    };
  },
};

// Codex Agent 인터페이스 — 실행 + 수정 + 리뷰
const codex = {
  // 실행 + 수정: Claude의 코드를 빌드/테스트하고 오류 수정
  async execute({ taskId, code, testCode, instruction, errorLog }) {
    return {
      success: true,           // 실행 성공 여부
      code: '수정된 코드',      // 수정된 코드 (또는 원본 유지)
      diff: '변경 사항 diff',
      buildResult: { passed: true },
      testResult: { passed: true, coverage: 85 },
    };
  },

  // 코드 리뷰: 검증 전용 (설계 변경 불가)
  async review({ taskId, diff, tags }) {
    return {
      verdict: 'APPROVE',  // 'APPROVE' 또는 'REJECT'
      issues: [
        {
          severity: 'LOW',           // CRITICAL | HIGH | MEDIUM | LOW
          category: 'performance',   // logic | security | performance | financial | test
          file: 'MyService.java',
          line: '15',
          description: '문제 설명',
          suggestion: '수정 방향',
        },
      ],
      summary: '리뷰 요약',
    };
  },
};
```

### 4.3 실행

```javascript
const { HarnessRunner } = require('./ai-system/harness/runner');

const runner = new HarnessRunner();
const result = await runner.run(task, { claude, codex });

// result 구조:
// 성공: { success: true,  state: 'DONE',   task: 'TASK-001' }
// 실패: { success: false, state: 'FAILED', reason: 'max_retry_exceeded' }
```

---

## 5. Agent 연동 가이드

### 5.1 Claude — 설계 + 코드 생성

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const claude = {
  async generate(prompt) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].text;

    return {
      code: content,
      diff: content,
      files: [],  // 파일 단위 파싱 필요
    };
  },
};
```

### 5.2 Codex — 실행 + 수정 + 리뷰

```javascript
const { CodexClient } = require('./ai-system/integration/codex');

const codexClient = new CodexClient({
  model: 'codex-mini-latest',
  effort: 'high',
});

const codex = {
  // 실행 + 수정
  async execute({ taskId, code, instruction, errorLog }) {
    return codexClient.executeAndFix({ taskId, code, instruction, errorLog });
  },

  // 코드 리뷰
  async review({ taskId, diff, tags }) {
    const isFinancial = tags?.includes('FINANCIAL');
    return codexClient.review({ adversarial: isFinancial });
  },
};
```

**Codex CLI 직접 사용:**

```bash
# 빌드 오류 수정 위임
codex rescue "fix compilation errors in BalanceService.java"

# 표준 코드 리뷰
codex review

# 적대적 리뷰 (금융 로직)
codex adversarial-review --base main

# 백그라운드 실행
codex rescue --background "run all tests and fix failures"
codex status
codex result
```

---

## 6. 프롬프트 커스터마이징

### 6.1 변수 치환 규칙

프롬프트 템플릿의 `{{변수명}}`은 FeedbackInjector가 자동으로 치환합니다:

| 변수 | 치환 시점 | 값 |
|------|-----------|-----|
| `{{task}}` | Dev 프롬프트 생성 시 | `task.description` |
| `{{system_context}}` | Dev/Review 프롬프트 생성 시 | `task.context` |
| `{{review_feedback}}` | 재시도 시 | Review Agent의 거절 사유 |
| `{{pr_diff}}` | Review 프롬프트 생성 시 | Dev Agent의 코드 diff |
| `{{branch_name}}` | Review 프롬프트 생성 시 | `feature/AI-{task.id}` |
| `{{task_id}}` | Review 프롬프트 생성 시 | `task.id` |
| `{{task_tags}}` | Review 프롬프트 생성 시 | `task.tags.join(', ')` |

### 6.2 프롬프트 수정 예시

Dev Agent에 코딩 컨벤션을 추가하고 싶다면 `ai-system/prompts/dev-prompt.md`를 수정합니다:

```markdown
조건:
1. 기존 코드 스타일 및 사내 가이드라인(Linter)을 엄격히 유지할 것.
2. ...기존 조건...
7. [추가] 메서드 이름은 camelCase, 클래스 이름은 PascalCase를 사용할 것.
8. [추가] 모든 public 메서드에 Javadoc 주석을 작성할 것.
```

### 6.3 새로운 변수 추가

FeedbackInjector를 확장하여 새 변수를 추가할 수 있습니다:

```javascript
// ai-system/harness/feedback-injector.js 의 buildDevPrompt 메서드 확장
buildDevPrompt(task) {
  const template = this.loadTemplate('dev-prompt.md');
  // ...기존 치환...
  // 새 변수 추가
  prompt = prompt.replace(/\{\{coding_standard\}\}/g, task.codingStandard || 'Java 17 + Spring Boot 3.x');
  return prompt;
}
```

---

## 7. 워크플로우 커스터마이징

### 7.1 상태 추가

`ai-system/flows/feature-flow.json`에 새 상태를 추가할 수 있습니다.
예를 들어, 보안 검사 단계를 추가하려면:

```json
{
  "states": {
    "REVIEW": {
      "transitions": [
        {
          "to": "SECURITY_SCAN",
          "trigger": "review_approved",
          "agent": "review"
        }
      ]
    },
    "SECURITY_SCAN": {
      "description": "보안 취약점 자동 스캔 (SAST/DAST)",
      "transitions": [
        { "to": "DONE", "trigger": "scan_passed" },
        { "to": "IN_PROGRESS", "trigger": "scan_failed", "action": "inject_security_feedback" }
      ]
    }
  }
}
```

### 7.2 재시도 횟수 변경

```json
{
  "retryPolicy": {
    "maxRetries": 5,
    "feedbackInjection": true,
    "onMaxRetryExceeded": "FAILED"
  }
}
```

또는 HarnessRunner 생성 시 오버라이드:

```javascript
const runner = new HarnessRunner({ maxRetries: 5 });
```

### 7.3 승인 정책 변경

```json
{
  "approvalPolicy": {
    "general": { "humanApprovalRequired": 1 },
    "financial": { "humanApprovalRequired": 3, "tags": ["FINANCIAL"] },
    "security": { "humanApprovalRequired": 2, "tags": ["SECURITY"] }
  }
}
```

---

## 8. 외부 시스템 연동

### 8.1 GitLab

```javascript
const { GitLabClient } = require('./ai-system/integration/gitlab');

const gitlab = new GitLabClient();

// 브랜치 생성
const branch = await gitlab.createBranch('TASK-001');
// → feature/AI-TASK-001

// 파일 커밋
await gitlab.commitFiles(branch.name, [
  { path: 'src/main/.../MyService.java', content: '...' },
], 'feat(AI-TASK-001): 잔액 조회 서비스 구현');

// MR 생성
const mr = await gitlab.createMergeRequest({
  sourceBranch: branch.name,
  title: '[AI] TASK-001: 잔액 조회 API 구현',
  description: 'Dev Agent가 생성한 코드입니다. Review Agent 리뷰 대기 중.',
});

// MR diff 조회 (Review Agent에 전달)
const diff = await gitlab.getMRDiff(mr.iid);

// 리뷰 코멘트 추가
await gitlab.addMRComment(mr.iid, '## Review Agent 리뷰 결과\n...');
```

### 8.2 Jira

```javascript
const { JiraClient } = require('./ai-system/integration/jira');

const jira = new JiraClient();

// Planner가 분해한 Task를 서브 태스크로 생성
await jira.createSubTasks('TASK-100', [
  { title: 'API 명세 설계', description: '...', tags: ['api-design'] },
  { title: 'DB 쿼리 정의', description: '...', tags: ['db-design'] },
  { title: '서비스 로직 구현', description: '...', tags: ['business-logic'] },
]);

// 상태 전이
await jira.transitionIssue('TASK-101', 'AI_DEV');
await jira.transitionIssue('TASK-101', 'AI_TEST');
await jira.transitionIssue('TASK-101', 'DONE');
```

### 8.3 Slack

```javascript
const { SlackNotifier } = require('./ai-system/integration/slack');

const slack = new SlackNotifier();

// 각 이벤트별 알림 예시
await slack.notifyPRCreated({ taskId: 'TASK-001', branchName: 'feature/AI-TASK-001', mrUrl: '...' });
await slack.notifyCIFailed({ taskId: 'TASK-001', error: 'Test failed', retryCount: 1 });
await slack.notifyReviewComplete({ taskId: 'TASK-001', verdict: 'APPROVE', summary: '...' });
await slack.notifyFailed({ taskId: 'TASK-001', reason: '3회 반복 실패', mention: '@here' });
await slack.notifyAwaitingApproval({ taskId: 'TASK-001', mrUrl: '...', isFinancial: true });
await slack.notifyDeployed({ taskId: 'TASK-001', environment: 'production' });
```

---

## 9. 보안 정책 체크리스트

프로젝트에 적용하기 전 반드시 확인하세요:

### 프롬프트 보안

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는가?
- [ ] API Key, DB 비밀번호가 프롬프트에 주입되지 않는가?
- [ ] KYC/개인정보 데이터가 컨텍스트에 포함되지 않는가?
- [ ] 로그에 민감 정보가 기록되지 않는가?

### 금융 로직

- [ ] `[FINANCIAL]` 태그가 올바르게 부여되었는가?
- [ ] 금융 로직 PR에 Human 2인 이상 승인이 설정되었는가?
- [ ] 트랜잭션 격리 수준이 REPEATABLE_READ 이상인가?
- [ ] Rollback 처리가 포함되어 있는가?

### 의존성 관리

- [ ] AI가 임의로 추가한 외부 라이브러리가 없는가?
- [ ] build.gradle / pom.xml 변경 사항이 Human 승인을 받았는가?

---

## 10. 트러블슈팅

### Q: 예제 실행 시 `MODULE_NOT_FOUND` 에러

```bash
npm install   # 의존성 재설치
```

### Q: Agent API 호출 시 401 에러

`.env` 파일의 API Key가 올바른지 확인하세요. `.env.example`과 비교하여 키 이름이 정확한지 검증합니다.

### Q: 피드백 루프가 무한 반복되는 것 같다

`retry.js`의 `maxRetries` 제한에 의해 최대 3회까지만 재시도됩니다. 로그에서 `MAX_RETRY_EXCEEDED` 이벤트를 확인하세요.

### Q: GitLab MR이 생성되지 않는다

1. `GITLAB_TOKEN`의 scope에 `api` 권한이 있는지 확인
2. `GITLAB_PROJECT_ID`가 올바른지 확인 (Settings > General에서 확인 가능)
3. 네트워크 연결 및 GitLab 서버 상태 확인

### Q: Slack 알림이 발송되지 않는다

`SLACK_WEBHOOK_URL`이 미설정이면 로컬 콘솔에 출력됩니다. Slack App에서 Incoming Webhook이 활성화되어 있는지 확인하세요.

### Q: 커스텀 상태를 추가했는데 전이가 안 된다

`feature-flow.json`에 상태를 추가한 후, `runner.js`의 `run()` 메서드에 해당 상태의 실행 로직도 함께 구현해야 합니다.
