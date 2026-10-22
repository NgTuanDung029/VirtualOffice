import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  AgyPermissionPolicy,
  DeniedActionInfo,
  ModelOption,
  QuotaBucket,
  QuotaGroup,
  ToolStepEvent,
  TurnUsageMetrics,
  UsageInformation,
} from '../shared/types.js';

export interface AgyStreamCallbacks {
  onInit: (info: { conversationId: string; model: string; cwd: string }) => void;
  onThinkingDelta: (delta: string) => void;
  onTextDelta: (delta: string) => void;
  onToolStep: (step: ToolStepEvent) => void;
  onUsageUpdate: (usage: TurnUsageMetrics) => void;
  onComplete: (result: {
    conversationId: string;
    response: string;
    durationSeconds: number;
    usage: TurnUsageMetrics;
    deniedActions?: DeniedActionInfo[];
  }) => void;
  onError: (errMessage: string) => void;
}

const KNOWN_MODELS_FALLBACK: ModelOption[] = [
  { id: 'gemini-4-argon-medium', name: 'Gemini 4 Argon (Medium)' },
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)' },
  { id: 'gemini-4-argon-low', name: 'Gemini 4 Argon (Low)' },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
  { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)' },
  { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
  { id: 'claude-opus-5-5-medium', name: 'Claude Opus 5.5 (Medium)' },
  { id: 'claude-sonnet-5-5-medium', name: 'Claude Sonnet 5.5 (Medium)' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
];

export class AgyCliAdapter {
  private agyPath: string | null = null;
  private agyVersion: string | null = null;
  private cachedModels: ModelOption[] = KNOWN_MODELS_FALLBACK;
  private sessionTotalTokens: TurnUsageMetrics = {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };
  private lastTurnTokens: TurnUsageMetrics | null = null;
  private lastUsageSnapshot: UsageInformation | null = null;
  private inFlightUsagePromise: Promise<UsageInformation> | null = null;

  constructor() {
    this.detectBinarySync();
  }

  public detectBinarySync(): string | null {
    const candidates: string[] = [];

    if (process.env.AGY_BIN_PATH) {
      candidates.push(process.env.AGY_BIN_PATH);
    }

    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'agy', 'bin', 'agy.exe'));

    // Search directories in system PATH
    const envPath = process.env.PATH || '';
    const pathDirs = envPath.split(path.delimiter);
    for (const p of pathDirs) {
      if (p.trim()) {
        candidates.push(path.join(p.trim(), 'agy.exe'));
      }
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          this.agyPath = candidate;
          return candidate;
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  public async checkAvailability(): Promise<{
    available: boolean;
    binaryPath: string | null;
    version: string | null;
    error?: string;
  }> {
    const bin = this.detectBinarySync() || 'agy.exe';
    return new Promise((resolve) => {
      execFile(
        bin,
        ['--version'],
        { timeout: 6000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve({
              available: false,
              binaryPath: null,
              version: null,
              error: `Antigravity CLI (agy.exe) not found or inaccessible: ${err.message}`,
            });
            return;
          }
          const ver = (stdout || '').trim().split(/\r?\n/).pop() || 'unknown';
          this.agyPath = bin;
          this.agyVersion = ver;
          resolve({
            available: true,
            binaryPath: bin,
            version: ver,
          });
        }
      );
    });
  }

  public getModelDisplayName(modelId: string | null): string | null {
    if (!modelId) return null;
    const found = this.cachedModels.find((m) => m.id === modelId);
    return found ? found.name : modelId;
  }

  public async fetchModels(): Promise<ModelOption[]> {
    const bin = this.agyPath || this.detectBinarySync();
    if (!bin) return this.cachedModels;

    return new Promise((resolve) => {
      execFile(
        bin,
        ['models'],
        { timeout: 10000, windowsHide: true },
        (err, stdout) => {
          if (err || !stdout) {
            resolve(this.cachedModels);
            return;
          }
          const parsed: ModelOption[] = [];
          const lines = stdout.split(/\r?\n/);
          for (const line of lines) {
            const parts = line.trim().split('\t');
            if (parts.length >= 2 && parts[0] && !parts[0].startsWith('Fetching')) {
              parsed.push({ id: parts[0].trim(), name: parts[1].trim() });
            }
          }
          if (parsed.length > 0) {
            this.cachedModels = parsed;
          }
          resolve(this.cachedModels);
        }
      );
    });
  }

  /**
   * Retrieves real quota usage via `agy -p "/usage" --output-format json`.
   * Combines quota buckets with actual recorded session token consumption.
   * Never fabricates missing metrics.
   */
  public async fetchUsageInformation(currentModel: string): Promise<UsageInformation> {
    const bin = this.agyPath || this.detectBinarySync();
    const modelDisplay = this.getModelDisplayName(currentModel);

    if (this.inFlightUsagePromise) {
      return this.inFlightUsagePromise;
    }

    if (this.lastUsageSnapshot && this.lastUsageSnapshot.lastUpdatedAt) {
      const ageMs = Date.now() - new Date(this.lastUsageSnapshot.lastUpdatedAt).getTime();
      if (ageMs < 3000) {
        return {
          ...this.lastUsageSnapshot,
          currentModel,
          currentModelDisplayName: modelDisplay,
        };
      }
    }

    if (!bin) {
      return {
        state: 'DISCONNECTED',
        provider: 'none',
        isSimulated: false,
        currentModel,
        currentModelDisplayName: modelDisplay,
        lastTurnTokens: this.lastTurnTokens,
        sessionTotalTokens: this.sessionTotalTokens,
        contextWindow: {
          status: 'UNAVAILABLE',
          usedTokens: null,
          capacityTokens: null,
          percentUsed: null,
          note: 'Antigravity CLI (agy.exe) is not connected.',
        },
        quota: {
          status: 'UNAVAILABLE',
          primaryBucketName: null,
          primaryRemainingPercent: null,
          primaryResetTime: null,
          groups: [],
          errorMessage: 'Antigravity CLI binary not detected.',
        },
        lastUpdatedAt: this.lastUsageSnapshot?.lastUpdatedAt || null,
        isStale: Boolean(this.lastUsageSnapshot),
        statusMessage: 'Antigravity CLI disconnected',
      };
    }

    this.inFlightUsagePromise = new Promise<UsageInformation>((resolve) => {
      execFile(
        bin,
        ['-p', '/usage', '--output-format', 'json'],
        { timeout: 15000, windowsHide: true },
        (err, stdout) => {
          const now = new Date().toISOString();
          if (err || !stdout) {
            if (this.lastUsageSnapshot) {
              const staleCopy: UsageInformation = {
                ...this.lastUsageSnapshot,
                state: 'STALE',
                currentModel,
                currentModelDisplayName: modelDisplay,
                lastTurnTokens: this.lastTurnTokens,
                sessionTotalTokens: this.sessionTotalTokens,
                isStale: true,
                statusMessage: `Refresh failed (${err?.message || 'timeout'}); showing last valid data.`,
              };
              resolve(staleCopy);
              return;
            }
            resolve({
              state: 'ERROR',
              provider: 'antigravity-cli',
              isSimulated: false,
              currentModel,
              currentModelDisplayName: modelDisplay,
              lastTurnTokens: this.lastTurnTokens,
              sessionTotalTokens: this.sessionTotalTokens,
              contextWindow: {
                status: 'UNSUPPORTED',
                usedTokens: this.lastTurnTokens ? this.lastTurnTokens.inputTokens : null,
                capacityTokens: null,
                percentUsed: null,
                note: 'agy CLI reports per-turn input tokens, but does not expose static context window capacity %.',
              },
              quota: {
                status: 'ERROR',
                primaryBucketName: null,
                primaryRemainingPercent: null,
                primaryResetTime: null,
                groups: [],
                errorMessage: err?.message || 'Failed to query agy /usage.',
              },
              lastUpdatedAt: null,
              isStale: false,
              statusMessage: 'Error querying agy /usage',
            });
            return;
          }

          try {
            const jsonLine = stdout
              .trim()
              .split(/\r?\n/)
              .find((l) => l.trim().startsWith('{'));
            const payload = JSON.parse(jsonLine || stdout.trim());
            const rawGroups = payload?.command?.data?.groups || [];
            const groups: QuotaGroup[] = rawGroups.map((g: Record<string, unknown>) => ({
              name: String(g.name || 'Models'),
              description: typeof g.description === 'string' ? g.description : undefined,
              buckets: Array.isArray(g.buckets)
                ? g.buckets.map((b: Record<string, unknown>): QuotaBucket => {
                    const frac =
                      typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 0;
                    return {
                      id: String(b.id || b.name || ''),
                      name: String(b.name || 'Quota'),
                      description:
                        typeof b.description === 'string' ? b.description : undefined,
                      window: String(b.window || ''),
                      remainingFraction: frac,
                      remainingPercent: Math.round(frac * 100),
                      resetTime: String(b.reset_time || ''),
                    };
                  })
                : [],
            }));

            // Pick the primary relevant quota bucket based on selected model
            let primaryBucket: QuotaBucket | null = null;
            const lowerModel = (currentModel || '').toLowerCase();
            for (const g of groups) {
              const gLower = g.name.toLowerCase();
              if (lowerModel.includes('argon') && gLower.includes('argon') && g.buckets[0]) {
                primaryBucket = g.buckets[0];
                break;
              }
              if (
                (lowerModel.includes('claude') || lowerModel.includes('gpt')) &&
                (gLower.includes('claude') || gLower.includes('gpt')) &&
                g.buckets[0]
              ) {
                primaryBucket = g.buckets[0];
                break;
              }
              if (
                lowerModel.includes('gemini') &&
                !lowerModel.includes('argon') &&
                gLower.includes('gemini models') &&
                g.buckets[0]
              ) {
                primaryBucket = g.buckets[0];
                break;
              }
            }
            if (!primaryBucket && groups[0]?.buckets[0]) {
              primaryBucket = groups[0].buckets[0];
            }

            const usageInfo: UsageInformation = {
              state: 'CONNECTED',
              provider: 'antigravity-cli',
              isSimulated: false,
              currentModel,
              currentModelDisplayName: modelDisplay,
              lastTurnTokens: this.lastTurnTokens,
              sessionTotalTokens: { ...this.sessionTotalTokens },
              contextWindow: {
                status: 'UNSUPPORTED',
                usedTokens: this.lastTurnTokens ? this.lastTurnTokens.inputTokens : null,
                capacityTokens: null,
                percentUsed: null,
                note: 'Antigravity CLI (agy) reports exact per-turn input/output tokens, but does not expose model context-window capacity % in JSON output.',
              },
              quota: {
                status: groups.length > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
                primaryBucketName: primaryBucket ? primaryBucket.name : null,
                primaryRemainingPercent: primaryBucket ? primaryBucket.remainingPercent : null,
                primaryResetTime: primaryBucket ? primaryBucket.resetTime : null,
                groups,
                description:
                  typeof payload?.command?.data?.description === 'string'
                    ? payload.command.data.description
                    : undefined,
              },
              lastUpdatedAt: now,
              isStale: false,
              statusMessage: 'Live data from Antigravity CLI (/usage)',
            };

            this.lastUsageSnapshot = usageInfo;
            resolve(usageInfo);
          } catch (parseErr) {
            resolve({
              state: 'ERROR',
              provider: 'antigravity-cli',
              isSimulated: false,
              currentModel,
              currentModelDisplayName: modelDisplay,
              lastTurnTokens: this.lastTurnTokens,
              sessionTotalTokens: this.sessionTotalTokens,
              contextWindow: {
                status: 'UNSUPPORTED',
                usedTokens: null,
                capacityTokens: null,
                percentUsed: null,
                note: 'Not exposed by agy CLI JSON output.',
              },
              quota: {
                status: 'ERROR',
                primaryBucketName: null,
                primaryRemainingPercent: null,
                primaryResetTime: null,
                groups: [],
                errorMessage: `Failed to parse agy /usage output: ${String(parseErr)}`,
              },
              lastUpdatedAt: null,
              isStale: false,
              statusMessage: 'Parse error from agy /usage',
            });
          }
        }
      );
    });

    try {
      return await this.inFlightUsagePromise;
    } finally {
      this.inFlightUsagePromise = null;
    }
  }

  public recordTurnUsage(usage: TurnUsageMetrics): void {
    if (
      usage.totalTokens > 0 ||
      usage.inputTokens > 0 ||
      usage.outputTokens > 0
    ) {
      this.lastTurnTokens = { ...usage };
      this.sessionTotalTokens = {
        inputTokens: this.sessionTotalTokens.inputTokens + usage.inputTokens,
        outputTokens: this.sessionTotalTokens.outputTokens + usage.outputTokens,
        thinkingTokens: this.sessionTotalTokens.thinkingTokens + usage.thinkingTokens,
        cacheReadTokens: this.sessionTotalTokens.cacheReadTokens + usage.cacheReadTokens,
        totalTokens: this.sessionTotalTokens.totalTokens + usage.totalTokens,
      };
      if (this.lastUsageSnapshot) {
        this.lastUsageSnapshot.lastTurnTokens = { ...this.lastTurnTokens };
        this.lastUsageSnapshot.sessionTotalTokens = { ...this.sessionTotalTokens };
        this.lastUsageSnapshot.contextWindow.usedTokens = this.lastTurnTokens.inputTokens;
      }
    }
  }

  /**
   * Executes a real streaming turn against `agy.exe` using `--output-format stream-json`.
   */
  public streamPrompt(options: {
    prompt: string;
    model: string;
    projectDir: string | null;
    agyConversationId?: string;
    permissionPolicy: AgyPermissionPolicy;
    approveAllForTurn?: boolean;
    callbacks: AgyStreamCallbacks;
  }): { cancel: () => void } {
    const bin = this.agyPath || this.detectBinarySync();
    if (!bin) {
      options.callbacks.onError('Antigravity CLI (agy.exe) is not available on this system.');
      return { cancel: () => {} };
    }

    const args: string[] = [
      '-p',
      options.prompt,
      '--output-format',
      'stream-json',
    ];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.agyConversationId) {
      args.push('--conversation', options.agyConversationId);
    }

    if (options.projectDir && fs.existsSync(options.projectDir)) {
      args.push('--add-dir', options.projectDir);
    }

    if (options.approveAllForTurn || options.permissionPolicy === 'auto-approve') {
      args.push('--dangerously-skip-permissions');
    } else if (options.permissionPolicy === 'accept-edits') {
      args.push('--mode', 'accept-edits');
    }

    const localAppData =
      process.env.LOCALAPPDATA ||
      path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local');
    const generalChatWorkspace = path.join(
      localAppData,
      'VirtualOffice',
      'workspace-general'
    );
    if (!fs.existsSync(generalChatWorkspace)) {
      try {
        fs.mkdirSync(generalChatWorkspace, { recursive: true });
      } catch {
        // ignore
      }
    }

    const cwd =
      options.projectDir && fs.existsSync(options.projectDir)
        ? options.projectDir
        : (fs.existsSync(generalChatWorkspace) ? generalChatWorkspace : process.cwd());

    const child = spawn(bin, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrText = '';
    let completed = false;
    let accumulatedText = '';
    let lastConversationId = options.agyConversationId || '';
    let latestUsage: TurnUsageMetrics = {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
    };

    const parseUsageObj = (raw: Record<string, unknown> | undefined): TurnUsageMetrics | null => {
      if (!raw || typeof raw !== 'object') return null;
      return {
        inputTokens: Number(raw.input_tokens || 0),
        outputTokens: Number(raw.output_tokens || 0),
        thinkingTokens: Number(raw.thinking_tokens || 0),
        cacheReadTokens: Number(raw.cache_read_tokens || 0),
        totalTokens: Number(raw.total_tokens || 0),
      };
    };

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;
      try {
        const evt = JSON.parse(trimmed);
        if (evt.event === 'init') {
          lastConversationId = evt.conversation_id || lastConversationId;
          options.callbacks.onInit({
            conversationId: lastConversationId,
            model: evt.init?.model || options.model,
            cwd: evt.init?.cwd || cwd,
          });
        } else if (evt.event === 'step_update' && evt.step_update) {
          const su = evt.step_update;
          if (su.conversation_id) {
            lastConversationId = su.conversation_id;
          }
          if (typeof su.thinking_delta === 'string' && su.thinking_delta.length > 0) {
            options.callbacks.onThinkingDelta(su.thinking_delta);
          }
          if (su.step_type === 'agent_response' && typeof su.text_delta === 'string') {
            accumulatedText += su.text_delta;
            options.callbacks.onTextDelta(su.text_delta);
          }
          if (su.step_type === 'tool') {
            options.callbacks.onToolStep({
              stepIndex: Number(su.step_index ?? 0),
              toolName: String(su.tool_name || su.tool_info?.name || 'tool'),
              state:
                su.state === 'ERROR'
                  ? 'ERROR'
                  : su.state === 'DONE'
                  ? 'DONE'
                  : 'ACTIVE',
              parameters: su.tool_info?.parameters,
              error: su.tool_info?.error?.message,
              durationSeconds:
                typeof su.duration_seconds === 'number' ? su.duration_seconds : undefined,
            });
          }
          const stepUsage = parseUsageObj(su.usage);
          if (stepUsage && stepUsage.totalTokens > 0) {
            latestUsage = stepUsage;
            options.callbacks.onUsageUpdate(stepUsage);
          }
        } else if (evt.event === 'result' && evt.result) {
          completed = true;
          const res = evt.result;
          if (res.conversation_id) {
            lastConversationId = res.conversation_id;
          }
          const finalUsage = parseUsageObj(res.usage) || latestUsage;
          this.recordTurnUsage(finalUsage);
          const finalResponse =
            typeof res.response === 'string' && res.response.length > 0
              ? res.response
              : accumulatedText;

          options.callbacks.onComplete({
            conversationId: lastConversationId,
            response: finalResponse,
            durationSeconds: Number(res.duration_seconds || 0),
            usage: finalUsage,
            deniedActions: Array.isArray(res.denied_actions)
              ? res.denied_actions
              : undefined,
          });
        }
      } catch {
        // Ignore non-JSON diagnostic lines
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      let newlineIdx: number;
      while ((newlineIdx = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, newlineIdx);
        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
        handleLine(line);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      if (!completed) {
        completed = true;
        options.callbacks.onError(`Failed to run agy.exe: ${err.message}`);
      }
    });

    child.on('close', (code) => {
      if (stdoutBuffer.trim().length > 0) {
        handleLine(stdoutBuffer);
        stdoutBuffer = '';
      }
      if (!completed) {
        completed = true;
        if (code !== 0) {
          options.callbacks.onError(
            stderrText.trim() || `Antigravity CLI exited with code ${code}`
          );
        } else {
          this.recordTurnUsage(latestUsage);
          options.callbacks.onComplete({
            conversationId: lastConversationId,
            response:
              accumulatedText ||
              (stderrText.includes('permission')
                ? stderrText.trim()
                : 'Turn finished with no text output.'),
            durationSeconds: 0,
            usage: latestUsage,
          });
        }
      }
    });

    return {
      cancel: () => {
        try {
          child.kill();
        } catch {
          // ignore
        }
      },
    };
  }
}
