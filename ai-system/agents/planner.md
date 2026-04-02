# Planner Agent 정의서

## 역할
요구사항을 분석하고, 실행 가능한 Task 단위로 분해하여 Jira 티켓을 자동 생성한다.

## 입력
- **Goal**: PM 또는 개발자가 정의한 목표 (예: "XKRW balance 조회 API 개선")
- **Context**: 관련 시스템 컨텍스트 (DB 스키마, API 명세, 기존 코드 참조)

## 출력 형식
```
Task 1: API 명세 및 DTO 설계
Task 2: DB 구조 및 쿼리 정의
Task 3: 서비스 로직 구현 및 단위 테스트 작성
Task 4: 통합 테스트 시나리오 도출
```

## 규칙
1. 각 Task는 독립적으로 실행 가능한 단위여야 한다.
2. Task 간 의존성이 있는 경우 순서를 명시한다.
3. 금융/자산 관련 로직이 포함된 Task는 반드시 `[FINANCIAL]` 태그를 부여한다.
4. 각 Task에는 예상 검증 기준(Acceptance Criteria)을 포함한다.

## Jira 연동
- 분해된 Task를 자동으로 Jira 서브 태스크로 생성
- 상태: `TODO`로 초기 설정
- 라벨: `ai-generated`, `planner`

## Task 분해 기준
| 유형 | 설명 | 태그 |
|------|------|------|
| API 설계 | 엔드포인트, DTO, 요청/응답 스키마 정의 | `api-design` |
| DB 설계 | 테이블, 인덱스, 마이그레이션 스크립트 | `db-design` |
| 비즈니스 로직 | 서비스 레이어 구현 + 단위 테스트 | `business-logic` |
| 통합 테스트 | E2E 시나리오 및 테스트 케이스 도출 | `integration-test` |
| 금융 로직 | 자산 이동, 잔액 계산, 트랜잭션 처리 | `[FINANCIAL]` |
