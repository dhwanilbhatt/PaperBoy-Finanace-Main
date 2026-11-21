import { Clock3, Radio, Waves } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  JAVIER_BLAS_QUOTE,
  SCENARIOS,
  WAR_STATUS_PANEL,
  WAR_TIMELINE,
} from '../data/macroData';
import type { ScenarioItem, SectionId } from '../types/macro';
import { SectionHeader } from './SectionHeader';
import { SignalBadge } from './SignalBadge';

interface WarRoomSectionProps {
  onOpenWhatsApp: (sectionId: SectionId) => void;
}

export function WarRoomSection({ onOpenWhatsApp }: WarRoomSectionProps) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioItem['id']>('limbo');
  const [timelineCategory, setTimelineCategory] = useState<'all' | 'military' | 'diplomacy' | 'market'>('all');
  const [timelineSearch, setTimelineSearch] = useState('');

  const activeScenario = SCENARIOS.find((s) => s.id === selectedScenario) ?? SCENARIOS[1];

  const filteredEvents = useMemo(() => {
    const q = timelineSearch.trim().toLowerCase();
    return WAR_TIMELINE.filter((ev) => {
      const catMatch = timelineCategory === 'all' || ev.category === timelineCategory;
      const queryMatch =
        !q ||
        ev.title.toLowerCase().includes(q) ||
        ev.detail.toLowerCase().includes(q) ||
        ev.date.toLowerCase().includes(q);
      return catMatch && queryMatch;
    });
  }, [timelineCategory, timelineSearch]);

  const hormuz = WAR_STATUS_PANEL.find((i) => i.id === 'hormuz') ?? WAR_STATUS_PANEL[0];
  const diplomacyRows = WAR_STATUS_PANEL.filter(
    (i) => i.id !== 'hormuz' && i.id !== 'trump-window'
  );
  const trumpWindow = WAR_STATUS_PANEL.find((i) => i.id === 'trump-window');

  return (
    <section id="war-room" className="scroll-mt-24 space-y-6">
      <SectionHeader
        index="02"
        title="The War Room"
        cadence="Geopolitical Tracker · Event-driven within 2 hours, 24/7"
        questionAnswered="A market-impact timeline, not a headline feed — does overnight escalation shift Deal, Limbo, or Third Strike odds?"
        sectionId="war-room"
        onOpenWhatsApp={onOpenWhatsApp}
      />

      {/* Row 1: Analytical Framework + Maritime & Diplomacy Status Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Analytical Thesis & Three Scenarios Summary (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-5">
          <div className="p-4 rounded-[8px] bg-[#0D243C] dark:bg-[#06111D] text-white space-y-2">
            <span className="block text-[11px] font-semibold text-[#e0b66e]">
              Core Analytical Framework
            </span>
            <blockquote
              className="text-lg sm:text-xl font-medium leading-snug text-white"
              style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
            >
              {JAVIER_BLAS_QUOTE.quote}
            </blockquote>
            <p className="text-xs text-[#c4d1db]">{JAVIER_BLAS_QUOTE.attribution}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="block text-[11px] font-semibold text-[#929fa7]">
                  Forward View · Probability Weights
                </span>
                <h3
                  className="text-lg font-medium text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Three scenarios
                </h3>
              </div>
              <Radio className="w-4 h-4 text-[#93a2ad]" aria-hidden="true" />
            </div>

            <div className="divide-y divide-[#edf0f2] dark:divide-[#19324D]">
              {SCENARIOS.map((s) => {
                const isSelected = s.id === selectedScenario;
                const barClass =
                  s.id === 'deal'
                    ? 'bg-[#e7f2ed] text-[#39886f] dark:bg-emerald-950/60 dark:text-emerald-300'
                    : s.id === 'limbo'
                      ? 'bg-[#f8f1e4] text-[#bb8532] dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-[#f7eae8] text-[#bd5e55] dark:bg-red-950/60 dark:text-red-300';

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedScenario(s.id)}
                    aria-pressed={isSelected}
                    className={`card-interactive w-full text-left py-2.5 px-3 grid grid-cols-[10px_minmax(0,1fr)_auto] gap-3 items-center cursor-pointer rounded-[7px] border ${
                      isSelected
                        ? 'bg-[#F6F8FB] dark:bg-[#0A1929] border-[#0D243C] dark:border-sky-400 shadow-[0_6px_14px_rgba(25,54,80,0.08)]'
                        : 'bg-white dark:bg-[#0B1D31] border-[#edf0f2] dark:border-[#19324D]'
                    }`}
                  >
                    <span className={`w-2 h-8 rounded-full grid place-items-start justify-center pt-1 ${barClass}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-xs sm:text-sm font-semibold text-[#0D243C] dark:text-white">
                          {s.name}
                          {s.isBaseCase ? ' · Base case' : ''}
                        </strong>
                        <span className="font-mono text-xs text-[#87949d] dark:text-slate-400 tabular-nums">
                          {s.probability}% weight
                        </span>
                      </div>
                      <p className="text-xs text-[#71808a] dark:text-slate-300 mt-0.5 truncate sm:whitespace-normal">
                        {s.trigger}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <small className="block text-[10px] font-semibold text-[#9da7ae]">
                        Brent
                      </small>
                      <strong className="font-mono text-xs sm:text-sm font-semibold text-[#0D243C] dark:text-slate-100 tabular-nums">
                        {s.brentRange}
                      </strong>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Proportional probability bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex w-full h-2 gap-0.5 rounded-full overflow-hidden">
                <span style={{ width: '25%' }} className="bg-[#39886f]" title="Deal 25%" />
                <span style={{ width: '55%' }} className="bg-[#c48d38]" title="Limbo 55%" />
                <span style={{ width: '20%' }} className="bg-[#bd5e55]" title="Third Strike 20%" />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[#99a4ab] dark:text-slate-400 tabular-nums">
                <span>Deal 25% ($75–80)</span>
                <span>Limbo 55% ($88–95)</span>
                <span>Strike 20% ($110–125)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#edf0f2] dark:border-[#19324D] grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
              <div>
                <span className="block text-[11px] text-[#89959e] dark:text-slate-400">Selected Target</span>
                <span className="font-semibold text-[#0D243C] dark:text-white">{activeScenario.brentRange}</span>
              </div>
              <div>
                <span className="block text-[11px] text-[#89959e] dark:text-slate-400">Est. VLCC</span>
                <span className="font-semibold text-[#0D243C] dark:text-white">${activeScenario.vlccAssumption}/bbl</span>
              </div>
              <div>
                <span className="block text-[11px] text-[#89959e] dark:text-slate-400">USD/INR Path</span>
                <span className="font-semibold text-[#0D243C] dark:text-white">{activeScenario.inrImpact}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Maritime & Diplomacy Current Status Surface (5 cols) */}
        <div className="lg:col-span-5 bg-[#F6F8FB] dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="block text-[11px] font-semibold text-[#929fa7]">
                  Maritime &amp; Diplomacy
                </span>
                <h3
                  className="text-lg font-medium text-[#0D243C] dark:text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Current status panel
                </h3>
              </div>
              <SignalBadge signal="danger" label="Alert posture" />
            </div>

            {/* Strait of Hormuz Featured Status Card */}
            <div className="flex items-center gap-3 p-3 rounded-[7px] border border-[#e5ebee] dark:border-[#19324D] bg-white dark:bg-[#06111D]">
              <div className="w-9 h-9 rounded-[7px] bg-[#eaf1f5] dark:bg-[#142D46] text-[#355b78] dark:text-sky-300 grid place-items-center shrink-0">
                <Waves className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-[#8c9aa4]">
                  {hormuz.label}
                </span>
                <strong className="block text-sm font-semibold text-[#0D243C] dark:text-white">
                  {hormuz.status}
                </strong>
                <small className="block text-[11px] text-[#71808a] dark:text-slate-300">
                  {hormuz.detail}
                </small>
              </div>
            </div>

            {/* Chokepoints & Diplomatic Back-Channels */}
            <div className="divide-y divide-[#e8edf0] dark:divide-[#19324D]">
              {diplomacyRows.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-[#354e62] dark:text-slate-100 block">
                      {item.label}
                    </span>
                    <span className="text-[11px] text-[#8c9aa4] dark:text-slate-400">
                      {item.detail}
                    </span>
                  </div>
                  <SignalBadge signal={item.signal} label={item.status} />
                </div>
              ))}
            </div>
          </div>

          {trumpWindow && (
            <div className="pt-3 border-t border-[#e5ebee] dark:border-[#19324D] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Clock3 className="w-5 h-5 text-[#a47d41] dark:text-amber-400 shrink-0" aria-hidden="true" />
                <div>
                  <span className="block text-[11px] text-[#81909a] dark:text-slate-400">
                    {trumpWindow.label}
                  </span>
                  <strong className="font-mono text-xl font-semibold text-[#28455d] dark:text-white tabular-nums">
                    46 <small className="text-xs font-medium">days left</small>
                  </strong>
                </div>
              </div>
              <p className="text-[11px] text-right text-[#74828e] dark:text-slate-300 max-w-[160px] leading-snug">
                GOP Congress ends Jan 3, 2027
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Living Timeline with Vertical Spine */}
      <div className="bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[9px] p-5">
        <div className="flex flex-col gap-3 pb-4 border-b border-[#edf0f2] dark:border-[#19324D] md:flex-row md:items-center md:justify-between">
          <div>
            <span className="block text-[11px] font-semibold text-[#929fa7]">
              Feb 28 – Nov 18, 2026 · {filteredEvents.length} of {WAR_TIMELINE.length} milestones
            </span>
            <h3
              className="text-lg font-medium text-[#0D243C] dark:text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Event timeline
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="timeline-search" className="sr-only">
              Search timeline events
            </label>
            <input
              id="timeline-search"
              type="search"
              value={timelineSearch}
              onChange={(e) => setTimelineSearch(e.target.value)}
              placeholder="Search timeline…"
              className="px-3 py-1.5 rounded-md text-xs bg-[#F6F8FB] dark:bg-[#07131F] border border-[#e1e6e9] dark:border-[#19324D] text-[#0D243C] dark:text-slate-100 w-44"
            />
            <div
              className="inline-flex items-center gap-0.5 p-0.5 border border-[#e1e6e9] dark:border-[#19324D] rounded-md bg-[#F6F8FB] dark:bg-[#07131F]"
              role="group"
              aria-label="Filter timeline by category"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'military', label: 'Military' },
                  { id: 'diplomacy', label: 'Diplomacy' },
                  { id: 'market', label: 'Market' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTimelineCategory(tab.id)}
                  aria-pressed={timelineCategory === tab.id}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    timelineCategory === tab.id
                      ? 'bg-[#0D243C] text-white dark:bg-slate-100 dark:text-[#07131F]'
                      : 'text-[#82909a] dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 max-h-[440px] overflow-y-auto pr-1">
          {filteredEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#71808a] dark:text-slate-400">
              No timeline events match your filter.{' '}
              <button
                type="button"
                onClick={() => {
                  setTimelineCategory('all');
                  setTimelineSearch('');
                }}
                className="underline text-[#0D243C] dark:text-slate-100 cursor-pointer"
              >
                Show all 15 events
              </button>
            </div>
          ) : (
            filteredEvents.map((ev, index) => (
              <article
                key={ev.id}
                className="grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 min-h-[64px]"
              >
                <div className="relative flex items-start justify-center font-mono text-[11px] font-bold text-[#a87932] dark:text-amber-400">
                  <span className="relative z-10 bg-white dark:bg-[#0B1D31] pt-0.5 pb-1">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {index < filteredEvents.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-5 bottom-0 w-px bg-[#dce5ea] dark:bg-[#19324D]"
                    />
                  )}
                </div>

                <div className="pb-4 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[#a08354] dark:text-amber-300">
                      {ev.date}
                    </span>
                    <span className="text-[11px] text-[#929fa7] capitalize">
                      · {ev.category}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-[#0D243C] dark:text-white mt-0.5">
                    {ev.title}
                  </h4>
                  <p className="text-xs text-[#71808a] dark:text-slate-300 leading-relaxed mt-0.5">
                    {ev.detail}
                  </p>
                </div>

                <div className="text-right pl-2 pt-1 shrink-0 space-y-1">
                  {ev.brentTag && (
                    <strong className="block font-mono text-xs font-semibold text-[#0D243C] dark:text-slate-100 tabular-nums">
                      {ev.brentTag}
                    </strong>
                  )}
                  <SignalBadge signal={ev.signal} />
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
