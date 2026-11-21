import { Activity, ArrowRight, Globe2, Landmark, Ship, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import {
  INDIA_ENERGY_CATALYSTS,
  INDIA_IMPORT_MIX,
  INDIA_KEY_METRICS,
  INDIA_TRANSMISSION_CHAIN,
} from '../data/macroData';
import type { MarketSnapshotData, SectionId, SignalLevel } from '../types/macro';
import { MetricDisplay } from './MetricDisplay';
import { SectionHeader } from './SectionHeader';
import { SignalBadge } from './SignalBadge';

interface IndiaTransmissionSectionProps {
  snapshot: MarketSnapshotData;
  liveBrent: number;
  liveVlcc: number;
  liveUsdInr: number;
  liveUsdInrSignal: SignalLevel;
  brentInput: number;
  vlccInput: number;
  isLoading?: boolean;
  isSyncing?: boolean;
  onChangeBrent: (val: number) => void;
  onChangeVlcc: (val: number) => void;
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

const CHAIN_NOTES: Record<string, string> = {
  oil: 'Every +$10/bbl sustained move adds roughly $12–14bn to India’s annualized net crude import bill.',
  'import-bill': 'October trade deficit hit $39.88bn (1-yr high) due to both elevated Brent and $20/bbl VLCC freight war surcharge.',
  rupee: 'INR below the 95.00 stress marker reduces RBI emergency FX intervention pressure.',
  inflation: 'Higher landed fuel feeds core CPI expectations; RBI keeps tightening bias at current Repo Rate.',
  nifty: 'Lower crude volatility + steady INR supports foreign institutional inflows into Indian equities.',
};

export function IndiaTransmissionSection({
  snapshot,
  liveBrent,
  liveVlcc,
  liveUsdInr,
  liveUsdInrSignal,
  brentInput,
  vlccInput,
  isLoading = false,
  isSyncing = false,
  onChangeBrent,
  onChangeVlcc,
  onOpenWhatsApp,
}: IndiaTransmissionSectionProps) {
  const [selectedChainId, setSelectedChainId] = useState<string>('oil');
  const preWarDelivered = 74;
  const deliveredCost = brentInput + vlccInput;
  const warPremium = deliveredCost - preWarDelivered;
  const warPremiumPct = Math.round((warPremium / preWarDelivered) * 100);
  const liveLanded = Math.round(liveBrent + liveVlcc);

  const transmissionChain = INDIA_TRANSMISSION_CHAIN.map((node) => {
    if (node.id === 'oil') {
      return {
        ...node,
        signal: (liveBrent >= 105 ? 'danger' : liveBrent >= 85 ? 'watch' : 'relief') as SignalLevel,
        statusText: `Live $${liveBrent.toFixed(2)} CO1 / ~$${liveLanded} landed`,
      };
    }
    if (node.id === 'rupee') {
      return {
        ...node,
        signal: liveUsdInrSignal,
        statusText:
          liveUsdInr >= 95
            ? `Breached 95.00 red line at ${liveUsdInr.toFixed(2)}`
            : `Trading at ${liveUsdInr.toFixed(2)} (below 95.00 red line)`,
      };
    }
    if (node.id === 'inflation') {
      return {
        ...node,
        statusText: `RBI Repo at ${snapshot.rbiRepoRate.toFixed(2)}% (tightening bias)`,
      };
    }
    if (node.id === 'nifty') {
      return {
        ...node,
        statusText: `Nifty at ${snapshot.nifty50.toLocaleString('en-IN')} ($5bn+ FII)`,
      };
    }
    return node;
  });

  const kpiCards = [
    {
      chainId: 'import-bill',
      label: 'India Trade Deficit (Oct)',
      value: '$39.88bn',
      unit: '1-yr high',
      signal: 'danger' as SignalLevel,
      note: 'Driven by elevated landed crude & freight bill',
      Icon: Ship,
    },
    {
      chainId: 'oil',
      label: 'India Crude Basket',
      value: `~$${liveLanded}`,
      unit: '/bbl landed',
      signal: 'watch' as SignalLevel,
      note: `Brent $${liveBrent.toFixed(2)} + ~$${Math.round(liveVlcc)} VLCC war freight`,
      Icon: Globe2,
    },
    {
      chainId: 'rupee',
      label: 'USD / INR Spot',
      value: liveUsdInr.toFixed(2),
      unit: 'red line 95',
      signal: liveUsdInrSignal,
      note: 'Strongest since April vs 96.57 July stress peak',
      Icon: Activity,
    },
    {
      chainId: 'nifty',
      label: 'Nifty 50 Index',
      value: snapshot.nifty50.toLocaleString('en-IN'),
      unit: '8-mo high',
      signal: (snapshot.nifty50 >= 25000 ? 'relief' : 'watch') as SignalLevel,
      note: 'Backed by $5bn+ FII buying in November',
      Icon: TrendingUp,
    },
  ];

  const indiaKeyMetrics = INDIA_KEY_METRICS.map((m) => {
    if (m.label === 'RBI Repo Rate') {
      return { ...m, value: `${snapshot.rbiRepoRate.toFixed(2)}%` };
    }
    if (m.label === 'Nifty 50') {
      return {
        ...m,
        value: snapshot.nifty50.toLocaleString('en-IN'),
        signal: (snapshot.nifty50 >= 25000 ? 'relief' : 'watch') as SignalLevel,
      };
    }
    if (m.label === 'USD/INR Spot') {
      return { ...m, value: liveUsdInr.toFixed(2), signal: liveUsdInrSignal };
    }
    return m;
  });

  return (
    <section id="india-transmission" className="scroll-mt-24 space-y-6">
      <SectionHeader
        index="03"
        title="The India transmission panel"
        cadence="Daily prices · Monthly crude import mix"
        questionAnswered={`What does $${liveBrent.toFixed(2)} Brent + ~$${Math.round(liveVlcc)}/bbl VLCC freight mean for India’s landed import bill, rupee, RBI policy, and Nifty?`}
        sectionId="india-transmission"
        onOpenWhatsApp={onOpenWhatsApp}
      />

      {/* 4-Column India Macro KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((card) => {
          const Icon = card.Icon;
          const isLinked = selectedChainId === card.chainId;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setSelectedChainId(card.chainId)}
              aria-pressed={isLinked}
              className={`card-interactive text-left w-full bg-white dark:bg-[#0B1D31] border rounded-[9px] p-4 shadow-[0_2px_5px_rgba(21,45,62,0.015)] cursor-pointer ${
                isLinked
                  ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                  : 'border-[#DDE4ED] dark:border-[#19324D]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#4b6a82] dark:text-sky-300 flex">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <SignalBadge signal={card.signal} />
              </div>
              <p className="mt-3 text-xs text-[#72818b] dark:text-slate-400">{card.label}</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <strong className="font-mono text-2xl font-semibold tracking-tight text-[#24435c] dark:text-white tabular-nums">
                  <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-24">
                    {card.value}
                  </MetricDisplay>
                </strong>
                <small className="text-[11px] font-medium text-[#89969f] dark:text-slate-400">
                  {card.unit}
                </small>
              </div>
              <p className="mt-2 text-xs text-[#8c989f] dark:text-slate-300 leading-relaxed">
                {card.note}
              </p>
            </button>
          );
        })}
      </div>

      {/* 2-Column Detail Grid: Delivered Cost Calculator + Import Mix / RBI Stance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        {/* Left: Indian Port Delivered Cost Calculator */}
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div>
                <span className="block text-[11px] font-semibold text-[#929fa7]">
                  Landed Barrel Calculator
                </span>
                <h3
                  className="text-lg font-medium text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Indian port delivered cost
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChangeBrent(liveBrent);
                  onChangeVlcc(liveVlcc);
                }}
                className="text-xs underline text-[#5f7280] hover:text-[#0D243C] dark:text-slate-300 dark:hover:text-white cursor-pointer"
              >
                Sync live (${liveBrent.toFixed(2)})
              </button>
            </div>
          </div>

          <div className="p-4 rounded-[7px] bg-[#F6F8FB] dark:bg-[#06111D] border border-[#e7ebed] dark:border-[#19324D]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-[#5f7280] dark:text-slate-300">
                Delivered to Indian Ports
              </span>
              <span className="font-mono text-2xl font-semibold text-[#0D243C] dark:text-white tabular-nums">
                <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-24">
                  ~${deliveredCost.toFixed(0)}/bbl
                </MetricDisplay>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-[#71808c] dark:text-slate-300">
              <span>Pre-war baseline: ~${preWarDelivered}/bbl</span>
              <span className={warPremium > 25 ? 'text-[#c05850] dark:text-red-400 font-semibold' : 'text-[#b17a22] dark:text-amber-300 font-semibold'}>
                War premium: {warPremium >= 0 ? '+' : ''}${warPremium.toFixed(0)}/bbl ({warPremiumPct >= 0 ? '+' : ''}{warPremiumPct}%)
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calc-brent" className="font-medium text-[#334c60] dark:text-slate-200">
                  Brent CO1 Price
                </label>
                <span className="font-mono font-semibold text-[#0D243C] dark:text-white tabular-nums">
                  ${brentInput.toFixed(2)}/bbl
                </span>
              </div>
              <input
                id="calc-brent"
                type="range"
                min={65}
                max={135}
                step={0.5}
                value={brentInput}
                onChange={(e) => onChangeBrent(parseFloat(e.target.value))}
                className="w-full accent-[#0D243C] dark:accent-slate-200 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calc-vlcc" className="font-medium text-[#334c60] dark:text-slate-200">
                  VLCC War Freight Tax
                </label>
                <span className="font-mono font-semibold text-[#0D243C] dark:text-white tabular-nums">
                  ${vlccInput.toFixed(0)}/bbl
                </span>
              </div>
              <input
                id="calc-vlcc"
                type="range"
                min={6}
                max={30}
                step={1}
                value={vlccInput}
                onChange={(e) => onChangeVlcc(parseFloat(e.target.value))}
                className="w-full accent-[#0D243C] dark:accent-slate-200 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  onChangeBrent(78);
                  onChangeVlcc(8);
                }}
                className="px-2 py-2 rounded-md text-xs font-medium border border-[#dce4e8] dark:border-[#19324D] hover:bg-[#f8fbfc] dark:hover:bg-[#142D46] text-[#334c60] dark:text-slate-200 cursor-pointer"
              >
                Deal ($78+$8)
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeBrent(liveBrent);
                  onChangeVlcc(liveVlcc);
                }}
                className="px-2 py-2 rounded-md text-xs font-medium border border-[#dce4e8] dark:border-[#19324D] hover:bg-[#f8fbfc] dark:hover:bg-[#142D46] text-[#334c60] dark:text-slate-200 cursor-pointer"
              >
                Live (${Math.round(liveBrent)}+${Math.round(liveVlcc)})
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeBrent(118);
                  onChangeVlcc(28);
                }}
                className="px-2 py-2 rounded-md text-xs font-medium border border-[#dce4e8] dark:border-[#19324D] hover:bg-[#f8fbfc] dark:hover:bg-[#142D46] text-[#334c60] dark:text-slate-200 cursor-pointer"
              >
                Strike ($118+$28)
              </button>
            </div>
          </div>
        </div>

        {/* Right: India Crude Import Mix + RBI Policy Reading */}
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="block text-[11px] font-semibold text-[#929fa7]">
                  Crude Import Mix · Monthly
                </span>
                <h3
                  className="text-lg font-medium text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Gulf overtakes Russia
                </h3>
              </div>
              <Landmark className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
            </div>

            <div className="flex items-baseline gap-2 mt-4">
              <strong className="font-mono text-2xl font-semibold text-[#24445e] dark:text-white tabular-nums">
                54%
              </strong>
              <span className="text-xs text-[#94a0a8] dark:text-slate-400">
                Gulf share in Nov vs. 34% in July (Russia fell 56% → 35%)
              </span>
            </div>

            {/* Rounded stacked proportion bar matching preview */}
            <div className="h-3.5 w-full flex rounded-full overflow-hidden mt-3 bg-[#e8edf0] dark:bg-[#06111D]">
              {INDIA_IMPORT_MIX.map((m) => (
                <div
                  key={m.source}
                  style={{ width: `${m.shareNov}%` }}
                  className={`${m.colorClass} transition-all`}
                  title={`${m.source}: ~${m.shareNov}%`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              {INDIA_IMPORT_MIX.map((m) => (
                <div key={m.source} className="text-xs">
                  <div className="flex items-center gap-1.5 text-[#74838d] dark:text-slate-400">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.colorClass}`} aria-hidden="true" />
                    <span className="truncate">{m.source.split(' ')[0]}</span>
                  </div>
                  <strong className="block font-mono text-sm font-semibold text-[#0D243C] dark:text-slate-100 mt-0.5 tabular-nums">
                    ~{m.shareNov}% <span className="text-[11px] font-normal text-[#94a0a8]">(Jul {m.shareJul}%)</span>
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[#edf0f2] dark:border-[#19324D] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#6f808c] dark:text-slate-300">
              <span>RBI Monetary Policy Repo Rate</span>
              <strong className="font-mono text-2xl font-semibold text-[#264760] dark:text-white tabular-nums">
                <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-16">
                  {snapshot.rbiRepoRate.toFixed(2)}%
                </MetricDisplay>
              </strong>
            </div>
            <div className="p-3 rounded-[6px] bg-[#f6f8f9] dark:bg-[#06111D] flex items-start gap-2.5 text-xs text-[#5f7280] dark:text-slate-300">
              <Activity className="w-4 h-4 text-[#718c9f] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Oct 2026 hike tightened stance after summer $135 crude peak. A 50bp Fed move in December forces RBI’s hand despite easing spot prices.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal 5-Step Transmission Chain */}
      <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <span className="block text-[11px] font-semibold text-[#929fa7]">
              The Transmission Chain
            </span>
            <h3
              className="text-lg font-medium text-[#0D243C] dark:text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              From oil to the equity tape
            </h3>
          </div>
          <span className="text-xs text-[#74828e] dark:text-slate-400">
            Oil → Import Bill → Rupee → Inflation / RBI → Nifty
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {transmissionChain.map((node, idx) => {
            const bottomBorder =
              node.signal === 'danger'
                ? 'border-b-2 border-b-[#cf7970]'
                : node.signal === 'relief'
                  ? 'border-b-2 border-b-[#65a38a]'
                  : 'border-b-2 border-b-[#d8ab61]';
            const isSelected = selectedChainId === node.id;
            return (
              <div key={node.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedChainId(node.id)}
                  aria-pressed={isSelected}
                  className={`card-interactive text-left w-full p-3 rounded-[7px] border bg-[#fbfcfc] dark:bg-[#06111D] cursor-pointer ${bottomBorder} ${
                    isSelected
                      ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                      : 'border-[#e7ebed] dark:border-[#19324D]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#9aa6ad]">
                    <span>0{idx + 1}</span>
                    <SignalBadge signal={node.signal} />
                  </div>
                  <strong className="block text-xs sm:text-sm font-semibold text-[#0D243C] dark:text-white mt-2">
                    {node.label}
                  </strong>
                  <p className="text-[11px] text-[#71808a] dark:text-slate-300 mt-1 leading-snug">
                    {node.statusText}
                  </p>
                </button>
                {idx < transmissionChain.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-[#b0bbc1] hidden lg:block shrink-0" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 pt-3 border-t border-[#edf0f2] dark:border-[#19324D] text-xs text-[#5f7280] dark:text-slate-300">
          <strong className="text-[#0D243C] dark:text-white">
            {transmissionChain.find((n) => n.id === selectedChainId)?.label}:
          </strong>{' '}
          {CHAIN_NOTES[selectedChainId] ?? ''}
        </p>
      </div>

      {/* Key India Data Releases & Supply Hedges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
          <h3
            className="text-lg font-medium text-[#0D243C] dark:text-white mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Key India macro releases
          </h3>
          <div className="divide-y divide-[#edf0f2] dark:divide-[#19324D]">
            {indiaKeyMetrics.map((m) => (
              <div key={m.label} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-[#0D243C] dark:text-slate-100">
                    {m.label}
                  </div>
                  <p className="text-xs text-[#71808a] dark:text-slate-300">{m.note}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
                    <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-16">
                      {m.value}
                    </MetricDisplay>
                  </div>
                  <SignalBadge signal={m.signal} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
          <h3
            className="text-lg font-medium text-[#0D243C] dark:text-white mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Supply hedges &amp; corporate winners
          </h3>
          <div className="divide-y divide-[#edf0f2] dark:divide-[#19324D]">
            {INDIA_ENERGY_CATALYSTS.map((cat) => (
              <div key={cat.title} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-[#0D243C] dark:text-slate-100">
                    {cat.title}
                  </div>
                  <p className="text-xs text-[#71808a] dark:text-slate-300">{cat.note}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className="font-mono text-sm font-semibold text-[#0D243C] dark:text-white tabular-nums">
                    {cat.metric}
                  </div>
                  <SignalBadge signal={cat.signal} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
