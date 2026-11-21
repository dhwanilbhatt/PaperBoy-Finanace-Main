import {
  AI_BOND_STATS,
  BRIEF_META,
  CREDIT_EVENTS,
  CREDIT_STRESS_METRICS,
  DATED_VS_CO1_GAP,
  INDIA_DATA_CENTERS,
  INDIA_ENERGY_CATALYSTS,
  INDIA_IMPORT_MIX,
  INDIA_KEY_METRICS,
  INDIA_TRANSMISSION_CHAIN,
  JAVIER_BLAS_QUOTE,
  OIL_INSTRUMENTS,
  POLICY_UPCOMING_DATES,
  SCENARIOS,
  WAR_STATUS_PANEL,
  WAR_TIMELINE,
} from '../data/macroData';
import type { MarketSnapshotData, OilInstrument, SectionId, SignalLevel } from '../types/macro';

function tag(signal: SignalLevel): string {
  if (signal === 'danger') return '[DANGER]';
  if (signal === 'watch') return '[WATCH]';
  return '[RELIEF]';
}

export interface LiveBriefContext {
  instruments?: OilInstrument[];
  snapshot?: MarketSnapshotData;
  brentInput?: number;
  vlccInput?: number;
}

export function buildWhatsAppBrief(
  sectionId: SectionId,
  ctx?: LiveBriefContext
): { title: string; text: string } {
  const instruments = ctx?.instruments ?? OIL_INSTRUMENTS;
  const snapshot = ctx?.snapshot;
  const headerDate = snapshot?.updatedLabel ?? BRIEF_META.updatedAt;
  const header = `PAPER BOY FINANCE | MACROLENS BRIEF | ${headerDate}`;

  const findInst = (id: string) => instruments.find((i) => i.id === id);
  const brent = findInst('brent-co1');
  const wti = findInst('wti-cl1');
  const m1m2 = findInst('m1-m2');
  const dated = findInst('dated-brent');
  const vlcc = findInst('vlcc-freight');
  const inr = findInst('usd-inr');
  const ttf = findInst('ttf-gas');

  const brentNum = ctx?.brentInput ?? brent?.numericValue ?? 92.69;
  const vlccNum = ctx?.vlccInput ?? vlcc?.numericValue ?? 20;
  const datedGap = ((dated?.numericValue ?? 93.03) - (brent?.numericValue ?? 92.69)).toFixed(2);

  if (sectionId === 'oil-dashboard') {
    const lines = [
      header,
      'SECTION 1: DAILY OIL DASHBOARD (8:00 AM IST)',
      '',
      'CORE SIGNAL: Paper vs. Physical Divergence',
      `- Brent CO1: ${brent?.value ?? '$92.69'} ${tag(brent?.signal ?? 'watch')} — ${brent?.interpretation ?? 'Paper price'}`,
      `- M1-M2 Backwardation: ${m1m2?.value ?? '+$2.73'} ${tag(m1m2?.signal ?? 'danger')} — ${m1m2?.interpretation ?? 'Physical tightness'}`,
      `- Dated Brent vs CO1 Gap: +$${datedGap} [WATCH] — Down from +$${DATED_VS_CO1_GAP.lastWeekPeak.toFixed(2)} last week (Alert >$2.00)`,
      '',
      'SEVEN INSTRUMENTS:',
      ...instruments.map(
        (item) => `- ${item.name}: ${item.value} ${tag(item.signal)} — ${item.interpretation}`
      ),
      '',
      'BRENT TRAJECTORY:',
      `- Nov 2 Open: $111.69 -> Nov 3-7 Dem Sweep: $97.50 -> Nov 10 War Low: $90.16 -> Live: ${brent?.value ?? '$92.69'}`,
      `- Bottom line: Paper is pricing surplus/peace, while ${m1m2?.value ?? '+$2.73'} M1-M2 reflects physical tightness.`,
    ];
    return { title: 'Daily Oil Dashboard Brief', text: lines.join('\n') };
  }

  if (sectionId === 'war-room') {
    const lines = [
      header,
      'SECTION 2: WAR ROOM & SCENARIO TRACKER',
      '',
      `FRAMEWORK: ${JAVIER_BLAS_QUOTE.quote}`,
      '',
      'CURRENT STATUS:',
      ...WAR_STATUS_PANEL.map(
        (item) => `- ${item.label}: ${item.status} ${tag(item.signal)} — ${item.detail}`
      ),
      '',
      'SCENARIO PROBABILITIES:',
      ...SCENARIOS.map(
        (s) => `- ${s.name} (${s.probability}%): Brent ${s.brentRange} — ${s.trigger}`
      ),
      '',
      'LATEST DEVELOPMENTS (NOV 15-18):',
      ...WAR_TIMELINE.slice(0, 4).map(
        (ev) => `- ${ev.date}: ${ev.title}. ${ev.detail}`
      ),
    ];
    return { title: 'War Room Brief', text: lines.join('\n') };
  }

  if (sectionId === 'india-transmission') {
    const delivered = brentNum + vlccNum;
    const warPrem = delivered - 74;
    const pct = Math.round((warPrem / 74) * 100);

    const lines = [
      header,
      'SECTION 3: INDIA TRANSMISSION PANEL',
      '',
      'DELIVERED INDIAN PORT COST:',
      `- Brent ($${brentNum.toFixed(2)}) + VLCC Freight ($${vlccNum.toFixed(0)}/bbl) = ~$${delivered.toFixed(0)}/bbl delivered`,
      `- Pre-war: ~$74/bbl | War premium: +$${warPrem.toFixed(0)}/bbl (+${pct}%)`,
      '',
      'TRANSMISSION CHAIN:',
      ...INDIA_TRANSMISSION_CHAIN.map(
        (step) => `- ${step.label} ${tag(step.signal)}: ${step.statusText}`
      ),
      '',
      'INDIA CRUDE IMPORT MIX (NOV 2026):',
      ...INDIA_IMPORT_MIX.map(
        (m) => `- ${m.source}: ~${m.shareNov}% (vs ${m.shareJul}% in July) — ${m.note}`
      ),
      '',
      'KEY INDIA METRICS & CATALYSTS:',
      ...INDIA_KEY_METRICS.map((m) => {
        if (m.label.includes('Nifty') && snapshot) {
          return `- ${m.label}: ${snapshot.nifty50.toLocaleString('en-IN')} ${tag(m.signal)} — ${m.note}`;
        }
        if (m.label.includes('USD/INR') && inr) {
          return `- ${m.label}: ${inr.value} ${tag(inr.signal)} — ${m.note}`;
        }
        if (m.label.includes('RBI Repo') && snapshot) {
          return `- ${m.label}: ${snapshot.rbiRepoRate.toFixed(2)}% ${tag(m.signal)} — ${m.note}`;
        }
        return `- ${m.label}: ${m.value} ${tag(m.signal)} — ${m.note}`;
      }),
      ...INDIA_ENERGY_CATALYSTS.map((c) => `- ${c.title}: ${c.metric} — ${c.note}`),
    ];
    return { title: 'India Transmission Brief', text: lines.join('\n') };
  }

  if (sectionId === 'capital-markets') {
    const lines = [
      header,
      'SECTION 4: CAPITAL MARKETS CORNER',
      '',
      'AI BOND ISSUANCE TRACKER:',
      ...AI_BOND_STATS.map((b) => `- ${b.label}: ${b.value} — ${b.note}`),
      '',
      'CREDIT STRESS DASHBOARD:',
      ...CREDIT_STRESS_METRICS.map(
        (c) => `- ${c.name} (${c.ticker}): ${c.value} ${tag(c.signal)} (${c.watchThreshold}) — ${c.interpretation}`
      ),
      '',
      'STRESS WATERFALL:',
      `- AI concessions (now 20-30bps) -> IG OAS (${snapshot?.igOasBps ?? 88}bps/100) -> HY OAS (${snapshot?.hyOasBps ?? 320}bps/350) -> VIX (${snapshot?.vix ?? 18.38}/25) -> Equity selloff`,
      '',
      'KEY EVENTS & INDIA DATA CENTER WAVE ($52.9bn):',
      ...CREDIT_EVENTS.map((e) => `- ${e.title}: ${e.detail}`),
      ...INDIA_DATA_CENTERS.map(
        (d) => `- ${d.company} (${d.location}): $${d.amountBn}bn (${d.capacity}) — ${d.note}`
      ),
    ];
    return { title: 'Capital Markets Brief', text: lines.join('\n') };
  }

  if (sectionId === 'policy-desk') {
    const lines = [
      header,
      'SECTION 5: POLICY DESK (RBI, FED, OPEC+, PSL)',
      '',
      'CENTRAL BANKS & OPEC+:',
      `- RBI: Repo at ${(snapshot?.rbiRepoRate ?? 5.5).toFixed(2)}%, calibrated tightening, Dec 2026 decision next. Risk: Fed 50bp hike forces RBI hand.`,
      `- US Fed: Hiking cycle active, 28bp priced for Dec (50bp tail risk). US 10Y at 5.01% on +0.4% Oct CPI. MOVE: ${snapshot?.moveIndex ?? 92.43}.`,
      '- OPEC+ (Nov 29, 11 days): Output 23.83 mb/d (Saudi war-high 10.56 mb/d). IEA sees first war-era surplus. Goldman $88 avg 2027.',
      '- RBI PSL Draft (Nov 5): Gold-backed agri loans kept with stricter checks; LC bill discounting in ANBC (Rs 10,000cr = Rs 4,000cr PSL). Comments due Nov 26.',
      '',
      'UPCOMING CATALYSTS:',
      ...POLICY_UPCOMING_DATES.map(
        (p) => `- ${p.date}: ${p.event} ${tag(p.signal)} — ${p.impact}`
      ),
    ];
    return { title: 'Policy Desk Brief', text: lines.join('\n') };
  }

  const fullLines = [
    header,
    'MACROLENS MORNING EXECUTIVE BRIEF',
    `Core Read: ${BRIEF_META.coreQuestion}`,
    '',
    '1. OIL DESK (8:00 AM IST)',
    `- Brent CO1: ${brent?.value ?? '$92.69'} ${tag(brent?.signal ?? 'watch')} | WTI: ${wti?.value ?? '$85.08'} | Dated Brent: ${dated?.value ?? '$93.03'} (+$${datedGap} gap)`,
    `- M1-M2 Backwardation: ${m1m2?.value ?? '+$2.73'} ${tag(m1m2?.signal ?? 'danger')} — War-level tightness (>+$2.50)`,
    `- VLCC Freight: ${vlcc?.value ?? '~$20/bbl'} ${tag(vlcc?.signal ?? 'danger')} | USD/INR: ${inr?.value ?? '93.41'} ${tag(inr?.signal ?? 'relief')} | TTF Gas: ${ttf?.value ?? 'EUR 85.31/MWh'}`,
    '',
    '2. WAR ROOM',
    '- Hormuz: Partially open, 19 vessels hit since Nov 15 [DANGER] | Bab el-Mandeb: Houthis advancing [DANGER]',
    '- Diplomacy: Oman Sultan talks Nov 17 [RELIEF]; Qatar & Pakistan active [WATCH]; Shenzhen summit Nov 19',
    '- Scenarios: Limbo/Strangulation 55% ($88-95) | Deal 25% ($75-80) | Third Strike 20% ($110-125)',
    '- Trump window: 46 days left before Jan 3, 2027 Democratic Congress',
    '',
    '3. INDIA TRANSMISSION',
    `- Delivered Cost: $${brentNum.toFixed(2)} + $${vlccNum.toFixed(0)} = ~$${(brentNum + vlccNum).toFixed(0)}/bbl (+${Math.round(((brentNum + vlccNum - 74) / 74) * 100)}% vs ~$74 pre-war)`,
    '- Mix (Nov): Gulf 54% (overtook Russia) | Russia 35% (down from 56%) | Others 11%',
    `- Oct Deficit: $39.88bn [DANGER] | RBI: ${(snapshot?.rbiRepoRate ?? 5.5).toFixed(2)}% | Nifty 50: ${(snapshot?.nifty50 ?? 25371).toLocaleString('en-IN')} [RELIEF] | INR: ${inr?.value ?? '93.41'}`,
    '',
    '4. CAPITAL MARKETS',
    '- AI Bonds: $540bn+ YTD ($740bn 2027 pipeline), 20-30bps concessions',
    `- Credit: IG OAS ${snapshot?.igOasBps ?? 88}bps [RELIEF] | HY OAS ${snapshot?.hyOasBps ?? 320}bps [RELIEF] | VIX ${snapshot?.vix ?? 18.38} [RELIEF] | MOVE ${snapshot?.moveIndex ?? 92.43} [WATCH] | Gold $${(snapshot?.goldSpot ?? 3945).toLocaleString('en-US')} [DANGER]`,
    '- Key: Anthropic $15bn shelved; Nvidia beat ($115.8bn rev) post-CEO shakeup; $52.9bn AP/Hyd DC wave',
    '',
    '5. POLICY DESK',
    '- Key Dates: Nov 19 Shenzhen Summit | Nov 26 RBI PSL Deadline | Nov 29 OPEC+ | Dec Fed & RBI | Jan 3 US Congress',
  ];
  return { title: 'Full Morning Executive Brief', text: fullLines.join('\n') };
}
