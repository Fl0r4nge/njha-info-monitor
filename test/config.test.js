import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadConfig } from '../src/config.js';

test('loadConfig reads JSON config and applies environment webhook override', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gongxin-config-'));
  const configPath = join(dir, 'config.json');
  const previousWebhook = process.env.FEISHU_WEBHOOK_URL;
  process.env.FEISHU_WEBHOOK_URL = 'https://example.test/env-webhook';

  try {
    await writeFile(configPath, JSON.stringify({
      loginUrl: 'https://example.test/login',
      projectUrl: 'https://example.test/projects',
      storageStatePath: './data/state.json',
      snapshotPath: './data/snapshot.json',
      selectors: {
        projectRows: 'table tbody tr',
        fields: {
          name: '.name',
          enterprise: '.enterprise',
          status: '.status',
          step: '.step'
        }
      }
    }));

    const config = await loadConfig(configPath);

    assert.equal(config.feishuWebhookUrl, 'https://example.test/env-webhook');
    assert.equal(config.timeoutMs, 30000);
    assert.equal(config.selectors.fields.status, '.status');
  } finally {
    if (previousWebhook === undefined) {
      delete process.env.FEISHU_WEBHOOK_URL;
    } else {
      process.env.FEISHU_WEBHOOK_URL = previousWebhook;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadConfig reads FEISHU_WEBHOOK_URL from a dotenv file when environment is empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gongxin-config-'));
  const configPath = join(dir, 'config.json');
  const envPath = join(dir, '.env');
  const previousWebhook = process.env.FEISHU_WEBHOOK_URL;
  delete process.env.FEISHU_WEBHOOK_URL;

  try {
    await writeFile(configPath, JSON.stringify({
      loginUrl: 'https://example.test/login',
      projectUrl: 'https://example.test/projects',
      storageStatePath: './data/state.json',
      snapshotPath: './data/snapshot.json',
      selectors: {
        projectRows: 'table tbody tr',
        fields: {
          name: '.name',
          enterprise: '.enterprise',
          status: '.status',
          step: '.step'
        }
      }
    }));
    await writeFile(envPath, 'FEISHU_WEBHOOK_URL=https://example.test/dotenv-webhook\n');

    const config = await loadConfig(configPath, envPath);

    assert.equal(config.feishuWebhookUrl, 'https://example.test/dotenv-webhook');
  } finally {
    if (previousWebhook === undefined) {
      delete process.env.FEISHU_WEBHOOK_URL;
    } else {
      process.env.FEISHU_WEBHOOK_URL = previousWebhook;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
