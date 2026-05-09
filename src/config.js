import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_TIMEOUT_MS = 30000;

export async function loadConfig(configPath = process.env.GONGXIN_CONFIG || 'config.json', envPath) {
  const resolvedPath = resolve(configPath);
  const dotenv = await loadDotenv(envPath || resolve(dirname(resolvedPath), '.env'));
  const raw = JSON.parse(await readFile(resolvedPath, 'utf8'));
  const config = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    ...raw,
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || dotenv.FEISHU_WEBHOOK_URL || raw.feishuWebhookUrl
  };

  validateConfig(config);
  return config;
}

async function loadDotenv(envPath) {
  try {
    const content = await readFile(envPath, 'utf8');
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const index = line.indexOf('=');
          if (index === -1) {
            return [line, ''];
          }
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
        })
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function validateConfig(config) {
  const required = ['loginUrl', 'projectUrl', 'storageStatePath', 'snapshotPath'];
  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Missing config field: ${field}`);
    }
  }

  if (!config.selectors?.projectRows) {
    throw new Error('Missing config field: selectors.projectRows');
  }

  const requiredFields = ['name', 'enterprise', 'status', 'step'];
  for (const field of requiredFields) {
    if (!config.selectors.fields?.[field]) {
      throw new Error(`Missing config field: selectors.fields.${field}`);
    }
  }
}
