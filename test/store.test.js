import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { JsonSnapshotStore } from '../src/store.js';

test('JsonSnapshotStore returns an empty snapshot when file does not exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gongxin-store-'));
  const store = new JsonSnapshotStore(join(dir, 'snapshot.json'));

  try {
    assert.deepEqual(await store.load(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('JsonSnapshotStore saves and loads project snapshots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gongxin-store-'));
  const file = join(dir, 'nested', 'snapshot.json');
  const store = new JsonSnapshotStore(file);
  const projects = [{ id: 'A', name: '项目A', status: '已通过' }];

  try {
    await store.save(projects);
    assert.deepEqual(await store.load(), projects);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
