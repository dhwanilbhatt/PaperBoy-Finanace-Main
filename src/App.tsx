import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Compass,
  Fuel,
  Globe2,
  Home,
  Landmark,
  MessageSquareShare,
  Moon,
  Sun,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { CapitalMarketsSection } from './components/CapitalMarketsSection';
import { HomeOverviewSection } from './components/HomeOverviewSection';
import { IndiaTransmissionSection } from './components/IndiaTransmissionSection';
import { OilDashboardSection } from './components/OilDashboardSection';
import { PolicyDeskSection } from './components/PolicyDeskSection';
import { WarRoomSection } from './components/WarRoomSection';
import { WhatsAppModal } from './components/WhatsAppModal';
import { useMarketData } from './hooks/useMarketData';
import type { DeskPageId, SectionId } from './types/macro';
import { buildWhatsAppBrief } from './utils/whatsappFormatter';

const SUBSEGMENTS: Array<{
  id: Exclude<DeskPageId, 'home'>;
  index: string;
  label: string;
  short: string;
  icon: typeof Fuel;
}> = [
  { id: 'oil-dashboard', index: '01', label: 'Oil dashboard', short: 'Oil', icon: Fuel },
  { id: 'war-room', index: '02', label: 'War room', short: 'War', icon: Compass },
  { id: 'india-transmission', index: '03', label: 'India transmission', short: 'India', icon: Globe2 },
  { id: 'capital-markets', index: '04', label: 'Capital markets', short: 'Credit', icon: CircleDollarSign },
  { id: 'policy-desk', index: '05', label: 'Policy desk', short: 'Policy', icon: Landmark },
];

const VALID_PAGES = new Set<DeskPageId>([
  'home',
  'oil-dashboard',
  'war-room',
  'india-transmission',
  'capital-markets',
  'policy-desk',
]);

function readInitialPageFromHash(): DeskPageId {
  if (typeof window === 'undefined') return 'home';
  const raw = window.location.hash.replace('#', '') as DeskPageId;
  return VALID_PAGES.has(raw) ? raw : 'home';
}

export function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const [activePage, setActivePage] = useState<DeskPageId>(readInitialPageFromHash);
  const market = useMarketData();

  const [brentInput, setBrentInput] = useState<number>(market.derived.brentCo1);
  const [vlccInput, setVlccInput] = useState<number>(market.derived.vlccFreight);
  const [modalSection, setModalSection] = useState<SectionId | null>(null);

  useEffect(() => {
    setBrentInput(market.derived.brentCo1);
    setVlccInput(market.derived.vlccFreight);
  }, [market.derived.brentCo1, market.derived.vlccFreight]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('macrolens.theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    const onHashChange = () => {
      const next = readInitialPageFromHash();
      setActivePage(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateToPage = useCallback((pageId: DeskPageId) => {
    setActivePage(pageId);
    const targetHash = `#${pageId}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, '', targetHash);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const activeBrief = modalSection
    ? buildWhatsAppBrief(modalSection, {
        instruments: market.instruments,
        snapshot: market.snapshot,
        brentInput,
        vlccInput,
      })
    : null;

  const activeSubIndex = SUBSEGMENTS.findIndex((s) => s.id === activePage);
  const activeSubMeta = activeSubIndex >= 0 ? SUBSEGMENTS[activeSubIndex] : null;
  const prevSub = activeSubIndex > 0 ? SUBSEGMENTS[activeSubIndex - 1] : null;
  const nextSub =
    activeSubIndex >= 0 && activeSubIndex < SUBSEGMENTS.length - 1
      ? SUBSEGMENTS[activeSubIndex + 1]
      : null;

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#0D243C] dark:bg-[#06111D] dark:text-slate-100 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] md:grid md:grid-cols-[224px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[#0D243C] focus:text-white focus:text-xs"
      >
        Skip to main content
      </a>

      {/* Left Persistent Ink-Navy Sidebar Matched to Paper Boy Finance Seal */}
      <aside className="hidden md:flex flex-col sticky top-0 h-screen bg-[#0D243C] dark:bg-[#050E18] text-white px-4 py-6 border-r border-[#163A5F]/40 dark:border-[#19324D] z-20">
        {/* Sidebar Brand Lockup */}
        <div className="pb-6 px-2 border-b border-white/12">
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className="flex items-center gap-3 min-w-0 text-left cursor-pointer w-full"
          >
            <BrandLogo size="md" className="border-2 border-white" />
            <div className="min-w-0 flex flex-col">
              <span
                className="text-white text-[17px] font-semibold tracking-tight leading-tight truncate"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Paper Boy Finance
              </span>
              <span className="mt-0.5 text-slate-300 text-[10px] font-semibold tracking-wide truncate">
                Equity Research &amp; Advisory
              </span>
            </div>
          </button>
        </div>

        {/* Home Link */}
        <div className="pt-5 pb-2 px-2.5 text-[11px] font-semibold text-slate-400 tracking-wide">
          Overview
        </div>
        <button
          type="button"
          onClick={() => navigateToPage('home')}
          className={`w-full min-h-[42px] rounded-[8px] flex items-center justify-between px-2.5 text-xs transition-all cursor-pointer ${
            activePage === 'home'
              ? 'bg-white text-[#0D243C] font-bold shadow-[0_6px_18px_rgba(4,12,22,0.22)]'
              : 'text-slate-200 hover:bg-white/10 hover:text-white font-medium'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Home className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Executive Home</span>
          </span>
        </button>

        {/* Subsegments Navigation */}
        <div className="pt-6 pb-2 px-2.5 text-[11px] font-semibold text-slate-400 tracking-wide">
          Subsegments
        </div>

        <nav className="grid gap-1.5" aria-label="Research subsegments">
          {SUBSEGMENTS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToPage(item.id)}
                className={`w-full min-h-[42px] rounded-[8px] grid grid-cols-[22px_1fr_24px] items-center text-left px-2.5 gap-1.5 text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#0D243C] font-bold shadow-[0_6px_18px_rgba(4,12,22,0.22)]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white font-medium'
                }`}
              >
                <span className="flex items-center">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                </span>
                <span className="truncate">{item.label}</span>
                <small
                  className={`text-right font-mono text-[10px] tabular-nums ${
                    isActive ? 'text-[#3A4E63]' : 'text-slate-400'
                  }`}
                >
                  {item.index}
                </small>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Bottom Truthful Provenance & Quota Summary */}
        <div className="mt-auto pt-4 px-2.5 border-t border-white/12 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-100">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                market.isRefreshingMetrics
                  ? 'bg-sky-300 animate-ping'
                  : market.dataSourceKind === 'live-api'
                    ? 'bg-emerald-400'
                    : market.dataSourceKind === 'sql-cache'
                      ? 'bg-sky-400'
                      : market.dataSourceKind === 'error'
                        ? 'bg-rose-400'
                        : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            <span className="truncate">
              {market.isRefreshingMetrics
                ? 'Fetching Upstream Feed…'
                : market.dataSourceKind === 'live-api'
                  ? `Live API (${market.syncIntervalMinutes}m auto)`
                  : market.dataSourceKind === 'sql-cache'
                    ? `Cached (${market.syncIntervalMinutes}m auto)`
                    : market.dataSourceKind === 'error'
                      ? 'Sync Failed (Check Log)'
                      : 'Static Baseline Only'}
            </span>
          </div>
          <p className="font-mono text-[11px] text-slate-300 tabular-nums">
            {market.dailyCallsUsed}/{market.dailyCallsLimit} API calls today (UTC)
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex flex-col">
        {/* Sticky Topbar */}
        <header className="sticky top-0 z-30 h-[62px] px-4 sm:px-7 lg:px-10 bg-white/95 dark:bg-[#06111D]/95 backdrop-blur-md border-b border-[#DDE4ED] dark:border-[#19324D] flex items-center justify-between gap-4">
          {/* Mobile Brand Lockup (<md) */}
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className="flex md:hidden items-center gap-2.5 min-w-0 shrink-0 cursor-pointer"
          >
            <BrandLogo size="sm" />
            <span
              className="text-base font-bold text-[#0D243C] dark:text-white truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Paper Boy Finance
            </span>
          </button>

          {/* Desktop Context Breadcrumb Trail */}
          <nav className="hidden md:flex items-center gap-2 text-xs text-[#63768A] dark:text-slate-300" aria-label="Breadcrumb">
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className={`font-semibold cursor-pointer hover:underline underline-offset-4 ${
                activePage === 'home'
                  ? 'text-[#0D243C] dark:text-white'
                  : 'text-[#63768A] dark:text-slate-400 hover:text-[#0D243C] dark:hover:text-white'
              }`}
            >
              Home
            </button>
            <span className="text-[#CBD5E1] dark:text-slate-600" aria-hidden="true">/</span>
            {activeSubMeta ? (
              <>
                <span className="text-[#63768A] dark:text-slate-400">Subsegments</span>
                <span className="text-[#CBD5E1] dark:text-slate-600" aria-hidden="true">/</span>
                <span className="font-bold text-[#0D243C] dark:text-white capitalize">
                  {activeSubMeta.index}. {activeSubMeta.label}
                </span>
              </>
            ) : (
              <span className="font-medium text-[#3A4E63] dark:text-slate-300">
                Executive Overview
              </span>
            )}
          </nav>

          {/* Right Actions: Truthful Source + Timestamp + Theme Switch + Full Brief */}
          <div className="flex items-center gap-2.5 sm:gap-3 ml-auto shrink-0">
            <span
              className={`hidden md:inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                market.isRefreshingMetrics
                  ? 'text-sky-700 dark:text-sky-300 animate-pulse'
                  : market.dataSourceKind === 'live-api'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : market.dataSourceKind === 'sql-cache'
                      ? 'text-sky-700 dark:text-sky-300'
                      : market.dataSourceKind === 'error'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              <span>
                {market.isRefreshingMetrics
                  ? 'Syncing…'
                  : market.dataSourceKind === 'live-api'
                    ? 'Live API'
                    : market.dataSourceKind === 'sql-cache'
                      ? 'Cached'
                      : market.dataSourceKind === 'error'
                        ? 'Sync Failed'
                        : 'Static Baseline'}
              </span>
            </span>
            <span className="hidden xl:inline text-[#CBD5E1] dark:text-slate-600" aria-hidden="true">·</span>
            <span className="hidden xl:inline-flex items-center gap-1.5 text-xs font-mono text-[#63768A] dark:text-slate-300 tabular-nums">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className={market.isRefreshingMetrics ? 'metric-sync-pulse' : ''}>
                {market.snapshot.updatedLabel}
              </span>
            </span>

            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Switch to light broadsheet theme' : 'Switch to midnight navy theme'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#0D243C] dark:text-slate-200 border border-[#DDE4ED] dark:border-[#19324D] bg-white dark:bg-[#0B1D31] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Midnight</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setModalSection('full-brief')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquareShare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Full Brief</span>
            </button>
          </div>
        </header>

        {/* Mobile Sticky Home + Subsegments Strip (<md) */}
        <nav
          className="flex md:hidden sticky top-[62px] z-20 overflow-x-auto gap-1.5 px-4 py-2 bg-white/95 dark:bg-[#06111D]/95 backdrop-blur-md border-b border-[#DDE4ED] dark:border-[#19324D]"
          aria-label="Mobile sections"
        >
          <button
            type="button"
            onClick={() => navigateToPage('home')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 border cursor-pointer ${
              activePage === 'home'
                ? 'border-[#0D243C] dark:border-white bg-[#0D243C] dark:bg-white text-white dark:text-[#081829] font-semibold'
                : 'border-transparent text-[#63768A] dark:text-slate-300'
            }`}
          >
            <Home className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Home</span>
          </button>

          {SUBSEGMENTS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToPage(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 border cursor-pointer ${
                  isActive
                    ? 'border-[#0D243C] dark:border-white bg-[#0D243C] dark:bg-white text-white dark:text-[#081829] font-semibold'
                    : 'border-transparent text-[#63768A] dark:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{item.short}</span>
              </button>
            );
          })}
        </nav>

        {/* Main Viewport */}
        <main id="main-content" className="w-full max-w-[1380px] mx-auto px-4 sm:px-7 lg:px-10 py-6 sm:py-8 space-y-8 flex-1">
          {activePage === 'home' ? (
            <HomeOverviewSection
              market={market}
              onNavigateSubsegment={navigateToPage}
              onOpenWhatsApp={setModalSection}
            />
          ) : (
            <div className="space-y-6">
              {/* Subsegment Top Navigation Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#DDE4ED] dark:border-[#19324D]">
                <button
                  type="button"
                  onClick={() => navigateToPage('home')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#0D243C] dark:text-slate-100 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Back to Home</span>
                </button>

                <div className="hidden lg:flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D]">
                  {SUBSEGMENTS.map((seg) => {
                    const active = activePage === seg.id;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => navigateToPage(seg.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#0D243C] text-white dark:bg-white dark:text-[#081829] font-semibold'
                            : 'text-[#63768A] dark:text-slate-300 hover:text-[#0D243C] dark:hover:text-white'
                        }`}
                      >
                        {seg.index}. {seg.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Subsegment Content */}
              {activePage === 'oil-dashboard' && (
                <OilDashboardSection
                  instruments={market.instruments}
                  liveBrent={market.derived.brentCo1}
                  liveM1M2={market.derived.m1m2}
                  liveDatedVsCo1Gap={market.derived.datedVsCo1Gap}
                  isLoading={market.loading}
                  isSyncing={market.isRefreshingMetrics}
                  isBusy={market.isBusy}
                  userEmail={market.user?.email}
                  priceAlerts={market.priceAlerts}
                  triggeredAlerts={market.triggeredAlerts}
                  onSavePriceAlert={market.savePriceAlert}
                  onDeletePriceAlert={market.deletePriceAlert}
                  onDismissTriggeredAlert={market.dismissTriggeredAlert}
                  onOpenWhatsApp={setModalSection}
                />
              )}

              {activePage === 'war-room' && (
                <WarRoomSection onOpenWhatsApp={setModalSection} />
              )}

              {activePage === 'india-transmission' && (
                <IndiaTransmissionSection
                  snapshot={market.snapshot}
                  liveBrent={market.derived.brentCo1}
                  liveVlcc={market.derived.vlccFreight}
                  liveUsdInr={market.derived.usdInr}
                  liveUsdInrSignal={market.instruments.find((i) => i.id === 'usd-inr')?.signal ?? 'relief'}
                  brentInput={brentInput}
                  vlccInput={vlccInput}
                  isLoading={market.loading}
                  isSyncing={market.isRefreshingMetrics}
                  onChangeBrent={setBrentInput}
                  onChangeVlcc={setVlccInput}
                  onOpenWhatsApp={setModalSection}
                />
              )}

              {activePage === 'capital-markets' && (
                <CapitalMarketsSection
                  snapshot={market.snapshot}
                  isLoading={market.loading}
                  isSyncing={market.isRefreshingMetrics}
                  onOpenWhatsApp={setModalSection}
                />
              )}

              {activePage === 'policy-desk' && (
                <PolicyDeskSection
                  snapshot={market.snapshot}
                  isLoading={market.loading}
                  isSyncing={market.isRefreshingMetrics}
                  onOpenWhatsApp={setModalSection}
                />
              )}

              {/* Bottom Subsegment Pager */}
              <div className="pt-4 border-t border-[#DDE4ED] dark:border-[#19324D] flex items-center justify-between gap-3">
                {prevSub ? (
                  <button
                    type="button"
                    onClick={() => navigateToPage(prevSub.id)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold text-[#0D243C] dark:text-slate-100 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{prevSub.index}. {prevSub.label}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold text-[#0D243C] dark:text-slate-100 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] cursor-pointer"
                  >
                    <Home className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Home Overview</span>
                  </button>
                )}

                {nextSub ? (
                  <button
                    type="button"
                    onClick={() => navigateToPage(nextSub.id)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 cursor-pointer ml-auto"
                  >
                    <span>{nextSub.index}. {nextSub.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigateToPage('home')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 cursor-pointer ml-auto"
                  >
                    <Home className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Return to Home</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <footer className="pt-5 pb-6 border-t border-[#DDE4ED] dark:border-[#19324D] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#63768A] dark:text-slate-400">
            <div className="flex items-center gap-2.5 text-[#0D243C] dark:text-white">
              <BrandLogo size="sm" />
              <span
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Paper Boy Finance · MacroLens
              </span>
            </div>
            <p className="font-mono tabular-nums">
              Decision support for emerging market analysts · {market.syncIntervalMinutes}m auto cadence · {market.dailyCallsUsed}/{market.dailyCallsLimit} API calls today
            </p>
            <button
              type="button"
              onClick={() => navigateToPage('home')}
              className="font-semibold text-[#0D243C] dark:text-slate-200 hover:underline underline-offset-4 whitespace-nowrap cursor-pointer"
            >
              Executive Home ↑
            </button>
          </footer>
        </main>
      </div>

      <WhatsAppModal
        isOpen={Boolean(modalSection)}
        title={activeBrief?.title ?? ''}
        initialText={activeBrief?.text ?? ''}
        onClose={() => setModalSection(null)}
      />
    </div>
  );
}

export default App;
