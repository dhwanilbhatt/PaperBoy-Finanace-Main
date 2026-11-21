import {
  Activity,
  ArrowRight,
  CircleDollarSign,
  Compass,
  FileText,
  Fuel,
  Globe2,
  Landmark,
  LogIn,
  MessageSquareShare,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { BRIEF_META, SCENARIOS, WAR_STATUS_PANEL } from '../data/macroData';
import type { UseMarketDataResult } from '../hooks/useMarketData';
import type { DeskPageId, SectionId, SignalLevel } from '../types/macro';
import { BrandLogo } from './BrandLogo';
import { MetricDisplay } from './MetricDisplay';
import { SignalBadge } from './SignalBadge';
import { SyncHistorySection } from './SyncHistorySection';

interface HomeOverviewSectionProps {
  market: UseMarketDataResult;
  onNavigateSubsegment: (pageId: DeskPageId) => void;
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

export function HomeOverviewSection({
  market,
  onNavigateSubsegment,
  onOpenWhatsApp,
}: HomeOverviewSectionProps) {
  const [noteInput, setNoteInput] = useState('');
  const [noteSection, setNoteSection] = useState<string>('home');
  const [savingNote, setSavingNote] = useState(false);

  const brentInst = market.instruments.find((i) => i.id === 'brent-co1');
  const m1m2Inst = market.instruments.find((i) => i.id === 'm1-m2');
  const usdInrInst = market.instruments.find((i) => i.id === 'usd-inr');
  const datedGap = market.derived.datedVsCo1Gap;
  const liveLanded = Math.round(market.derived.brentCo1 + market.derived.vlccFreight);

  const baseCase = SCENARIOS.find((s) => s.isBaseCase) ?? SCENARIOS[1];
  const hormuz = WAR_STATUS_PANEL[0];
  const isLoading = market.loading;
  const isSyncing = market.isRefreshingMetrics;

  const subsegments: Array<{
    id: Exclude<DeskPageId, 'home'>;
    index: string;
    title: string;
    kicker: string;
    headlineMetric: string;
    metricLabel: string;
    signal: SignalLevel;
    signalLabel: string;
    summary: string;
    Icon: typeof Fuel;
  }> = [
    {
      id: 'oil-dashboard',
      index: '01',
      title: 'The Oil Dashboard',
      kicker: 'Energy Benchmarks · Physical vs. Paper',
      headlineMetric: brentInst?.value ?? `$${market.derived.brentCo1.toFixed(2)}`,
      metricLabel: `M1–M2 ${m1m2Inst?.value ?? `+$${market.derived.m1m2.toFixed(2)}`} · Dated gap +$${datedGap.toFixed(2)}`,
      signal: m1m2Inst?.signal ?? 'danger',
      signalLabel: m1m2Inst?.signalLabel ?? 'Danger',
      summary:
        brentInst?.interpretation ??
        '7 live instruments tracking paper Brent vs. prompt physical backwardation and VLCC war freight.',
      Icon: Fuel,
    },
    {
      id: 'war-room',
      index: '02',
      title: 'The War Room',
      kicker: 'Geopolitics & Chokepoints · 24/7',
      headlineMetric: `${baseCase.probability}% Limbo`,
      metricLabel: `${hormuz.label}: ${hormuz.status} · 46d window`,
      signal: 'danger',
      signalLabel: 'Alert',
      summary:
        'Scenario odds across Deal ($75–80), Strangulation Limbo ($88–95), and Third Strike ($110–125) plus 15-event spine.',
      Icon: Compass,
    },
    {
      id: 'india-transmission',
      index: '03',
      title: 'India Transmission',
      kicker: 'Landed Cost · FX · Equity Tape',
      headlineMetric: `USD/INR ${market.derived.usdInr.toFixed(2)}`,
      metricLabel: `~$${liveLanded}/bbl landed · Nifty ${market.snapshot.nifty50.toLocaleString('en-IN')}`,
      signal: usdInrInst?.signal ?? 'relief',
      signalLabel: usdInrInst?.signalLabel ?? 'Relief',
      summary:
        'Live landed barrel calculator, Gulf-vs-Russia crude import mix shift (54% vs 35%), and 5-step equity transmission.',
      Icon: Globe2,
    },
    {
      id: 'capital-markets',
      index: '04',
      title: 'Capital Markets',
      kicker: 'Credit Spreads · Hyperscaler Supply',
      headlineMetric: `${market.snapshot.igOasBps} / ${market.snapshot.hyOasBps} bps`,
      metricLabel: `VIX ${market.snapshot.vix.toFixed(2)} · MOVE ${market.snapshot.moveIndex.toFixed(2)} · Gold $${market.snapshot.goldSpot.toLocaleString('en-US')}`,
      signal: market.snapshot.moveIndex >= 90 ? 'watch' : 'relief',
      signalLabel: market.snapshot.moveIndex >= 90 ? 'Watch MOVE' : 'Normal',
      summary:
        'Tracking $540bn+ YTD AI bond supply, 5-stage stress waterfall, credit spreads, and India $52.9bn DC buildout.',
      Icon: CircleDollarSign,
    },
    {
      id: 'policy-desk',
      index: '05',
      title: 'Policy Desk',
      kicker: 'RBI · Federal Reserve · OPEC+',
      headlineMetric: `${market.snapshot.rbiRepoRate.toFixed(2)}% RBI`,
      metricLabel: `US 10Y ${(market.snapshot.us10yYield ?? 5.01).toFixed(2)}% · OPEC+ Nov 29 · Congress Jan 3`,
      signal: 'watch',
      signalLabel: 'Tightening',
      summary:
        'Monetary policy constraints, RBI PSL draft ANBC inclusion rules, FOMC 25bp vs 50bp tail risk, and catalyst calendar.',
      Icon: Landmark,
    },
  ];

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    setSavingNote(true);
    const ok = await market.addAnalystNote(noteSection, noteInput.trim());
    setSavingNote(false);
    if (ok) setNoteInput('');
  };

  return (
    <div className="space-y-8">
      {/* Masthead Strip */}
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <BrandLogo size="lg" className="hidden sm:flex" />
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#63768A] dark:text-slate-400">
                <span>Paper Boy Finance</span>
                <span aria-hidden="true">·</span>
                <span>Equity Research &amp; Advisory</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#0D243C] dark:text-slate-300">
                  <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-36">
                    {market.snapshot.updatedLabel}
                  </MetricDisplay>
                </span>
              </div>
              <h1
                className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
              >
                MacroLens Home
              </h1>
              <p className="text-sm text-[#3A4E63] dark:text-slate-300">
                {BRIEF_META.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenWhatsApp('full-brief')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquareShare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Export Morning Brief</span>
            </button>
          </div>
        </div>

        {/* Ink-Navy Hero Masthead Panel */}
        <div className="relative overflow-hidden rounded-[12px] hero-orb px-6 py-7 sm:px-8 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-7 items-center text-white">
          <div className="lg:col-span-5 relative z-10 space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
              <Activity className="w-3.5 h-3.5 text-white shrink-0" aria-hidden="true" />
              <span>10-Second PM Check</span>
              <span className="h-px w-8 bg-white/30 inline-block" aria-hidden="true" />
            </div>
            <h2
              className="text-3xl sm:text-[38px] font-medium leading-[1.06] tracking-tight text-white"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              Paper vs. Physical:
              <br />
              <em className="text-sky-200 font-normal">first signal.</em>
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed max-w-sm">
              When paper futures and physical backwardation converge, the war premium unwinds. Select a subsegment below for full desk analytics.
            </p>
          </div>

          {/* 3-Tile Morning Pulse Strip */}
          <div
            className="lg:col-span-7 relative z-10 bg-white/[0.07] border border-white/15 rounded-[8px] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/15 overflow-hidden"
            aria-label="Three core morning indicators"
          >
            <button
              type="button"
              onClick={() => onNavigateSubsegment('oil-dashboard')}
              className="hero-tile-interactive p-4 sm:px-5 sm:py-4 flex flex-col justify-between gap-2 text-left cursor-pointer"
            >
              <span className="text-[11px] font-bold text-slate-200 flex items-center justify-between gap-2">
                <span>Brent · CO1</span>
                {isSyncing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-ping" aria-hidden="true" />
                )}
              </span>
              <div className="font-mono text-2xl sm:text-[28px] font-semibold tracking-tight text-white tabular-nums whitespace-nowrap">
                <MetricDisplay
                  loading={isLoading}
                  syncing={isSyncing}
                  lightSkeleton
                  skeletonWidthClass="w-24"
                >
                  {brentInst?.value ?? `$${market.derived.brentCo1.toFixed(2)}`}
                </MetricDisplay>
                <span className="text-[11px] font-normal text-slate-300 ml-1">/bbl</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-200">
                <span>{brentInst?.signalLabel ?? 'Watch'} · Open Oil Desk</span>
                <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSubsegment('oil-dashboard')}
              className="hero-tile-interactive p-4 sm:px-5 sm:py-4 flex flex-col justify-between gap-2 text-left cursor-pointer"
            >
              <span className="text-[11px] font-bold text-slate-200 flex items-center justify-between gap-2">
                <span>M1–M2 Spread</span>
                {isSyncing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-ping" aria-hidden="true" />
                )}
              </span>
              <div className="font-mono text-2xl sm:text-[28px] font-semibold tracking-tight text-white tabular-nums whitespace-nowrap">
                <MetricDisplay
                  loading={isLoading}
                  syncing={isSyncing}
                  lightSkeleton
                  skeletonWidthClass="w-24"
                >
                  {m1m2Inst?.value ?? `+$${market.derived.m1m2.toFixed(2)}`}
                </MetricDisplay>
                <span className="text-[11px] font-normal text-slate-300 ml-1">/bbl</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-200">
                <span>Physical · {m1m2Inst?.signalLabel ?? 'Danger'}</span>
                <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSubsegment('india-transmission')}
              className="hero-tile-interactive p-4 sm:px-5 sm:py-4 flex flex-col justify-between gap-2 text-left cursor-pointer"
            >
              <span className="text-[11px] font-bold text-slate-200 flex items-center justify-between gap-2">
                <span>Dated vs. CO1</span>
                {isSyncing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-ping" aria-hidden="true" />
                )}
              </span>
              <div className="font-mono text-2xl sm:text-[28px] font-semibold tracking-tight text-white tabular-nums whitespace-nowrap">
                <MetricDisplay
                  loading={isLoading}
                  syncing={isSyncing}
                  lightSkeleton
                  skeletonWidthClass="w-24"
                >
                  {datedGap >= 0 ? '+' : '-'}${Math.abs(datedGap).toFixed(2)}
                </MetricDisplay>
                <span className="text-[11px] font-normal text-slate-300 ml-1">/bbl</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] text-slate-200">
                <span>
                  INR{' '}
                  <MetricDisplay
                    loading={isLoading}
                    syncing={isSyncing}
                    lightSkeleton
                    skeletonWidthClass="w-12"
                  >
                    {market.derived.usdInr.toFixed(2)}
                  </MetricDisplay>{' '}
                  · India Desk
                </span>
                <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Subsegments Directory Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-[#DDE4ED] dark:border-[#19324D]">
          <div>
            <span className="text-xs font-semibold text-[#63768A] dark:text-slate-400">
              Research Subsegments
            </span>
            <h2
              className="text-2xl font-semibold text-[#0D243C] dark:text-white tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Intelligence desks
            </h2>
          </div>
          <p className="text-xs text-[#63768A] dark:text-slate-300">
            Select any subsegment to enter focused analysis and charts
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {subsegments.map((seg) => {
            const Icon = seg.Icon;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => onNavigateSubsegment(seg.id)}
                className="card-interactive text-left w-full bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[10px] p-5 flex flex-col justify-between gap-4 cursor-pointer group"
              >
                <div className="space-y-3 w-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-[#EEF2F7] dark:bg-[#112A45] text-[#0D243C] dark:text-sky-200 grid place-items-center shrink-0">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <span className="block font-mono text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
                          {seg.index} · {seg.kicker}
                        </span>
                        <h3
                          className="text-lg font-semibold text-[#0D243C] dark:text-white truncate"
                          style={{ fontFamily: 'var(--font-display)' }}
                        >
                          {seg.title}
                        </h3>
                      </div>
                    </div>
                    <SignalBadge signal={seg.signal} label={seg.signalLabel} />
                  </div>

                  <div className="pt-2 border-t border-[#EDF1F6] dark:border-[#19324D]">
                    <div className="font-mono text-2xl font-semibold text-[#0D243C] dark:text-white tabular-nums">
                      <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-32">
                        {seg.headlineMetric}
                      </MetricDisplay>
                    </div>
                    <div className="font-mono text-[11px] text-[#63768A] dark:text-slate-400 mt-0.5 tabular-nums">
                      <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-48">
                        {seg.metricLabel}
                      </MetricDisplay>
                    </div>
                  </div>

                  <p className="text-xs text-[#3A4E63] dark:text-slate-300 leading-relaxed">
                    {seg.summary}
                  </p>
                </div>

                <div className="w-full pt-3 border-t border-[#EDF1F6] dark:border-[#19324D] flex items-center justify-between text-xs font-semibold text-[#0D243C] dark:text-sky-200">
                  <span>Open subsegment</span>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}

          {/* Analyst Desk Notes Card (Cloud SQL Authenticated) */}
          <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[10px] p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-lg bg-[#EEF2F7] dark:bg-[#112A45] text-[#0D243C] dark:text-sky-200 grid place-items-center shrink-0">
                    <FileText className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div>
                    <span className="block font-mono text-[11px] font-semibold text-[#63768A] dark:text-slate-400">
                      DESK SCRATCHPAD
                    </span>
                    <h3
                      className="text-lg font-semibold text-[#0D243C] dark:text-white"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      Analyst Desk Notes
                    </h3>
                  </div>
                </div>
              </div>

              {!market.user ? (
                <div className="p-3.5 rounded-lg bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] space-y-2.5">
                  <p className="text-xs text-[#3A4E63] dark:text-slate-300 leading-relaxed">
                    Sign in with Google to save private conviction notes linked to each research subsegment.
                  </p>
                  <button
                    type="button"
                    onClick={() => void market.signInWithGoogle()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Sign in with Google</span>
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSaveNote} className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={noteSection}
                        onChange={(e) => setNoteSection(e.target.value)}
                        aria-label="Note target subsegment"
                        className="px-2.5 py-1.5 rounded-md text-xs bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] text-[#0D243C] dark:text-slate-100"
                      >
                        <option value="home">Executive</option>
                        <option value="oil-dashboard">Oil Desk</option>
                        <option value="war-room">War Room</option>
                        <option value="india-transmission">India</option>
                        <option value="capital-markets">Credit</option>
                        <option value="policy-desk">Policy</option>
                      </select>
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        maxLength={400}
                        placeholder="Add private conviction note…"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md text-xs bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] text-[#0D243C] dark:text-slate-100"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingNote || noteInput.trim().length < 3}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] disabled:opacity-50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{savingNote ? 'Saving…' : 'Save Note'}</span>
                    </button>
                  </form>

                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {market.analystNotes.length === 0 ? (
                      <p className="text-[11px] text-[#63768A] dark:text-slate-400">
                        No notes saved yet for {market.user.email}.
                      </p>
                    ) : (
                      market.analystNotes.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className="p-2 rounded bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] text-xs"
                        >
                          <span className="font-mono text-[10px] font-semibold text-[#163A5F] dark:text-sky-300 uppercase">
                            {item.sectionId}
                          </span>
                          <p className="text-[#0D243C] dark:text-slate-200 mt-0.5">{item.note}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-[#EDF1F6] dark:border-[#19324D] text-[11px] text-[#63768A] dark:text-slate-400">
              Synced per Google account
            </div>
          </div>
        </div>
      </section>

      {/* Truthful Provenance & PostgreSQL Sync History Audit Table */}
      <SyncHistorySection market={market} />
    </div>
  );
}
