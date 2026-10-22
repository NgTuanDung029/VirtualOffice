import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';
import { StorageManager } from './storage.js';
import {
  isPathInsideProject,
  listAuthorizedProjectFiles,
  listSubdirectories,
  listWindowsDrives,
  openNativeWindowsFolderPicker,
  validateProjectDirectory,
} from './projectManager.js';
import { LifecycleManager } from './lifecycleManager.js';
import { AgyCliAdapter } from './agyAdapter.js';
import { DemoAgentAdapter } from './demoAdapter.js';
import {
  AgentAdapterMode,
  AgyPermissionPolicy,
  ApplicationSettings,
  Conversation,
  ProjectInfo,
  UsageInformation,
} from '../shared/types.js';

const HOST = '127.0.0.1';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface ServerInstance {
  server: http.Server;
  port: number;
  host: string;
  url: string;
  storage: StorageManager;
  lifecycle: LifecycleManager;
  shutdown: (reason?: string) => Promise<void>;
}

export async function createVirtualOfficeServer(options?: {
  preferredPort?: number;
  dataDir?: string;
  clientDistDir?: string;
  heartbeatIntervalMs?: number;
  staleSessionTimeoutMs?: number;
  shutdownGracePeriodMs?: number;
  initialConnectTimeoutMs?: number;
  exitProcessOnShutdown?: boolean;
}): Promise<ServerInstance> {
  const storage = new StorageManager(options?.dataDir);
  const loadedConfig = storage.loadConfig();

  const settings: ApplicationSettings = {
    ...loadedConfig.settings,
    ...(options?.heartbeatIntervalMs
      ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
      : {}),
    ...(options?.staleSessionTimeoutMs
      ? { staleSessionTimeoutMs: options.staleSessionTimeoutMs }
      : {}),
    ...(options?.shutdownGracePeriodMs
      ? { shutdownGracePeriodMs: options.shutdownGracePeriodMs }
      : {}),
  };

  let selectedProject: ProjectInfo | null = loadedConfig.selectedProjectPath
    ? validateProjectDirectory(loadedConfig.selectedProjectPath)
    : null;
  let recentProjects: string[] = loadedConfig.recentProjects;
  let conversations: Conversation[] = storage.loadConversations();
  let lastUsage: UsageInformation | null = loadedConfig.lastUsage;

  const agyAdapter = new AgyCliAdapter();
  const demoAdapter = new DemoAgentAdapter();
  let agyStatus = await agyAdapter.checkAvailability();
  let availableModels = await agyAdapter.fetchModels();

  let activeTurnCancel: (() => void) | null = null;
  let isShuttingDown = false;

  const persistConfig = () => {
    storage.saveConfig({
      settings,
      selectedProjectPath: selectedProject ? selectedProject.path : null,
      recentProjects,
      lastUsage,
    });
  };

  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDistDir =
    options?.clientDistDir ||
    path.resolve(currentFileDir, '..', 'client');

  let shutdownFn: (reason?: string) => Promise<void> = async () => {};

  const lifecycle = new LifecycleManager({
    heartbeatIntervalMs: settings.heartbeatIntervalMs,
    staleSessionTimeoutMs: settings.staleSessionTimeoutMs,
    shutdownGracePeriodMs: settings.shutdownGracePeriodMs,
    initialConnectTimeoutMs: options?.initialConnectTimeoutMs ?? 90000,
    logger: (level, msg, meta) => storage.log(level, msg, meta),
    onShutdownTriggered: (reason) => {
      void shutdownFn(reason);
    },
  });

  /**
   * Security check: Validates Host and Origin headers to ensure only loopback
   * requests can interact with the local server (Phase 10.6 & Phase 12).
   */
  const isAuthorizedLocalRequest = (req: http.IncomingMessage, boundPort: number): boolean => {
    const hostHeader = (req.headers.host || '').toLowerCase();
    const validHosts = new Set([
      `127.0.0.1:${boundPort}`,
      `localhost:${boundPort}`,
      '127.0.0.1',
      'localhost',
    ]);
    if (hostHeader && !validHosts.has(hostHeader)) {
      return false;
    }

    const origin = (req.headers.origin || '').toLowerCase();
    if (origin) {
      const validOrigins = new Set([
        `http://127.0.0.1:${boundPort}`,
        `http://localhost:${boundPort}`,
      ]);
      if (!validOrigins.has(origin)) {
        return false;
      }
    }
    return true;
  };

  const readJsonBody = <T = Record<string, unknown>>(
    req: http.IncomingMessage
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8');
        if (body.length > 2 * 1024 * 1024) {
          reject(new Error('Payload too large'));
          req.destroy();
        }
      });
      req.on('end', () => {
        if (!body.trim()) {
          resolve({} as T);
          return;
        }
        try {
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  };

  const sendJson = (
    res: http.ServerResponse,
    statusCode: number,
    payload: unknown
  ): void => {
    const json = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(json);
  };

  let boundPort = 0;

  const server = http.createServer(async (req, res) => {
    try {
      if (!isAuthorizedLocalRequest(req, boundPort)) {
        storage.log('WARN', 'Rejected request failing Host/Origin validation', {
          host: req.headers.host,
          origin: req.headers.origin,
          url: req.url,
        });
        sendJson(res, 403, {
          error: 'Forbidden: Local loopback Host/Origin check failed.',
        });
        return;
      }

      const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${boundPort}`);
      const pathname = parsedUrl.pathname;
      const method = (req.method || 'GET').toUpperCase();

      // 1. Health Endpoint (Phase 8.3)
      if (pathname === '/health' && method === 'GET') {
        const snap = lifecycle.getSnapshot();
        sendJson(res, 200, {
          status: isShuttingDown ? 'shutting_down' : 'ok',
          app: 'The Virtual Office for Your Work',
          host: HOST,
          port: boundPort,
          pid: process.pid,
          uptimeSeconds: Math.floor(process.uptime()),
          activeTabs: snap.activeTabCount,
          shuttingDown: isShuttingDown,
          agyAvailable: agyStatus.available,
        });
        return;
      }

      // 2. Lifecycle Endpoints (Phase 10)
      if (pathname === '/api/lifecycle/register' && method === 'POST') {
        const body = await readJsonBody<{ tabId?: string; visible?: boolean }>(req);
        if (!body.tabId) {
          sendJson(res, 400, { error: 'tabId is required' });
          return;
        }
        const snap = lifecycle.registerTab(
          body.tabId,
          req.headers['user-agent'],
          body.visible !== false
        );
        sendJson(res, 200, { ok: true, lifecycle: snap });
        return;
      }

      if (pathname === '/api/lifecycle/heartbeat' && method === 'POST') {
        const body = await readJsonBody<{ tabId?: string; visible?: boolean }>(req);
        if (!body.tabId) {
          sendJson(res, 400, { error: 'tabId is required' });
          return;
        }
        const snap = lifecycle.heartbeat(
          body.tabId,
          body.visible !== false,
          req.headers['user-agent']
        );
        sendJson(res, 200, { ok: true, lifecycle: snap });
        return;
      }

      if (pathname === '/api/lifecycle/close' && method === 'POST') {
        const body = await readJsonBody<{ tabId?: string; reason?: string }>(req);
        if (!body.tabId) {
          sendJson(res, 400, { error: 'tabId is required' });
          return;
        }
        const snap = lifecycle.closeTab(body.tabId, body.reason || 'beacon-close');
        sendJson(res, 200, { ok: true, lifecycle: snap });
        return;
      }

      if (pathname === '/api/lifecycle/status' && method === 'GET') {
        sendJson(res, 200, lifecycle.getSnapshot());
        return;
      }

      // 3. Bootstrap State
      if (pathname === '/api/bootstrap' && method === 'GET') {
        if (selectedProject?.path) {
          selectedProject = validateProjectDirectory(selectedProject.path);
        }
        agyStatus = await agyAdapter.checkAvailability();
        const activeMode: AgentAdapterMode =
          settings.preferredAdapter === 'agy' && agyStatus.available
            ? 'agy'
            : 'demo';

        sendJson(res, 200, {
          settings,
          activeAdapterMode: activeMode,
          agyStatus,
          availableModels,
          selectedProject,
          recentProjects,
          conversations,
          lastUsage,
          lifecycle: lifecycle.getSnapshot(),
        });
        return;
      }

      // 4. Project Directory Management (Phase 3.2 & Phase 5.2)
      if (pathname === '/api/project/select' && method === 'POST') {
        const body = await readJsonBody<{ path?: string }>(req);
        const rawPath = (body.path || '').trim();
        const validated = validateProjectDirectory(rawPath);
        if (!validated.exists || !validated.accessible) {
          sendJson(res, 400, {
            ok: false,
            project: validated,
            error: validated.error || 'Selected folder is invalid or inaccessible.',
          });
          return;
        }
        selectedProject = validated;
        recentProjects = [
          validated.path,
          ...recentProjects.filter(
            (p) => p.toLowerCase() !== validated.path.toLowerCase()
          ),
        ].slice(0, 8);
        persistConfig();
        storage.log('INFO', `Selected project directory: ${validated.path}`);
        sendJson(res, 200, {
          ok: true,
          project: selectedProject,
          recentProjects,
        });
        return;
      }

      if (pathname === '/api/project/clear' && method === 'POST') {
        selectedProject = null;
        persistConfig();
        sendJson(res, 200, { ok: true, project: null, recentProjects });
        return;
      }

      if (pathname === '/api/project/validate' && method === 'POST') {
        const body = await readJsonBody<{ path?: string }>(req);
        const rawPath = (body.path || '').trim();
        const validated = validateProjectDirectory(rawPath);
        sendJson(res, 200, {
          ok: validated.exists && validated.accessible,
          project: validated,
          error: validated.error,
        });
        return;
      }

      if (pathname === '/api/project/pick-native' && method === 'POST') {
        const pickedPath = await openNativeWindowsFolderPicker(
          selectedProject?.path || process.cwd()
        );
        if (!pickedPath) {
          sendJson(res, 200, { cancelled: true });
          return;
        }
        const validated = validateProjectDirectory(pickedPath);
        if (validated.exists && validated.accessible) {
          selectedProject = validated;
          recentProjects = [
            validated.path,
            ...recentProjects.filter(
              (p) => p.toLowerCase() !== validated.path.toLowerCase()
            ),
          ].slice(0, 8);
          persistConfig();
        }
        sendJson(res, 200, {
          cancelled: false,
          ok: validated.exists && validated.accessible,
          project: validated,
          recentProjects,
          error: validated.error,
        });
        return;
      }

      if (pathname === '/api/project/browse' && method === 'GET') {
        const requestedDir = parsedUrl.searchParams.get('dir');
        const drives = listWindowsDrives();
        const targetDir =
          requestedDir ||
          selectedProject?.path ||
          process.cwd() ||
          drives[0]?.drive ||
          'C:\\';
        const listing = listSubdirectories(targetDir);
        sendJson(res, 200, {
          drives,
          ...listing,
        });
        return;
      }

      if (pathname === '/api/project/files' && method === 'GET') {
        if (!selectedProject || !selectedProject.exists || !selectedProject.accessible) {
          sendJson(res, 400, {
            error: 'No valid project directory is currently selected.',
          });
          return;
        }
        const subdir = parsedUrl.searchParams.get('subdir') || '';
        if (!isPathInsideProject(selectedProject.path, subdir)) {
          sendJson(res, 403, {
            error: 'Forbidden: Path traversal outside the authorized project directory.',
          });
          return;
        }
        try {
          const files = listAuthorizedProjectFiles(selectedProject.path, subdir);
          sendJson(res, 200, { files, projectPath: selectedProject.path });
        } catch (err) {
          sendJson(res, 400, { error: String(err) });
        }
        return;
      }

      // 5. Usage Information Endpoint (Phase 7)
      if (
        (pathname === '/api/usage' && method === 'GET') ||
        (pathname === '/api/usage/refresh' && method === 'POST')
      ) {
        agyStatus = await agyAdapter.checkAvailability();
        const useDemo = settings.preferredAdapter === 'demo' || !agyStatus.available;
        if (useDemo) {
          const demoUsage = demoAdapter.getDemoUsageInformation(settings.selectedModel);
          sendJson(res, 200, demoUsage);
          return;
        }
        const usage = await agyAdapter.fetchUsageInformation(settings.selectedModel);
        lastUsage = usage;
        persistConfig();
        sendJson(res, 200, usage);
        return;
      }

      // 6. Settings Update
      if (pathname === '/api/settings' && method === 'POST') {
        const body = await readJsonBody<Partial<ApplicationSettings>>(req);
        if (body.language === 'en' || body.language === 'vi') {
          settings.language = body.language;
        }
        if (body.preferredAdapter === 'agy' || body.preferredAdapter === 'demo') {
          settings.preferredAdapter = body.preferredAdapter;
        }
        if (typeof body.selectedModel === 'string' && body.selectedModel.trim()) {
          settings.selectedModel = body.selectedModel.trim();
        }
        if (
          body.permissionPolicy === 'request-review' ||
          body.permissionPolicy === 'accept-edits' ||
          body.permissionPolicy === 'auto-approve'
        ) {
          settings.permissionPolicy = body.permissionPolicy;
        }
        if (typeof body.splitRatio === 'number') {
          settings.splitRatio = Math.min(0.8, Math.max(0.35, body.splitRatio));
        }
        if (typeof body.officeCollapsed === 'boolean') {
          settings.officeCollapsed = body.officeCollapsed;
        }
        if (typeof body.reducedMotion === 'boolean') {
          settings.reducedMotion = body.reducedMotion;
        }
        if (
          typeof body.heartbeatIntervalMs === 'number' ||
          typeof body.staleSessionTimeoutMs === 'number' ||
          typeof body.shutdownGracePeriodMs === 'number'
        ) {
          lifecycle.updateConfig({
            heartbeatIntervalMs: body.heartbeatIntervalMs,
            staleSessionTimeoutMs: body.staleSessionTimeoutMs,
            shutdownGracePeriodMs: body.shutdownGracePeriodMs,
          });
          const snap = lifecycle.getSnapshot();
          settings.heartbeatIntervalMs = snap.heartbeatIntervalMs;
          settings.staleSessionTimeoutMs = snap.staleSessionTimeoutMs;
          settings.shutdownGracePeriodMs = snap.shutdownGracePeriodMs;
        }
        persistConfig();
        sendJson(res, 200, { ok: true, settings, lifecycle: lifecycle.getSnapshot() });
        return;
      }

      // 7. Conversations Persistence
      if (pathname === '/api/conversations/save' && method === 'POST') {
        const body = await readJsonBody<{ conversations?: Conversation[] }>(req);
        if (Array.isArray(body.conversations)) {
          conversations = body.conversations;
          storage.saveConversations(conversations);
        }
        sendJson(res, 200, { ok: true, count: conversations.length });
        return;
      }

      // 8. Streaming AI Chat Turn via SSE (Phase 5.1 & Phase 6)
      if (pathname === '/api/chat/stream' && method === 'POST') {
        const body = await readJsonBody<{
          prompt?: string;
          adapterMode?: AgentAdapterMode;
          model?: string;
          projectPath?: string | null;
          agyConversationId?: string;
          permissionPolicy?: AgyPermissionPolicy;
          approveAllForTurn?: boolean;
          attachments?: string[];
        }>(req);

        const rawPrompt = (body.prompt || '').trim();
        if (!rawPrompt) {
          sendJson(res, 400, { error: 'Message prompt cannot be empty.' });
          return;
        }

        const requestedMode: AgentAdapterMode =
          body.adapterMode || settings.preferredAdapter;
        const model = body.model || settings.selectedModel;
        const permPolicy = body.permissionPolicy || settings.permissionPolicy;

        // Validate project directory if provided (if null/empty, chat executes in General Chat mode)
        let activeProjectDir: string | null = null;
        if (
          body.projectPath &&
          typeof body.projectPath === 'string' &&
          body.projectPath.trim() !== ''
        ) {
          const check = validateProjectDirectory(body.projectPath);
          if (!check.exists || !check.accessible) {
            sendJson(res, 400, {
              error: check.error || 'Selected project directory is not accessible.',
            });
            return;
          }
          activeProjectDir = check.path;
        }

        // Append authorized file attachment context references if any
        let finalPrompt = rawPrompt;
        if (
          Array.isArray(body.attachments) &&
          body.attachments.length > 0 &&
          activeProjectDir
        ) {
          const validAttachments = body.attachments.filter((rel) =>
            isPathInsideProject(activeProjectDir!, rel)
          );
          if (validAttachments.length > 0) {
            finalPrompt =
              `[Attached Project Files in ${activeProjectDir}: ${validAttachments.join(', ')}]\n\n` +
              rawPrompt;
          }
        }

        // Open SSE stream
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const sendSse = (event: string, data: unknown) => {
          if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        };

        if (requestedMode === 'agy') {
          agyStatus = await agyAdapter.checkAvailability();
          if (!agyStatus.available) {
            sendSse('error', {
              message:
                agyStatus.error ||
                'Antigravity CLI (agy.exe) is unavailable. Switch to Demo Mode manually if you wish to test offline.',
            });
            res.end();
            return;
          }

          sendSse('state', { state: 'THINKING', isSimulated: false });

          const streamHandle = agyAdapter.streamPrompt({
            prompt: finalPrompt,
            model,
            projectDir: activeProjectDir,
            agyConversationId: body.agyConversationId,
            permissionPolicy: permPolicy,
            approveAllForTurn: Boolean(body.approveAllForTurn),
            callbacks: {
              onInit: (info) => {
                sendSse('init', { ...info, isSimulated: false });
              },
              onThinkingDelta: (delta) => {
                sendSse('state', { state: 'THINKING', isSimulated: false });
                sendSse('thinking', { delta, isSimulated: false });
              },
              onTextDelta: (delta) => {
                sendSse('state', { state: 'WORKING', isSimulated: false });
                sendSse('text', { delta, isSimulated: false });
              },
              onToolStep: (step) => {
                sendSse('state', { state: 'WORKING', isSimulated: false });
                sendSse('tool', { step, isSimulated: false });
              },
              onUsageUpdate: (usage) => {
                sendSse('usage', { usage, isSimulated: false });
              },
              onComplete: (result) => {
                activeTurnCancel = null;
                sendSse('complete', { ...result, isSimulated: false });
                if (!res.writableEnded) res.end();
              },
              onError: (errMessage) => {
                activeTurnCancel = null;
                sendSse('error', { message: errMessage, isSimulated: false });
                if (!res.writableEnded) res.end();
              },
            },
          });

          activeTurnCancel = streamHandle.cancel;
          req.on('close', () => {
            if (activeTurnCancel === streamHandle.cancel) {
              streamHandle.cancel();
              activeTurnCancel = null;
            }
          });
          return;
        } else {
          // Demo Mode (explicitly chosen by user)
          sendSse('state', { state: 'THINKING', isSimulated: true });
          const demoHandle = demoAdapter.streamDemoPrompt({
            prompt: finalPrompt,
            projectDir: activeProjectDir,
            callbacks: {
              onInit: (info) => sendSse('init', { ...info, isSimulated: true }),
              onThinkingDelta: (delta) => {
                sendSse('state', { state: 'THINKING', isSimulated: true });
                sendSse('thinking', { delta, isSimulated: true });
              },
              onTextDelta: (delta) => {
                sendSse('state', { state: 'WORKING', isSimulated: true });
                sendSse('text', { delta, isSimulated: true });
              },
              onToolStep: (step) => {
                sendSse('state', { state: 'WORKING', isSimulated: true });
                sendSse('tool', { step, isSimulated: true });
              },
              onUsageUpdate: (usage) => {
                sendSse('usage', { usage, isSimulated: true });
              },
              onComplete: (result) => {
                activeTurnCancel = null;
                sendSse('complete', { ...result, isSimulated: true });
                if (!res.writableEnded) res.end();
              },
              onError: (errMessage) => {
                activeTurnCancel = null;
                sendSse('error', { message: errMessage, isSimulated: true });
                if (!res.writableEnded) res.end();
              },
            },
          });
          activeTurnCancel = demoHandle.cancel;
          req.on('close', () => {
            if (activeTurnCancel === demoHandle.cancel) {
              demoHandle.cancel();
              activeTurnCancel = null;
            }
          });
          return;
        }
      }

      if (pathname === '/api/chat/cancel' && method === 'POST') {
        if (activeTurnCancel) {
          activeTurnCancel();
          activeTurnCancel = null;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      // 9. Static Frontend Asset Serving (Phase 8.5)
      if (method === 'GET' || method === 'HEAD') {
        const relativeReq = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const safeAssetPath = path.resolve(clientDistDir, relativeReq);
        if (!isPathInsideProject(clientDistDir, safeAssetPath)) {
          sendJson(res, 403, { error: 'Forbidden path' });
          return;
        }

        let fileToServe = safeAssetPath;
        if (!fs.existsSync(fileToServe) || fs.statSync(fileToServe).isDirectory()) {
          // Fallback to index.html for SPA routes
          fileToServe = path.join(clientDistDir, 'index.html');
        }

        if (fs.existsSync(fileToServe) && fs.statSync(fileToServe).isFile()) {
          const ext = path.extname(fileToServe).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
          });
          fs.createReadStream(fileToServe).pipe(res);
          return;
        }
      }

      sendJson(res, 404, { error: `Not found: ${method} ${pathname}` });
    } catch (err) {
      storage.log('ERROR', 'Unhandled HTTP request error', String(err));
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: `Internal server error: ${(err as Error)?.message || String(err)}`,
        });
      }
    }
  });

  // Safe dynamic port binding strictly to 127.0.0.1 (Phase 8.1 & 8.4)
  const preferredPort =
    options?.preferredPort ??
    (process.env.VIRTUAL_OFFICE_PORT
      ? Number(process.env.VIRTUAL_OFFICE_PORT)
      : 47831);

  const listenOnPort = (portToTry: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && portToTry !== 0) {
          // Port conflict: safely fall back to OS-assigned ephemeral port on 127.0.0.1
          storage.log(
            'WARN',
            `Port ${portToTry} is in use; falling back to an available loopback port.`
          );
          listenOnPort(0).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener('error', onError);
        const addr = server.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : portToTry;
        resolve(actualPort);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(portToTry, HOST);
    });
  };

  boundPort = await listenOnPort(preferredPort);
  lifecycle.setPort(boundPort);
  const url = `http://${HOST}:${boundPort}`;

  storage.writeRuntimeInstance({
    pid: process.pid,
    port: boundPort,
    host: HOST,
    startedAt: new Date().toISOString(),
    url,
  });

  storage.log('INFO', `Server listening on ${url} (PID: ${process.pid})`);

  shutdownFn = async (reason = 'manual') => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    storage.log('INFO', `Shutting down server (reason: ${reason})`);
    lifecycle.disposeTimers();
    if (activeTurnCancel) {
      activeTurnCancel();
      activeTurnCancel = null;
    }
    storage.clearRuntimeInstance();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      setTimeout(() => resolve(), 1500).unref();
    });

    if (options?.exitProcessOnShutdown) {
      process.exit(0);
    }
  };

  return {
    server,
    port: boundPort,
    host: HOST,
    url,
    storage,
    lifecycle,
    shutdown: shutdownFn,
  };
}

// Direct CLI execution entrypoint
const isMainModule = (() => {
  try {
    const entryPath = fileURLToPath(import.meta.url);
    return (
      process.argv[1] &&
      path.resolve(process.argv[1]).toLowerCase() ===
        path.resolve(entryPath).toLowerCase()
    );
  } catch {
    return false;
  }
})();

if (isMainModule) {
  createVirtualOfficeServer({ exitProcessOnShutdown: true })
    .then((instance) => {
      console.log(
        `[VirtualOffice] Ready at ${instance.url} (PID ${process.pid}, bound to ${instance.host})`
      );
      process.on('SIGINT', () => void instance.shutdown('SIGINT'));
      process.on('SIGTERM', () => void instance.shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('[VirtualOffice] Failed to start server:', err);
      process.exit(1);
    });
}
