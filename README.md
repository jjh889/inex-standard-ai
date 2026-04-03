# AI Development Standard Framework v2.0

**3-Agent 아키텍처** 기반 개발 자동화 프레임워크.
각 Agent가 명확히 분리된 책임을 갖고, Harness가 전체 파이프라인을 오케스트레이션합니다.

| Agent | 역할 | 모델 |
|-------|------|------|
| **Claude** | 설계 + 코드 생성 | Anthropic Claude Sonnet |
| **Codex** | 실행 + 수정 + 코드 리뷰 | OpenAI Codex |
| **Harness** | 테스트 + 검증 + 피드백 라우팅 | CI Pipeline |

> 표준 원문: [docs/STANDARD.md](docs/STANDARD.md) | 상세 사용 설명서: [docs/USAGE.md](docs/USAGE.md)

---

## 아키텍처

```
[PM/개발자] ─→ [Goal 정의] ─→ [Planner Agent]
                                      │
                                Task 분해 + Jira 서브태스크 생성
                                      │
                              [PLAN_REVIEW]
                          AI 실행 계획 생성 → Human 확인/승인
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ↓                            ↓                            ↓
     Claude                        Codex                       Harness
  "무엇을 만들지"              "돌아가게 만듦"              "맞는지 확인"
  ─────────────               ─────────────               ─────────────
  • API/로직 설계              • 빌드 + 실행               • CI 파이프라인
  • 코드 생성                  • 컴파일 오류 수정           • 테스트 검증
  • 테스트 케이스 설계          • 런타임 에러 수정           • 피드백 라우팅
                              • 코드 리뷰 (검증)           • 상태 관리
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ↓
                           ┌─── 피드백 라우팅 ───┐
                           │                      │
                           │  리뷰 REJECT          │──→ Claude (설계 수정)
                           │  실행/CI 실패         │──→ Codex (실행 수정)
                           │  3회 실패 → FAILED    │──→ 개발자 수동 개입
                           │  전체 통과            │──→ Human 승인 대기
                           └──────────────────────┘
```

### 상태 전이

```
TODO → PLAN_REVIEW → DESIGN → CODEX_EXEC → CI_TEST → REVIEW → DONE → MERGED
       (AI 계획 확인)  (Claude)   (Codex)    (Harness)  (Codex)  (Human)
                ↑          ↑           │         │
                │          └───────────┘         │  실행/CI 실패
                │          (Codex 재수정)         │  → Codex에게 피드백
                │                                │
                └────────────────────────────────┘  리뷰 REJECT
                                                    → Claude에게 피드백
       PLAN 거부 → FAILED                 FAILED ← 3회 초과
```

### 핵심: 피드백 라우팅

| 실패 유형 | 피드백 대상 | 이유 |
|-----------|------------|------|
| PLAN 거부 | **중단** | Human이 실행 계획을 거부 → FAILED |
| Codex 실행 실패 | **Codex** | 빌드/런타임 오류 → 실행 레벨 수정 |
| CI 테스트 실패 | **Codex** | 테스트 코드/로직 수정 |
| 리뷰 REJECT | **Claude** | 설계/아키텍처 문제 → 재설계 |
| 같은 에러 2회 반복 | **Claude** | 에스컬레이션 → 설계 레벨 재검토 |

---

## Quick Start

```bash
git clone <repository-url>
cd ai-standard
npm install

# 예제 실행 (외부 API 불필요)
node examples/01-basic-workflow.js
```

### Codex 플러그인 설치 (Claude Code 사용 시)

```bash
# Claude Code에서 Codex 플러그인 설치
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

---

## 프로젝트 구조

```
ai-standard/
├── ai-system/
│   ├── agents/                         # Agent 역할 정의서
│   │   ├── planner.md                  #   Goal → Task 분해
│   │   ├── dev.md                      #   Claude: 설계 + 코드 생성
│   │   ├── codex.md                    #   Codex: 실행 + 수정 + 리뷰
│   │   └── review.md                   #   리뷰 검증 항목 (Codex 참조)
│   ├── prompts/                        # 프롬프트 템플릿
│   │   ├── planner-prompt.md           #   {{goal}}, {{project_context}}
│   │   ├── dev-prompt.md               #   Claude용: {{task}}, {{review_feedback}}
│   │   ├── codex-prompt.md             #   Codex용: {{claude_code}}, {{execution_error}}
│   │   └── review-prompt.md            #   리뷰용: {{pr_diff}}, {{task_tags}}
│   ├── flows/
│   │   └── feature-flow.json           #   3-Agent 상태 머신 + 피드백 라우팅
│   ├── harness/                        # Control Layer
│   │   ├── runner.js                   #   3-Agent 오케스트레이터
│   │   ├── retry.js                    #   재시도 관리 (최대 3회)
│   │   ├── feedback-injector.js        #   피드백 라우팅 (Claude/Codex 분기)
│   │   └── validator.js                #   CI 파이프라인 검증
│   ├── integration/                    # 외부 시스템 연동
│   │   ├── codex.js                    #   Codex CLI 연동 (실행/리뷰/rescue)
│   │   ├── gitlab.js                   #   GitLab API
│   │   ├── jira.js                     #   Jira API
│   │   └── slack.js                    #   Slack Webhook
│   └── config/
│       ├── agents.json                 #   Claude/Codex 모델 + 파라미터
│       └── security-policy.json        #   보안 정책
├── examples/                           # 실행 가능한 예제 7개
├── docs/
│   ├── USAGE.md                        # 상세 사용 설명서
│   └── STANDARD.md                     # AI 개발 표준 원문
└── package.json
```

---

## 예제 목록

| # | 파일 | 시나리오 | 핵심 |
|---|------|---------|------|
| 01 | `01-basic-workflow.js` | **3-Agent 기본 성공** | Claude→Codex→Harness→리뷰 전체 흐름 |
| 02 | `02-feedback-loop.js` | **Codex 실행 실패→재수정** | 실행 실패 피드백 → Codex에게 라우팅 |
| 03 | `03-financial-task.js` | **금융 로직 [FINANCIAL]** | 리뷰 REJECT → Claude 재설계, 적대적 리뷰 |
| 04 | `04-max-retry-failure.js` | **3회 실패→FAILED** | 아키텍처 레벨 문제 → 개발자 수동 개입 |
| 05 | `05-planner-decompose.js` | **Goal→Task 분해** | 3-Agent 할당 시각화 |
| 06 | `06-custom-agent.js` | **실제 API 연동** | Claude API + Codex CLI 연동 코드 |
| 07 | `07-integration-demo.js` | **GitLab+Jira+Slack 통합** | 3-Agent 타임라인 시각화 |
| 08 | `08-smart-retry-escalation.js` | **Smart Retry + 에스컬레이션** | 같은 에러 2회 → Codex→Claude 자동 전환 |

```bash
node examples/01-basic-workflow.js          # 기본 3-Agent 흐름
node examples/02-feedback-loop.js           # Codex 실행 실패 → 재수정
node examples/03-financial-task.js          # 금융 로직 + 적대적 리뷰
node examples/08-smart-retry-escalation.js  # Smart Retry 에스컬레이션
```

---

## Agent 설정

`ai-system/config/agents.json`:

```json
{
  "agents": {
    "claude": {
      "role": "설계자 — 무엇을 만들지 결정",
      "model": "claude-sonnet-4-6",
      "temperature": 0.2
    },
    "codex": {
      "role": "실행자 — 실제로 돌아가게 만듦",
      "model": "codex-mini-latest",
      "effort": "high",
      "capabilities": ["execute", "review", "adversarialReview", "rescue"]
    }
  }
}
```

---

## Codex CLI 명령어

| 명령어 | 용도 | 사용 시점 |
|--------|------|-----------|
| `codex rescue "..."` | 작업 위임 (빌드 수정, 버그 조사) | CODEX_EXEC 단계 |
| `codex review` | 표준 코드 리뷰 | REVIEW 단계 |
| `codex adversarial-review` | 설계 검증 리뷰 | [FINANCIAL] Task 리뷰 |
| `codex status` | 작업 상태 확인 | 백그라운드 실행 시 |
| `codex result` | 완료 결과 조회 | 작업 완료 후 |

---

## 리스크 대응

### 1. 디버깅 복잡성 — AI Audit Log

> 문제가 Claude인지 / Codex인지 / Harness인지 알 수 없다

**해결: `audit-logger.js`** — 모든 Agent 입출력을 구조화하여 추적

```
logs/audit/TASK-001_20260402_abc123.json
```

기록 항목:
- Claude: 프롬프트 메타데이터 + 생성 코드 길이/파일 수
- Codex: 실행 결과 + 빌드/테스트 결과 + 수정 diff
- Harness: CI 결과 + **피드백 라우팅 결정 사유**
- 상태 전이: 전체 타임라인

```javascript
const report = runner.getAuditReport();
// { sessionId, summary: { claudeCalls: 3, codexCalls: 4, escalations: 1 }, entries: [...] }
```

### 2. Codex 땜질 문제 — Smart Retry + 자동 에스컬레이션

> Claude 설계가 틀리면 Codex가 계속 땜질만 한다

**해결: `smart-retry.js`** — 실패 패턴 분석 후 자동 에스컬레이션

| 상황 | 기존 (단순 retry) | Smart Retry |
|------|-------------------|-------------|
| Codex 같은 에러 2회 | Codex에게 또 보냄 | **Claude에게 에스컬레이션** (재설계) |
| CI 같은 테스트 2회 실패 | Codex에게 또 보냄 | **Claude에게 에스컬레이션** |
| 리뷰 REJECT | Claude에게 보냄 | Claude에게 보냄 (동일) |

```
1차: Codex 빌드 실패 (import 오류) → Codex에게 피드백
2차: Codex 같은 빌드 실패 → ⚡ 에스컬레이션 → Claude에게 재설계 요청
3차: Claude 재설계 → Codex 성공
```

예제: `node examples/08-smart-retry-escalation.js`

### 3. 실패 루프 안전장치

- **최대 3회** 재시도 후 FAILED (무한 루프 방지)
- **에러 시그니처 정규화**: 줄번호/경로 제거 후 패턴 비교
- **실패 통계**: `runner.retryManager.getStats(taskId)`로 패턴 분석
- **Slack 멘션 알림**: FAILED 시 `@here` 포함 알림 발송

---

## 보안 정책

- **민감 정보** — API Key, DB 비밀번호, KYC 데이터 → 프롬프트/로그 저장 금지
- **금융 로직** — `[FINANCIAL]` 태그 → Codex 적대적 리뷰 + Human 2인 승인
- **역할 분리** — Claude(생성)과 Codex(검증)의 역할 분리 엄수
- **Codex 제약** — 설계 변경 금지, 외부 라이브러리 추가 금지, 실행 레벨 수정만 허용

---

## 금지 사항

- 하나의 AI가 코드 생성과 검증을 동시에 수행
- AI 코드를 Human 승인 없이 운영 환경에 직배포
- Codex가 Claude의 설계 의도를 변경
- Human 승인 없는 대규모 리팩토링 및 외부 라이브러리 도입

---

## 문서

| 문서 | 설명 |
|------|------|
| [docs/USAGE.md](docs/USAGE.md) | 설치, 설정, 실행, 커스터마이징 가이드 |
| [docs/STANDARD.md](docs/STANDARD.md) | AI 개발 표준 v1.1 원문 |
| [ai-system/agents/*.md](ai-system/agents/) | Agent별 역할 정의서 (Claude, Codex, Planner) |
| [ai-system/prompts/*.md](ai-system/prompts/) | 프롬프트 템플릿 + 변수 설명 |
