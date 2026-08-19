import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentClient } from '../src/agent-client.js';
import { buildJobConfig } from '../src/agent.js';

test('buildJobConfig keeps configured paths but switches platform origin and account state', () => {
  const config = buildJobConfig(
    {
      loginUrl: 'http://old.example/ui/#/login',
      projectUrl: 'http://old.example/personal',
      storageStatePath: './old.json',
    },
    {
      accountId: 'account-1',
      platformBaseUrl: 'https://platform.example:9443',
      project: { name: '测试企业' },
    },
    './tmp-agent',
  );
  assert.equal(config.loginUrl, 'https://platform.example:9443/ui/#/login');
  assert.equal(config.projectUrl, 'https://platform.example:9443/personal');
  assert.match(config.storageStatePath, /tmp-agent[/\\]account-1[/\\]storage_state\.json$/);
});

test('agent claim sends the global agent key and a matching CSRF pair', async () => {
  const calls = [];
  const client = createAgentClient({
    baseUrl: 'https://collect.example/app/app_1/',
    agentKey: 'secret',
    csrfToken: 'csrf-test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('null', { status: 200 });
    },
  });
  assert.equal(await client.claim(), null);
  assert.equal(calls[0].url, 'https://collect.example/app/app_1/api/platform-agent/jobs/claim');
  assert.equal(calls[0].options.headers['X-Platform-Agent-Key'], 'secret');
  assert.equal(calls[0].options.headers['X-Suda-Csrf-Token'], 'csrf-test');
  assert.equal(calls[0].options.headers.Cookie, 'suda-csrf-token=csrf-test');
  assert.equal(calls[0].options.headers['X-Platform-Run-Token'], undefined);
});

test('agent run requests and file downloads keep the matching CSRF pair', async () => {
  const calls = [];
  const client = createAgentClient({
    baseUrl: 'https://collect.example/app/app_1',
    agentKey: 'secret',
    csrfToken: 'csrf-download',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
  });

  assert.deepEqual(await client.downloadFile('/api/platform-agent/runs/run-1/files/file-1', 'run-secret'), Buffer.from([1, 2, 3]));
  assert.equal(calls[0].options.headers['X-Platform-Run-Token'], 'run-secret');
  assert.equal(calls[0].options.headers['X-Suda-Csrf-Token'], 'csrf-download');
  assert.equal(calls[0].options.headers.Cookie, 'suda-csrf-token=csrf-download');
});
