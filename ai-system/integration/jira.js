/**
 * AI Dev Standard - Jira Integration
 *
 * Jira API 연동 모듈.
 * Task 생성, 상태 전이, 서브 태스크 자동 생성 등을 처리한다.
 *
 * 상태 흐름: TODO → PLAN_REVIEW → AI_DEV → AI_TEST → AI_REVIEW → DONE
 */

const axios = require('axios');

class JiraClient {
  constructor(config = {}) {
    this.baseUrl = config.url || process.env.JIRA_URL;
    this.email = config.email || process.env.JIRA_EMAIL;
    this.apiToken = config.apiToken || process.env.JIRA_API_TOKEN;
    this.projectKey = config.projectKey || process.env.JIRA_PROJECT_KEY;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/rest/api/3`,
      auth: { username: this.email, password: this.apiToken },
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Planner Agent가 분해한 Task들을 Jira 서브 태스크로 생성한다.
   *
   * @param {string} parentIssueKey - 부모 이슈 키 (예: 'TASK-100')
   * @param {Array<Object>} tasks - 분해된 Task 목록
   * @returns {Array<Object>} 생성된 서브 태스크 목록
   */
  async createSubTasks(parentIssueKey, tasks) {
    console.log(`[Jira] 서브 태스크 ${tasks.length}개 생성 - 부모: ${parentIssueKey}`);

    const created = [];
    for (const task of tasks) {
      const issue = await this.createIssue({
        summary: task.title,
        description: task.description,
        issueType: 'Sub-task',
        parentKey: parentIssueKey,
        labels: ['ai-generated', ...(task.tags || [])],
      });
      created.push(issue);
    }

    return created;
  }

  /**
   * Jira 이슈를 생성한다.
   *
   * @param {Object} options
   * @returns {Object} 생성된 이슈
   */
  async createIssue({ summary, description, issueType = 'Task', parentKey, labels = [] }) {
    const fields = {
      project: { key: this.projectKey },
      summary,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      },
      issuetype: { name: issueType },
      labels,
    };

    if (parentKey) {
      fields.parent = { key: parentKey };
    }

    const response = await this.client.post('/issue', { fields });
    console.log(`[Jira] 이슈 생성: ${response.data.key}`);
    return response.data;
  }

  /**
   * 이슈 상태를 전이한다.
   *
   * @param {string} issueKey
   * @param {string} statusName - 전이할 상태명 (예: 'AI_DEV', 'AI_TEST', 'DONE')
   */
  async transitionIssue(issueKey, statusName) {
    // 사용 가능한 전이 목록 조회
    const transitions = await this.client.get(`/issue/${issueKey}/transitions`);
    const target = transitions.data.transitions.find(
      (t) => t.name.toUpperCase() === statusName.toUpperCase()
    );

    if (!target) {
      console.warn(`[Jira] 전이 불가: ${issueKey} → ${statusName} (사용 가능한 전이 없음)`);
      return null;
    }

    await this.client.post(`/issue/${issueKey}/transitions`, {
      transition: { id: target.id },
    });

    console.log(`[Jira] 상태 전이: ${issueKey} → ${statusName}`);
    return { issueKey, status: statusName };
  }

  /**
   * 이슈에 코멘트를 추가한다.
   *
   * @param {string} issueKey
   * @param {string} comment
   */
  async addComment(issueKey, comment) {
    await this.client.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: comment }],
          },
        ],
      },
    });

    console.log(`[Jira] 코멘트 추가: ${issueKey}`);
  }
}

module.exports = { JiraClient };
