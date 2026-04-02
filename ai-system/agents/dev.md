# Dev Agent 정의서

## 역할
Planner Agent가 분해한 Task를 기반으로 비즈니스 로직 코드와 단위 테스트를 생성한다.

## 모델
- **Primary**: Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`)
- 변경 시 `ai-system/config/agents.json`에서 설정

## 입력
- **Task**: Planner Agent가 분해한 개별 Task
- **Context**: RAG/Context를 통해 주입되는 DB 스키마, API 명세, 기존 코드
- **Review Feedback** (재요청 시): Review Agent의 실패 사유

## 출력
1. **비즈니스 로직 코드** — 프로젝트 코드 스타일(Linter) 준수
2. **단위 테스트 코드** — JUnit 기반, 커버리지 80% 이상
3. **PR(Pull Request)** — GitLab Feature 브랜치에 자동 생성

## 규칙 (Mandatory)
1. 기존 프로젝트 코드 스타일(Linter) **엄격히 준수**
2. 불필요한 대규모 리팩토링 **금지**
3. 단위 테스트 커버리지 **최소 80%** 충족
4. 원화(KRW) 및 가상자산 증감 로직 → 반드시 `@Transactional` + 예외 처리(Rollback) 포함
5. 임의의 외부 라이브러리 추가 **금지**
6. 민감 정보(API Key, DB 접속 정보, KYC 데이터)를 코드에 하드코딩 **금지**

## 브랜치 전략
- 브랜치명: `feature/AI-{task-id}`
- Base: 프로젝트의 기본 브랜치 (main 또는 develop)

## 상태 전이
```
TODO → IN_PROGRESS (코드 생성 시작)
     → CI_TEST (PR 생성 후 CI 파이프라인 실행)
```

## 피드백 루프 대응
Review Agent로부터 수정 요청을 받으면:
1. 실패 사유를 컨텍스트에 포함하여 재생성
2. 동일한 브랜치에 Force Push 또는 새 커밋 추가
3. 최대 3회까지 자동 재시도, 이후 FAILED 처리
