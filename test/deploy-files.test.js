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

test('Dockerfile Playwright image version matches pinned package dependency', async () => {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const playwrightVersion = packageJson.dependencies.playwright;

  assert.match(playwrightVersion, /^\d+\.\d+\.\d+$/);
  assert.match(dockerfile, new RegExp(`mcr\\.microsoft\\.com/playwright:v${playwrightVersion}-noble`));
});

test('repository forces shell scripts to use LF line endings', async () => {
  const attributes = await readFile('.gitattributes', 'utf8');
  const dockerfile = await readFile('Dockerfile', 'utf8');

  assert.match(attributes, /\*\.sh text eol=lf/);
  assert.match(dockerfile, /sed -i 's\/\\r\$\/\/' docker\/\*\.sh/);
});
