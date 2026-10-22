import { LifecycleStatusSnapshot, TabSessionInfo } from '../shared/types.js';

export interface LifecycleManagerOptions {
  heartbeatIntervalMs?: number;
  staleSessionTimeoutMs?: number;
  shutdownGracePeriodMs?: number;
  initialConnectTimeoutMs?: number;
  onShutdownTriggered: (reason: string) => void;
  onStateChange?: (snapshot: LifecycleStatusSnapshot) => void;
  logger?: (level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: unknown) => void;
}

interface InternalTabRecord {
  tabId: string;
  registeredAt: number;
  lastHeartbeatAt: number;
  userAgent?: string;
  visible: boolean;
}

export class LifecycleManager {
  private readonly tabs = new Map<string, InternalTabRecord>();
  private heartbeatIntervalMs: number;
  private staleSessionTimeoutMs: number;
  private shutdownGracePeriodMs: number;
  private readonly initialConnectTimeoutMs: number;
  private readonly onShutdownTriggered: (reason: string) => void;
  private readonly onStateChange?: (snapshot: LifecycleStatusSnapshot) => void;
  private readonly logger?: (level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: unknown) => void;

  private hasEverHadTab = false;
  private shutdownTimer: NodeJS.Timeout | null = null;
  private shutdownScheduledAtMs: number | null = null;
  private sweepInterval: NodeJS.Timeout | null = null;
  private initialStartupTimer: NodeJS.Timeout | null = null;
  private committedShutdown = false;
  private readonly serverStartedAt: string;
  private port = 0;

  constructor(options: LifecycleManagerOptions) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
    this.staleSessionTimeoutMs = options.staleSessionTimeoutMs ?? 25000;
    this.shutdownGracePeriodMs = options.shutdownGracePeriodMs ?? 5000;
    this.initialConnectTimeoutMs = options.initialConnectTimeoutMs ?? 90000;
    this.onShutdownTriggered = options.onShutdownTriggered;
    this.onStateChange = options.onStateChange;
    this.logger = options.logger;
    this.serverStartedAt = new Date().toISOString();

    this.sweepInterval = setInterval(() => {
      this.sweepStaleSessions();
    }, 1000);
    this.sweepInterval.unref();

    // Safety fallback if the server is started and no browser tab ever connects within initialConnectTimeoutMs
    this.initialStartupTimer = setTimeout(() => {
      if (!this.hasEverHadTab && this.tabs.size === 0 && !this.committedShutdown) {
        this.log('WARN', 'No browser tab connected within initial startup timeout; scheduling shutdown.');
        this.scheduleShutdownGracePeriod('initial-connect-timeout');
      }
    }, this.initialConnectTimeoutMs);
    this.initialStartupTimer.unref();
  }

  public setPort(port: number): void {
    this.port = port;
  }

  public updateConfig(config: {
    heartbeatIntervalMs?: number;
    staleSessionTimeoutMs?: number;
    shutdownGracePeriodMs?: number;
  }): void {
    if (
      typeof config.heartbeatIntervalMs === 'number' &&
      config.heartbeatIntervalMs >= 500 &&
      config.heartbeatIntervalMs <= 60000
    ) {
      this.heartbeatIntervalMs = config.heartbeatIntervalMs;
    }
    if (
      typeof config.staleSessionTimeoutMs === 'number' &&
      config.staleSessionTimeoutMs >= 1500 &&
      config.staleSessionTimeoutMs <= 180000
    ) {
      this.staleSessionTimeoutMs = config.staleSessionTimeoutMs;
    }
    if (
      typeof config.shutdownGracePeriodMs === 'number' &&
      config.shutdownGracePeriodMs >= 500 &&
      config.shutdownGracePeriodMs <= 60000
    ) {
      this.shutdownGracePeriodMs = config.shutdownGracePeriodMs;
    }
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: unknown): void {
    if (this.logger) {
      this.logger(level, msg, meta);
    }
  }

  public registerTab(tabId: string, userAgent?: string, visible = true): LifecycleStatusSnapshot {
    if (this.committedShutdown) {
      return this.getSnapshot();
    }
    const cleanId = (tabId || '').trim();
    if (!cleanId) {
      throw new Error('tabId is required');
    }

    const now = Date.now();
    this.hasEverHadTab = true;
    if (this.initialStartupTimer) {
      clearTimeout(this.initialStartupTimer);
      this.initialStartupTimer = null;
    }

    const existing = this.tabs.get(cleanId);
    this.tabs.set(cleanId, {
      tabId: cleanId,
      registeredAt: existing ? existing.registeredAt : now,
      lastHeartbeatAt: now,
      userAgent: userAgent || existing?.userAgent,
      visible,
    });

    this.cancelPendingShutdown('tab-registered');
    this.log('INFO', `Tab registered: ${cleanId} (active tabs: ${this.tabs.size})`);
    const snap = this.getSnapshot();
    this.onStateChange?.(snap);
    return snap;
  }

  public heartbeat(tabId: string, visible = true, userAgent?: string): LifecycleStatusSnapshot {
    if (this.committedShutdown) {
      return this.getSnapshot();
    }
    const cleanId = (tabId || '').trim();
    if (!cleanId) {
      throw new Error('tabId is required');
    }

    const now = Date.now();
    this.hasEverHadTab = true;
    const existing = this.tabs.get(cleanId);
    if (existing) {
      existing.lastHeartbeatAt = now;
      existing.visible = visible;
      if (userAgent) existing.userAgent = userAgent;
    } else {
      // Re-register transparently if tab recovered from temporary disconnect or reload
      this.tabs.set(cleanId, {
        tabId: cleanId,
        registeredAt: now,
        lastHeartbeatAt: now,
        userAgent,
        visible,
      });
      this.log('INFO', `Tab re-registered via heartbeat: ${cleanId}`);
    }

    this.cancelPendingShutdown('heartbeat-received');
    const snap = this.getSnapshot();
    this.onStateChange?.(snap);
    return snap;
  }

  public closeTab(tabId: string, reason = 'client-close'): LifecycleStatusSnapshot {
    if (this.committedShutdown) {
      return this.getSnapshot();
    }
    const cleanId = (tabId || '').trim();
    if (cleanId && this.tabs.has(cleanId)) {
      this.tabs.delete(cleanId);
      this.log('INFO', `Tab closed (${reason}): ${cleanId} (remaining tabs: ${this.tabs.size})`);
    }

    if (this.hasEverHadTab && this.tabs.size === 0) {
      this.scheduleShutdownGracePeriod(`last-tab-closed:${reason}`);
    }

    const snap = this.getSnapshot();
    this.onStateChange?.(snap);
    return snap;
  }

  public sweepStaleSessions(): void {
    if (this.committedShutdown) return;

    const now = Date.now();
    let removedCount = 0;

    for (const [tabId, record] of this.tabs.entries()) {
      // Allow slightly longer tolerance for background/hidden tabs in case browser throttled timers
      const effectiveTimeout = record.visible
        ? this.staleSessionTimeoutMs
        : Math.max(this.staleSessionTimeoutMs, Math.min(this.staleSessionTimeoutMs * 1.5, 45000));

      if (now - record.lastHeartbeatAt > effectiveTimeout) {
        this.tabs.delete(tabId);
        removedCount++;
        this.log('INFO', `Expired stale tab session: ${tabId}`, {
          idleMs: now - record.lastHeartbeatAt,
          effectiveTimeout,
        });
      }
    }

    if (removedCount > 0) {
      if (this.hasEverHadTab && this.tabs.size === 0) {
        this.scheduleShutdownGracePeriod('all-tabs-stale-expired');
      }
      this.onStateChange?.(this.getSnapshot());
    }
  }

  private scheduleShutdownGracePeriod(triggerReason: string): void {
    if (this.committedShutdown || this.shutdownTimer) {
      return;
    }

    this.shutdownScheduledAtMs = Date.now() + this.shutdownGracePeriodMs;
    this.log(
      'INFO',
      `Zero active tabs (${triggerReason}). Scheduling server shutdown in ${this.shutdownGracePeriodMs}ms.`
    );

    this.shutdownTimer = setTimeout(() => {
      this.shutdownTimer = null;
      this.shutdownScheduledAtMs = null;
      if (this.tabs.size === 0 && !this.committedShutdown) {
        this.committedShutdown = true;
        this.log('INFO', `Grace period elapsed with 0 active tabs. Committing shutdown (${triggerReason}).`);
        this.disposeTimers();
        this.onShutdownTriggered(triggerReason);
      }
    }, this.shutdownGracePeriodMs);
  }

  private cancelPendingShutdown(reason: string): void {
    if (this.shutdownTimer && !this.committedShutdown) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
      this.shutdownScheduledAtMs = null;
      this.log('INFO', `Cancelled pending shutdown grace period (${reason}).`);
    }
  }

  public isShuttingDown(): boolean {
    return this.committedShutdown;
  }

  public getSnapshot(): LifecycleStatusSnapshot {
    const now = Date.now();
    const tabsList: TabSessionInfo[] = Array.from(this.tabs.values()).map((t) => ({
      tabId: t.tabId,
      registeredAt: new Date(t.registeredAt).toISOString(),
      lastHeartbeatAt: new Date(t.lastHeartbeatAt).toISOString(),
      userAgent: t.userAgent,
      visible: t.visible,
    }));

    return {
      activeTabCount: tabsList.length,
      tabs: tabsList,
      shutdownScheduledAt: this.shutdownScheduledAtMs
        ? new Date(this.shutdownScheduledAtMs).toISOString()
        : null,
      shutdownRemainingMs: this.shutdownScheduledAtMs
        ? Math.max(0, this.shutdownScheduledAtMs - now)
        : null,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      staleSessionTimeoutMs: this.staleSessionTimeoutMs,
      shutdownGracePeriodMs: this.shutdownGracePeriodMs,
      serverStartedAt: this.serverStartedAt,
      pid: process.pid,
      port: this.port,
    };
  }

  public disposeTimers(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
    if (this.initialStartupTimer) {
      clearTimeout(this.initialStartupTimer);
      this.initialStartupTimer = null;
    }
  }
}
