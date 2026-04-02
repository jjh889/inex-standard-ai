/**
 * AI Dev Standard - GitLab Integration
 *
 * GitLab API 연동 모듈.
 * Feature 브랜치 생성, MR(Merge Request) 생성, CI 파이프라인 트리거 등을 처리한다.
 */

const axios = require('axios');

class GitLabClient {
  constructor(config = {}) {
    this.baseUrl = config.url || process.env.GITLAB_URL;
    this.token = config.token || process.env.GITLAB_TOKEN;
    this.projectId = config.projectId || process.env.GITLAB_PROJECT_ID;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v4`,
      headers: { 'PRIVATE-TOKEN': this.token },
    });
  }

  /**
   * Feature 브랜치를 생성한다.
   * 브랜치명 규칙: feature/AI-{taskId}
   *
   * @param {string} taskId
   * @param {string} baseBranch - 기본 브랜치 (default: 'main')
   * @returns {Object} 생성된 브랜치 정보
   */
  async createBranch(taskId, baseBranch = 'main') {
    const branchName = `feature/AI-${taskId}`;
    console.log(`[GitLab] 브랜치 생성: ${branchName}`);

    const response = await this.client.post(
      `/projects/${this.projectId}/repository/branches`,
      { branch: branchName, ref: baseBranch }
    );

    return { name: branchName, ...response.data };
  }

  /**
   * 파일을 커밋한다.
   *
   * @param {string} branchName
   * @param {Array<{path: string, content: string}>} files
   * @param {string} commitMessage
   */
  async commitFiles(branchName, files, commitMessage) {
    console.log(`[GitLab] 커밋 생성: ${branchName} (${files.length}개 파일)`);

    const actions = files.map((file) => ({
      action: 'create',
      file_path: file.path,
      content: file.content,
    }));

    const response = await this.client.post(
      `/projects/${this.projectId}/repository/commits`,
      {
        branch: branchName,
        commit_message: commitMessage,
        actions,
      }
    );

    return response.data;
  }

  /**
   * Merge Request를 생성한다.
   *
   * @param {Object} options
   * @param {string} options.sourceBranch
   * @param {string} options.targetBranch
   * @param {string} options.title
   * @param {string} options.description
   * @returns {Object} 생성된 MR 정보
   */
  async createMergeRequest({ sourceBranch, targetBranch = 'main', title, description }) {
    console.log(`[GitLab] MR 생성: ${sourceBranch} → ${targetBranch}`);

    const response = await this.client.post(
      `/projects/${this.projectId}/merge_requests`,
      {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
        remove_source_branch: true,
      }
    );

    return response.data;
  }

  /**
   * MR의 변경 내용(diff)을 가져온다.
   *
   * @param {number} mrIid - MR의 IID
   * @returns {string} diff 내용
   */
  async getMRDiff(mrIid) {
    const response = await this.client.get(
      `/projects/${this.projectId}/merge_requests/${mrIid}/changes`
    );

    return response.data.changes
      .map((change) => `--- ${change.old_path}\n+++ ${change.new_path}\n${change.diff}`)
      .join('\n\n');
  }

  /**
   * MR에 코멘트를 추가한다 (Review Agent 피드백용).
   *
   * @param {number} mrIid
   * @param {string} body - 코멘트 내용
   */
  async addMRComment(mrIid, body) {
    console.log(`[GitLab] MR #${mrIid}에 리뷰 코멘트 추가`);

    await this.client.post(
      `/projects/${this.projectId}/merge_requests/${mrIid}/notes`,
      { body }
    );
  }

  /**
   * CI 파이프라인 상태를 조회한다.
   *
   * @param {number} pipelineId
   * @returns {Object} 파이프라인 상태
   */
  async getPipelineStatus(pipelineId) {
    const response = await this.client.get(
      `/projects/${this.projectId}/pipelines/${pipelineId}`
    );
    return response.data;
  }

  /**
   * 파이프라인 완료를 대기한다.
   *
   * @param {number} pipelineId
   * @param {number} timeout - 타임아웃 (ms)
   * @param {number} interval - 폴링 간격 (ms)
   * @returns {Object} 최종 파이프라인 상태
   */
  async waitForPipeline(pipelineId, timeout = 300000, interval = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.getPipelineStatus(pipelineId);

      if (['success', 'failed', 'canceled'].includes(status.status)) {
        return {
          passed: status.status === 'success',
          status: status.status,
          duration: status.duration,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return { passed: false, status: 'timeout', error: 'CI 파이프라인 타임아웃' };
  }
}

module.exports = { GitLabClient };
