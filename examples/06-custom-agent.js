/**
 * 예제 06: 실제 AI API 연동 예제 (Claude + Codex)
 *
 * 실제 Anthropic Claude API와 OpenAI Codex CLI를 연동하는 방법을 보여줍니다.
 * API Key 미설정 시 Mock 모드로 폴백합니다.
 *
 * 실행:
 *   node examples/06-custom-agent.js
 *
 * 사전 설정 (실제 연동 시):
 *   1. npm install @anthropic-ai/sdk
 *   2. npm install -g @openai/codex && codex login
 *   3. .env에 ANTHROPIC_API_KEY 설정
 */

require('dotenv').config();

const { HarnessRunner } = require('../ai-system/harness/runner');
const agentConfig = require('../ai-system/config/agents.json');

// ============================================================
// 1. Claude Agent 팩토리
// ============================================================

function createClaude() {
  const cfg = agentConfig.agents.claude;

  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`  [설정] Claude: ${cfg.model} (실제 API 연동 가능)\n`);
    // 실제 연동 코드:
    // const Anthropic = require('@anthropic-ai/sdk');
    // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // return {
    //   async generate(prompt) {
    //     const res = await client.messages.create({
    //       model: cfg.model, max_tokens: cfg.maxTokens,
    //       temperature: cfg.temperature,
    //       messages: [{ role: 'user', content: prompt }],
    //     });
    //     return parseClaudeResponse(res.content[0].text);
    //   },
    // };
  } else {
    console.log('  [설정] Claude: Mock 모드 (ANTHROPIC_API_KEY 미설정)\n');
  }

  return {
    async generate(prompt) {
      console.log('  [Claude] Mock: 코드 생성\n');
      return {
        code: '@Service class CacheService { /* 캐시 로직 */ }',
        testCode: '@SpringBootTest class CacheServiceTest { /* 테스트 */ }',
        files: [{ path: 'CacheService.java', content: '...' }],
        diff: '+ CacheService.java',
      };
    },
  };
}

// ============================================================
// 2. Codex Agent 팩토리
// ============================================================

function createCodex() {
  const cfg = agentConfig.agents.codex;
  console.log(`  [설정] Codex: ${cfg.model} (effort: ${cfg.effort})\n`);

  // 실제 연동:
  // const { CodexClient } = require('../ai-system/integration/codex');
  // const client = new CodexClient({ model: cfg.model, effort: cfg.effort });
  // return {
  //   async execute(params) { return client.executeAndFix(params); },
  //   async review(params) { return client.review({ adversarial: params.tags?.includes('FINANCIAL') }); },
  // };

  return {
    async execute({ taskId }) {
      console.log('  [Codex] Mock: 빌드 + 테스트 실행 → 성공\n');
      return { success: true, code: '...', diff: '...', buildResult: { passed: true }, testResult: { passed: true, coverage: 85 } };
    },
    async review({ taskId }) {
      console.log('  [Codex] Mock: 코드 리뷰 → APPROVE\n');
      return { verdict: 'APPROVE', issues: [], summary: 'Mock 리뷰 통과' };
    },
  };
}

// ============================================================
// 3. 실행
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  예제 06: 실제 API 연동 (Claude + Codex)                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('┌─── Agent 설정 ──────────────────────────────────────────┐');
  console.log(`│ Claude: ${agentConfig.agents.claude.model.padEnd(30)} (설계 + 코드 생성)`);
  console.log(`│ Codex:  ${agentConfig.agents.codex.model.padEnd(30)} (실행 + 수정 + 리뷰)`);
  console.log('└──────────────────────────────────────────────────────────┘\n');

  const claude = createClaude();
  const codex = createCodex();

  const task = {
    id: 'TASK-099',
    description: 'Redis 캐시 서비스 구현',
    tags: ['business-logic'],
    context: 'Cache-Aside 패턴, TTL 60초',
  };

  const runner = new HarnessRunner();
  const result = await runner.run(task, { claude, codex });

  console.log('\n┌─── 결과 ──────────────────────────────────────────────┐');
  console.log(`│ 성공: ${result.success}  상태: ${result.state}`);
  console.log('└────────────────────────────────────────────────────────┘');

  console.log('\n[실제 연동 시]');
  console.log('  1. npm install @anthropic-ai/sdk');
  console.log('  2. npm install -g @openai/codex && codex login');
  console.log('  3. .env에 ANTHROPIC_API_KEY 설정');
  console.log('  4. 위 코드의 주석 해제');
}

main().catch(console.error);
