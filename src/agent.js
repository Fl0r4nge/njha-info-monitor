#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { loginAndSave } from './login.js';
import { withPlatformContext } from './platform/context.js';
import { collectAll } from './platform/collect.js';
import { downloadAttachments, findAttachments } from './platform/attachments.js';
import { buildResponsePlan, mapAttachmentToItem } from './bridge/field-map.js';
import { createAgentClient } from './agent-client.js';

function pathOnOrigin(original, baseUrl) {
  const source = new URL(original);
  return new URL(`${source.pathname}${source.search}${source.hash}`, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

export function buildJobConfig(baseConfig, job, dataRoot = './data/agent') {
  const accountDir = resolve(dataRoot, job.accountId);
  return {
    ...baseConfig,
    enterpriseName: job.project.name,
    loginUrl: pathOnOrigin(baseConfig.loginUrl, job.platformBaseUrl),
    projectUrl: pathOnOrigin(baseConfig.projectUrl, job.platformBaseUrl),
    storageStatePath: join(accountDir, 'storage_state.json'),
    snapshotPath: join(accountDir, 'projects_snapshot.json'),
    accountDir,
  };
}

function isLoginStateError(error) {
  return /登录态|storageState|登录需要人工|自动滑块验证|Timed out waiting for login|browserType\.launch/i.test(
    error?.message || String(error),
  );
}

async function collectJob(config) {
  return withPlatformContext(config, async ({ api, context }) => {
    const collected = await collectAll(api);
    const candidates = findAttachments(collected, { sourceLabel: '一体化平台自动采集' });
    const attachments = await downloadAttachments(
      api,
      candidates,
      join(config.accountDir, 'inbound'),
    );
    return { collected, attachments, sessionState: await context.storageState() };
  });
}

async function ensureCollected(config, job) {
  await mkdir(config.accountDir, { recursive: true });
  if (job.sessionState) {
    await writeFile(config.storageStatePath, JSON.stringify(job.sessionState, null, 2), 'utf8');
  }
  try {
    return await collectJob(config);
  } catch (error) {
    if (!isLoginStateError(error)) throw error;
    await loginAndSave(
      config,
      { username: job.username, password: job.password },
      {
        autoSave: true,
        headless: process.env.PLATFORM_AGENT_HEADLESS !== '0',
        sliderAttempts: Number(process.env.GONGXIN_SLIDER_ATTEMPTS || 3),
      },
    );
    return collectJob(config);
  }
}

async function importInbound(client, job, collected, attachments) {
  if (!['inbound', 'bidirectional'].includes(job.direction)) {
    return { values: { imported: 0, skipped: 0 }, files: { imported: 0, skipped: 0, failed: 0 } };
  }
  const entries = buildResponsePlan(collected)
    .filter((entry) => entry.value !== null)
    .map((entry) => ({ itemKey: entry.itemKey, value: entry.value }));
  const values = await client.importValues(job.runId, job.runToken, entries);
  const files = { imported: 0, skipped: 0, failed: 0 };
  for (const attachment of attachments.filter((item) => item.ok)) {
    const mapped = mapAttachmentToItem(attachment);
    if (!mapped.itemKey) {
      files.skipped += 1;
      continue;
    }
    try {
      const buffer = await readFile(attachment.savedAs);
      const result = await client.importFile(
        job.runId,
        job.runToken,
        mapped.itemKey,
        attachment.name,
        buffer,
        undefined,
      );
      if (result?.skipped) files.skipped += 1;
      else files.imported += 1;
    } catch {
      files.failed += 1;
    }
  }
  return { values, files };
}

async function stageOutbound(client, job, targetDir) {
  if (!['outbound', 'bidirectional'].includes(job.direction)) {
    return { values: 0, files: 0, prepared: 0, applied: true };
  }
  await mkdir(targetDir, { recursive: true });
  let prepared = 0;
  for (const file of job.outbound.files) {
    const safeName = file.fileName.replace(/[/\\<>:"|?*]/g, '_');
    const buffer = await client.downloadFile(file.downloadPath, job.runToken);
    await writeFile(join(targetDir, `${file.itemKey}-${safeName}`), buffer);
    prepared += 1;
  }
  await writeFile(
    join(targetDir, 'values.json'),
    JSON.stringify(job.outbound.values, null, 2),
    'utf8',
  );
  return {
    values: job.outbound.values.length,
    files: job.outbound.files.length,
    prepared,
    applied: job.outbound.values.length === 0 && job.outbound.files.length === 0,
    note: '平台写接口字段和附件归属尚未用真实企业返回体校准，已安全生成待推送包，未盲目提交正式申报。',
  };
}

export async function processJob(client, baseConfig, job) {
  const config = buildJobConfig(baseConfig, job);
  try {
    const result = await ensureCollected(config, job);
    const inbound = await importInbound(client, job, result.collected, result.attachments);
    const outbound = await stageOutbound(client, job, join(config.accountDir, 'outbound'));
    const partial = ['outbound', 'bidirectional'].includes(job.direction) && !outbound.applied;
    await client.complete(job.runId, job.runToken, {
      status: partial ? 'partial' : 'success',
      summary: {
        inbound,
        outbound,
        warnings: result.collected.warnings.length,
      },
      errorMessage: partial ? outbound.note : undefined,
      sessionState: result.sessionState,
    });
    return { status: partial ? 'partial' : 'success', inbound, outbound };
  } catch (error) {
    const verification = isLoginStateError(error);
    await client.complete(job.runId, job.runToken, {
      status: verification ? 'needs_verification' : 'failed',
      errorMessage: error.message || String(error),
      verificationUrl: verification ? process.env.PLATFORM_AGENT_VNC_URL : undefined,
    });
    return { status: verification ? 'needs_verification' : 'failed', error: error.message || String(error) };
  }
}

export async function runOnce() {
  const client = createAgentClient({
    baseUrl: process.env.COLLECT_AGENT_BASE_URL,
    agentKey: process.env.COLLECT_AGENT_KEY,
  });
  const job = await client.claim();
  if (!job) return { status: 'idle' };
  const config = await loadConfig();
  return processJob(client, config, job);
}

async function main() {
  const watch = process.argv.includes('--watch');
  do {
    const result = await runOnce();
    console.log(`[${new Date().toISOString()}] ${JSON.stringify(result)}`);
    if (!watch) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Number(process.env.AGENT_POLL_MS || 60000)));
  } while (true);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
