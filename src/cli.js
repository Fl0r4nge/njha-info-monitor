#!/usr/bin/env node
/**
 * 平台采集 / 回灌 / 反向推送的统一入口。
 *
 * 完整操作顺序：
 *   1. npm run login                （人工：图形验证码 + 滑块）
 *   2. npm run platform:collect     采集平台数据 → data/collected-*.json + data/raw-responses.json
 *   3. npm run platform:files       下载平台附件 → data/attachments/
 *   4. npm run bridge:plan          生成回灌计划 → data/import-plan.json（**只生成，不写入**）
 *   5. 人工核对 import-plan.json
 *   6. npm run bridge:apply -- --apply   真正写入佐证材料收集系统
 *   7. npm run platform:push -- --confirm I-UNDERSTAND   反向推送到平台（默认只演练）
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { loadConfig } from './config.js';
import { withPlatformContext } from './platform/context.js';
import { collectAll } from './platform/collect.js';
import { findAttachments, downloadAttachments } from './platform/attachments.js';
import { uploadFileToPlatform } from './platform/push.js';
import { createCollectClient } from './bridge/collect-system.js';
import { buildImportPlan, applyImportPlan } from './bridge/field-map.js';

const DATA_DIR = './data';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey;
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/** --apply / --confirm 这类开关必须是"显式真"，字符串 "false"/"0" 一律当假 */
export function isTrueFlag(value) {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  return path;
}

function collectClientFromEnv() {
  const baseUrl = process.env.COLLECT_BASE_URL;
  const slug = process.env.COLLECT_SLUG;
  if (!baseUrl || !slug) {
    throw new Error('缺少环境变量 COLLECT_BASE_URL / COLLECT_SLUG（见 .env.example）');
  }
  return createCollectClient({
    baseUrl,
    slug,
    accessCode: process.env.COLLECT_ACCESS_CODE,
    adminKey: process.env.COLLECT_ADMIN_KEY,
  });
}

const commands = {
  async collect(config) {
    const result = await withPlatformContext(config, async ({ api }) => {
      const collected = await collectAll(api);
      await api.dumpRawResponses(join(DATA_DIR, 'raw-responses.json'));
      return collected;
    });
    const target = join(DATA_DIR, `collected-${config.enterpriseName || 'enterprise'}.json`);
    await writeJson(target, result);
    console.log(`采集完成 → ${target}`);
    console.log(`鉴权方式：${result.authMode}；告警 ${result.warnings.length} 条`);
    for (const warning of result.warnings) console.log(`  · ${warning.label}：${warning.message}`);
    console.log('首次跑通后请用 data/raw-responses.json 里的真实字段名校正 src/bridge/field-map.js');
  },

  async files(config) {
    const source = join(DATA_DIR, `collected-${config.enterpriseName || 'enterprise'}.json`);
    const collected = JSON.parse(await readFile(source, 'utf8'));
    const attachments = findAttachments(collected, { sourceLabel: '平台采集' });
    console.log(`识别出 ${attachments.length} 个候选附件`);
    if (attachments.length === 0) return;

    const results = await withPlatformContext(config, ({ api }) =>
      downloadAttachments(api, attachments, join(DATA_DIR, 'attachments'), {
        onProgress: (done, total, name) => console.log(`  [${done}/${total}] ${name}`),
      }));
    await writeJson(join(DATA_DIR, 'attachments.json'), results);
    const ok = results.filter((r) => r.ok).length;
    console.log(`下载完成：成功 ${ok}/${results.length}，清单见 data/attachments.json`);
  },

  async plan(config) {
    const collected = JSON.parse(
      await readFile(join(DATA_DIR, `collected-${config.enterpriseName || 'enterprise'}.json`), 'utf8'),
    );
    let attachments = [];
    try {
      attachments = JSON.parse(await readFile(join(DATA_DIR, 'attachments.json'), 'utf8'));
    } catch {
      console.log('（还没有 attachments.json，本次计划只含字段回灌）');
    }

    const client = collectClientFromEnv();
    const checklist = await client.getChecklist();
    const plan = buildImportPlan({ collected, checklist, attachments });
    const target = await writeJson(join(DATA_DIR, 'import-plan.json'), plan);

    console.log(`回灌计划已生成 → ${target}`);
    console.log(`  可写入 ${plan.responses.length} 项，冲突 ${plan.conflicts.length} 项，` +
      `跳过 ${plan.skipped.length} 项，附件 ${plan.files.length} 个`);
    for (const conflict of plan.conflicts) {
      console.log(`  [冲突] ${conflict.itemKey} ${conflict.label}：本系统已有不同内容，默认不覆盖`);
    }
    console.log('确认无误后执行：npm run bridge:apply -- --apply');
  },

  async apply(_config, args) {
    const apply = isTrueFlag(args.apply);
    const plan = JSON.parse(await readFile(join(DATA_DIR, 'import-plan.json'), 'utf8'));
    const client = collectClientFromEnv();
    if (!apply) console.log('== 演练模式（加 --apply 才真正写入）==');
    const done = await applyImportPlan(client, plan, { apply });
    if (apply) {
      console.log(`写入完成：字段 ${done.responses.length} 项，文件 ${done.files.length} 个，失败 ${done.failed.length} 项`);
    }
  },

  /** 反向推送：把收集系统里的文件传到平台。默认演练。 */
  async push(config, args) {
    const filePath = args.file;
    if (!filePath) throw new Error('用法：npm run platform:push -- --file <本地文件> [--confirm I-UNDERSTAND]');
    const dryRun = args.confirm !== 'I-UNDERSTAND';
    if (dryRun) {
      console.log('== 演练模式：不会真的上传。真发请加 --confirm I-UNDERSTAND ==');
    }
    const result = await withPlatformContext(config, ({ api }) =>
      uploadFileToPlatform(api, filePath, {
        dryRun,
        confirm: args.confirm,
        fileName: basename(filePath),
      }));
    console.log(JSON.stringify(result, null, 2));
  },
};

async function main() {
  const [, , rawCommand, ...rest] = process.argv;
  const args = parseArgs(rest);
  // --help / -h 出现在命令位时也要当帮助处理，不要报"未知命令"
  const isHelp = !rawCommand || ['help', '--help', '-h'].includes(rawCommand) || args.help === true;
  const command = rawCommand;

  if (isHelp) {
    console.log(`用法：node src/cli.js <命令> [选项]

命令：
  collect   采集平台数据（企业档案 / 申报 / 项目 / 服务商备案）
  files     下载平台附件
  plan      生成回灌到佐证材料收集系统的计划（不写入）
  apply     执行回灌，需 --apply
  push      把本地文件上传到平台，需 --confirm I-UNDERSTAND

所有命令都要求已有平台登录态（先跑 npm run login）。`);
    return;
  }

  const handler = commands[command];
  if (!handler) throw new Error(`未知命令：${command}`);

  const config = await loadConfig();
  await handler(config, args);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
