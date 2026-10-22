// Shared types across Frontend and Backend for The Virtual Office for Your Work

export type AgentActivityState =
  | 'IDLE'
  | 'THINKING'
  | 'WORKING'
  | 'WAITING'
  | 'COMPLETED'
  | 'ERROR'
  | 'DISCONNECTED';

export type AgentConnectionStatus =
  | 'CONNECTED'
  | 'DEMO_MODE'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

export type UsageStatusState =
  | 'CONNECTED'
  | 'LOADING'
  | 'UNAVAILABLE'
  | 'DISCONNECTED'
  | 'STALE'
  | 'UNSUPPORTED'
  | 'ERROR';

export type AgentAdapterMode = 'agy' | 'demo';

export type AgyPermissionPolicy = 'request-review' | 'accept-edits' | 'auto-approve';

export interface ProjectInfo {
  path: string;
  name: string;
  exists: boolean;
  accessible: boolean;
  driveLetter?: string;
  fileCountSummary?: number;
  lastValidatedAt: string;
  error?: string;
}

export interface DeniedActionInfo {
  action: string;
  display_name: string;
}

export interface ToolStepEvent {
  stepIndex: number;
  toolName: string;
  state: 'ACTIVE' | 'DONE' | 'ERROR';
  parameters?: Record<string, unknown>;
  error?: string;
  durationSeconds?: number;
}

export interface TurnUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'event' | 'error';
  content: string;
  timestamp: string;
  projectPath: string | null;
  adapterMode: AgentAdapterMode;
  isSimulated: boolean;
  model?: string;
  thinkingText?: string;
  toolSteps?: ToolStepEvent[];
  usage?: TurnUsageMetrics;
  durationSeconds?: number;
  deniedActions?: DeniedActionInfo[];
  agyConversationId?: string;
  attachments?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  projectPath: string | null;
  projectName: string | null;
  createdAt: string;
  updatedAt: string;
  adapterMode: AgentAdapterMode;
  agyConversationId?: string;
  messages: ChatMessage[];
}

export interface ActivityFeedItem {
  id: string;
  timestamp: string;
  type:
    | 'USER_REQUEST'
    | 'AGENT_THINKING'
    | 'AGENT_WORKING'
    | 'TOOL_CALL'
    | 'AGENT_WAITING'
    | 'TASK_COMPLETED'
    | 'ERROR'
    | 'DISCONNECTED'
    | 'PROJECT_CHANGED'
    | 'SYSTEM';
  summary: string;
  detail?: string;
  isSimulated: boolean;
}

export interface QuotaBucket {
  id: string;
  name: string;
  description?: string;
  window: string;
  remainingFraction: number; // 0.0 to 1.0
  remainingPercent: number;  // 0 to 100
  resetTime: string;
}

export interface QuotaGroup {
  name: string;
  description?: string;
  buckets: QuotaBucket[];
}

export interface UsageInformation {
  state: UsageStatusState;
  provider: 'antigravity-cli' | 'demo-simulated' | 'none';
  isSimulated: boolean;
  currentModel: string | null;
  currentModelDisplayName: string | null;
  // Latest turn & session token consumption (from real agy step/result usage)
  lastTurnTokens: TurnUsageMetrics | null;
  sessionTotalTokens: TurnUsageMetrics;
  // Context window metrics: explicitly tracked as supported or unsupported
  contextWindow: {
    status: 'SUPPORTED' | 'UNSUPPORTED' | 'UNAVAILABLE';
    usedTokens: number | null; // Last turn inputTokens if available
    capacityTokens: number | null; // null if agy CLI does not expose model capacity
    percentUsed: number | null; // null when capacity is not exposed by agy CLI
    note: string;
  };
  // Quota information from `agy -p "/usage" --output-format json`
  quota: {
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNSUPPORTED' | 'STALE' | 'ERROR';
    primaryBucketName: string | null;
    primaryRemainingPercent: number | null;
    primaryResetTime: string | null;
    groups: QuotaGroup[];
    description?: string;
    errorMessage?: string;
  };
  lastUpdatedAt: string | null;
  isStale: boolean;
  statusMessage?: string;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface ApplicationSettings {
  language: 'en' | 'vi';
  preferredAdapter: AgentAdapterMode;
  selectedModel: string;
  permissionPolicy: AgyPermissionPolicy;
  splitRatio: number; // Default 0.6667
  officeCollapsed: boolean;
  reducedMotion: boolean;
  heartbeatIntervalMs: number;
  staleSessionTimeoutMs: number;
  shutdownGracePeriodMs: number;
}

export interface TabSessionInfo {
  tabId: string;
  registeredAt: string;
  lastHeartbeatAt: string;
  userAgent?: string;
  visible: boolean;
}

export interface LifecycleStatusSnapshot {
  activeTabCount: number;
  tabs: TabSessionInfo[];
  shutdownScheduledAt: string | null;
  shutdownRemainingMs: number | null;
  heartbeatIntervalMs: number;
  staleSessionTimeoutMs: number;
  shutdownGracePeriodMs: number;
  serverStartedAt: string;
  pid: number;
  port: number;
}
