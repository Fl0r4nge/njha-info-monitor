import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('login-vnc binds noVNC to all interfaces inside the container', async () => {
  const script = await readFile('docker/login-vnc.sh', 'utf8');

  assert.match(script, /0\.0\.0\.0:6080/);
});

test('diagnose script checks container, localhost, and firewall layers', async () => {
  const script = await readFile('scripts/diagnose-vnc-centos.sh', 'utf8');

  assert.match(script, /docker compose ps login/);
  assert.match(script, /curl -fsSI http:\/\/127\.0\.0\.1:6080\/vnc\.html/);
  assert.match(script, /firewall-cmd --list-ports/);
});
