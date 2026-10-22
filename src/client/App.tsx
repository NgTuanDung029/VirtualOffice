import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityFeedItem,
  AgentActivityState,
  AgentAdapterMode,
  AgentConnectionStatus,
  ApplicationSettings,
  ChatMessage,
  Conversation,
  DeniedActionInfo,
  LifecycleStatusSnapshot,
  ModelOption,
  ProjectInfo,
  ToolStepEvent,
  TurnUsageMetrics,
  UsageInformation,
} from '../shared/types';
import { TerminalWorkspace } from './components/TerminalWorkspace';
import { PixelOfficePanel } from './components/PixelOfficeCanvas';
import { UsageStatusBar } from './components/UsageStatusBar';
import { DirectoryModal, SettingsModal } from './components/DirectoryModal';

function makeId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createBlankConversation(
  project: ProjectInfo | null,
  adapterMode: AgentAdapterMode
): Conversation {
  const now = new Date().toISOString();
  return {
    id: makeId('conv'),
    title: project ? `Workspace: ${project.name}` : 'New Session',
    projectPath: project ? project.path : null,
    projectName: project ? project.name : null,
    createdAt: now,
    updatedAt: now,
    adapterMode,
    messages: [],
  };
}

export const App: React.FC = () => {
  // Unique per-tab session identifier (Phase 10.1)
  const tabIdRef = useRef<string>(makeId('tab'));
  const sessionStartedAtRef = useRef<number>(Date.now());

  // Centralized Application State (Phase 5)
  const [settings, setSettings] = useState<ApplicationSettings>({
    preferredAdapter: 'agy',
    selectedModel: 'gemini-4-argon-medium',
    permissionPolicy: 'request-review',
    splitRatio: 0.6667,
    officeCollapsed: false,
    reducedMotion: false,
    heartbeatIntervalMs: 5000,
    staleSessionTimeoutMs: 25000,
    shutdownGracePeriodMs: 5000,
  });

  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>(() => [
    createBlankConversation(null, 'agy'),
  ]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [agentConnectionStatus, setAgentConnectionStatus] =
    useState<AgentConnectionStatus>('CONNECTING');
  const [agentActivityState, setAgentActivityState] =
    useState<AgentActivityState>('IDLE');
  const [currentTask, setCurrentTask] = useState<string>(
    'Idle — Ready for your prompt'
  );
  const [completedTasksCount, setCompletedTasksCount] = useState<number>(0);
  const [activityHistory, setActivityHistory] = useState<ActivityFeedItem[]>([]);
  const [usageInformation, setUsageInformation] =
    useState<UsageInformation | null>(null);
  const [usageLoading, setUsageLoading] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([
    { id: 'gemini-4-argon-medium', name: 'Gemini 4 Argon (Medium)' },
    { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
  ]);
  const [agyInfo, setAgyInfo] = useState<{
    available: boolean;
    binaryPath: string | null;
    version: string | null;
    error?: string;
  }>({
    available: false,
    binaryPath: null,
    version: null,
  });
  const [lifecycleSnapshot, setLifecycleSnapshot] =
    useState<LifecycleStatusSnapshot | null>(null);

  // Modals & UI State
  const [directoryModalOpen, setDirectoryModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const completedTimeoutRef = useRef<number | null>(null);

  const pushActivity = useCallback(
    (
      type: ActivityFeedItem['type'],
      summary: string,
      isSimulated: boolean,
      detail?: string
    ) => {
      setActivityHistory((prev) => [
        {
          id: makeId('act'),
          timestamp: new Date().toISOString(),
          type,
          summary,
          detail,
          isSimulated,
        },
        ...prev.slice(0, 49),
      ]);
    },
    []
  );

  // Refresh Usage Information (Phase 7.5 - auto-refresh every 10s)
  const usageLoadingRef = useRef(false);
  const refreshUsage = useCallback(async () => {
    if (usageLoadingRef.current) return;
    usageLoadingRef.current = true;
    setUsageLoading(true);
    try {
      const res = await fetch('/api/usage/refresh', { method: 'POST' });
      if (res.ok) {
        const data: UsageInformation = await res.json();
        setUsageInformation(data);
      }
    } catch {
      setUsageInformation((prev) =>
        prev
          ? {
              ...prev,
              state: 'STALE',
              isStale: true,
              statusMessage: 'Connection lost; retaining last valid usage snapshot.',
            }
          : null
      );
    } finally {
      usageLoadingRef.current = false;
      setUsageLoading(false);
    }
  }, []);

  // Periodic Usage Auto-Refresh (Every 10 seconds per user request)
  useEffect(() => {
    const usageTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && agentConnectionStatus !== 'DISCONNECTED') {
        void refreshUsage();
      }
    }, 10000);
    return () => window.clearInterval(usageTimer);
  }, [refreshUsage, agentConnectionStatus]);

  // Bootstrap Initial State from Local Backend
  useEffect(() => {
    let mounted = true;
    const initBootstrap = async () => {
      try {
        const res = await fetch('/api/bootstrap');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;

        if (data.settings) setSettings(data.settings);
        if (data.agyStatus) setAgyInfo(data.agyStatus);
        if (Array.isArray(data.availableModels) && data.availableModels.length > 0) {
          setAvailableModels(data.availableModels);
        }
        if (data.selectedProject) setSelectedProject(data.selectedProject);
        if (Array.isArray(data.recentProjects)) setRecentProjects(data.recentProjects);
        if (data.lastUsage) setUsageInformation(data.lastUsage);
        if (data.lifecycle) setLifecycleSnapshot(data.lifecycle);

        const mode: AgentAdapterMode = data.activeAdapterMode || 'agy';
        if (mode === 'agy' && data.agyStatus?.available) {
          setAgentConnectionStatus('CONNECTED');
          setAgentActivityState('IDLE');
          pushActivity(
            'SYSTEM',
            `Connected to Antigravity CLI (v${data.agyStatus.version})`,
            false,
            data.agyStatus.binaryPath || undefined
          );
        } else {
          setAgentConnectionStatus('DEMO_MODE');
          setAgentActivityState('IDLE');
          pushActivity(
            'SYSTEM',
            'Initialized in Demo Mode (Simulated Adapter)',
            true
          );
        }

        if (Array.isArray(data.conversations) && data.conversations.length > 0) {
          setConversations(data.conversations);
          const first = data.conversations[0];
          setActiveConvId(first.id);
          if (first.projectPath) {
            void handleSyncProjectForConversation(first.projectPath, first.projectName);
          } else {
            setSelectedProject(null);
          }
        } else {
          const initialConv = createBlankConversation(
            null,
            mode
          );
          setConversations([initialConv]);
          setActiveConvId(initialConv.id);
          setSelectedProject(null);
        }

        void refreshUsage();
      } catch (err) {
        if (!mounted) return;
        setAgentConnectionStatus('DISCONNECTED');
        setAgentActivityState('DISCONNECTED');
        setCurrentTask('Disconnected from local backend server');
        pushActivity(
          'DISCONNECTED',
          'Could not reach local backend server on 127.0.0.1',
          false,
          String(err)
        );
      }
    };
    void initBootstrap();
    return () => {
      mounted = false;
    };
  }, [pushActivity, refreshUsage]);

  // Tab-Session Registration, Heartbeats, and sendBeacon Closure (Phase 10)
  useEffect(() => {
    const tabId = tabIdRef.current;

    const register = async () => {
      try {
        const res = await fetch('/api/lifecycle/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tabId,
            visible: document.visibilityState === 'visible',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.lifecycle) setLifecycleSnapshot(data.lifecycle);
        }
      } catch {
        // Ignore transient error; next heartbeat will recover
      }
    };

    const sendHeartbeat = async () => {
      try {
        const res = await fetch('/api/lifecycle/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tabId,
            visible: document.visibilityState === 'visible',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.lifecycle) setLifecycleSnapshot(data.lifecycle);
          setAgentConnectionStatus((prev) =>
            prev === 'DISCONNECTED'
              ? settings.preferredAdapter === 'agy' && agyInfo.available
                ? 'CONNECTED'
                : 'DEMO_MODE'
              : prev
          );
          setAgentActivityState((prev) =>
            prev === 'DISCONNECTED' ? 'IDLE' : prev
          );
        }
      } catch {
        setAgentConnectionStatus('DISCONNECTED');
        setAgentActivityState('DISCONNECTED');
      }
    };

    void register();

    const intervalMs = Math.max(1500, settings.heartbeatIntervalMs || 5000);
    const hbTimer = window.setInterval(() => {
      void sendHeartbeat();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    };

    const handlePageUnload = (evtType: string) => {
      const payload = JSON.stringify({ tabId, reason: evtType });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
        navigator.sendBeacon('/api/lifecycle/close', blob);
      } else {
        void fetch('/api/lifecycle/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      }
    };

    const onPageHide = () => handlePageUnload('pagehide');
    const onBeforeUnload = () => handlePageUnload('beforeunload');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(hbTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [settings.heartbeatIntervalMs, settings.preferredAdapter, agyInfo.available]);

  // Persist conversations whenever they change
  const persistConversationsToServer = useCallback((nextConvs: Conversation[]) => {
    void fetch('/api/conversations/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversations: nextConvs }),
    }).catch(() => {});
  }, []);

  // Resizable Split-Screen Divider Logic (Phase 2.2)
  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ratio = e.clientX / window.innerWidth;
      const clamped = Math.min(0.78, Math.max(0.42, ratio));
      setSettings((prev) => ({ ...prev, splitRatio: clamped }));
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
      void fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splitRatio: settings.splitRatio }),
      }).catch(() => {});
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit, settings.splitRatio]);

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) ||
    conversations[0] ||
    createBlankConversation(selectedProject, settings.preferredAdapter);

  const updateSettings = async (partial: Partial<ApplicationSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
        if (data.lifecycle) setLifecycleSnapshot(data.lifecycle);
      }
      if (partial.preferredAdapter || partial.selectedModel) {
        if (partial.preferredAdapter === 'demo') {
          setAgentConnectionStatus('DEMO_MODE');
        } else if (partial.preferredAdapter === 'agy') {
          setAgentConnectionStatus(
            agyInfo.available ? 'CONNECTED' : 'ERROR'
          );
        }
        void refreshUsage();
      }
    } catch {
      // ignore
    }
  };

  // Synchronize Project/Folder State with active conversation
  const handleSyncProjectForConversation = async (
    dirPath: string | null,
    fallbackName?: string | null
  ) => {
    if (!dirPath) {
      setSelectedProject(null);
      return;
    }
    try {
      const res = await fetch('/api/project/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      if (data.project) {
        setSelectedProject(data.project);
      } else {
        setSelectedProject({
          path: dirPath,
          name: fallbackName || dirPath.split(/[/\\]/).filter(Boolean).pop() || 'Project',
          exists: false,
          accessible: false,
          lastValidatedAt: new Date().toISOString(),
          error: data.error || 'Folder not accessible',
        });
      }
    } catch {
      setSelectedProject({
        path: dirPath,
        name: fallbackName || 'Project',
        exists: false,
        accessible: false,
        lastValidatedAt: new Date().toISOString(),
      });
    }
  };

  const handleSelectConversation = async (
    convId: string,
    convList?: Conversation[]
  ) => {
    setActiveConvId(convId);
    const list = convList || conversations;
    const target = list.find((c) => c.id === convId);
    if (!target || !target.projectPath) {
      setSelectedProject(null);
    } else {
      await handleSyncProjectForConversation(target.projectPath, target.projectName);
    }
  };

  // Project State Flow (Phase 5.2)
  const handleSelectProjectPath = async (
    dirPath: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/project/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Directory validation failed.' };
      }
      setSelectedProject(data.project);
      if (Array.isArray(data.recentProjects)) {
        setRecentProjects(data.recentProjects);
      }

      // Bind selected folder to current conversation
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              projectPath: data.project.path,
              projectName: data.project.name,
              title:
                c.title === 'New Chat' || c.title === 'Đoạn Chat Mới' || c.title === 'New Session'
                  ? `Workspace: ${data.project.name}`
                  : c.title,
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        });
        persistConversationsToServer(updated);
        return updated;
      });

      pushActivity(
        'PROJECT_CHANGED',
        `Selected project folder: ${data.project.name}`,
        false,
        data.project.path
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  };

  const handleClearProject = async () => {
    await fetch('/api/project/clear', { method: 'POST' });
    setSelectedProject(null);
    setConversations((prev) => {
      const updated = prev.map((c) => {
        if (c.id === activeConvId) {
          return {
            ...c,
            projectPath: null,
            projectName: null,
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      });
      persistConversationsToServer(updated);
      return updated;
    });
    pushActivity('PROJECT_CHANGED', 'Cleared folder for current conversation (General Chat)', false);
  };

  const handlePickNativeDialog = async () => {
    const res = await fetch('/api/project/pick-native', { method: 'POST' });
    const data = await res.json();
    if (data.cancelled) return { cancelled: true };
    if (data.ok && data.project) {
      setSelectedProject(data.project);
      if (Array.isArray(data.recentProjects)) {
        setRecentProjects(data.recentProjects);
      }
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              projectPath: data.project.path,
              projectName: data.project.name,
              title:
                c.title === 'New Chat' || c.title === 'Đoạn Chat Mới' || c.title === 'New Session'
                  ? `Workspace: ${data.project.name}`
                  : c.title,
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        });
        persistConversationsToServer(updated);
        return updated;
      });
      pushActivity(
        'PROJECT_CHANGED',
        `Selected project folder: ${data.project.name}`,
        false,
        data.project.path
      );
    }
    return {
      cancelled: false,
      ok: Boolean(data.ok),
      error: data.error,
    };
  };

  const handleNewConversation = () => {
    // When clicking New Chat, folder is empty (General Chat)
    const newConv = createBlankConversation(
      null,
      settings.preferredAdapter
    );
    const updated = [newConv, ...conversations];
    setConversations(updated);
    setActiveConvId(newConv.id);
    setSelectedProject(null); // Folder becomes empty!
    persistConversationsToServer(updated);
  };

  const handleDeleteConversation = (convId: string) => {
    const remaining = conversations.filter((c) => c.id !== convId);
    if (remaining.length === 0) {
      const fresh = createBlankConversation(
        null,
        settings.preferredAdapter
      );
      setConversations([fresh]);
      setActiveConvId(fresh.id);
      setSelectedProject(null);
      persistConversationsToServer([fresh]);
    } else {
      setConversations(remaining);
      if (activeConvId === convId) {
        void handleSelectConversation(remaining[0].id, remaining);
      }
      persistConversationsToServer(remaining);
    }
  };

  const handleRenameConversation = (convId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const updated = conversations.map((c) =>
      c.id === convId ? { ...c, title: trimmed, updatedAt: new Date().toISOString() } : c
    );
    setConversations(updated);
    persistConversationsToServer(updated);
  };

  // Agent State Flow (Phase 5.1)
  const handleSendMessage = async (
    prompt: string,
    attachments: string[],
    approveAllForTurn = false
  ): Promise<boolean> => {
    if (completedTimeoutRef.current) {
      window.clearTimeout(completedTimeoutRef.current);
      completedTimeoutRef.current = null;
    }

    const mode: AgentAdapterMode = settings.preferredAdapter;
    const isSim = mode === 'demo';
    const nowIso = new Date().toISOString();

    const userMessage: ChatMessage = {
      id: makeId('msg-user'),
      role: 'user',
      content: prompt,
      timestamp: nowIso,
      projectPath: selectedProject?.path || null,
      adapterMode: mode,
      isSimulated: isSim,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const assistantMsgId = makeId('msg-ai');
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      projectPath: selectedProject?.path || null,
      adapterMode: mode,
      isSimulated: isSim,
      model: settings.selectedModel,
      thinkingText: '',
      toolSteps: [],
    };

    const targetConvId = activeConversation.id;
    const currentAgyConvId = activeConversation.agyConversationId;

    // 1. Add user message + assistant placeholder to conversation
    setConversations((prev) => {
      const next = prev.map((c) => {
        if (c.id !== targetConvId) return c;
        const autoTitle =
          c.messages.length === 0
            ? prompt.slice(0, 38) + (prompt.length > 38 ? '...' : '')
            : c.title;
        return {
          ...c,
          title: autoTitle,
          projectPath: selectedProject?.path || c.projectPath,
          projectName: selectedProject?.name || c.projectName,
          updatedAt: nowIso,
          messages: [...c.messages, userMessage, placeholderAssistant],
        };
      });
      persistConversationsToServer(next);
      return next;
    });

    // 2. Change office state to THINKING
    setIsStreaming(true);
    setAgentActivityState('THINKING');
    setCurrentTask(`Thinking: "${prompt.slice(0, 48)}${prompt.length > 48 ? '...' : ''}"`);
    pushActivity(
      'USER_REQUEST',
      `User submitted prompt (${prompt.length} chars)`,
      isSim,
      selectedProject ? `Workspace: ${selectedProject.name}` : undefined
    );
    pushActivity(
      'AGENT_THINKING',
      isSim
        ? 'Demo Adapter simulating reasoning...'
        : `Antigravity (${settings.selectedModel}) analyzing request...`,
      isSim
    );

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          adapterMode: mode,
          model: settings.selectedModel,
          projectPath: selectedProject?.path || null,
          agyConversationId: currentAgyConvId,
          permissionPolicy: settings.permissionPolicy,
          approveAllForTurn,
          attachments,
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      const updateAssistantMsg = (
        updater: (msg: ChatMessage) => ChatMessage,
        newAgyCid?: string
      ) => {
        setConversations((prev) => {
          const next = prev.map((c) => {
            if (c.id !== targetConvId) return c;
            return {
              ...c,
              agyConversationId: newAgyCid || c.agyConversationId,
              updatedAt: new Date().toISOString(),
              messages: c.messages.map((m) =>
                m.id === assistantMsgId ? updater(m) : m
              ),
            };
          });
          persistConversationsToServer(next);
          return next;
        });
      };

      const processSseBlock = (block: string) => {
        const lines = block.split('\n');
        let eventType = 'message';
        let dataLine = '';
        for (const l of lines) {
          if (l.startsWith('event:')) eventType = l.slice(6).trim();
          if (l.startsWith('data:')) dataLine += l.slice(5).trim();
        }
        if (!dataLine) return;

        try {
          const payload = JSON.parse(dataLine);
          if (eventType === 'init') {
            updateAssistantMsg(
              (m) => ({
                ...m,
                model: payload.model || m.model,
                agyConversationId: payload.conversationId,
              }),
              payload.conversationId
            );
          } else if (eventType === 'state') {
            if (payload.state === 'WORKING') {
              setAgentActivityState('WORKING');
              setCurrentTask('Working — Streaming code & executing steps...');
            } else if (payload.state === 'THINKING') {
              setAgentActivityState('THINKING');
            }
          } else if (eventType === 'thinking') {
            updateAssistantMsg((m) => ({
              ...m,
              thinkingText: (m.thinkingText || '') + (payload.delta || ''),
            }));
          } else if (eventType === 'text') {
            setAgentActivityState('WORKING');
            updateAssistantMsg((m) => ({
              ...m,
              content: m.content + (payload.delta || ''),
            }));
          } else if (eventType === 'tool') {
            const step: ToolStepEvent = payload.step;
            setAgentActivityState('WORKING');
            setCurrentTask(`Executing tool: ${step.toolName}`);
            pushActivity(
              'TOOL_CALL',
              `Tool ${step.toolName} (${step.state})`,
              Boolean(payload.isSimulated)
            );
            updateAssistantMsg((m) => {
              const existing = m.toolSteps || [];
              const idx = existing.findIndex(
                (s) => s.stepIndex === step.stepIndex && s.toolName === step.toolName
              );
              const nextSteps =
                idx >= 0
                  ? existing.map((s, i) => (i === idx ? step : s))
                  : [...existing, step];
              return { ...m, toolSteps: nextSteps };
            });
          } else if (eventType === 'usage') {
            const u: TurnUsageMetrics = payload.usage;
            updateAssistantMsg((m) => ({ ...m, usage: u }));
          } else if (eventType === 'complete') {
            const denied: DeniedActionInfo[] | undefined = payload.deniedActions;
            updateAssistantMsg(
              (m) => ({
                ...m,
                content:
                  m.content.trim().length > 0
                    ? m.content
                    : payload.response ||
                      (denied && denied.length > 0
                        ? 'Antigravity paused this turn because a tool requested interactive permission.'
                        : m.content),
                usage: payload.usage || m.usage,
                durationSeconds: payload.durationSeconds,
                deniedActions: denied,
                agyConversationId: payload.conversationId,
              }),
              payload.conversationId
            );

            if (denied && denied.length > 0) {
              setAgentActivityState('WAITING');
              setCurrentTask(
                `Waiting for permission approval (${denied
                  .map((d) => d.display_name)
                  .join(', ')})`
              );
              pushActivity(
                'AGENT_WAITING',
                `Agent requested permission for: ${denied
                  .map((d) => d.display_name)
                  .join(', ')}`,
                Boolean(payload.isSimulated)
              );
            } else {
              setCompletedTasksCount((c) => c + 1);
              setAgentActivityState('COMPLETED');
              setCurrentTask('Completed response!');
              pushActivity(
                'TASK_COMPLETED',
                `Completed response (${
                  payload.usage?.totalTokens
                    ? `${payload.usage.totalTokens.toLocaleString()} tokens`
                    : 'done'
                })`,
                Boolean(payload.isSimulated)
              );
              completedTimeoutRef.current = window.setTimeout(() => {
                setAgentActivityState('IDLE');
                setCurrentTask('Idle — Ready for your next prompt');
              }, 3200);
            }
            void refreshUsage();
          } else if (eventType === 'error') {
            setAgentActivityState('ERROR');
            setCurrentTask(`Error: ${payload.message}`);
            pushActivity(
              'ERROR',
              payload.message || 'Agent request failed',
              Boolean(payload.isSimulated)
            );
            updateAssistantMsg((m) => ({
              ...m,
              role: 'error',
              content: payload.message || 'An error occurred while processing the request.',
            }));
          }
        } catch {
          // ignore malformed event chunk
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        let sepIndex: number;
        while ((sepIndex = sseBuffer.indexOf('\n\n')) !== -1) {
          const block = sseBuffer.slice(0, sepIndex);
          sseBuffer = sseBuffer.slice(sepIndex + 2);
          processSseBlock(block);
        }
      }

      setIsStreaming(false);
      return true;
    } catch (err) {
      setIsStreaming(false);
      setAgentActivityState('ERROR');
      const errMsg = (err as Error)?.message || String(err);
      setCurrentTask(`Error: ${errMsg}`);
      pushActivity('ERROR', `Request failed: ${errMsg}`, isSim);

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== targetConvId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    role: 'error',
                    content: `Failed to complete request: ${errMsg}`,
                  }
                : m
            ),
          };
        })
      );
      return false;
    }
  };

  const handleCancelStream = async () => {
    await fetch('/api/chat/cancel', { method: 'POST' }).catch(() => {});
    setIsStreaming(false);
    setAgentActivityState('WAITING');
    setCurrentTask('Turn cancelled by user — Waiting for next prompt');
    pushActivity(
      'AGENT_WAITING',
      'User stopped active generation',
      settings.preferredAdapter === 'demo'
    );
  };

  const leftWidthStyle = settings.officeCollapsed
    ? '100%'
    : `${(settings.splitRatio * 100).toFixed(2)}%`;
  const rightWidthStyle = settings.officeCollapsed
    ? '0%'
    : `${((1 - settings.splitRatio) * 100).toFixed(2)}%`;

  return (
    <div
      className={`vo-app-shell ${isDraggingSplit ? 'vo-dragging-split' : ''}`}
    >
      {/* LEFT PANEL: Terminal Coding Workspace (Default 66.67%) */}
      <div className="vo-left-pane" style={{ width: leftWidthStyle }}>
        <TerminalWorkspace
          selectedProject={selectedProject}
          connectionStatus={agentConnectionStatus}
          adapterMode={settings.preferredAdapter}
          selectedModel={settings.selectedModel}
          availableModels={availableModels}
          conversations={conversations}
          activeConversation={activeConversation}
          isStreaming={isStreaming}
          officeCollapsed={settings.officeCollapsed}
          language={settings.language || 'en'}
          onToggleLanguage={(lang) => void updateSettings({ language: lang })}
          onOpenDirectoryModal={() => setDirectoryModalOpen(true)}
          onOpenSettingsModal={() => setSettingsModalOpen(true)}
          onToggleAdapterMode={(mode) =>
            void updateSettings({ preferredAdapter: mode })
          }
          onSelectModel={(modelId) =>
            void updateSettings({ selectedModel: modelId })
          }
          onNewConversation={handleNewConversation}
          onSelectConversation={(cid) => void handleSelectConversation(cid)}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onSendMessage={handleSendMessage}
          onCancelStream={() => void handleCancelStream()}
          onToggleOfficeCollapse={() =>
            void updateSettings({ officeCollapsed: !settings.officeCollapsed })
          }
        />
      </div>

      {/* RESIZABLE SPLIT DIVIDER */}
      {!settings.officeCollapsed && (
        <div
          className="vo-split-divider"
          onMouseDown={() => setIsDraggingSplit(true)}
          title="Drag to resize workspace / virtual office panels (Default 2:1)"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="vo-split-handle" />
        </div>
      )}

      {/* RIGHT PANEL: Cozy Animated Pixel-Art Virtual Office (Default 33.33%) */}
      {!settings.officeCollapsed && (
        <div className="vo-right-pane" style={{ width: rightWidthStyle }}>
          <PixelOfficePanel
            activityState={agentActivityState}
            connectionStatus={agentConnectionStatus}
            isSimulated={settings.preferredAdapter === 'demo'}
            selectedProject={selectedProject}
            currentTask={currentTask}
            completedTasksCount={completedTasksCount}
            sessionStartedAt={sessionStartedAtRef.current}
            activityFeed={activityHistory}
            reducedMotion={settings.reducedMotion}
            language={settings.language || 'en'}
          >
            {/* Bottom-Right Persistent Token Usage Status Bar (Phase 7) */}
            <UsageStatusBar
              usage={usageInformation}
              loading={usageLoading}
              language={settings.language || 'en'}
              onRefresh={() => void refreshUsage()}
            />
          </PixelOfficePanel>
        </div>
      )}

      {/* Modals */}
      <DirectoryModal
        isOpen={directoryModalOpen}
        onClose={() => setDirectoryModalOpen(false)}
        language={settings.language || 'en'}
        currentProject={selectedProject}
        recentProjects={recentProjects}
        onSelectPath={handleSelectProjectPath}
        onClearProject={handleClearProject}
        onPickNativeDialog={handlePickNativeDialog}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        lifecycle={lifecycleSnapshot}
        agyInfo={agyInfo}
        onSaveSettings={updateSettings}
      />
    </div>
  );
};
