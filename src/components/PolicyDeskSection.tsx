import { CalendarDays, Landmark, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { POLICY_UPCOMING_DATES } from '../data/macroData';
import type { MarketSnapshotData, SectionId } from '../types/macro';
import { MetricDisplay } from './MetricDisplay';
import { SectionHeader } from './SectionHeader';
import { SignalBadge } from './SignalBadge';

interface PolicyDeskSectionProps {
  snapshot: MarketSnapshotData;
  isLoading?: boolean;
  isSyncing?: boolean;
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

const PLAIN_ENGLISH_NOTES = [
  {
    pillar: 'rbi',
    date: 'Nov 5 · RBI PSL Draft',
    title: 'LC bill discounting included in ANBC',
    copy: 'No longer excluded from Adjusted Net Bank Credit — every ₹10,000cr added triggers ₹4,000cr more Priority Sector Lending requirement. Industry comment deadline Nov 26.',
  },
  {
    pillar: 'rbi',
    date: 'Nov 5 · RBI PSL Draft',
    title: 'Gold-backed agricultural loans preserved',
    copy: 'Gold-backed agri loans continue to qualify for PSL targets, subject to tighter bank end-use verification.',
  },
  {
    pillar: 'fed',
    date: 'Fed · FOMC Speakers',
    title: 'December 25bp base case vs 50bp tail risk',
    copy: 'After +0.4% Oct CPI pushed US 10Y back to 5.01%, Waller signaled openness to 50bp while Logan and Goldman base case favor two 25bp hikes (Dec + Mar 2027).',
  },
  {
    pillar: 'opec',
    date: 'OPEC+ · Nov 29 Ministerial',
    title: 'Price defense vs. market share test',
    copy: 'With Saudi pumping a war-high 10.56 mb/d and IEA calling a global surplus, Nov 29 sets the 2027 supply floor.',
  },
];

export function PolicyDeskSection({
  snapshot,
  isLoading = false,
  isSyncing = false,
  onOpenWhatsApp,
}: PolicyDeskSectionProps) {
  const [selectedPillar, setSelectedPillar] = useState<'rbi' | 'fed' | 'opec'>('rbi');

  const trackers = [
    {
      id: 'rbi' as const,
      institution: 'RBI Monetary Policy',
      signal: 'watch' as const,
      statusLabel: 'Tightening',
      subtitle: 'Benchmark Repo Rate',
      value: `${snapshot.rbiRepoRate.toFixed(2)}%`,
      note: 'First hike in nearly 4 years in Oct 2026. Next MPC decision Dec 2026; exposed if US Fed hikes 50bp.',
    },
    {
      id: 'fed' as const,
      institution: 'US Federal Reserve',
      signal: 'danger' as const,
      statusLabel: '50bp tail risk',
      subtitle: 'US 10-Year Yield / Dec Priced',
      value: `${(snapshot.us10yYield ?? 5.01).toFixed(2)}% / 28bp`,
      note: `Hot +0.4% Oct CPI pushed 10Y near 5%; MOVE Index at ${snapshot.moveIndex.toFixed(2)}.`,
    },
    {
      id: 'opec' as const,
      institution: 'OPEC+ Countdown (Nov 29)',
      signal: 'watch' as const,
      statusLabel: '11 days',
      subtitle: 'Saudi Oct Output / OPEC Total',
      value: '10.56 / 23.83 mb/d',
      note: 'IEA sees global oil in surplus; Nov 29 tests whether Saudi defends price or market share.',
    },
  ];

  return (
    <section id="policy-desk" className="scroll-mt-24 space-y-6">
      <SectionHeader
        index="05"
        title="What policy is watching"
        cadence="Policy Desk · Within 4 hours of RBI, Fed, or OPEC+ statements"
        questionAnswered="Central-bank, regulatory, and OPEC+ decisions are the slow-moving forces — when do policy windows close?"
        sectionId="policy-desk"
        onOpenWhatsApp={onOpenWhatsApp}
      />

      {/* 3-Column Policy Tracker Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
        {trackers.map((t) => {
          const isSelected = selectedPillar === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedPillar(t.id)}
              aria-pressed={isSelected}
              className={`card-interactive text-left w-full bg-white dark:bg-[#0B1D31] border rounded-[9px] p-4 flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'border-[#0D243C] dark:border-sky-400 ring-1 ring-[#0D243C]/20 dark:ring-sky-400/20'
                  : 'border-[#DDE4ED] dark:border-[#19324D]'
              }`}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#37536a] dark:text-slate-100">
                    {t.institution}
                  </span>
                  <SignalBadge signal={t.signal} label={t.statusLabel} />
                </div>
                <p className="mt-3 text-xs text-[#8c989f] dark:text-slate-400">{t.subtitle}</p>
                <strong className="block mt-1 font-mono text-2xl font-semibold text-[#25465f] dark:text-white tabular-nums">
                  <MetricDisplay loading={isLoading} syncing={isSyncing} skeletonWidthClass="w-24">
                    {t.value}
                  </MetricDisplay>
                </strong>
              </div>
              <small className="block mt-3 text-xs text-[#71808a] dark:text-slate-300 leading-relaxed">
                {t.note}
              </small>
            </button>
          );
        })}
      </div>

      {/* Bottom 2-Column Split: Plain-English Policy Notes + Calendar Squares */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-7 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <span className="block text-[11px] font-semibold text-[#929fa7]">
                Regulation &amp; Central Banks
              </span>
              <h3
                className="text-lg font-medium text-[#0D243C] dark:text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Policy notes, in plain English
              </h3>
            </div>
            <Landmark className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
          </div>

          <div className="divide-y divide-[#edf0f2] dark:divide-[#19324D]">
            {PLAIN_ENGLISH_NOTES.map((note, idx) => {
              const isHighlighted = note.pillar === selectedPillar;
              return (
                <article
                  key={note.title}
                  className={`py-3 px-2 -mx-2 rounded-md grid grid-cols-[24px_1fr] gap-2.5 items-start transition-colors ${
                    isHighlighted ? 'bg-[#F6F8FB] dark:bg-[#06111D]' : ''
                  }`}
                >
                  <span className="font-mono text-[11px] font-bold text-[#b58b4a] dark:text-amber-400 pt-0.5">
                    0{idx + 1}
                  </span>
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-[#9d865f] dark:text-amber-300">
                      {note.date}
                    </span>
                    <h4 className="text-xs sm:text-sm font-semibold text-[#0D243C] dark:text-white mt-0.5">
                      {note.title}
                    </h4>
                    <p className="text-xs text-[#71808a] dark:text-slate-300 leading-relaxed mt-0.5">
                      {note.copy}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <span className="block text-[11px] font-semibold text-[#929fa7]">
                  Catalyst Calendar · Nov 2026 – Jan 2027
                </span>
                <h3
                  className="text-lg font-medium text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  On the calendar
                </h3>
              </div>
              <CalendarDays className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
            </div>

            <div className="divide-y divide-[#edf0f2] dark:divide-[#19324D]">
              {POLICY_UPCOMING_DATES.map((item) => {
                const parts = item.date.replace(',', '').split(' ');
                const month = parts[0]?.toUpperCase() ?? 'DEC';
                const day = parts[1]?.length <= 2 ? parts[1] : parts[1] ?? '26';
                return (
                  <article
                    key={`${item.date}-${item.event}`}
                    className="py-2.5 grid grid-cols-[44px_1fr_auto] gap-3 items-center"
                  >
                    <div className="w-11 h-9 rounded-[5px] bg-[#f1f5f7] dark:bg-[#06111D] text-[#718594] dark:text-slate-300 grid place-content-center justify-items-center">
                      <span className="font-mono text-[9px] font-bold leading-none">{month}</span>
                      <strong className="font-mono text-xs font-bold text-[#3e5a70] dark:text-white mt-0.5 leading-none">
                        {day}
                      </strong>
                    </div>
                    <div className="min-w-0">
                      <strong className="block text-xs font-semibold text-[#0D243C] dark:text-white truncate">
                        {item.event}
                      </strong>
                      <span className="block text-[11px] text-[#71808a] dark:text-slate-300 mt-0.5 leading-snug">
                        {item.impact}
                      </span>
                    </div>
                    <SignalBadge signal={item.signal} />
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-3 p-2.5 rounded-[5px] bg-[#faf5ea] dark:bg-amber-950/30 text-[#8d774f] dark:text-amber-200 flex items-center gap-2 text-[11px]">
            <ShieldAlert className="w-4 h-4 text-[#b1853b] dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>Key inflection: Jan 3, 2027 Democratic Congress narrows executive war leeway.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
