import { ArrowRight, ArrowUpRight, CircleDollarSign, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import {
  AI_BOND_STATS,
  CREDIT_EVENTS,
  CREDIT_STRESS_METRICS,
  INDIA_DATA_CENTERS,
  STRESS_WATERFALL,
} from '../data/macroData';
import type { MarketSnapshotData, SectionId, SignalLevel } from '../types/macro';
import { MetricDisplay } from './MetricDisplay';
import { SectionHeader } from './SectionHeader';
import { SignalBadge } from './SignalBadge';

interface CapitalMarketsSectionProps {
  snapshot: MarketSnapshotData;
  isLoading?: boolean;
  isSyncing?: boolean;
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

const MONOGRAMS: Record<string, string> = {
  'ig-oas': 'IG',
  'hy-oas': 'HY',
  vix: 'VX',
  move: 'MV',
  gold: 'AU',
  silver: 'AG',
};

const STEP_TO_SPREAD: Record<string, string> = {
  '01': 'ig-oas',
  '02': 'ig-oas',
  '03': 'hy-oas',
  '04': 'vix',
  '05': 'move',
};

export function CapitalMarketsSection({
  snapshot,
  isLoading = false,
  isSyncing = false,
  onOpenWhatsApp,
}: CapitalMarketsSectionProps) {
  const [selectedSpreadId, setSelectedSpreadId] = useState<string>('ig-oas');
  const [selectedEventTitle, setSelectedEventTitle] = useState<string>(CREDIT_EVENTS[0].title);

  const totalIndiaDcBn = INDIA_DATA_CENTERS.reduce((sum, item) => sum + item.amountBn, 0);
  const maxDcBn = Math.max(...INDIA_DATA_CENTERS.map((d) => d.amountBn));

  const liveWaterfall = STRESS_WATERFALL.map((stage) => {
    if (stage.step === '02') {
      const sig: SignalLevel = snapshot.igOasBps >= 100 ? 'danger' : snapshot.igOasBps >= 92 ? 'watch' : 'relief';
      return { ...stage, status: `${snapshot.igOasBps}bps · Watch 100bps`, signal: sig };
    }
    if (stage.step === '03') {
      const sig: SignalLevel = snapshot.hyOasBps >= 350 ? 'danger' : snapshot.hyOasBps >= 335 ? 'watch' : 'relief';
      return { ...stage, status: `${snapshot.hyOasBps}bps · Watch 350bps`, signal: sig };
    }
    if (stage.step === '04') {
      const sig: SignalLevel = snapshot.vix >= 25 ? 'danger' : snapshot.vix >= 20 ? 'watch' : 'relief';
      return { ...stage, status: `${snapshot.vix.toFixed(2)} · Watch 25`, signal: sig };
    }
    if (stage.step === '05') {
      const triggered = snapshot.vix >= 25 && snapshot.hyOasBps >= 350;
      return {
        ...stage,
        status: triggered ? 'Contagion risk active' : 'Not triggered',
        signal: (triggered ? 'danger' : 'relief') as SignalLevel,
      };
    }
    return stage;
  });

  const liveCreditMetrics = CREDIT_STRESS_METRICS.map((item) => {
    if (item.id === 'ig-oas') {
      const sig: SignalLevel = snapshot.igOasBps >= 100 ? 'danger' : snapshot.igOasBps >= 92 ? 'watch' : 'relief';
      return {
        ...item,
        value: `${snapshot.igOasBps}bps`,
        signal: sig,
        statusLabel: sig === 'danger' ? 'Wide' : sig === 'watch' ? 'Watch' : 'Normal',
        fillPct: Math.min(100, Math.round((snapshot.igOasBps / 125) * 100)),
      };
    }
    if (item.id === 'hy-oas') {
      const sig: SignalLevel = snapshot.hyOasBps >= 350 ? 'danger' : snapshot.hyOasBps >= 335 ? 'watch' : 'relief';
      return {
        ...item,
        value: `${snapshot.hyOasBps}bps`,
        signal: sig,
        statusLabel: sig === 'danger' ? 'Contagion' : sig === 'watch' ? 'Watch' : 'Upper Normal',
        fillPct: Math.min(100, Math.round((snapshot.hyOasBps / 420) * 100)),
      };
    }
    if (item.id === 'vix') {
      const sig: SignalLevel = snapshot.vix >= 25 ? 'danger' : snapshot.vix >= 20 ? 'watch' : 'relief';
      return {
        ...item,
        value: snapshot.vix.toFixed(2),
        signal: sig,
        statusLabel: sig === 'danger' ? 'Stress' : sig === 'watch' ? 'Elevated' : 'Calm',
        fillPct: Math.min(100, Math.round((snapshot.vix / 32) * 100)),
      };
    }
    if (item.id === 'move') {
      const sig: SignalLevel = snapshot.moveIndex >= 110 ? 'danger' : snapshot.moveIndex >= 90 ? 'watch' : 'relief';
      return {
        ...item,
        value: snapshot.moveIndex.toFixed(2),
        signal: sig,
        statusLabel: sig === 'danger' ? 'Danger' : sig === 'watch' ? 'Watch' : 'Calm',
        fillPct: Math.min(100, Math.round((snapshot.moveIndex / 120) * 100)),
      };
    }
    if (item.id === 'gold') {
      const sig: SignalLevel = snapshot.goldSpot >= 3800 ? 'danger' : snapshot.goldSpot >= 3400 ? 'watch' : 'relief';
      return {
        ...item,
        value: `$${snapshot.goldSpot.toLocaleString('en-US')}/oz`,
        signal: sig,
        statusLabel: sig === 'danger' ? 'Danger' : sig === 'watch' ? 'Elevated' : 'Normal',
        fillPct: 92,
      };
    }
    if (item.id === 'silver') {
      const sig: SignalLevel = snapshot.silverSpot >= 48 ? 'danger' : snapshot.silverSpot >= 40 ? 'watch' : 'relief';
      return {
        ...item,
        value: `$${snapshot.silverSpot.toFixed(2)}/oz`,
        signal: sig,
        statusLabel: sig === 'danger' ? 'Danger' : sig === 'watch' ? 'Elevated' : 'Normal',
        fillPct: 88,
      };
    }
    return { ...item, fillPct: 60 };
  });

  return (
    <section id="capital-markets" className="scroll-mt-24 space-y-6">
      <SectionHeader
        index="04"
        title="The cost of capital"
        cadence="Capital Markets Corner · Weekly Friday evenings IST"
        questionAnswered="Is credit pricing AI hyperscaler bond supply accurately, and where does the credit stress waterfall stand?"
        sectionId="capital-markets"
        onOpenWhatsApp={onOpenWhatsApp}
      />

      {/* Top 2-Column Credit Issuance & Paper-vs-Physical Credit Framework */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        {/* AI Bond Issuance */}
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="block text-[11px] font-semibold text-[#929fa7]">
                AI Bond Issuance · Supply Wave
              </span>
              <h3
                className="text-lg font-medium text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Funding at scale
              </h3>
            </div>
            <CircleDollarSign className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
          </div>

          <div className="flex items-center gap-4">
            <div>
              <small className="block text-[11px] font-semibold text-[#8d9aa3]">YTD 2026 VOLUME</small>
              <strong className="font-mono text-2xl font-semibold text-[#27455e] dark:text-white tabular-nums">
                $540bn+
              </strong>
            </div>
            <ArrowRight className="w-4 h-4 text-[#aeb8bf] shrink-0" aria-hidden="true" />
            <div>
              <small className="block text-[11px] font-semibold text-[#8d9aa3]">2027 PIPELINE</small>
              <strong className="font-mono text-2xl font-semibold text-[#27455e] dark:text-white tabular-nums">
                $740bn
              </strong>
            </div>
          </div>

          <div>
            <div className="h-2 rounded-full bg-[#edf1f3] dark:bg-[#06111D] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: '73%',
                  background: 'linear-gradient(90deg, #254b72, #6d8ba2)',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-[#8e9aa2] dark:text-slate-400">
              <span>$67bn issued Oct 29 – Nov 7 alone</span>
              <span>JPMorgan FY forecast already exceeded</span>
            </div>
          </div>

          <div className="p-3 rounded-[7px] bg-[#f9f4ea] dark:bg-amber-950/30 border border-[#ebdfc9] dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="shrink-0">
              <span className="block text-[10px] font-bold text-[#a0804e] dark:text-amber-300">
                NEW-ISSUE CONCESSION
              </span>
              <strong className="font-mono text-lg font-semibold text-[#8d6425] dark:text-amber-200 tabular-nums">
                20–30 <small className="text-xs font-medium">bps</small>
              </strong>
            </div>
            <p className="text-xs text-[#857756] dark:text-amber-100/80 leading-relaxed max-w-xs">
              3–4x normal concession even for AAA/AA tech borrowers — crowding out EM issuers.
            </p>
          </div>

          <div className="divide-y divide-[#edf0f2] dark:divide-[#19324D] pt-1">
            {AI_BOND_STATS.slice(0, 2).map((stat) => (
              <div key={stat.label} className="py-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-[#5f7280] dark:text-slate-300">{stat.label}</span>
                <span className="font-mono font-semibold text-[#0D243C] dark:text-white tabular-nums">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Paper vs Physical Credit + Stress Waterfall */}
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="block text-[11px] font-semibold text-[#929fa7]">
                Paper vs Physical · Credit
              </span>
              <h3
                className="text-lg font-medium text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Are spreads pricing risk?
              </h3>
            </div>
            <ShieldAlert className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-[1fr_22px_1fr] items-center gap-2">
            <div className="p-3 rounded-[7px] border border-[#e8edf0] dark:border-[#19324D] bg-[#fbfcfc] dark:bg-[#06111D]">
              <span className="block text-[10px] font-bold text-[#8697a1]">PAPER</span>
              <strong
                className="block text-base font-medium text-[#3a5366] dark:text-white mt-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-28">
                  IG OAS {snapshot.igOasBps}bps
                </MetricDisplay>
              </strong>
              <p className="text-[11px] text-[#71808a] dark:text-slate-300 mt-1 leading-snug">
                Calm secondary pricing inside 80–100bps range.
              </p>
              <div className="h-1.5 rounded-full bg-[#e8edf0] dark:bg-[#142D46] mt-2.5 overflow-hidden">
                <span className="block h-full rounded-full bg-[#6e8da2]" style={{ width: '58%' }} />
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-[#a6b2b9] mx-auto" aria-hidden="true" />

            <div className="p-3 rounded-[7px] border border-[#e8edf0] dark:border-[#19324D] bg-[#fbfcfc] dark:bg-[#06111D]">
              <span className="block text-[10px] font-bold text-[#8697a1]">PHYSICAL</span>
              <strong
                className="block text-base font-medium text-[#3a5366] dark:text-white mt-1"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                $740bn Capex Need
              </strong>
              <p className="text-[11px] text-[#71808a] dark:text-slate-300 mt-1 leading-snug">
                Primary market concessions forced wide to clear supply.
              </p>
              <div className="h-1.5 rounded-full bg-[#e8edf0] dark:bg-[#142D46] mt-2.5 overflow-hidden">
                <span className="block h-full rounded-full bg-[#ca9b4d]" style={{ width: '82%' }} />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#edf0f2] dark:border-[#19324D]">
            <span className="block text-[11px] font-semibold text-[#71828d] dark:text-slate-300">
              Waterfall of Credit Stress (Early Warning Chain)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {liveWaterfall.map((stage) => {
                const targetId = STEP_TO_SPREAD[stage.step] ?? 'ig-oas';
                const isActive = selectedSpreadId === targetId && stage.step !== '01';
                return (
                  <button
                    key={stage.step}
                    type="button"
                    onClick={() => setSelectedSpreadId(targetId)}
                    aria-pressed={isActive}
                    className={`card-interactive text-left p-2.5 rounded-[7px] border bg-[#fbfcfc] dark:bg-[#06111D] flex flex-col justify-between gap-1.5 cursor-pointer ${
                      isActive
                        ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                        : 'border-[#e8edf0] dark:border-[#19324D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className="font-mono text-[10px] text-[#9aa6ad]">{stage.step}</span>
                      <SignalBadge signal={stage.signal} />
                    </div>
                    <strong className="text-[11px] font-semibold text-[#0D243C] dark:text-white leading-tight">
                      {stage.label}
                    </strong>
                    <span className="font-mono text-[10px] text-[#71808a] dark:text-slate-300 tabular-nums">
                      <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-20">
                        {stage.status}
                      </MetricDisplay>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Spreads & Stagflation Tile Grid (Live from Snapshot) */}
      <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <span className="block text-[11px] font-semibold text-[#929fa7]">
              Credit Stress &amp; Stagflation Watchlist
            </span>
            <h3
              className="text-lg font-medium text-[#0D243C] dark:text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Spreads, volatility &amp; monetary hedges
            </h3>
          </div>
          <span className={`text-xs font-mono ${isSyncing ? 'text-[#0D243C] dark:text-sky-300 font-semibold animate-pulse' : 'text-[#71808c] dark:text-slate-400'}`}>
            {isSyncing ? 'Syncing live quotes…' : 'Live Firestore sync'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {liveCreditMetrics.map((item) => {
            const isSelected = selectedSpreadId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedSpreadId(item.id)}
                aria-pressed={isSelected}
                className={`card-interactive text-left w-full border rounded-[7px] p-3.5 bg-white dark:bg-[#06111D] flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                    : 'border-[#e8edf0] dark:border-[#19324D]'
                }`}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-[6px] bg-[#eaf0f4] dark:bg-[#142D46] text-[#355773] dark:text-sky-300 font-mono text-[11px] font-bold grid place-items-center">
                        {MONOGRAMS[item.id] ?? 'MK'}
                      </span>
                      <div>
                        <span className="block text-xs font-semibold text-[#0D243C] dark:text-white">
                          {item.name}
                        </span>
                        <span className="block font-mono text-[10px] text-[#8d9aa3] dark:text-slate-400">
                          {item.ticker}
                        </span>
                      </div>
                    </div>
                    <SignalBadge signal={item.signal} label={item.statusLabel} />
                  </div>

                  <div className="flex items-baseline justify-between gap-2 mt-3">
                    <strong className="font-mono text-xl font-semibold text-[#27465f] dark:text-white tabular-nums">
                      <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-24">
                        {item.value}
                      </MetricDisplay>
                    </strong>
                    <span className="font-mono text-[11px] text-[#71808a] dark:text-slate-400">
                      {item.watchThreshold}
                    </span>
                  </div>

                  <div className="h-1 mt-2.5 rounded-full bg-[#edf1f3] dark:bg-[#142D46] overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-[#6e8ca1] dark:bg-sky-400"
                      style={{ width: `${item.fillPct}%` }}
                    />
                  </div>
                </div>

                <p className="mt-2.5 text-xs text-[#647987] dark:text-slate-300 leading-relaxed">
                  {item.interpretation}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Row: Key Credit Events + India Data Center Wave */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <span className="block text-[11px] font-semibold text-[#929fa7]">Event Monitor</span>
              <h3
                className="text-lg font-medium text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Credit &amp; semiconductor notes
              </h3>
            </div>
            <ArrowUpRight className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CREDIT_EVENTS.map((ev, idx) => {
              const isSelected = selectedEventTitle === ev.title;
              return (
                <button
                  key={ev.title}
                  type="button"
                  onClick={() => setSelectedEventTitle(ev.title)}
                  aria-pressed={isSelected}
                  className={`card-interactive text-left w-full border rounded-[7px] p-3 flex flex-col justify-between gap-2 bg-[#fbfcfc] dark:bg-[#06111D] cursor-pointer ${
                    isSelected
                      ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                      : 'border-[#ebeff1] dark:border-[#19324D]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="font-mono text-[11px] font-bold text-[#b58b4a] dark:text-amber-400">
                      0{idx + 1}
                    </span>
                    <SignalBadge signal={ev.signal} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-[#0D243C] dark:text-white">
                      {ev.title}
                    </h4>
                    <p className="text-[11px] text-[#71808a] dark:text-slate-300 leading-relaxed mt-1">
                      {ev.detail}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
          <div className="flex items-baseline justify-between gap-2 mb-4">
            <div>
              <span className="block text-[11px] font-semibold text-[#929fa7]">
                Andhra Pradesh &amp; Hyderabad
              </span>
              <h3
                className="text-lg font-medium text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                India data center wave
              </h3>
            </div>
            <span className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
              ${totalIndiaDcBn.toFixed(1)}bn total
            </span>
          </div>

          <div className="space-y-3">
            {INDIA_DATA_CENTERS.map((deal) => (
              <div key={deal.company} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <div>
                    <span className="font-semibold text-[#0D243C] dark:text-white">{deal.company}</span>
                    <span className="text-[#71808a] dark:text-slate-400">
                      {' · '}
                      {deal.capacity} · {deal.location}
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-[#0D243C] dark:text-white tabular-nums">
                    ${deal.amountBn.toFixed(1)}bn
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#edf1f3] dark:bg-[#06111D] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#2c8568] dark:bg-emerald-500"
                    style={{ width: `${Math.round((deal.amountBn / maxDcBn) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#89959e] dark:text-slate-400">{deal.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
