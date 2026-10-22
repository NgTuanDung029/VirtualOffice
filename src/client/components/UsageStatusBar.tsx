import React, { useState } from 'react';
import { UsageInformation } from '../../shared/types';
import { Language, translations } from '../i18n';
import {
  Activity,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Cpu,
  Database,
  Gauge,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';

interface UsageStatusBarProps {
  usage: UsageInformation | null;
  loading: boolean;
  language: Language;
  onRefresh: () => void;
}

function formatTokenCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatResetTime(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Unavailable';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return 'Refreshing soon';
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const relative =
      days > 0
        ? `in ${days}d ${remHours}h`
        : totalHours > 0
        ? `in ${totalHours}h ${mins}m`
        : `in ${mins}m`;
    return `${d.toLocaleString()} (${relative})`;
  } catch {
    return isoStr;
  }
}

export const UsageStatusBar: React.FC<UsageStatusBarProps> = ({
  usage,
  loading,
  language,
  onRefresh,
}) => {
  const t = translations[language];
  const [popoverOpen, setPopoverOpen] = useState(false);

  const effectiveState = loading
    ? 'LOADING'
    : usage
    ? usage.state
    : 'UNAVAILABLE';

  // Build honest compact display segments: MODEL | TOKENS | CONTEXT | QUOTA
  // Never fabricate numbers or replace missing metrics with 0.
  const modelSegment = (() => {
    if (!usage || !usage.currentModel) return 'MODEL: N/A';
    const shortName = (usage.currentModelDisplayName || usage.currentModel)
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .trim()
      .toUpperCase();
    return shortName.length > 18 ? shortName.slice(0, 18) : shortName;
  })();

  const tokensSegment = (() => {
    if (!usage || usage.isSimulated) return 'TOKENS: N/A (DEMO)';
    const total = usage.sessionTotalTokens?.totalTokens ?? 0;
    const hasTurn = Boolean(usage.lastTurnTokens);
    if (!hasTurn && total === 0) {
      return 'TOKENS: 0 (IDLE)';
    }
    return `${formatTokenCount(total)} TOK`;
  })();

  const contextSegment = (() => {
    if (!usage || usage.isSimulated) return 'CTX: N/A';
    if (
      usage.contextWindow.status === 'SUPPORTED' &&
      usage.contextWindow.percentUsed !== null
    ) {
      return `CTX ${usage.contextWindow.percentUsed}%`;
    }
    if (usage.contextWindow.usedTokens !== null) {
      return `IN ${formatTokenCount(usage.contextWindow.usedTokens)} (CAP N/A)`;
    }
    return 'CTX: UNSUPPORTED';
  })();

  const quotaSegment = (() => {
    if (!usage) return 'QUOTA: N/A';
    if (usage.isSimulated) return 'QUOTA: DEMO';
    if (
      usage.quota.status === 'AVAILABLE' &&
      usage.quota.primaryRemainingPercent !== null
    ) {
      return `QUOTA ${usage.quota.primaryRemainingPercent}%`;
    }
    return `QUOTA: ${usage.quota.status}`;
  })();

  return (
    <div className="vo-usage-bar-wrapper">
      {/* Detailed Popover (Phase 7.3) */}
      {popoverOpen && (
        <div
          className="vo-usage-popover"
          role="dialog"
          aria-label="Detailed Antigravity Token and Quota Usage"
        >
          <div className="vo-usage-popover-header">
            <div className="vo-usage-popover-title">
              <Gauge size={14} />
              <span>ANTIGRAVITY USAGE &amp; QUOTA (/usage)</span>
            </div>
            <div className="vo-usage-popover-actions">
              <button
                type="button"
                className="vo-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                disabled={loading}
                title="Refresh /usage from Antigravity CLI"
              >
                <RefreshCw size={13} className={loading ? 'vo-spin' : ''} />
              </button>
              <button
                type="button"
                className="vo-icon-btn"
                onClick={() => setPopoverOpen(false)}
                title="Close usage details"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* State Banner */}
          <div className={`vo-usage-state-banner vo-ustate-${effectiveState.toLowerCase()}`}>
            <span>STATUS: {effectiveState}</span>
            {usage?.isStale && (
              <span className="vo-stale-badge">STALE DATA (Last valid retained)</span>
            )}
            {usage?.isSimulated && (
              <span className="vo-stale-badge">DEMO MODE (Not real Antigravity data)</span>
            )}
          </div>

          <div className="vo-usage-popover-body">
            {/* 1. Active Model */}
            <div className="vo-usage-section">
              <div className="vo-usage-sec-title">
                <Cpu size={12} /> {t.modelTitle}
              </div>
              <div className="vo-usage-kv">
                <span>{t.currentModel}</span>
                <strong>{usage?.currentModelDisplayName || usage?.currentModel || 'Unavailable'}</strong>
              </div>
              <div className="vo-usage-kv">
                <span>{t.sourceProvider}</span>
                <code>{usage?.provider || 'none'}</code>
              </div>
            </div>

            {/* 2. Token Consumption (Per-Turn & Session) */}
            <div className="vo-usage-section">
              <div className="vo-usage-sec-title">
                <Activity size={12} /> {t.tokenConsumption}
              </div>
              {usage?.isSimulated ? (
                <div className="vo-usage-note">
                  Demo Mode is active. Token counts are not fabricated for simulated responses.
                </div>
              ) : (
                <>
                  <div className="vo-usage-kv">
                    <span>{t.lastTurnInput}</span>
                    <strong>
                      {usage?.lastTurnTokens
                        ? usage.lastTurnTokens.inputTokens.toLocaleString()
                        : 'No turn run yet'}
                    </strong>
                  </div>
                  <div className="vo-usage-kv">
                    <span>{t.lastTurnOutput}</span>
                    <strong>
                      {usage?.lastTurnTokens
                        ? usage.lastTurnTokens.outputTokens.toLocaleString()
                        : 'No turn run yet'}
                    </strong>
                  </div>
                  <div className="vo-usage-kv">
                    <span>{t.lastTurnThinking}</span>
                    <strong>
                      {usage?.lastTurnTokens
                        ? usage.lastTurnTokens.thinkingTokens.toLocaleString()
                        : 'No turn run yet'}
                    </strong>
                  </div>
                  <div className="vo-usage-kv">
                    <span>{t.sessionTotal}</span>
                    <strong>
                      {usage ? usage.sessionTotalTokens.totalTokens.toLocaleString() : 'Unavailable'}
                    </strong>
                  </div>
                </>
              )}
            </div>

            {/* 3. Context-Window Utilization */}
            <div className="vo-usage-section">
              <div className="vo-usage-sec-title">
                <Database size={12} /> {t.contextUtilization}
              </div>
              <div className="vo-usage-kv">
                <span>{t.contextCapacityStatus}</span>
                <span className="vo-unsupported-pill">
                  {usage?.contextWindow.status || 'UNAVAILABLE'}
                </span>
              </div>
              <div className="vo-usage-kv">
                <span>{t.lastPromptContext}</span>
                <strong>
                  {usage?.contextWindow.usedTokens !== null &&
                  usage?.contextWindow.usedTokens !== undefined
                    ? `${usage.contextWindow.usedTokens.toLocaleString()} tokens`
                    : 'Not yet measured'}
                </strong>
              </div>
              <div className="vo-usage-kv">
                <span>{t.contextCapacityPercent}</span>
                <span>{t.unsupportedByCli}</span>
              </div>
              <div className="vo-usage-note">
                {usage?.contextWindow.note ||
                  'Antigravity CLI exposes exact turn input/output tokens and quota buckets, but does not expose static context window capacity.'}
              </div>
            </div>

            {/* 4. Account Quota Buckets from `agy -p "/usage" --output-format json` */}
            <div className="vo-usage-section">
              <div className="vo-usage-sec-title">
                <ShieldAlert size={12} /> {t.quotaBuckets}
              </div>
              {usage?.quota.groups && usage.quota.groups.length > 0 ? (
                <div className="vo-quota-groups">
                  {usage.quota.groups.map((group) => (
                    <div key={group.name} className="vo-quota-group">
                      <div className="vo-quota-group-name">{group.name}</div>
                      {group.buckets.map((bucket) => (
                        <div key={bucket.id} className="vo-quota-bucket">
                          <div className="vo-quota-bucket-row">
                            <span className="vo-quota-bucket-label">
                              {bucket.name} ({bucket.window})
                            </span>
                            <strong className="vo-quota-bucket-pct">
                              {bucket.remainingPercent}% remaining
                            </strong>
                          </div>
                          <div className="vo-quota-bar-track">
                            <div
                              className="vo-quota-bar-fill"
                              style={{
                                width: `${Math.max(0, Math.min(100, bucket.remainingPercent))}%`,
                                backgroundColor:
                                  bucket.remainingPercent > 50
                                    ? '#22c55e'
                                    : bucket.remainingPercent > 20
                                    ? '#f59e0b'
                                    : '#ef4444',
                              }}
                            />
                          </div>
                          <div className="vo-quota-reset">
                            Resets: {formatResetTime(bucket.resetTime)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="vo-usage-note">
                  {usage?.quota.errorMessage ||
                    usage?.quota.description ||
                    'Quota buckets are currently unavailable.'}
                </div>
              )}
            </div>

            {/* Footer timestamp */}
            <div className="vo-usage-popover-footer">
              <span>
                Last Updated:{' '}
                {usage?.lastUpdatedAt
                  ? new Date(usage.lastUpdatedAt).toLocaleTimeString()
                  : 'Never'}
              </span>
              {usage?.statusMessage && <span>{usage.statusMessage}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Compact Bar at Bottom-Right (Phase 7.1 & 7.2) */}
      <button
        type="button"
        className={`vo-usage-compact-bar vo-ubar-${effectiveState.toLowerCase()}`}
        onClick={() => setPopoverOpen((prev) => !prev)}
        title="Click to view detailed Antigravity token, context, and quota usage (/usage)"
      >
        <span className={`vo-usage-led vo-led-${effectiveState.toLowerCase()}`} />
        <span className="vo-usage-seg">{modelSegment}</span>
        <span className="vo-usage-sep">|</span>
        <span className="vo-usage-seg">{tokensSegment}</span>
        <span className="vo-usage-sep">|</span>
        <span className="vo-usage-seg">{contextSegment}</span>
        <span className="vo-usage-sep">|</span>
        <span className="vo-usage-seg vo-usage-quota-seg">{quotaSegment}</span>
        {usage?.isStale && <AlertCircle size={11} className="vo-stale-icon" />}
        <span className="vo-usage-chevron">
          {popoverOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </button>
    </div>
  );
};
