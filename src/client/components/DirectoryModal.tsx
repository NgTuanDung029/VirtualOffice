import React, { useEffect, useState } from 'react';
import {
  ApplicationSettings,
  LifecycleStatusSnapshot,
  ProjectInfo,
} from '../../shared/types';
import { Language, translations } from '../i18n';
import {
  Check,
  Compass,
  CornerLeftUp,
  Folder,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';

interface DirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentProject: ProjectInfo | null;
  recentProjects: string[];
  onSelectPath: (dirPath: string) => Promise<{ ok: boolean; error?: string }>;
  onClearProject: () => Promise<void>;
  onPickNativeDialog: () => Promise<{
    cancelled: boolean;
    ok?: boolean;
    error?: string;
  }>;
}

export const DirectoryModal: React.FC<DirectoryModalProps> = ({
  isOpen,
  onClose,
  language,
  currentProject,
  recentProjects,
  onSelectPath,
  onClearProject,
  onPickNativeDialog,
}) => {
  const t = translations[language];
  const [manualPath, setManualPath] = useState(currentProject?.path || '');
  const [drives, setDrives] = useState<{ drive: string; label: string }[]>([]);
  const [browseCurrentPath, setBrowseCurrentPath] = useState('');
  const [browseParentPath, setBrowseParentPath] = useState<string | null>(null);
  const [subdirectories, setSubdirectories] = useState<{ name: string; path: string }[]>([]);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nativePickerBusy, setNativePickerBusy] = useState(false);

  const loadDirectoryListing = async (targetDir?: string) => {
    setLoading(true);
    setBrowseError(null);
    setSelectError(null);
    try {
      let clean = (targetDir || '').trim();
      if (clean.startsWith('"') && clean.endsWith('"')) {
        clean = clean.slice(1, -1).trim();
      }
      if (/^[a-zA-Z]:$/.test(clean)) {
        clean += '\\';
      }
      const qs = clean ? `?dir=${encodeURIComponent(clean)}` : '';
      const res = await fetch(`/api/project/browse${qs}`);
      const data = await res.json();
      if (Array.isArray(data.drives)) setDrives(data.drives);
      if (data.currentPath) {
        setBrowseCurrentPath(data.currentPath);
        setManualPath(data.currentPath);
      }
      setBrowseParentPath(data.parentPath || null);
      setSubdirectories(Array.isArray(data.directories) ? data.directories : []);
      if (data.error) {
        setBrowseError(data.error);
        setSelectError(data.error);
      }
    } catch (err) {
      const msg = `Failed to browse local directories: ${String(err)}`;
      setBrowseError(msg);
      setSelectError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectError(null);
      setManualPath(currentProject?.path || '');
      void loadDirectoryListing(currentProject?.path);
    }
  }, [isOpen, currentProject?.path]);

  if (!isOpen) return null;

  const handleConfirmSelection = async (pathToSelect: string) => {
    setSelectError(null);
    const res = await onSelectPath(pathToSelect);
    if (res.ok) {
      onClose();
    } else {
      setSelectError(res.error || 'Could not select folder.');
    }
  };

  const handleNativeDialog = async () => {
    setNativePickerBusy(true);
    setSelectError(null);
    try {
      const res = await onPickNativeDialog();
      if (!res.cancelled) {
        if (res.ok) {
          onClose();
        } else {
          setSelectError(res.error || 'Selected folder is not accessible.');
        }
      }
    } finally {
      setNativePickerBusy(false);
    }
  };

  return (
    <div className="vo-modal-backdrop" onClick={onClose}>
      <div
        className="vo-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Select Windows Project Directory"
      >
        <div className="vo-modal-header">
          <div className="vo-modal-title">
            <FolderOpen size={16} />
            <span>{t.dirModalTitle}</span>
          </div>
          <button type="button" className="vo-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="vo-modal-body">
          <p className="vo-modal-desc">
            {t.dirModalDesc}
          </p>

          {/* Native Windows Folder Dialog Action */}
          <div className="vo-native-picker-bar">
            <button
              type="button"
              className="vo-btn vo-btn-accent"
              onClick={handleNativeDialog}
              disabled={nativePickerBusy}
            >
              <FolderOpen size={14} />
              <span>
                {nativePickerBusy
                  ? t.waitingNativeDialog
                  : t.openNativeDialog}
              </span>
            </button>
            {currentProject && (
              <button
                type="button"
                className="vo-btn vo-btn-danger"
                onClick={async () => {
                  await onClearProject();
                  onClose();
                }}
                title={t.clearSelection}
              >
                <Trash2 size={14} />
                <span>{t.clearSelection}</span>
              </button>
            )}
          </div>

          {/* Direct Path Entry (supports pasting Vietnamese/Unicode paths) */}
          <div className="vo-field-group">
            <label className="vo-field-label">{t.folderPathLabel}</label>
            <div className="vo-input-row">
              <input
                type="text"
                className="vo-text-input"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="e.g., C:\Duzg\Project\VirtualOffice or C:\Dự Án Tiếng Việt"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleConfirmSelection(manualPath);
                  }
                }}
              />
              <button
                type="button"
                className="vo-btn vo-btn-accent"
                onClick={handleNativeDialog}
                disabled={nativePickerBusy}
                title={t.browseButton}
              >
                <FolderOpen size={14} />
                <span>{nativePickerBusy ? '...' : t.browseButton}</span>
              </button>
              <button
                type="button"
                className="vo-btn vo-btn-secondary"
                onClick={() => void loadDirectoryListing(manualPath)}
                disabled={loading}
                title={t.exploreFolder}
              >
                <Compass size={14} className={loading ? 'vo-spin' : ''} />
                <span>{t.exploreFolder}</span>
              </button>
              <button
                type="button"
                className="vo-btn vo-btn-primary"
                onClick={() => void handleConfirmSelection(manualPath)}
                title={t.selectFolderButton}
              >
                <Check size={14} />
                <span>{t.selectFolderButton}</span>
              </button>
            </div>
          </div>

          {selectError && (
            <div className="vo-alert-error">
              <AlertTriangle size={14} />
              <span>{selectError}</span>
            </div>
          )}

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className="vo-recent-projects">
              <span className="vo-field-label">Recent Folders:</span>
              <div className="vo-recent-chips">
                {recentProjects.map((rp) => (
                  <button
                    key={rp}
                    type="button"
                    className="vo-chip-btn"
                    onClick={() => void handleConfirmSelection(rp)}
                    title={rp}
                  >
                    <Folder size={11} />
                    <span>{rp}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* In-App Windows Drive & Directory Navigator */}
          <div className="vo-browser-box">
            <div className="vo-browser-toolbar">
              <div className="vo-drive-list">
                {drives.map((d) => (
                  <button
                    key={d.drive}
                    type="button"
                    className={`vo-drive-btn ${
                      browseCurrentPath.toUpperCase().startsWith(d.drive.toUpperCase())
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => void loadDirectoryListing(d.drive)}
                  >
                    <HardDrive size={12} />
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
              <div className="vo-browser-nav-btns">
                {browseParentPath && (
                  <button
                    type="button"
                    className="vo-btn vo-btn-sm"
                    onClick={() => void loadDirectoryListing(browseParentPath)}
                  >
                    <CornerLeftUp size={12} />
                    <span>Up One Level</span>
                  </button>
                )}
                <button
                  type="button"
                  className="vo-btn vo-btn-sm"
                  onClick={() => void loadDirectoryListing(browseCurrentPath)}
                >
                  <RefreshCw size={12} className={loading ? 'vo-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="vo-browser-current-bar">
              <span>Current Directory:</span>
              <code>{browseCurrentPath || 'None'}</code>
            </div>

            {browseError && <div className="vo-alert-error">{browseError}</div>}

            <div className="vo-subdir-list">
              {subdirectories.length === 0 ? (
                <div className="vo-subdir-empty">
                  No subdirectories in this folder. Click &ldquo;Select Folder&rdquo; to use{' '}
                  <code>{browseCurrentPath}</code>.
                </div>
              ) : (
                subdirectories.map((dir) => (
                  <div key={dir.path} className="vo-subdir-row">
                    <button
                      type="button"
                      className="vo-subdir-open-btn"
                      onClick={() => void loadDirectoryListing(dir.path)}
                    >
                      <Folder size={14} className="vo-folder-icon" />
                      <span>{dir.name}</span>
                    </button>
                    <button
                      type="button"
                      className="vo-btn vo-btn-sm vo-btn-primary"
                      onClick={() => void handleConfirmSelection(dir.path)}
                    >
                      {t.useThisFolder}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ApplicationSettings;
  lifecycle: LifecycleStatusSnapshot | null;
  agyInfo: {
    available: boolean;
    binaryPath: string | null;
    version: string | null;
    error?: string;
  };
  onSaveSettings: (partial: Partial<ApplicationSettings>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  lifecycle,
  agyInfo,
  onSaveSettings,
}) => {
  const t = translations[settings.language || 'en'];
  const [heartbeatSec, setHeartbeatSec] = useState(
    Math.round(settings.heartbeatIntervalMs / 1000)
  );
  const [staleSec, setStaleSec] = useState(
    Math.round(settings.staleSessionTimeoutMs / 1000)
  );
  const [graceSec, setGraceSec] = useState(
    Math.round(settings.shutdownGracePeriodMs / 1000)
  );

  useEffect(() => {
    if (isOpen) {
      setHeartbeatSec(Math.round(settings.heartbeatIntervalMs / 1000));
      setStaleSec(Math.round(settings.staleSessionTimeoutMs / 1000));
      setGraceSec(Math.round(settings.shutdownGracePeriodMs / 1000));
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  return (
    <div className="vo-modal-backdrop" onClick={onClose}>
      <div
        className="vo-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Workspace Settings and Lifecycle Configuration"
      >
        <div className="vo-modal-header">
          <div className="vo-modal-title">
            <Settings size={16} />
            <span>{t.settingsModalTitle}</span>
          </div>
          <button type="button" className="vo-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="vo-modal-body">
          {/* 0. Language Switcher */}
          <div className="vo-settings-section">
            <h4 className="vo-settings-heading">
              <span>🌐</span> {t.languageSection}
            </h4>
            <div className="vo-field-group">
              <label className="vo-field-label">{t.languageLabel}</label>
              <select
                className="vo-select-input"
                value={settings.language || 'en'}
                onChange={(e) =>
                  void onSaveSettings({
                    language: e.target.value as 'en' | 'vi',
                  })
                }
              >
                <option value="en">🇺🇸 English (Default)</option>
                <option value="vi">🇻🇳 Tiếng Việt</option>
              </select>
            </div>
          </div>

          {/* 1. Antigravity Integration Status */}
          <div className="vo-settings-section">
            <h4 className="vo-settings-heading">
              <Shield size={14} /> Antigravity Integration &amp; Permission Policy
            </h4>
            <div className="vo-settings-kv">
              <span>{t.detectedCliBinary}</span>
              <code>{agyInfo.binaryPath || 'Not detected'}</code>
            </div>
            <div className="vo-settings-kv">
              <span>{t.cliVersionStatus}</span>
              <strong>
                {agyInfo.available
                  ? `Connected (v${agyInfo.version})`
                  : `Unavailable (${agyInfo.error || 'Not installed'})`}
              </strong>
            </div>

            <div className="vo-field-group">
              <label className="vo-field-label">{t.activeAgentAdapter}</label>
              <select
                className="vo-select-input"
                value={settings.preferredAdapter}
                onChange={(e) =>
                  void onSaveSettings({
                    preferredAdapter: e.target.value as 'agy' | 'demo',
                  })
                }
              >
                <option value="agy">
                  Real Antigravity CLI (agy.exe — Authenticated Environment)
                </option>
                <option value="demo">
                  Demo Mode (Offline Simulated Fallback — Clearly Labeled)
                </option>
              </select>
            </div>

            <div className="vo-field-group">
              <label className="vo-field-label">
                Antigravity Tool &amp; Command Permission Policy:
              </label>
              <select
                className="vo-select-input"
                value={settings.permissionPolicy}
                onChange={(e) =>
                  void onSaveSettings({
                    permissionPolicy: e.target.value as ApplicationSettings['permissionPolicy'],
                  })
                }
              >
                <option value="request-review">
                  Safe Default (Request Review — Prompt before running commands/edits)
                </option>
                <option value="accept-edits">
                  Accept Edits (--mode accept-edits)
                </option>
                <option value="auto-approve">
                  Auto-Approve Tools (--dangerously-skip-permissions — Explicit User Opt-In)
                </option>
              </select>
            </div>
          </div>

          {/* 2. Display & Accessibility */}
          <div className="vo-settings-section">
            <h4 className="vo-settings-heading">
              <Sliders size={14} /> Visual &amp; Accessibility Preferences
            </h4>
            <label className="vo-checkbox-row">
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) =>
                  void onSaveSettings({ reducedMotion: e.target.checked })
                }
              />
              <span>Reduce Pixel-Art Office Animations (Reduced Motion Mode)</span>
            </label>
          </div>

          {/* 3. Automatic Tab-Lifecycle Shutdown Configuration */}
          <div className="vo-settings-section">
            <h4 className="vo-settings-heading">
              Automatic Server Shutdown Lifecycle (Phase 10)
            </h4>
            <p className="vo-modal-desc">
              The local server binds strictly to <code>127.0.0.1</code> and automatically shuts
              down after all application browser tabs have closed.
            </p>
            <div className="vo-lifecycle-grid">
              <div className="vo-field-group">
                <label className="vo-field-label">Heartbeat Interval (sec):</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="vo-text-input"
                  value={heartbeatSec}
                  onChange={(e) => setHeartbeatSec(Number(e.target.value))}
                />
              </div>
              <div className="vo-field-group">
                <label className="vo-field-label">Stale Tab Timeout (sec):</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  className="vo-text-input"
                  value={staleSec}
                  onChange={(e) => setStaleSec(Number(e.target.value))}
                />
              </div>
              <div className="vo-field-group">
                <label className="vo-field-label">Shutdown Grace Period (sec):</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="vo-text-input"
                  value={graceSec}
                  onChange={(e) => setGraceSec(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="vo-settings-actions-row">
              <button
                type="button"
                className="vo-btn vo-btn-primary"
                onClick={() =>
                  void onSaveSettings({
                    heartbeatIntervalMs: Math.max(1, heartbeatSec) * 1000,
                    staleSessionTimeoutMs: Math.max(3, staleSec) * 1000,
                    shutdownGracePeriodMs: Math.max(1, graceSec) * 1000,
                  })
                }
              >
                Apply Lifecycle Timing
              </button>
            </div>

            {lifecycle && (
              <div className="vo-lifecycle-live-box">
                <div>
                  <strong>Active Connected Tabs:</strong> {lifecycle.activeTabCount}
                </div>
                <div>
                  <strong>Server PID &amp; Loopback Port:</strong> PID {lifecycle.pid} on{' '}
                  <code>127.0.0.1:{lifecycle.port}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
