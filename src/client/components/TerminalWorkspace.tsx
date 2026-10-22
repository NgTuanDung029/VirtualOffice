import React, { useEffect, useRef, useState } from 'react';
import {
  AgentAdapterMode,
  AgentConnectionStatus,
  ChatMessage,
  Conversation,
  ModelOption,
  ProjectInfo,
} from '../../shared/types';
import { Language, translations } from '../i18n';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  FileCode,
  FolderOpen,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Send,
  Settings,
  ShieldAlert,
  Square,
  Terminal,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';

interface TerminalWorkspaceProps {
  selectedProject: ProjectInfo | null;
  connectionStatus: AgentConnectionStatus;
  adapterMode: AgentAdapterMode;
  selectedModel: string;
  availableModels: ModelOption[];
  conversations: Conversation[];
  activeConversation: Conversation;
  isStreaming: boolean;
  officeCollapsed: boolean;
  onOpenDirectoryModal: () => void;
  onOpenSettingsModal: () => void;
  onToggleAdapterMode: (mode: AgentAdapterMode) => void;
  onSelectModel: (modelId: string) => void;
  onNewConversation: () => void;
  onSelectConversation: (convId: string) => void;
  onDeleteConversation: (convId: string) => void;
  onRenameConversation: (convId: string, newTitle: string) => void;
  onSendMessage: (
    prompt: string,
    attachments: string[],
    approveAllForTurn?: boolean
  ) => Promise<boolean>;
  onCancelStream: () => void;
  onToggleOfficeCollapse: () => void;
  language: Language;
  onToggleLanguage: (lang: Language) => void;
}

/**
 * Splits markdown content into text paragraphs and fenced code blocks
 * with syntax highlighting and one-click Copy button.
 */
const MessageContentRenderer: React.FC<{ content: string }> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!content) return null;

  const segments: {
    type: 'text' | 'code';
    lang?: string;
    value: string;
  }[] = [];

  const codeRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      lang: match[1] || 'code',
      value: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  const handleCopy = async (codeText: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedIndex(idx);
      setTimeout(() => {
        setCopiedIndex((curr) => (curr === idx ? null : curr));
      }, 1800);
    } catch {
      // Fallback copy via temporary textarea
      const ta = document.createElement('textarea');
      ta.value = codeText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1800);
    }
  };

  return (
    <div className="vo-msg-rendered">
      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return (
            <div key={idx} className="vo-code-block">
              <div className="vo-code-header">
                <span className="vo-code-lang">{seg.lang || 'shell'}</span>
                <button
                  type="button"
                  className="vo-copy-btn"
                  onClick={() => void handleCopy(seg.value, idx)}
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check size={12} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="vo-code-pre">
                <code>{seg.value}</code>
              </pre>
            </div>
          );
        }

        return (
          <div key={idx} className="vo-msg-text-block">
            {seg.value.split('\n').map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {line}
                {lIdx < seg.value.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export const TerminalWorkspace: React.FC<TerminalWorkspaceProps> = ({
  selectedProject,
  connectionStatus,
  adapterMode,
  selectedModel,
  availableModels,
  conversations,
  activeConversation,
  isStreaming,
  officeCollapsed,
  onOpenDirectoryModal,
  onOpenSettingsModal,
  onToggleAdapterMode,
  onSelectModel,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onSendMessage,
  onCancelStream,
  onToggleOfficeCollapse,
  language,
  onToggleLanguage,
}) => {
  const t = translations[language];
  const [draftPrompt, setDraftPrompt] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const startRename = (conv: Conversation) => {
    setEditingTabId(conv.id);
    setEditingTitle(conv.title);
  };

  const commitRename = (convId: string) => {
    if (editingTitle.trim()) {
      onRenameConversation(convId, editingTitle.trim());
    }
    setEditingTabId(null);
  };
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachPopoverOpen, setAttachPopoverOpen] = useState(false);
  const [projectFiles, setProjectFiles] = useState<
    { name: string; relativePath: string; isDirectory: boolean }[]
  >([]);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [autoScroll, setAutoScroll] = useState(true);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll to bottom when new messages arrive unless user scrolled up
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !autoScroll) return;
    el.scrollTop = el.scrollHeight;
  }, [activeConversation.messages, autoScroll]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 80);
  };

  const handleSubmit = async (approveAllForTurn = false, overridePrompt?: string) => {
    const textToSend = (overridePrompt !== undefined ? overridePrompt : draftPrompt).trim();
    if (!textToSend) {
      setComposerError('Please enter a message before sending.');
      return;
    }
    if (isStreaming) {
      return; // Prevent duplicate submission
    }

    setComposerError(null);
    const savedDraft = draftPrompt;
    const savedAttachments = [...attachments];
    if (overridePrompt === undefined) {
      setDraftPrompt('');
      setAttachments([]);
    }
    setAutoScroll(true);

    const ok = await onSendMessage(textToSend, savedAttachments, approveAllForTurn);
    if (!ok && overridePrompt === undefined) {
      // Preserve message content after recoverable error (Phase 3.4)
      setDraftPrompt(savedDraft);
      setAttachments(savedAttachments);
      setComposerError('Request could not be sent. Your draft has been preserved.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draftPrompt.trim().length > 0 && !isStreaming) {
        void handleSubmit(false);
      }
    }
  };

  const loadAttachableFiles = async () => {
    if (!selectedProject || !selectedProject.exists) {
      setProjectFiles([]);
      return;
    }
    try {
      const res = await fetch('/api/project/files');
      const data = await res.json();
      if (Array.isArray(data.files)) {
        setProjectFiles(
          data.files.filter((f: { isDirectory: boolean }) => !f.isDirectory)
        );
      }
    } catch {
      setProjectFiles([]);
    }
  };

  const toggleAttachment = (relPath: string) => {
    setAttachments((prev) =>
      prev.includes(relPath) ? prev.filter((p) => p !== relPath) : [...prev, relPath]
    );
  };

  // Find last user prompt for re-running with permission if deniedActions occurred
  const lastUserPrompt = [...activeConversation.messages]
    .reverse()
    .find((m) => m.role === 'user')?.content;

  return (
    <section className="vo-terminal-panel" aria-label="AI Terminal Coding Workspace">
      {/* Main Top Navigation & Project Toolbar (Phase 2.3 & 3.1) */}
      <header className="vo-toolbar">
        <div className="vo-toolbar-brand">
          <img
            src="/assets/pixel-logo.svg"
            alt="Virtual Office Logo"
            className="vo-brand-logo"
          />
          <div className="vo-brand-text">
            <span className="vo-brand-title">{t.appTitle}</span>
            <span className="vo-brand-subtitle">{t.appSubtitle}</span>
          </div>
        </div>

        {/* Project Folder Selector Button */}
        <div className="vo-toolbar-project">
          <button
            type="button"
            className={`vo-project-selector-btn ${
              selectedProject && (!selectedProject.exists || !selectedProject.accessible)
                ? 'vo-project-invalid'
                : !selectedProject
                ? 'vo-project-empty'
                : ''
            }`}
            onClick={onOpenDirectoryModal}
            title={
              selectedProject
                ? `Current Working Directory: ${selectedProject.path}`
                : `${t.noFolderSelected} — ${t.clickToSelectFolder}`
            }
          >
            <FolderOpen size={14} />
            <div className="vo-project-selector-labels">
              <span className="vo-project-name">
                {selectedProject ? selectedProject.name : t.noFolderSelected}
              </span>
              <span className="vo-project-path">
                {selectedProject
                  ? selectedProject.path
                  : t.clickToSelectFolder}
              </span>
            </div>
          </button>
        </div>

        {/* Adapter Mode, Model Picker, Language Switcher, Connection Badge & Actions */}
        <div className="vo-toolbar-actions">
          {/* Language Switcher: 🇻🇳 VI / 🇺🇸 EN */}
          <button
            type="button"
            className="vo-mode-btn vo-lang-toggle-btn"
            onClick={() => onToggleLanguage(language === 'en' ? 'vi' : 'en')}
            title={language === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English'}
          >
            <span className="vo-lang-flag">{language === 'en' ? '🇺🇸' : '🇻🇳'}</span>
            <span>{language.toUpperCase()}</span>
          </button>

          {/* Adapter Switcher: Real Antigravity CLI vs Demo Mode */}
          <div className="vo-adapter-switch" role="group" aria-label="Agent Integration Mode">
            <button
              type="button"
              className={`vo-mode-btn ${adapterMode === 'agy' ? 'active-live' : ''}`}
              onClick={() => onToggleAdapterMode('agy')}
              title={language === 'en' ? 'Use real authenticated Antigravity CLI' : 'Sử dụng Antigravity CLI thật'}
            >
              <span className="vo-status-dot live" />
              <span>{t.liveAgyCli}</span>
            </button>
            <button
              type="button"
              className={`vo-mode-btn ${adapterMode === 'demo' ? 'active-demo' : ''}`}
              onClick={() => onToggleAdapterMode('demo')}
              title={language === 'en' ? 'Use simulated offline Demo Adapter' : 'Sử dụng chế độ Demo mô phỏng'}
            >
              <span className="vo-status-dot demo" />
              <span>{t.demoMode}</span>
            </button>
          </div>

          {/* Model Selector */}
          <select
            className="vo-toolbar-model-select"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            title="Select AI Model"
            aria-label="Select AI Model"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* New Conversation Action */}
          <button
            type="button"
            className="vo-btn vo-btn-secondary"
            onClick={onNewConversation}
            title={t.newChat}
          >
            <MessageSquarePlus size={14} />
            <span className="vo-hide-narrow">{t.newChat}</span>
          </button>

          {/* Settings Action */}
          <button
            type="button"
            className="vo-icon-btn"
            onClick={onOpenSettingsModal}
            title={t.settings}
          >
            <Settings size={16} />
          </button>

          {/* Collapse/Expand Right Virtual Office Panel */}
          <button
            type="button"
            className="vo-icon-btn"
            onClick={onToggleOfficeCollapse}
            title={
              officeCollapsed
                ? 'Restore Pixel-Art Virtual Office Panel'
                : 'Collapse Pixel-Art Virtual Office Panel'
            }
          >
            {officeCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
      </header>

      {/* Secondary Sub-Bar: Conversation Tabs & Storage Provenance Notice (Phase 3.3) */}
      <div className="vo-subtoolbar">
        <div className="vo-conv-tabs">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`vo-conv-tab ${
                conv.id === activeConversation.id ? 'active' : ''
              } ${editingTabId === conv.id ? 'editing' : ''}`}
            >
              {editingTabId === conv.id ? (
                <div className="vo-conv-rename-wrap">
                  <Terminal size={11} />
                  <input
                    type="text"
                    className="vo-conv-rename-input"
                    value={editingTitle}
                    autoFocus
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(conv.id);
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    onBlur={() => commitRename(conv.id)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="vo-conv-tab-btn"
                  onClick={() => onSelectConversation(conv.id)}
                  onDoubleClick={() => startRename(conv)}
                  title={`${conv.title}${
                    conv.projectPath ? ` (${conv.projectPath})` : ''
                  } — ${t.renameTabPrompt}`}
                >
                  <Terminal size={11} />
                  <span className="vo-conv-tab-title">{conv.title}</span>
                  {conv.projectName ? (
                    <span className="vo-conv-proj-tag">📁 {conv.projectName}</span>
                  ) : (
                    <span className="vo-conv-general-tag">💬</span>
                  )}
                </button>
              )}
              {editingTabId !== conv.id && (
                <div className="vo-conv-tab-actions">
                  <button
                    type="button"
                    className="vo-conv-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(conv);
                    }}
                    title={t.renameChat}
                  >
                    <Edit2 size={10} />
                  </button>
                  {conversations.length > 1 && (
                    <button
                      type="button"
                      className="vo-conv-del-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      title="Delete local conversation"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="vo-provenance-badge" title="Local application conversation history is stored separately in %LOCALAPPDATA%\VirtualOffice and does not claim to synchronize all internal Antigravity IDE transcripts.">
          <span>{t.localAppHistory}</span>
          {activeConversation.agyConversationId && (
            <code className="vo-agy-cid">
              AGY SESSION: {activeConversation.agyConversationId.slice(0, 8)}
            </code>
          )}
        </div>
      </div>

      {/* Show notice banner only if the selected folder is inaccessible */}
      {selectedProject && (!selectedProject.exists || !selectedProject.accessible) && (
        <div className="vo-workspace-notice vo-notice-error">
          <AlertTriangle size={14} />
          <span>
            <strong>{t.projectInaccessible}</strong>{' '}
            <code>{selectedProject.path}</code> — {selectedProject.error}
          </span>
          <button
            type="button"
            className="vo-inline-link"
            onClick={onOpenDirectoryModal}
          >
            {t.changeFolder}
          </button>
        </div>
      )}

      {/* Scrollable Conversation History Stream (Phase 3.3) */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="vo-messages-viewport"
      >
        {activeConversation.messages.length === 0 ? (
          <div className="vo-empty-chat">
            <div className="vo-empty-terminal-header">
              <span>{selectedProject ? `$ cd "${selectedProject.path}"` : `$ virtual-office --general-chat`}</span>
            </div>
            <div className="vo-empty-body">
              <h3>{selectedProject ? `${t.welcomeTitle} — ${selectedProject.name}` : t.welcomeTitleGeneral}</h3>
              <p>
                {selectedProject
                  ? (adapterMode === 'agy' && connectionStatus === 'CONNECTED'
                      ? t.welcomeDescLive
                      : t.welcomeDescDemo)
                  : t.welcomeDescGeneral}
              </p>
              <div className="vo-quick-prompts">
                {selectedProject ? (
                  <>
                    <button
                      type="button"
                      className="vo-quick-prompt-btn"
                      onClick={() => setDraftPrompt(t.promptArch)}
                    >
                      {t.promptArch}
                    </button>
                    <button
                      type="button"
                      className="vo-quick-prompt-btn"
                      onClick={() => setDraftPrompt(t.promptUtility)}
                    >
                      {t.promptUtility}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="vo-quick-prompt-btn"
                      onClick={() => setDraftPrompt(t.promptGeneral1)}
                    >
                      {t.promptGeneral1}
                    </button>
                    <button
                      type="button"
                      className="vo-quick-prompt-btn"
                      onClick={() => setDraftPrompt(t.promptGeneral2)}
                    >
                      {t.promptGeneral2}
                    </button>
                    <button
                      type="button"
                      className="vo-quick-prompt-btn"
                      onClick={() => setDraftPrompt(t.promptGeneral3)}
                    >
                      {t.promptGeneral3}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          activeConversation.messages.map((msg: ChatMessage) => (
            <article
              key={msg.id}
              className={`vo-message-card vo-msg-${msg.role} ${
                msg.isSimulated ? 'vo-msg-simulated' : ''
              }`}
            >
              <div className="vo-message-meta">
                <div className="vo-message-author">
                  {msg.role === 'user' ? (
                    <>
                      <User size={13} />
                      <span>YOU</span>
                    </>
                  ) : msg.role === 'assistant' ? (
                    <>
                      <Bot size={13} />
                      <span>
                        {msg.isSimulated
                          ? 'DEMO ASSISTANT [SIMULATED]'
                          : `ANTIGRAVITY AGENT (${msg.model || selectedModel})`}
                      </span>
                    </>
                  ) : msg.role === 'error' ? (
                    <>
                      <AlertTriangle size={13} />
                      <span>ERROR</span>
                    </>
                  ) : (
                    <>
                      <Terminal size={13} />
                      <span>SYSTEM EVENT</span>
                    </>
                  )}

                  {msg.isSimulated && (
                    <span className="vo-sim-badge">SIMULATED DEMO</span>
                  )}
                  {!msg.isSimulated && msg.role === 'assistant' && (
                    <span className="vo-real-badge">LIVE AGY CLI</span>
                  )}
                </div>

                <div className="vo-message-right-meta">
                  {msg.projectPath ? (
                    <span className="vo-msg-cwd" title={msg.projectPath}>
                      📁 {msg.projectPath}
                    </span>
                  ) : (
                    <span className="vo-msg-general-tag" title="General Chat (No folder bound)">
                      💬 General
                    </span>
                  )}
                  {msg.usage && msg.usage.totalTokens > 0 && (
                    <span
                      className="vo-msg-tokens"
                      title={`Input: ${msg.usage.inputTokens} | Output: ${msg.usage.outputTokens} | Thinking: ${msg.usage.thinkingTokens}`}
                    >
                      {msg.usage.totalTokens.toLocaleString()} tok
                    </span>
                  )}
                  <time className="vo-msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </time>
                </div>
              </div>

              {/* Attached files badge */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="vo-msg-attachments">
                  {msg.attachments.map((att) => (
                    <span key={att} className="vo-attachment-pill">
                      <FileCode size={11} />
                      <span>{att}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Thinking Drawer if present */}
              {msg.thinkingText && (
                <div className="vo-thinking-box">
                  <button
                    type="button"
                    className="vo-thinking-toggle"
                    onClick={() =>
                      setExpandedThinking((prev) => ({
                        ...prev,
                        [msg.id]: !prev[msg.id],
                      }))
                    }
                  >
                    {expandedThinking[msg.id] ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                    <span>Agent Reasoning / Thinking Trace</span>
                  </button>
                  {expandedThinking[msg.id] && (
                    <pre className="vo-thinking-content">{msg.thinkingText}</pre>
                  )}
                </div>
              )}

              {/* Tool Execution Steps if present */}
              {msg.toolSteps && msg.toolSteps.length > 0 && (
                <div className="vo-tool-steps">
                  {msg.toolSteps.map((step, sIdx) => (
                    <div
                      key={`${step.stepIndex}-${sIdx}`}
                      className={`vo-tool-card vo-tool-${step.state.toLowerCase()}`}
                    >
                      <div className="vo-tool-header">
                        <Wrench size={12} />
                        <strong>Tool: {step.toolName}</strong>
                        <span className="vo-tool-state">{step.state}</span>
                        {step.durationSeconds !== undefined && (
                          <span className="vo-tool-dur">
                            {step.durationSeconds.toFixed(2)}s
                          </span>
                        )}
                      </div>
                      {step.parameters && (
                        <pre className="vo-tool-params">
                          {JSON.stringify(step.parameters, null, 2)}
                        </pre>
                      )}
                      {step.error && (
                        <div className="vo-tool-error">{step.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Main Message Body */}
              <MessageContentRenderer content={msg.content} />

              {/* Permission Approval Prompt if Antigravity Headless CLI denied a tool action (Phase 3.5 & 6.2) */}
              {msg.deniedActions && msg.deniedActions.length > 0 && lastUserPrompt && (
                <div className="vo-permission-banner">
                  <div className="vo-permission-info">
                    <ShieldAlert size={15} />
                    <div>
                      <strong>
                        Antigravity Permission Required:{' '}
                        {msg.deniedActions.map((d) => d.display_name).join(', ')}
                      </strong>
                      <p>
                        Headless print mode stopped because a tool requested permission.
                        Click below to explicitly authorize tool execution for this turn.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="vo-btn vo-btn-accent"
                    disabled={isStreaming}
                    onClick={() => void handleSubmit(true, lastUserPrompt)}
                  >
                    <Play size={13} />
                    <span>Authorize &amp; Re-Run Turn</span>
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* Persistent Message Composer at Bottom of Left Panel (Phase 3.4) */}
      <footer className="vo-composer-area">
        {composerError && (
          <div className="vo-composer-error">
            <AlertTriangle size={13} />
            <span>{composerError}</span>
          </div>
        )}

        {/* Selected File Attachments Strip */}
        {attachments.length > 0 && (
          <div className="vo-composer-attachments">
            <span className="vo-attach-label">Attached Context:</span>
            {attachments.map((rel) => (
              <span key={rel} className="vo-attachment-pill">
                <FileCode size={11} />
                <span>{rel}</span>
                <button
                  type="button"
                  onClick={() => toggleAttachment(rel)}
                  title="Remove attachment"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* File Attachment Picker Popover */}
        {attachPopoverOpen && (
          <div className="vo-attach-popover">
            <div className="vo-attach-popover-header">
              <span>Attach Project File Reference ({selectedProject?.name || 'None'})</span>
              <button
                type="button"
                className="vo-icon-btn"
                onClick={() => setAttachPopoverOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="vo-attach-list">
              {!selectedProject ? (
                <div className="vo-attach-empty">
                  Select a project folder first to attach workspace files.
                </div>
              ) : projectFiles.length === 0 ? (
                <div className="vo-attach-empty">
                  No top-level files found in {selectedProject.name}.
                </div>
              ) : (
                projectFiles.map((f) => (
                  <button
                    key={f.relativePath}
                    type="button"
                    className={`vo-attach-item ${
                      attachments.includes(f.relativePath) ? 'selected' : ''
                    }`}
                    onClick={() => toggleAttachment(f.relativePath)}
                  >
                    <FileCode size={12} />
                    <span>{f.relativePath}</span>
                    {attachments.includes(f.relativePath) && <Check size={12} />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="vo-composer-box">
          <button
            type="button"
            className="vo-icon-btn vo-attach-trigger"
            onClick={() => {
              if (!selectedProject) {
                onOpenDirectoryModal();
                return;
              }
              const next = !attachPopoverOpen;
              setAttachPopoverOpen(next);
              if (next) void loadAttachableFiles();
            }}
            title={
              selectedProject
                ? (language === 'vi' ? 'Đính kèm file từ thư mục dự án' : 'Attach file reference from project folder')
                : (language === 'vi' ? 'Bấm để chọn thư mục dự án trước khi đính kèm file' : 'Click to select project folder before attaching files')
            }
          >
            <Paperclip size={16} />
          </button>

          <textarea
            ref={textareaRef}
            className="vo-composer-textarea"
            rows={2}
            value={draftPrompt}
            onChange={(e) => {
              setDraftPrompt(e.target.value);
              if (composerError) setComposerError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              language === 'vi'
                ? 'Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)'
                : 'Type a message... (Enter to send, Shift+Enter for newline)'
            }
          />

          {isStreaming ? (
            <button
              type="button"
              className="vo-btn vo-btn-danger vo-send-btn"
              onClick={onCancelStream}
              title="Stop current generation"
            >
              <Square size={14} />
              <span>{t.stop}</span>
            </button>
          ) : (
            <button
              type="button"
              className="vo-btn vo-btn-primary vo-send-btn"
              disabled={!draftPrompt.trim()}
              onClick={() => void handleSubmit(false)}
              title={t.enterToSend}
            >
              <Send size={14} />
              <span>{t.send}</span>
            </button>
          )}
        </div>

        <div className="vo-composer-hints">
          <span>
            <kbd>Enter</kbd> {t.enterToSend} &middot; <kbd>Shift + Enter</kbd> {t.shiftEnterNewline}
          </span>
          <span>
            {t.modeLabel}{' '}
            <strong>
              {adapterMode === 'agy'
                ? t.liveModeName
                : t.demoModeName}
            </strong>
          </span>
        </div>
      </footer>
    </section>
  );
};
