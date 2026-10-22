import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

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

test('7. Packaging, VirtualOffice-Setup.exe installation into Unicode path, One-Click Launcher duplicate-instance reuse, Real agy.exe chat stream, and auto-shutdown', async () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-pkg-test-'));
  const installDir = path.join(tempBase, 'Cài Đặt Virtual Office 2026');
  const dataDir = path.join(tempBase, 'AppData');
  fs.mkdirSync(dataDir, { recursive: true });

  const setupExe = path.resolve('VirtualOffice-Setup.exe');
  assert.ok(fs.existsSync(setupExe), 'VirtualOffice-Setup.exe must exist');

  try {
    // 1. Run VirtualOffice-Setup.exe in silent mode to install into Unicode directory
    execFileSync(
      setupExe,
      ['/SILENT', `/DIR=${installDir}`, '/NOSHORTCUT'],
      { stdio: 'inherit', timeout: 60000 }
    );

    // Verify installed files
    assert.ok(fs.existsSync(path.join(installDir, 'start-virtual-office.bat')));
    assert.ok(fs.existsSync(path.join(installDir, 'dist', 'server', 'index.mjs')));
    assert.ok(fs.existsSync(path.join(installDir, 'dist', 'client', 'index.html')));
    assert.ok(
      fs.existsSync(path.join(installDir, 'dist', 'client', 'assets', 'pixel-logo.svg'))
    );
    assert.ok(fs.existsSync(path.join(installDir, 'runtime', 'node.exe')));

    // 2. Launch installed app via launcher.ps1 -NoBrowser
    const launcherPs1 = path.join(installDir, 'scripts', 'launcher.ps1');
    const envWithIsolatedData = {
      ...process.env,
      VIRTUAL_OFFICE_DATA_DIR: dataDir,
      VIRTUAL_OFFICE_PORT: '0',
    };

    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPs1, '-NoBrowser'],
      { env: envWithIsolatedData, timeout: 30000 }
    );

    const runtimeFile = path.join(dataDir, 'runtime-instance.json');
    assert.ok(fs.existsSync(runtimeFile), 'runtime-instance.json should be created by server');
    const runtimeInfo1 = JSON.parse(fs.readFileSync(runtimeFile, 'utf-8'));
    assert.equal(runtimeInfo1.host, '127.0.0.1');
    assert.ok(runtimeInfo1.port > 0);
    assert.ok(runtimeInfo1.pid > 0);

    // 3. Run launcher a SECOND time -> must detect healthy instance and reuse same PID & port
    const secondLaunchOut = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPs1, '-NoBrowser'],
      { env: envWithIsolatedData, encoding: 'utf-8', timeout: 15000 }
    );
    assert.ok(
      secondLaunchOut.includes('Healthy application instance already running'),
      'Second launcher invocation must reuse running instance'
    );
    const runtimeInfo2 = JSON.parse(fs.readFileSync(runtimeFile, 'utf-8'));
    assert.equal(runtimeInfo2.pid, runtimeInfo1.pid);
    assert.equal(runtimeInfo2.port, runtimeInfo1.port);

    // 4. Verify production frontend assets are served locally
    const indexHtmlRes = await httpRequest(`${runtimeInfo1.url}/`);
    assert.equal(indexHtmlRes.status, 200);
    assert.ok(indexHtmlRes.body.includes('The Virtual Office for Your Work'));

    const logoRes = await httpRequest(`${runtimeInfo1.url}/assets/pixel-logo.svg`);
    assert.equal(logoRes.status, 200);
    assert.ok(logoRes.body.includes('<svg'));

    // 5. Configure fast 1-second grace period and test REAL Antigravity CLI (`agy.exe`) chat streaming
    await httpRequest(`${runtimeInfo1.url}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        preferredAdapter: 'agy',
        selectedModel: 'gemini-3.8-flash-low',
        shutdownGracePeriodMs: 1000,
      },
    });

    const realStreamRes = await httpRequest(`${runtimeInfo1.url}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        prompt: 'Reply with only the single word OFFICE_READY',
        adapterMode: 'agy',
        model: 'gemini-3.8-flash-low',
      },
    });
    assert.equal(realStreamRes.status, 200);
    assert.ok(
      realStreamRes.body.includes('event: init'),
      'Real agy stream must emit init event'
    );
    assert.ok(
      realStreamRes.body.includes('event: complete'),
      'Real agy stream must emit complete event'
    );
    assert.ok(
      realStreamRes.body.includes('"isSimulated":false'),
      'Real agy stream events must have isSimulated: false'
    );

    // 6. Register a browser tab session and then close it to trigger automatic server shutdown
    await httpRequest(`${runtimeInfo1.url}/api/lifecycle/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { tabId: 'pkg-tab-1', visible: true },
    });

    await httpRequest(`${runtimeInfo1.url}/api/lifecycle/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { tabId: 'pkg-tab-1', reason: 'test-finished' },
    });

    // Wait 1.6s for 1s grace period + process exit
    await new Promise((r) => setTimeout(r, 1600));

    // Verify server shut down and released its port
    let connectionRefused = false;
    try {
      await httpRequest(`${runtimeInfo1.url}/health`);
    } catch {
      connectionRefused = true;
    }
    assert.equal(
      connectionRefused,
      true,
      'Packaged server must shut down automatically after final tab closes'
    );
  } finally {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});
