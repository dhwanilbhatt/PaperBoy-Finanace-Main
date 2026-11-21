import { ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BellRing, Mail, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  BRENT_JOURNEY,
  DATED_VS_CO1_GAP,
  M1_M2_REGIMES,
} from '../data/macroData';
import type {
  AlertDirection,
  OilInstrument,
  PriceAlertConfig,
  SectionId,
  SignalLevel,
  TriggeredAlertNotice,
} from '../types/macro';
import { MetricDisplay } from './MetricDisplay';
import { PriceAlertModal } from './PriceAlertModal';
import { SectionHeader } from './SectionHeader';
import { SignalBadge } from './SignalBadge';

interface OilDashboardSectionProps {
  instruments: OilInstrument[];
  liveBrent: number;
  liveM1M2: number;
  liveDatedVsCo1Gap: number;
  isLoading?: boolean;
  isSyncing?: boolean;
  isBusy?: boolean;
  userEmail?: string | null;
  priceAlerts: PriceAlertConfig[];
  triggeredAlerts: TriggeredAlertNotice[];
  onSavePriceAlert: (input: {
    instrument: OilInstrument;
    direction: AlertDirection;
    thresholdPrice: number;
    notifyBrowser: boolean;
    notifyEmail: boolean;
    emailAddress: string;
    isActive: boolean;
  }) => Promise<boolean>;
  onDeletePriceAlert: (instrumentId: string) => Promise<void>;
  onDismissTriggeredAlert: (alertId: string) => void;
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

const SERIES_OFFSETS: Record<
  string,
  {
    d5: number[];
    d1m: number[];
    delta: string;
    direction: 'up' | 'down' | 'flat';
  }
> = {
  'brent-co1': {
    d5: [1.1, -0.4, 0.7, 0.3, 0],
    d1m: [19.0, 11.2, 4.8, -2.5, -1.3, 0.8, 0],
    delta: '-$19.00 vs Nov 2',
    direction: 'down',
  },
  'wti-cl1': {
    d5: [0.8, -0.3, 0.5, 0.2, 0],
    d1m: [14.1, 8.6, 3.2, -1.8, -0.6, 0.4, 0],
    delta: '-$7.61 spread vs CO1',
    direction: 'down',
  },
  'm1-m2': {
    d5: [-0.4, -0.75, -0.25, -0.1, 0],
    d1m: [0.4, 0.6, -0.75, -0.5, 0.15, 0.08, 0],
    delta: 'War-tight (> +$2.50)',
    direction: 'up',
  },
  'dated-brent': {
    d5: [2.8, 1.9, 1.1, 0.4, 0],
    d1m: [17.4, 10.2, 5.1, 2.2, 1.6, 0.5, 0],
    delta: 'Spot premium vs paper',
    direction: 'down',
  },
  'vlcc-freight': {
    d5: [0, 0, 0, 0, 0],
    d1m: [5, 5, 2, 1, 0, 0, 0],
    delta: 'War tax unmoved since Feb 28',
    direction: 'flat',
  },
  'usd-inr': {
    d5: [0.65, 0.48, 0.32, 0.14, 0],
    d1m: [3.16, 2.4, 1.8, 1.1, 0.75, 0.28, 0],
    delta: 'Below 95.00 stress line',
    direction: 'down',
  },
  'ttf-gas': {
    d5: [-1.1, 0.8, 1.4, 0.6, 0],
    d1m: [-3.2, 1.9, 4.1, 2.5, 1.2, 0.5, 0],
    delta: 'Stable despite LNG backlog',
    direction: 'flat',
  },
};

function Sparkline({ values, signal }: { values: number[]; signal: SignalLevel }) {
  const width = 120;
  const height = 34;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values.map((value, idx) => {
    const x = pad + (idx / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const points = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const stroke =
    signal === 'relief' ? '#2c8568' : signal === 'danger' ? '#c05850' : '#b17a22';

  return (
    <svg className="block w-full h-[34px] mt-1.5 overflow-visible" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2.8" fill={stroke} />
    </svg>
  );
}

export function OilDashboardSection({
  instruments,
  liveBrent,
  liveM1M2,
  liveDatedVsCo1Gap,
  isLoading = false,
  isSyncing = false,
  isBusy = false,
  userEmail,
  priceAlerts,
  triggeredAlerts,
  onSavePriceAlert,
  onDeletePriceAlert,
  onDismissTriggeredAlert,
  onOpenWhatsApp,
}: OilDashboardSectionProps) {
  const [signalFilter, setSignalFilter] = useState<'all' | SignalLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<'5D' | '1M'>('5D');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedInstId, setSelectedInstId] = useState<string>('brent-co1');
  const [alertModalInstId, setAlertModalInstId] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number>(BRENT_JOURNEY.length - 1);
  const [simulatedSpread, setSimulatedSpread] = useState<number>(liveDatedVsCo1Gap);

  const alertsByInstrument = useMemo(
    () => new Map(priceAlerts.map((alert) => [alert.instrumentId, alert])),
    [priceAlerts]
  );

  const alertModalInstrument = useMemo(
    () => instruments.find((i) => i.id === alertModalInstId) ?? null,
    [instruments, alertModalInstId]
  );

  useEffect(() => {
    setSimulatedSpread(liveDatedVsCo1Gap);
  }, [liveDatedVsCo1Gap]);

  const filteredInstruments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return instruments.filter((inst) => {
      const matchesSignal = signalFilter === 'all' || inst.signal === signalFilter;
      const matchesQuery =
        !q ||
        inst.name.toLowerCase().includes(q) ||
        inst.interpretation.toLowerCase().includes(q) ||
        inst.ticker.toLowerCase().includes(q);
      return matchesSignal && matchesQuery;
    });
  }, [instruments, signalFilter, searchQuery]);

  const journeyPoints = useMemo(() => {
    return BRENT_JOURNEY.map((pt, idx) =>
      idx === BRENT_JOURNEY.length - 1 ? { ...pt, price: liveBrent } : pt
    );
  }, [liveBrent]);

  const svgW = 640;
  const svgH = 215;
  const padL = 42;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const minP = Math.min(85, Math.floor(liveBrent - 5));
  const maxP = Math.max(115, Math.ceil(liveBrent + 5));

  const points = journeyPoints.map((pt, i) => {
    const x = padL + (i / (journeyPoints.length - 1)) * plotW;
    const y = padT + ((maxP - pt.price) / (maxP - minP)) * plotH;
    return { ...pt, x, y };
  });

  const linePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `${padL},${padT + plotH} ${linePoints} ${svgW - padR},${padT + plotH}`;
  const activePoint = points[hoveredIdx] ?? points[points.length - 1];

  const spreadSignal: SignalLevel =
    simulatedSpread >= 2.0 ? 'danger' : simulatedSpread >= 1.0 ? 'watch' : 'relief';
  const spreadReadout =
    simulatedSpread >= 2.0
      ? 'Physical buyers paying an overt war premium futures ignore.'
      : simulatedSpread >= 1.0
        ? 'Moderate physical tightness — monitor Dated cargo bids.'
        : `Spot physical cargo tracking paper CO1 closely (${liveDatedVsCo1Gap >= 0 ? '+' : ''}$${liveDatedVsCo1Gap.toFixed(2)} live).`;

  const activeM1M2Index = liveM1M2 > 2.5 ? 2 : liveM1M2 >= 1.5 ? 1 : 0;

  return (
    <section id="oil-dashboard" className="scroll-mt-24 space-y-6">
      <SectionHeader
        index="01"
        title="The oil pulse"
        cadence="Daily Oil Dashboard · 8:00 AM IST · Live Firestore sync"
        questionAnswered="Paper price meets physical signal. Read M1–M2 backwardation, VLCC freight, Dated spread, and FX alongside the benchmark."
        sectionId="oil-dashboard"
        onOpenWhatsApp={onOpenWhatsApp}
      />

      {/* Context Row: Signal Legend + Filter / View Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#778590] dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px] bg-[#2c8568]" aria-hidden="true" />
            Relief
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px] bg-[#d49a3d]" aria-hidden="true" />
            Watch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px] bg-[#c05850]" aria-hidden="true" />
            Danger
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="oil-search" className="sr-only">
            Filter instruments
          </label>
          <input
            id="oil-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter instrument…"
            className="px-3 py-1.5 rounded-md text-xs bg-white dark:bg-[#0B1D31] border border-[#e1e6e9] dark:border-[#19324D] text-[#0D243C] dark:text-slate-100 w-40"
          />

          <div
            className="inline-flex items-center gap-0.5 p-0.5 border border-[#e1e6e9] dark:border-[#19324D] rounded-md bg-white dark:bg-[#0B1D31]"
            role="group"
            aria-label="Filter by signal"
          >
            {(['all', 'danger', 'watch', 'relief'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSignalFilter(mode)}
                aria-pressed={signalFilter === mode}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  signalFilter === mode
                    ? 'bg-[#0D243C] text-white dark:bg-slate-100 dark:text-[#06111D]'
                    : 'text-[#82909a] dark:text-slate-300 hover:text-[#0D243C] dark:hover:text-white'
                }`}
              >
                {mode === 'all' ? `All (${instruments.length})` : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          <div
            className="inline-flex items-center gap-0.5 p-0.5 border border-[#e1e6e9] dark:border-[#19324D] rounded-md bg-white dark:bg-[#0B1D31]"
            role="group"
            aria-label="Sparkline range"
          >
            {(['5D', '1M'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeframe(range)}
                aria-pressed={timeframe === range}
                className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  timeframe === range
                    ? 'bg-[#0D243C] text-white dark:bg-slate-100 dark:text-[#06111D]'
                    : 'text-[#82909a] dark:text-slate-300'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <div
            className="inline-flex items-center gap-0.5 p-0.5 border border-[#e1e6e9] dark:border-[#19324D] rounded-md bg-white dark:bg-[#0B1D31]"
            role="group"
            aria-label="Layout view"
          >
            {(['cards', 'table'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[#0D243C] text-white dark:bg-slate-100 dark:text-[#06111D]'
                    : 'text-[#82909a] dark:text-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Triggered Threshold Alert Banners */}
      {triggeredAlerts.length > 0 && (
        <div className="space-y-2" role="status" aria-live="polite">
          {triggeredAlerts.map((notice) => {
            const opSymbol = notice.direction === 'above' ? '≥' : '≤';
            const mailSubject = `MacroLens Price Alert: ${notice.instrumentName} hit ${notice.formattedPrice}`;
            const mailBody = `Instrument: ${notice.instrumentName}\nLive Price: ${notice.formattedPrice} (${notice.currentPrice})\nThreshold Condition: ${notice.direction === 'above' ? 'Rises above' : 'Drops below'} ${notice.thresholdPrice}\nTriggered At: ${notice.triggeredAtIso}`;
            const mailtoHref = notice.notifyEmail && notice.emailAddress
              ? `mailto:${encodeURIComponent(notice.emailAddress)}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
              : null;

            return (
              <div
                key={notice.alertId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-[9px] border border-[#f5c7c4] dark:border-red-800/70 bg-[#fdeeee] dark:bg-red-950/40 text-xs"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <BellRing className="w-4 h-4 text-[#b9443e] dark:text-red-300 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0D243C] dark:text-white">
                      Threshold triggered: {notice.instrumentName} at{' '}
                      <span className="font-mono">{notice.formattedPrice}</span>{' '}
                      <span className="font-normal text-[#63768A] dark:text-slate-300">
                        (target {opSymbol} {notice.thresholdPrice})
                      </span>
                    </p>
                    <p className="text-[11px] text-[#63768A] dark:text-slate-300 mt-0.5">
                      {notice.notifyBrowser ? 'Browser notification dispatched' : ''}
                      {notice.notifyBrowser && notice.notifyEmail ? ' · ' : ''}
                      {notice.notifyEmail && notice.emailAddress ? `Email recipient: ${notice.emailAddress}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {mailtoHref && (
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-white dark:bg-[#0B1D31] text-[#0D243C] dark:text-slate-100 border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45]"
                    >
                      <Mail className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>Draft Email</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setAlertModalInstId(notice.instrumentId)}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-[#0D243C] text-white dark:bg-white dark:text-[#081829] cursor-pointer"
                  >
                    Re-arm Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissTriggeredAlert(notice.alertId)}
                    aria-label={`Dismiss alert for ${notice.instrumentName}`}
                    className="p-1.5 rounded-md text-[#63768A] hover:text-[#0D243C] dark:text-slate-400 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7 Instruments: 3-Column Sparkline Card Grid OR Structured Table */}
      {filteredInstruments.length === 0 ? (
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] py-10 px-4 text-center text-xs text-[#71808a] dark:text-slate-400">
          No instruments match the current filter.{' '}
          <button
            type="button"
            onClick={() => {
              setSignalFilter('all');
              setSearchQuery('');
            }}
            className="underline text-[#0D243C] dark:text-slate-100 cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredInstruments.map((inst) => {
            const meta = SERIES_OFFSETS[inst.id] ?? {
              d5: [0.4, 0.2, -0.1, 0.1, 0],
              d1m: [1.2, 0.8, 0.4, -0.2, 0.1, 0.05, 0],
              delta: inst.unit,
              direction: 'flat' as const,
            };
            const series = (timeframe === '5D' ? meta.d5 : meta.d1m).map(
              (offset) => inst.numericValue + offset
            );
            const lowVal = Math.min(...series);
            const highVal = Math.max(...series);
            const isSelected = selectedInstId === inst.id;
            const existingAlert = alertsByInstrument.get(inst.id);
            const isArmed = Boolean(existingAlert?.isActive);
            const isTriggered = Boolean(existingAlert && !existingAlert.isActive && existingAlert.triggeredAtIso);
            const TrendIcon =
              meta.direction === 'up'
                ? ArrowUpRight
                : meta.direction === 'down'
                  ? ArrowDownRight
                  : ArrowRight;

            return (
              <article
                key={inst.id}
                className={`card-interactive text-left w-full bg-white dark:bg-[#0B1D31] border rounded-[9px] p-4 shadow-[0_2px_5px_rgba(21,45,62,0.015)] flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                    : 'border-[#DDE4ED] dark:border-[#19324D]'
                }`}
              >
                <div className="w-full">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedInstId(inst.id)}
                      aria-pressed={isSelected}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <p className="text-xs font-bold text-[#334c60] dark:text-slate-100 truncate">
                        {inst.name}
                      </p>
                      <p className="font-mono text-[11px] text-[#95a0a7] dark:text-slate-400 mt-0.5">
                        {inst.ticker}
                        {inst.isPmCore ? ' · PM Core' : ''}
                      </p>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAlertModalInstId(inst.id)}
                        aria-label={
                          isArmed && existingAlert
                            ? `Edit alert for ${inst.name} (${existingAlert.direction === 'above' ? 'above' : 'below'} ${existingAlert.thresholdPrice})`
                            : `Set alert for ${inst.name}`
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                          isTriggered
                            ? 'bg-[#fdeeee] dark:bg-red-950/50 text-[#b9443e] dark:text-red-300 border-[#f5c7c4] dark:border-red-800/60'
                            : isArmed
                              ? 'bg-[#0D243C] dark:bg-sky-400 text-white dark:text-[#06111D] border-[#0D243C] dark:border-sky-400'
                              : 'bg-[#F6F8FB] dark:bg-[#081829] text-[#3A4E63] dark:text-slate-200 border-[#DDE4ED] dark:border-[#19324D] hover:border-[#0D243C] dark:hover:border-sky-400'
                        }`}
                      >
                        {isArmed || isTriggered ? (
                          <BellRing className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <Bell className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span className="font-mono tabular-nums">
                          {isTriggered
                            ? 'Triggered'
                            : isArmed && existingAlert
                              ? `${existingAlert.direction === 'above' ? '≥' : '≤'}${existingAlert.thresholdPrice}`
                              : existingAlert
                                ? 'Paused'
                                : 'Set Alert'}
                        </span>
                      </button>
                      <SignalBadge signal={inst.signal} label={inst.signalLabel} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedInstId(inst.id)}
                    className="w-full text-left cursor-pointer mt-3.5 block"
                  >
                    <div className="flex items-baseline gap-2">
                      <strong className="font-mono text-2xl font-semibold tracking-tight text-[#0D243C] dark:text-white tabular-nums">
                        <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-24">
                          {inst.value}
                        </MetricDisplay>
                      </strong>
                      <span className="text-[11px] text-[#89959e] dark:text-slate-400">
                        {inst.unit}
                      </span>
                    </div>

                    <div
                      className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${
                        meta.direction === 'up'
                          ? 'text-[#b47726] dark:text-amber-300'
                          : meta.direction === 'down'
                            ? 'text-[#318267] dark:text-emerald-300'
                            : 'text-[#71808c] dark:text-slate-400'
                      }`}
                    >
                      <TrendIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{meta.delta}</span>
                      <span className="ml-auto font-mono text-[10px] font-medium text-[#a3adb4]">
                        {timeframe}
                      </span>
                    </div>

                    <Sparkline values={series} signal={inst.signal} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedInstId(inst.id)}
                  className="w-full text-left mt-2.5 space-y-1.5 cursor-pointer"
                >
                  <p className="text-xs text-[#71808a] dark:text-slate-300 leading-relaxed">
                    {inst.interpretation}
                  </p>
                  {existingAlert && (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#47607A] dark:text-sky-300">
                      <span>
                        Alert {existingAlert.direction === 'above' ? '≥' : '≤'} {existingAlert.thresholdPrice}
                      </span>
                      {existingAlert.notifyBrowser && <span>· Browser</span>}
                      {existingAlert.notifyEmail && <span>· Email</span>}
                    </div>
                  )}
                  {isSelected && (
                    <div className="pt-2 border-t border-[#edf0f2] dark:border-[#19324D] flex items-center justify-between font-mono text-[11px] text-[#5f7280] dark:text-slate-300 tabular-nums">
                      <span>{timeframe} Low: {lowVal.toFixed(2)}</span>
                      <span>{timeframe} High: {highVal.toFixed(2)}</span>
                    </div>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e8edf0] dark:border-[#19324D] bg-[#F6F8FB] dark:bg-[#0A1929] text-xs font-semibold text-[#71808c] dark:text-slate-300">
                <th className="py-2.5 px-4">Instrument</th>
                <th className="py-2.5 px-4 text-right">Value</th>
                <th className="py-2.5 px-4">Signal</th>
                <th className="py-2.5 px-4">Price Alert</th>
                <th className="py-2.5 px-4">Plain-English Interpretation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f2] dark:divide-[#19324D] text-sm">
              {filteredInstruments.map((inst) => {
                const existingAlert = alertsByInstrument.get(inst.id);
                const isArmed = Boolean(existingAlert?.isActive);
                const isTriggered = Boolean(existingAlert && !existingAlert.isActive && existingAlert.triggeredAtIso);
                return (
                  <tr key={inst.id} className="hover:bg-[#F6F8FB] dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 align-top">
                      <div className="font-semibold text-[#0D243C] dark:text-slate-100">{inst.name}</div>
                      <div className="font-mono text-xs text-[#89959e] dark:text-slate-400">
                        {inst.ticker}
                        {inst.isPmCore ? ' · PM Core' : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#0D243C] dark:text-slate-100 tabular-nums whitespace-nowrap align-top">
                      <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-20">
                        {inst.value}
                      </MetricDisplay>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <SignalBadge signal={inst.signal} label={inst.signalLabel} />
                    </td>
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setAlertModalInstId(inst.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                          isTriggered
                            ? 'bg-[#fdeeee] dark:bg-red-950/50 text-[#b9443e] dark:text-red-300 border-[#f5c7c4] dark:border-red-800/60'
                            : isArmed
                              ? 'bg-[#0D243C] dark:bg-sky-400 text-white dark:text-[#06111D] border-[#0D243C] dark:border-sky-400'
                              : 'bg-[#F6F8FB] dark:bg-[#081829] text-[#0D243C] dark:text-slate-200 border-[#DDE4ED] dark:border-[#19324D] hover:border-[#0D243C] dark:hover:border-sky-400'
                        }`}
                      >
                        {isArmed || isTriggered ? (
                          <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span className="font-mono tabular-nums">
                          {isTriggered
                            ? 'Triggered'
                            : isArmed && existingAlert
                              ? `${existingAlert.direction === 'above' ? '≥' : '≤'} ${existingAlert.thresholdPrice}`
                              : existingAlert
                                ? 'Paused'
                                : 'Set Alert'}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs md:text-sm text-[#5f7280] dark:text-slate-300 align-top">
                      {inst.interpretation}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* M1-M2 Footnote Banner */}
      <div className="flex items-start sm:items-center gap-2.5 px-3.5 py-2.5 rounded-[7px] border border-[#ebdfc9] dark:border-amber-900/50 bg-[#fcf9f3] dark:bg-amber-950/20 text-xs text-[#806b48] dark:text-amber-200 leading-relaxed">
        <Zap className="w-4 h-4 text-[#b17a22] dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
        <span>
          <strong className="text-[#594827] dark:text-amber-100">How to read the M1–M2 spread:</strong> Physical tightness is signaled below +$1.50 (Relief · deal priced), +$1.50 to +$2.50 (Watch), and above +$2.50 (Danger · war-level tightness).
        </span>
      </div>

      {/* Brent Journey Area Chart + M1-M2 & Dated Gap Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-7 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div>
                <h3
                  className="text-base font-semibold text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Brent CO1 Journey (Nov 2 – Live)
                </h3>
                <p className="text-xs text-[#74828e] dark:text-slate-400">
                  From $111.69 pre-midterm open to $90.16 war low and ${liveBrent.toFixed(2)} live.
                </p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-lg font-semibold text-[#0D243C] dark:text-white">
                  <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-20">
                    ${activePoint.price.toFixed(2)}
                  </MetricDisplay>
                </span>
                <span className="block text-[11px] text-[#89959e] dark:text-slate-400">
                  {activePoint.date} · {activePoint.catalyst}
                </span>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto min-w-[460px]"
                role="img"
                aria-label="Brent CO1 price trajectory from November 2 to current live quote"
              >
                <defs>
                  <linearGradient id="brent-area-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#d9e8f3" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#d9e8f3" stopOpacity="0.06" />
                  </linearGradient>
                </defs>
                {[90, 95, 100, 105, 110].map((tick) => {
                  const y = padT + ((maxP - tick) / (maxP - minP)) * plotH;
                  return (
                    <g key={tick}>
                      <line
                        x1={padL}
                        x2={svgW - padR}
                        y1={y}
                        y2={y}
                        className="stroke-[#e7edf2] dark:stroke-[#19324D]"
                        strokeDasharray="3 5"
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-[#99a5ad] dark:fill-slate-400 font-mono text-[10px]"
                      >
                        ${tick}
                      </text>
                    </g>
                  );
                })}

                <polygon points={areaPoints} fill="url(#brent-area-fill)" />
                <polyline
                  points={linePoints}
                  fill="none"
                  className="stroke-[#254b72] dark:stroke-sky-300"
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {points.map((pt, i) => {
                  const isActive = i === hoveredIdx;
                  const isLast = i === points.length - 1;
                  return (
                    <g key={pt.date}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isActive ? 5.5 : 3.5}
                        fill={isLast || isActive ? '#d59836' : '#254b72'}
                        className="dark:stroke-[#0B1D31] stroke-white"
                        strokeWidth={1.5}
                      />
                      <text
                        x={pt.x}
                        y={svgH - 8}
                        textAnchor="middle"
                        className={`font-mono text-[10px] ${
                          isActive
                            ? 'fill-[#0D243C] dark:fill-white font-semibold'
                            : 'fill-[#99a5ad] dark:fill-slate-400'
                        }`}
                      >
                        {pt.date.replace(' (IST)', '').replace(' Open', '')}
                      </text>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={18}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIdx(i)}
                        onClick={() => setHoveredIdx(i)}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#edf0f2] dark:border-[#19324D] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#0D243C] dark:text-slate-100">
              {activePoint.date}: {activePoint.catalyst}
            </span>
            <span className="text-[#74828e] dark:text-slate-300">{activePoint.note}</span>
          </div>
        </div>

        {/* M1-M2 Regimes + Dated vs CO1 Gap Stress Slider */}
        <div className="lg:col-span-5 bg-[#F6F8FB] dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3
                className="text-base font-semibold text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                M1–M2 Backwardation Regime
              </h3>
              <span className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
                <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-16">
                  {liveM1M2 >= 0 ? '+' : '-'}${Math.abs(liveM1M2).toFixed(2)}
                </MetricDisplay>
              </span>
            </div>

            <div className="space-y-2">
              {M1_M2_REGIMES.map((regime, idx) => {
                const isActive = idx === activeM1M2Index;
                return (
                  <div
                    key={regime.range}
                    className={`p-2.5 rounded-[7px] border text-xs flex items-start justify-between gap-3 ${
                      isActive
                        ? 'border-[#e8c6c2] dark:border-red-800 bg-white dark:bg-red-950/30'
                        : 'border-[#e5ebee] dark:border-[#19324D] bg-white/70 dark:bg-[#091826]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-[#0D243C] dark:text-slate-100 tabular-nums">
                          {regime.range}
                        </span>
                        {isActive && (
                          <span className="font-mono text-[11px] font-semibold text-[#ac514c] dark:text-red-300">
                            · Active now
                          </span>
                        )}
                      </div>
                      <p className="text-[#71808a] dark:text-slate-300">{regime.meaning}</p>
                    </div>
                    <SignalBadge signal={regime.signal} label={regime.label} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[#e5ebee] dark:border-[#19324D] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4
                  className="text-sm font-semibold text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Dated Brent vs. CO1 Gap
                </h4>
                <p className="text-[11px] text-[#89959e] dark:text-slate-400">
                  Most honest single number · Alert &gt; +$2.00
                </p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-base font-semibold text-[#0D243C] dark:text-white">
                  {simulatedSpread >= 0 ? '+' : '-'}${Math.abs(simulatedSpread).toFixed(2)}
                </span>
                <span className="block text-[11px] text-[#89959e] dark:text-slate-400">
                  Peak last wk: +${DATED_VS_CO1_GAP.lastWeekPeak.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-[#5f7280] dark:text-slate-300 mb-1.5">
                <label htmlFor="spread-slider">Stress test spread ($0.00 – $4.00)</label>
                <SignalBadge signal={spreadSignal} />
              </div>
              <input
                id="spread-slider"
                type="range"
                min={0}
                max={4}
                step={0.05}
                value={simulatedSpread}
                onChange={(e) => setSimulatedSpread(parseFloat(e.target.value))}
                className="w-full accent-[#0D243C] dark:accent-slate-200 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] font-mono text-[#89959e] dark:text-slate-400 mt-1">
                <button
                  type="button"
                  onClick={() => setSimulatedSpread(liveDatedVsCo1Gap)}
                  className="underline hover:text-[#0D243C] dark:hover:text-white cursor-pointer"
                >
                  Live ({liveDatedVsCo1Gap >= 0 ? '+' : '-'}${Math.abs(liveDatedVsCo1Gap).toFixed(2)})
                </button>
                <span>Red line (+$2.00)</span>
                <button
                  type="button"
                  onClick={() => setSimulatedSpread(DATED_VS_CO1_GAP.lastWeekPeak)}
                  className="underline hover:text-[#0D243C] dark:hover:text-white cursor-pointer"
                >
                  Last week (+$3.49)
                </button>
              </div>
            </div>

            <p className="text-xs text-[#71808a] dark:text-slate-300 leading-relaxed">
              {spreadReadout}
            </p>
          </div>
        </div>
      </div>

      <PriceAlertModal
        isOpen={Boolean(alertModalInstrument)}
        instrument={alertModalInstrument}
        existingAlert={alertModalInstrument ? alertsByInstrument.get(alertModalInstrument.id) : undefined}
        userEmail={userEmail}
        isBusy={isBusy}
        onClose={() => setAlertModalInstId(null)}
        onSave={onSavePriceAlert}
        onDelete={onDeletePriceAlert}
      />
    </section>
  );
}
