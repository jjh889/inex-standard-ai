/**
 * AI Dev Standard - Slack Integration
 *
 * Slack Webhook 연동 모듈.
 * PR 생성, CI 실패, 리뷰 완료, 반복 실패 등의 이벤트를 알림으로 발송한다.
 */

const axios = require('axios');

class SlackNotifier {
  constructor(config = {}) {
    this.webhookUrl = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.channel = config.channel || process.env.SLACK_CHANNEL || '#ai-dev-alerts';
  }

  /**
   * PR 생성 알림을 발송한다.
   *
   * @param {Object} params
   * @param {string} params.taskId
   * @param {string} params.branchName
   * @param {string} params.mrUrl - GitLab MR URL
   */
  async notifyPRCreated({ taskId, branchName, mrUrl }) {
    await this.send({
      text: `📋 *PR 생성* | Task: ${taskId}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📋 *새 PR이 생성되었습니다*\n• Task: \`${taskId}\`\n• Branch: \`${branchName}\`\n• <${mrUrl}|MR 바로가기>`,
          },
        },
      ],
    });
  }

  /**
   * CI 테스트 실패 알림을 발송한다.
   *
   * @param {Object} params
   * @param {string} params.taskId
   * @param {string} params.error
   * @param {number} params.retryCount
   */
  async notifyCIFailed({ taskId, error, retryCount }) {
    await this.send({
      text: `⚠️ *CI 실패* | Task: ${taskId} (재시도 ${retryCount}/3)`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⚠️ *CI 테스트 실패*\n• Task: \`${taskId}\`\n• 재시도: ${retryCount}/3\n• 에러: ${error}`,
          },
        },
      ],
    });
  }

  /**
   * 코드 리뷰 완료 알림을 발송한다.
   *
   * @param {Object} params
   * @param {string} params.taskId
   * @param {string} params.verdict - 'APPROVE' | 'REJECT'
   * @param {string} params.summary
   */
  async notifyReviewComplete({ taskId, verdict, summary }) {
    const emoji = verdict === 'APPROVE' ? '✅' : '❌';
    await this.send({
      text: `${emoji} *리뷰 ${verdict}* | Task: ${taskId}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *코드 리뷰 완료*\n• Task: \`${taskId}\`\n• 결과: *${verdict}*\n• 요약: ${summary}`,
          },
        },
      ],
    });
  }

  /**
   * 3회 반복 실패(FAILED) 알림을 발송한다. (멘션 포함)
   *
   * @param {Object} params
   * @param {string} params.taskId
   * @param {string} params.reason
   * @param {string} [params.mention] - 멘션할 사용자/그룹 (예: '@here', '@channel')
   */
  async notifyFailed({ taskId, reason, mention = '@here' }) {
    await this.send({
      text: `🚨 *FAILED* | Task: ${taskId} - 개발자 수동 개입 필요 ${mention}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🚨 *3회 반복 실패 - 개발자 수동 개입 필요* ${mention}\n• Task: \`${taskId}\`\n• 사유: ${reason}\n• 전체 로그를 확인하고 수동으로 처리해주세요.`,
          },
        },
      ],
    });
  }

  /**
   * Human 승인 대기 알림을 발송한다.
   *
   * @param {Object} params
   * @param {string} params.taskId
   * @param {string} params.mrUrl
   * @param {boolean} params.isFinancial - 금융 로직 포함 여부
   */
  async notifyAwaitingApproval({ taskId, mrUrl, isFinancial = false }) {
    const approvalMsg = isFinancial
      ? '⚠️ *금융 로직 포함* - Human 개발자 *2인 이상* 승인 필요'
      : 'Human 개발자 승인 필요';

    await this.send({
      text: `🔔 *승인 대기* | Task: ${taskId}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔔 *Human 승인 대기 중*\n• Task: \`${taskId}\`\n• ${approvalMsg}\n• <${mrUrl}|MR 바로가기>`,
          },
        },
      ],
    });
  }

  /**
   * 배포 완료 알림을 발송한다.
   */
  async notifyDeployed({ taskId, environment = 'production' }) {
    await this.send({
      text: `🚀 *배포 완료* | Task: ${taskId} → ${environment}`,
    });
  }

  /**
   * Slack Webhook으로 메시지를 발송한다.
   */
  async send(payload) {
    if (!this.webhookUrl) {
      console.warn('[Slack] Webhook URL이 설정되지 않았습니다. 알림을 건너뜁니다.');
      console.log('[Slack] (로컬) 알림:', payload.text);
      return;
    }

    try {
      await axios.post(this.webhookUrl, {
        channel: this.channel,
        ...payload,
      });
    } catch (error) {
      console.error('[Slack] 알림 발송 실패:', error.message);
    }
  }
}

module.exports = { SlackNotifier };
