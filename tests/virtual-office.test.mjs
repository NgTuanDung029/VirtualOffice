import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createVirtualOfficeServer } from '../dist/server/index.mjs';

function makeTempDir(prefix = 'vo-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString('utf-8');
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            // non-json
          }
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(
        typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
      );
    }
    req.end();
  });
}

test('1. Server binds strictly to 127.0.0.1, serves /health, and handles port conflicts safely', async () => {
  const dataDir1 = makeTempDir('vo-data1-');
  const dataDir2 = makeTempDir('vo-data2-');
  const srv1 = await createVirtualOfficeServer({
    preferredPort: 0,
    dataDir: dataDir1,
  });

  try {
    assert.equal(srv1.host, '127.0.0.1');
    assert.ok(srv1.port > 0);

    const health = await httpRequest(`${srv1.url}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.json.status, 'ok');
    assert.equal(health.json.host, '127.0.0.1');
    assert.equal(health.json.app, 'The Virtual Office for Your Work');

    // Attempt to start a second server requesting srv1's bound port -> must safely pick another port
    const srv2 = await createVirtualOfficeServer({
      preferredPort: srv1.port,
      dataDir: dataDir2,
    });
    try {
      assert.equal(srv2.host, '127.0.0.1');
      assert.notEqual(srv2.port, srv1.port);
      const health2 = await httpRequest(`${srv2.url}/health`);
      assert.equal(health2.status, 200);
    } finally {
      await srv2.shutdown('test-cleanup');
    }
  } finally {
    await srv1.shutdown('test-cleanup');
    fs.rmSync(dataDir1, { recursive: true, force: true });
    fs.rmSync(dataDir2, { recursive: true, force: true });
  }
});

test('2. Security controls reject cross-origin and foreign Host headers', async () => {
  const dataDir = makeTempDir('vo-sec-');
  const srv = await createVirtualOfficeServer({
    preferredPort: 0,
    dataDir,
  });

  try {
    const badOrigin = await httpRequest(`${srv.url}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious.example.com',
      },
      body: { preferredAdapter: 'demo' },
    });
    assert.equal(badOrigin.status, 403);

    const badHost = await httpRequest(`${srv.url}/health`, {
      method: 'GET',
      headers: {
        Host: 'attacker.local:8080',
      },
    });
    assert.equal(badHost.status, 403);

    const validOrigin = await httpRequest(`${srv.url}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `http://127.0.0.1:${srv.port}`,
      },
      body: { preferredAdapter: 'demo' },
    });
    assert.equal(validOrigin.status, 200);
  } finally {
    await srv.shutdown('test-cleanup');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('3. Windows folder selection supports spaces, Vietnamese Unicode characters, missing paths, and blocks path traversal', async () => {
  const dataDir = makeTempDir('vo-proj-');
  const unicodeRoot = makeTempDir('vo-ws-');
  const vietnameseFolder = path.join(
    unicodeRoot,
    'Dự Án Tiếng Việt - Kiểm Thử 2026'
  );
  fs.mkdirSync(vietnameseFolder, { recursive: true });
  fs.writeFileSync(
    path.join(vietnameseFolder, 'hello.ts'),
    'export const x = 1;\n',
    'utf-8'
  );

  const srv = await createVirtualOfficeServer({
    preferredPort: 0,
    dataDir,
  });

  try {
    // 1. Select valid Vietnamese folder with spaces
    const selRes = await httpRequest(`${srv.url}/api/project/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { path: vietnameseFolder },
    });
    assert.equal(selRes.status, 200);
    assert.equal(selRes.json.ok, true);
    assert.equal(selRes.json.project.name, 'Dự Án Tiếng Việt - Kiểm Thử 2026');
    assert.equal(selRes.json.project.exists, true);
    assert.equal(selRes.json.project.accessible, true);

    // 2. List files inside authorized folder
    const filesRes = await httpRequest(`${srv.url}/api/project/files`);
    assert.equal(filesRes.status, 200);
    assert.ok(
      filesRes.json.files.some((f) => f.name === 'hello.ts'),
      'Expected hello.ts in authorized project files'
    );

    // 3. Block path traversal outside authorized project directory
    const traversalRes = await httpRequest(
      `${srv.url}/api/project/files?subdir=${encodeURIComponent('..\\..\\')}`
    );
    assert.equal(traversalRes.status, 403);

    // 4. Reject non-existent / deleted folder
    const missingPath = path.join(unicodeRoot, 'Folder-Does-Not-Exist-999');
    const missingRes = await httpRequest(`${srv.url}/api/project/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { path: missingPath },
    });
    assert.equal(missingRes.status, 400);
    assert.equal(missingRes.json.project.exists, false);

    // 5. Clear project selection
    const clearRes = await httpRequest(`${srv.url}/api/project/clear`, {
      method: 'POST',
    });
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.json.project, null);
  } finally {
    await srv.shutdown('test-cleanup');
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(unicodeRoot, { recursive: true, force: true });
  }
});

test('4. Multi-tab lifecycle: closing 1 of 2 tabs keeps server alive; reload cancels grace period; closing final tab shuts server down and releases port', async () => {
  const dataDir = makeTempDir('vo-life-');
  const srv = await createVirtualOfficeServer({
    preferredPort: 0,
    dataDir,
    heartbeatIntervalMs: 500,
    staleSessionTimeoutMs: 4000,
    shutdownGracePeriodMs: 600,
  });

  const port = srv.port;

  // Register Tab A and Tab B
  const regA = await httpRequest(`${srv.url}/api/lifecycle/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { tabId: 'tab-A', visible: true },
  });
  assert.equal(regA.json.lifecycle.activeTabCount, 1);

  const regB = await httpRequest(`${srv.url}/api/lifecycle/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { tabId: 'tab-B', visible: true },
  });
  assert.equal(regB.json.lifecycle.activeTabCount, 2);

  // Close Tab A -> Tab B remains, so no shutdown should be scheduled
  const closeA = await httpRequest(`${srv.url}/api/lifecycle/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { tabId: 'tab-A', reason: 'tab-closed' },
  });
  assert.equal(closeA.json.lifecycle.activeTabCount, 1);
  assert.equal(closeA.json.lifecycle.shutdownScheduledAt, null);

  // Wait 750ms (longer than grace period) -> server must STILL be running because Tab B is open
  await new Promise((r) => setTimeout(r, 750));
  const healthStillUp = await httpRequest(`${srv.url}/health`);
  assert.equal(healthStillUp.status, 200);
  assert.equal(healthStillUp.json.activeTabs, 1);

  // Simulate Tab B reload: Tab B sends close on pagehide, then immediately registers again within grace period
  const closeBForReload = await httpRequest(`${srv.url}/api/lifecycle/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { tabId: 'tab-B', reason: 'pagehide-reload' },
  });
  assert.equal(closeBForReload.json.lifecycle.activeTabCount, 0);
  assert.ok(closeBForReload.json.lifecycle.shutdownScheduledAt !== null);

  // Re-register within 150ms (before 600ms grace period expires)
  await new Promise((r) => setTimeout(r, 150));
  const regBReloaded = await httpRequest(`${srv.url}/api/lifecycle/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { tabId: 'tab-B-reloaded', visible: true },
  });
  assert.equal(regBReloaded.json.lifecycle.activeTabCount, 1);
  assert.equal(regBReloaded.json.lifecycle.shutdownScheduledAt, null);

  // Now close the final tab (tab-B-reloaded) and wait for the 600ms grace period to elapse
  const closeFinal = await httpRequest(`${srv.url}/api/lifecycle/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // sendBeacon content-type
    body: JSON.stringify({ tabId: 'tab-B-reloaded', reason: 'final-tab-close' }),
  });
  assert.equal(closeFinal.json.lifecycle.activeTabCount, 0);

  await new Promise((r) => setTimeout(r, 900));
  assert.equal(srv.lifecycle.isShuttingDown(), true);

  // Verify port is released by binding a temporary server to the exact same port
  const probeServer = http.createServer();
  await new Promise((resolve, reject) => {
    probeServer.once('error', reject);
    probeServer.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probeServer.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('5. Browser crash simulation: stale session expiration triggers automatic shutdown', async () => {
  const dataDir = makeTempDir('vo-crash-');
  const srv = await createVirtualOfficeServer({
    preferredPort: 0,
    dataDir,
    heartbeatIntervalMs: 500,
    staleSessionTimeoutMs: 1500,
    shutdownGracePeriodMs: 500,
  });

  await httpRequest(`${srv.url}/api/lifecycle/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { tabId: 'tab-crashed', visible: true },
  });

  // Stop sending heartbeats and wait for staleSessionTimeout (1500ms) + sweep (1000ms) + gracePeriod (500ms)
  await new Promise((r) => setTimeout(r, 3400));
  assert.equal(srv.lifecycle.isShuttingDown(), true);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('6. Usage provider & Chat stream: verifies Demo Mode separation and Real Antigravity CLI (/usage)', async () => {
  const dataDir = makeTempDir('vo-usage-');
  const srv = await createVirtualOfficeServer({
    preferredPort: 0,
    dataDir,
  });

  try {
    // 1. Switch to Demo Mode and verify no fabricated usage metrics
    await httpRequest(`${srv.url}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { preferredAdapter: 'demo' },
    });

    const demoUsage = await httpRequest(`${srv.url}/api/usage`);
    assert.equal(demoUsage.status, 200);
    assert.equal(demoUsage.json.isSimulated, true);
    assert.equal(demoUsage.json.provider, 'demo-simulated');
    assert.equal(demoUsage.json.state, 'UNAVAILABLE');
    assert.equal(demoUsage.json.quota.primaryRemainingPercent, null);

    // 2. Test Demo Chat Stream
    const demoStream = await httpRequest(`${srv.url}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        prompt: 'Hello virtual office test',
        adapterMode: 'demo',
      },
    });
    assert.equal(demoStream.status, 200);
    assert.ok(demoStream.body.includes('[DEMO MODE'));
    assert.ok(demoStream.body.includes('"isSimulated":true'));

    // 3. Switch to Real Antigravity CLI mode and verify live `/usage` retrieval
    await httpRequest(`${srv.url}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { preferredAdapter: 'agy', selectedModel: 'gemini-4-argon-medium' },
    });

    const realUsage = await httpRequest(`${srv.url}/api/usage/refresh`, {
      method: 'POST',
    });
    assert.equal(realUsage.status, 200);
    assert.equal(realUsage.json.isSimulated, false);
    assert.equal(realUsage.json.provider, 'antigravity-cli');
    assert.equal(realUsage.json.state, 'CONNECTED');
    assert.equal(realUsage.json.contextWindow.status, 'UNSUPPORTED');
    assert.ok(Array.isArray(realUsage.json.quota.groups));
    assert.ok(realUsage.json.quota.groups.length > 0);
    assert.equal(typeof realUsage.json.quota.primaryRemainingPercent, 'number');
  } finally {
    await srv.shutdown('test-cleanup');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
