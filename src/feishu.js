export function buildFeishuMessage(changes, options = {}) {
  const title = options.title || '工信平台流程状态变更';
  const platformName = options.platformName || '南京市中小企业数字化转型城市试点线上一体化公共服务平台';
  const elements = [
    {
      tag: 'markdown',
      content: `**平台：**${platformName}\n**变更数量：**${changes.length}`
    },
    { tag: 'hr' },
    ...changes.flatMap((change) => formatChange(change))
  ];

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: title
        }
      },
      elements
    }
  };
}

export function buildFeishuFlowPayload(change) {
  const project = change.after || change.before || {};
  const enterprise = project.enterprise || '-';
  const stage = project.step || project.stage || '-';
  const status = project.status || '-';
  const time = project.updatedAt || project.time || new Date().toISOString();

  return {
    enterprise,
    stage,
    status,
    time,
    text: `工信平台流程状态更新：${enterprise} - ${stage} - ${status}`
  };
}

export async function sendFeishuWebhook(webhookUrl, message, fetchImpl = fetch) {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Feishu webhook failed: HTTP ${response.status} ${body}`);
  }

  return response;
}

export function buildLoginExpiredMessage(enterprise = '企业名称', time = new Date().toISOString()) {
  return {
    enterprise,
    stage: '系统巡检',
    status: '登录态已失效',
    time,
    text: '工信平台巡检异常：登录态已失效，请重新登录并更新 storage_state.json'
  };
}

function formatChange(change) {
  if (change.type === 'added') {
    return [markdownBlock(`**新增项目**\n${formatProject(change.after)}`), divider()];
  }

  if (change.type === 'removed') {
    return [markdownBlock(`**项目消失/不可见**\n${formatProject(change.before)}`), divider()];
  }

  const before = change.before || {};
  const after = change.after || {};
  return [
    markdownBlock(
      [
        `**项目：**${after.name || before.name || change.id}`,
        `**企业：**${after.enterprise || before.enterprise || '-'}`,
        `**原状态：**${before.status || '-'}`,
        `**新状态：**${after.status || '-'}`,
        `**原流程：**${before.step || '-'}`,
        `**新流程：**${after.step || '-'}`,
        `**更新时间：**${after.updatedAt || '-'}`,
        after.remark ? `**备注：**${after.remark}` : null,
        after.detailUrl ? `[打开详情](${after.detailUrl})` : null
      ].filter(Boolean).join('\n')
    ),
    divider()
  ];
}

function formatProject(project = {}) {
  return [
    `**项目：**${project.name || '-'}`,
    `**企业：**${project.enterprise || '-'}`,
    `**状态：**${project.status || '-'}`,
    `**流程：**${project.step || '-'}`,
    `**更新时间：**${project.updatedAt || '-'}`
  ].join('\n');
}

function markdownBlock(content) {
  return { tag: 'markdown', content };
}

function divider() {
  return { tag: 'hr' };
}
