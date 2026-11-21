import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { UseMarketDataResult } from '../hooks/useMarketData';
import type { MarketSyncRunItem } from '../types/macro';

interface SyncHistorySectionProps {
  market: UseMarketDataResult;
}

type HistoryFilter = 'all' | 'success' | 'issues';

function formatRelativeAge(iso: string | null, nowMs: number): string {
  if (!iso) return 'Never synced';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'Unknown';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return remMin > 0 ? `${hours}h ${remMin}m ago` : `${hours}h ago`;
}

function formatCountdown(iso: string | null, nowMs: number): string {
  if (!iso) return 'Awaiting schedule';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'Scheduled';
  const diffMin = Math.ceil((ts - nowMs) / 60000);
  if (diffMin <= 0) return 'Due now';
  if (diffMin < 60) return `In ${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return remMin > 0 ? `In ${hours}h ${remMin}m` : `In ${hours}h`;
}

function formatIstShort(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatTriggerLabel(raw: string): string {
  switch (raw) {
    case 'manual':
      return 'Manual Check';
    case 'scheduler':
      return 'Server Scheduler';
    case 'startup':
      return 'Server Startup';
    case 'client-background':
      return 'Background Poll';
    default:
      return raw || 'Unknown';
  }
}

function renderStatusCell(status: string) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Verified</span>
      </span>
    );
  }
  if (status === 'quota-guard') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Quota Guard</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Failed</span>
    </span>
  );
}

export function SyncHistorySection({ market }: SyncHistorySectionProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [reloadingLog, setReloadingLog] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleReloadLog = async () => {
    setReloadingLog(true);
    try {
      await market.reloadSyncHistory();
    } finally {
      setReloadingLog(false);
    }
  };

  const filteredRuns = useMemo<MarketSyncRunItem[]>(() => {
    if (filter === 'success') {
      return market.syncHistory.filter((r) => r.status === 'success');
    }
    if (filter === 'issues') {
      return market.syncHistory.filter((r) => r.status !== 'success');
    }
    return market.syncHistory;
  }, [market.syncHistory, filter]);

  const provenanceMeta = useMemo(() => {
    if (market.isRefreshingMetrics) {
      return {
        label: 'Fetching Upstream Feed',
        detail: 'Requesting live quotes from API Ninjas…',
        toneClass: 'text-sky-700 dark:text-sky-300',
        Icon: RefreshCw,
        spin: true,
      };
    }
    if (market.dataSourceKind === 'live-api') {
      return {
        label: 'Live API Verified',
        detail: 'Fresh upstream API Ninjas response',
        toneClass: 'text-emerald-700 dark:text-emerald-400',
        Icon: CheckCircle2,
        spin: false,
      };
    }
    if (market.dataSourceKind === 'sql-cache') {
      return {
        label: 'Cached Quotes',
        detail: 'Served from recent saved run (0 API calls)',
        toneClass: 'text-sky-700 dark:text-sky-300',
        Icon: Database,
        spin: false,
      };
    }
    if (market.dataSourceKind === 'error') {
      return {
        label: 'Sync Failed',
        detail: market.syncError || 'Upstream API fetch returned an error',
        toneClass: 'text-rose-700 dark:text-rose-400',
        Icon: AlertTriangle,
        spin: false,
      };
    }
    return {
      label: 'Static Baseline Only',
      detail: 'No verified upstream refresh recorded',
      toneClass: 'text-amber-700 dark:text-amber-400',
      Icon: AlertCircle,
      spin: false,
    };
  }, [market.dataSourceKind, market.isRefreshingMetrics, market.syncError]);

  const ProvenanceIcon = provenanceMeta.Icon;

  return (
    <section className="space-y-4" aria-labelledby="sync-audit-heading">
      {/* Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end justify-between pb-3 border-b border-[#DDE4ED] dark:border-[#19324D]">
        <div>
          <span className="text-xs font-semibold text-[#63768A] dark:text-slate-400">
            Refresh Verification &amp; Log
          </span>
          <h2
            id="sync-audit-heading"
            className="text-2xl font-semibold text-[#0D243C] dark:text-white tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Sync Status &amp; History
          </h2>
          <p className="text-xs text-[#63768A] dark:text-slate-300 mt-0.5">
            Shows whether quotes are live or cached, daily API usage, and recent refresh runs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleReloadLog()}
            disabled={reloadingLog}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#0D243C] dark:text-slate-100 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${reloadingLog ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{reloadingLog ? 'Reloading…' : 'Reload Log'}</span>
          </button>

          <button
            type="button"
            onClick={() => void market.refreshFromGoogleSearch()}
            disabled={market.isRefreshingMetrics}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${market.isRefreshingMetrics ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{market.isRefreshingMetrics ? 'Fetching…' : 'Fetch Live Now'}</span>
          </button>
        </div>
      </div>

      {/* Truthful 4-Cell Provenance Strip */}
      <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[10px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#EDF1F6] dark:divide-[#19324D] overflow-hidden">
        <div className="p-4 space-y-1">
          <span className="block text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
            Active Data Provenance
          </span>
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${provenanceMeta.toneClass}`}>
            <ProvenanceIcon
              className={`w-4 h-4 shrink-0 ${provenanceMeta.spin ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{provenanceMeta.label}</span>
          </div>
          <p className="text-[11px] text-[#63768A] dark:text-slate-400 truncate">
            {provenanceMeta.detail}
          </p>
        </div>

        <div className="p-4 space-y-1">
          <span className="block text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
            Last Upstream Sync
          </span>
          <div className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
            {formatRelativeAge(market.lastApiSyncIso, nowMs)}
          </div>
          <p className="font-mono text-[11px] text-[#63768A] dark:text-slate-400 tabular-nums">
            {market.lastApiSyncIso ? `${formatIstShort(market.lastApiSyncIso)} IST` : 'No API timestamp yet'}
          </p>
        </div>

        <div className="p-4 space-y-1">
          <span className="block text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
            Daily API Quota (UTC)
          </span>
          <div className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
            {market.dailyCallsUsed} / {market.dailyCallsLimit} calls
          </div>
          <p className="text-[11px] text-[#63768A] dark:text-slate-400">
            {market.syncIntervalMinutes}m active (09–21 IST) · 3h night · 4h wknd
          </p>
        </div>

        <div className="p-4 space-y-1">
          <span className="block text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
            Next Scheduled Check
          </span>
          <div className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
            {formatCountdown(market.nextSyncAt, nowMs)}
          </div>
          <p className="font-mono text-[11px] text-[#63768A] dark:text-slate-400 tabular-nums">
            {market.nextSyncAt ? `${formatIstShort(market.nextSyncAt)} IST` : 'Scheduler initializing'}
          </p>
        </div>
      </div>

      {/* Transparent Error Notice when present */}
      {market.syncError && (
        <div
          role="alert"
          className="px-4 py-3 rounded-[10px] border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5 min-w-0">
            <span className="font-semibold block">Last Refresh Error</span>
            <p className="break-words">{market.syncError}</p>
          </div>
        </div>
      )}

      {/* Sync History Table */}
      <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EDF1F6] dark:border-[#19324D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#63768A] dark:text-slate-300">
            <span className="font-semibold text-[#0D243C] dark:text-white">
              Refresh History
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {market.syncHistory.length} recorded {market.syncHistory.length === 1 ? 'run' : 'runs'}
            </span>
          </div>

          <div
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] self-start sm:self-auto"
            role="group"
            aria-label="Filter sync history status"
          >
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-white dark:bg-[#112A45] text-[#0D243C] dark:text-white shadow-xs font-semibold'
                  : 'text-[#63768A] dark:text-slate-400 hover:text-[#0D243C] dark:hover:text-white'
              }`}
            >
              All Runs
            </button>
            <button
              type="button"
              onClick={() => setFilter('success')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filter === 'success'
                  ? 'bg-white dark:bg-[#112A45] text-[#0D243C] dark:text-white shadow-xs font-semibold'
                  : 'text-[#63768A] dark:text-slate-400 hover:text-[#0D243C] dark:hover:text-white'
              }`}
            >
              Verified
            </button>
            <button
              type="button"
              onClick={() => setFilter('issues')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filter === 'issues'
                  ? 'bg-white dark:bg-[#112A45] text-[#0D243C] dark:text-white shadow-xs font-semibold'
                  : 'text-[#63768A] dark:text-slate-400 hover:text-[#0D243C] dark:hover:text-white'
              }`}
            >
              Errors &amp; Guards
            </button>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="px-6 py-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#0D243C] dark:text-white">
              {market.syncHistory.length === 0
                ? 'No sync runs recorded yet.'
                : 'No sync runs match the selected filter.'}
            </p>
            <p className="text-xs text-[#63768A] dark:text-slate-400 max-w-md mx-auto">
              Every real server sync attempt, quote snapshot, quota guard skip, and failure is logged here verbatim.
            </p>
            {market.syncHistory.length === 0 && (
              <button
                type="button"
                onClick={() => void market.refreshFromGoogleSearch()}
                disabled={market.isRefreshingMetrics}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Run First Verified Fetch</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EDF1F6] dark:border-[#19324D] bg-[#F6F8FB]/70 dark:bg-[#06111D]/60 text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                    Run
                  </th>
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                    Time (IST)
                  </th>
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                    Trigger
                  </th>
                  <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                    Outcome
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">
                    Brent
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">
                    WTI
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-right whitespace-nowrap">
                    USD/INR
                  </th>
                  <th scope="col" className="py-2.5 px-4">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF1F6] dark:divide-[#19324D] text-xs">
                {filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-[#F6F8FB]/80 dark:hover:bg-[#112A45]/40 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#63768A] dark:text-slate-400 whitespace-nowrap">
                      #{run.id}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-mono tabular-nums text-[#0D243C] dark:text-slate-100">
                        {formatIstShort(run.createdAt)}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-[#63768A] dark:text-slate-400">
                        {formatRelativeAge(run.createdAt, nowMs)}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[#3A4E63] dark:text-slate-300">
                      <div>{formatTriggerLabel(run.triggeredBy)}</div>
                      <div className="font-mono text-[11px] tabular-nums text-[#63768A] dark:text-slate-400">
                        {run.intervalMinutes}m window
                      </div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {renderStatusCell(run.status)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#0D243C] dark:text-slate-100 whitespace-nowrap">
                      {run.quotes?.brent ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#0D243C] dark:text-slate-100 whitespace-nowrap">
                      {run.quotes?.wti ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-[#0D243C] dark:text-slate-100 whitespace-nowrap">
                      {run.quotes?.usdInr ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-[#3A4E63] dark:text-slate-300 max-w-md">
                      <p className="line-clamp-2 leading-relaxed">{run.summary}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
