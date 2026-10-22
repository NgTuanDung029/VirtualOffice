import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ApplicationSettings,
  Conversation,
  UsageInformation,
} from '../shared/types.js';

export function getAppDataDir(): string {
  const customDir = process.env.VIRTUAL_OFFICE_DATA_DIR;
  if (customDir && customDir.trim().length > 0) {
    return path.resolve(customDir);
  }
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'VirtualOffice');
}

const DEFAULT_SETTINGS: ApplicationSettings = {
  language: 'en',
  preferredAdapter: 'agy',
  selectedModel: 'gemini-4-argon-medium',
  permissionPolicy: 'request-review',
  splitRatio: 0.6667,
  officeCollapsed: false,
  reducedMotion: false,
  heartbeatIntervalMs: 5000,
  staleSessionTimeoutMs: 25000,
  shutdownGracePeriodMs: 5000,
};

export class StorageManager {
  private readonly baseDir: string;
  private readonly configPath: string;
  private readonly conversationsPath: string;
  private readonly logsDir: string;
  private readonly runtimeFilePath: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || getAppDataDir();
    this.configPath = path.join(this.baseDir, 'config.json');
    this.conversationsPath = path.join(this.baseDir, 'conversations.json');
    this.logsDir = path.join(this.baseDir, 'logs');
    this.runtimeFilePath = path.join(this.baseDir, 'runtime-instance.json');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getRuntimeFilePath(): string {
    return this.runtimeFilePath;
  }

  public log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
    try {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        pid: process.pid,
        message,
        ...(meta !== undefined ? { meta } : {}),
      });
      const logFile = path.join(
        this.logsDir,
        `server-${new Date().toISOString().slice(0, 10)}.log`
      );
      fs.appendFileSync(logFile, line + '\n', 'utf-8');
    } catch {
      // Ignore logging errors
    }
  }

  public loadConfig(): {
    settings: ApplicationSettings;
    selectedProjectPath: string | null;
    recentProjects: string[];
    lastUsage: UsageInformation | null;
  } {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          selectedProjectPath:
            typeof parsed.selectedProjectPath === 'string'
              ? parsed.selectedProjectPath
              : null,
          recentProjects: Array.isArray(parsed.recentProjects)
            ? parsed.recentProjects.filter((p: unknown) => typeof p === 'string')
            : [],
          lastUsage: parsed.lastUsage || null,
        };
      }
    } catch (err) {
      this.log('WARN', 'Failed to read config.json, using defaults', String(err));
    }
    return {
      settings: { ...DEFAULT_SETTINGS },
      selectedProjectPath: null,
      recentProjects: [],
      lastUsage: null,
    };
  }

  public saveConfig(data: {
    settings: ApplicationSettings;
    selectedProjectPath: string | null;
    recentProjects: string[];
    lastUsage: UsageInformation | null;
  }): void {
    try {
      this.ensureDirectories();
      const tmpPath = `${this.configPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.configPath);
    } catch (err) {
      this.log('ERROR', 'Failed to save config.json', String(err));
    }
  }

  public loadConversations(): Conversation[] {
    try {
      if (fs.existsSync(this.conversationsPath)) {
        const raw = fs.readFileSync(this.conversationsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      this.log('WARN', 'Failed to read conversations.json', String(err));
    }
    return [];
  }

  public saveConversations(conversations: Conversation[]): void {
    try {
      this.ensureDirectories();
      const tmpPath = `${this.conversationsPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(conversations, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.conversationsPath);
    } catch (err) {
      this.log('ERROR', 'Failed to save conversations.json', String(err));
    }
  }

  public writeRuntimeInstance(info: {
    pid: number;
    port: number;
    host: string;
    startedAt: string;
    url: string;
  }): void {
    try {
      this.ensureDirectories();
      fs.writeFileSync(this.runtimeFilePath, JSON.stringify(info, null, 2), 'utf-8');
    } catch (err) {
      this.log('WARN', 'Failed to write runtime-instance.json', String(err));
    }
  }

  public clearRuntimeInstance(): void {
    try {
      if (fs.existsSync(this.runtimeFilePath)) {
        const raw = JSON.parse(fs.readFileSync(this.runtimeFilePath, 'utf-8'));
        if (raw.pid === process.pid) {
          fs.unlinkSync(this.runtimeFilePath);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
