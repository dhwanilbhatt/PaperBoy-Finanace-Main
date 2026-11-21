import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, isSqlConfigured } from '../db/index.ts';
import { marketQuoteHistory, marketSyncRuns } from '../db/schema.ts';
import type {
  DataSourceKind,
  GroundedSource,
  MarketSnapshotData,
  MarketSyncRunItem,
  MarketSyncRunQuoteSummary,
  OilInstrument,
  SignalLevel,
} from '../types/macro.ts';

interface GroundedMarketPayload {
  brentCo1: number;
  wtiCl1: number;
  datedBrent: number;
  m1m2: number;
  vlccFreight: number;
  usdInr: number;
  ttfGas: number;
  nifty50: number;
  rbiRepoRate: number;
  vix: number;
  moveIndex: number;
  igOasBps: number;
  hyOasBps: number;
  goldSpot: number;
  silverSpot: number;
  summary: string;
  notes?: Record<string, string>;
}

export interface LiveGoogleMarketState {
  isGrounded: boolean;
  dataSourceKind: DataSourceKind;
  dailyCallsUsed: number;
  dailyCallsLimit: number;
  status: 'idle' | 'syncing' | 'ready' | 'error';
  intervalMinutes: number;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  summary: string;
  sources: GroundedSource[];
  syncError: string | null;
  instruments: OilInstrument[] | null;
  snapshot: MarketSnapshotData | null;
}

const DEFAULT_NOTES: Record<string, string> = {
  'brent-co1': 'Paper benchmark tracked live via Google Search',
  'wti-cl1': 'US light sweet crude benchmark tracking Brent-WTI spread',
  'm1-m2': 'Prompt physical backwardation gauge (>+$2.50 war tightness)',
  'dated-brent': 'Spot physical cargo benchmark vs. paper CO1 futures',
  'vlcc-freight': 'Gulf-to-Asia supertanker war freight cost gauge',
  'usd-inr': 'India FX stress gauge (red line at 95.00)',
  'ttf-gas': 'European benchmark natural gas price',
};

const DEFAULT_SYNC_INTERVAL_MINUTES = 30;
const MIN_SYNC_INTERVAL_MINUTES = 30;
const MAX_SYNC_INTERVAL_MINUTES = 240;

const CORE_OIL_FX_TTL_MS = 30 * 60 * 1000; // 30m during 09:00-21:00 IST weekdays (24 runs * 3 = 72 calls)
const OVERNIGHT_CORE_TTL_MS = 180 * 60 * 1000; // 3h overnight Mon-Fri (~4 runs * 3 = 12 calls)
const WEEKEND_CORE_TTL_MS = 240 * 60 * 1000; // 4h on weekends when futures/FX are closed (~18 calls/day)
const EQUITIES_TTL_MS = 240 * 60 * 1000; // 4h weekday -> Nifty 50 + VIX (2 calls)
const METALS_GAS_TTL_MS = 720 * 60 * 1000; // 12h -> Gold, Silver, Nat Gas (3 calls)
const TREASURY_TTL_MS = 1440 * 60 * 1000; // 24h -> Daily US par yield curve (1 call)
const MAX_DAILY_API_NINJAS_CALLS = 95; // 95/day * 31 days = 2,945/month ceiling (< 3,000 limit)

let cachedState: LiveGoogleMarketState = {
  isGrounded: false,
  dataSourceKind: 'baseline-only',
  dailyCallsUsed: 0,
  dailyCallsLimit: MAX_DAILY_API_NINJAS_CALLS,
  status: 'idle',
  intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  lastSyncedAt: null,
  nextSyncAt: null,
  summary: 'Static desk baseline active — awaiting verified live market sync.',
  sources: [],
  syncError: null,
  instruments: null,
  snapshot: null,
};

interface ApiNinjasCommodityResponse {
  exchange?: string;
  name?: string;
  price?: number;
  change_24h?: number;
  change_24h_percent?: number;
  high_24h?: number;
  low_24h?: number;
  futures_contract?: string;
}

interface ApiNinjasExchangeRateResponse {
  currency_pair?: string;
  exchange_rate?: number;
}

interface ApiNinjasStockResponse {
  ticker?: string;
  name?: string;
  price?: number;
  change?: number;
}

interface ApiNinjasTreasuryResponse {
  date?: string;
  rates?: {
    year_2?: number;
    year_10?: number;
  };
}

const API_NINJAS_BASE_URL = 'https://api.api-ninjas.com';

const BASELINE_VALUES: Omit<GroundedMarketPayload, 'summary' | 'notes'> = {
  brentCo1: 92.69,
  wtiCl1: 85.08,
  datedBrent: 93.03,
  m1m2: 2.73,
  vlccFreight: 20,
  usdInr: 93.41,
  ttfGas: 85.31,
  nifty50: 25371,
  rbiRepoRate: 5.5,
  vix: 18.38,
  moveIndex: 92.43,
  igOasBps: 88,
  hyOasBps: 320,
  goldSpot: 3945,
  silverSpot: 51.27,
};

let inFlightSync: Promise<LiveGoogleMarketState> | null = null;
let schedulerTimer: NodeJS.Timeout | null = null;

// Tiered API Ninjas endpoint TTL timestamps & daily quota budget tracker
let lastCoreSyncMs = 0;
let lastEquitiesSyncMs = 0;
let lastMetalsGasSyncMs = 0;
let lastTreasurySyncMs = 0;
let cachedNatGasPrice: number | null = null;
let cachedUs10Y: number | null = null;
let dailyCallCounterDate = new Date().toISOString().slice(0, 10);
let dailyApiNinjasCalls = 0;

function resetDailyCounterIfNeeded(): void {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (dailyCallCounterDate !== todayUtc) {
    dailyCallCounterDate = todayUtc;
    dailyApiNinjasCalls = 0;
  }
}

function isWeekendUtc(): boolean {
  const day = new Date().getUTCDay();
  return day === 0 || day === 6;
}

function isActiveWeekdayMarketWindowUtc(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  // 03:30 UTC (09:00 AM IST) to 15:30 UTC (09:00 PM IST): 12h peak window @ 30m cadence
  return mins >= 3 * 60 + 30 && mins <= 15 * 60 + 30;
}

function canSpendApiNinjasCalls(count: number): boolean {
  resetDailyCounterIfNeeded();
  return dailyApiNinjasCalls + count <= MAX_DAILY_API_NINJAS_CALLS;
}

function recordApiNinjasCalls(count: number): void {
  resetDailyCounterIfNeeded();
  dailyApiNinjasCalls += count;
}

function createAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function fetchApiNinjasEndpoint<T>(pathAndQuery: string, apiKey: string): Promise<T> {
  recordApiNinjasCalls(1);
  const res = await fetch(`${API_NINJAS_BASE_URL}${pathAndQuery}`, {
    method: 'GET',
    headers: {
      'X-Api-Key': apiKey,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`API Ninjas ${pathAndQuery.split('?')[0]} returned HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function getPreviousMarketValues(): Omit<GroundedMarketPayload, 'summary' | 'notes'> {
  if (!cachedState.instruments || !cachedState.snapshot) {
    return { ...BASELINE_VALUES };
  }
  const findInst = (id: string, fallback: number) =>
    cachedState.instruments?.find((i) => i.id === id)?.numericValue ?? fallback;
  return {
    brentCo1: findInst('brent-co1', BASELINE_VALUES.brentCo1),
    wtiCl1: findInst('wti-cl1', BASELINE_VALUES.wtiCl1),
    datedBrent: findInst('dated-brent', BASELINE_VALUES.datedBrent),
    m1m2: findInst('m1-m2', BASELINE_VALUES.m1m2),
    vlccFreight: findInst('vlcc-freight', BASELINE_VALUES.vlccFreight),
    usdInr: findInst('usd-inr', BASELINE_VALUES.usdInr),
    ttfGas: findInst('ttf-gas', BASELINE_VALUES.ttfGas),
    nifty50: cachedState.snapshot.nifty50 ?? BASELINE_VALUES.nifty50,
    rbiRepoRate: cachedState.snapshot.rbiRepoRate ?? BASELINE_VALUES.rbiRepoRate,
    vix: cachedState.snapshot.vix ?? BASELINE_VALUES.vix,
    moveIndex: cachedState.snapshot.moveIndex ?? BASELINE_VALUES.moveIndex,
    igOasBps: cachedState.snapshot.igOasBps ?? BASELINE_VALUES.igOasBps,
    hyOasBps: cachedState.snapshot.hyOasBps ?? BASELINE_VALUES.hyOasBps,
    goldSpot: cachedState.snapshot.goldSpot ?? BASELINE_VALUES.goldSpot,
    silverSpot: cachedState.snapshot.silverSpot ?? BASELINE_VALUES.silverSpot,
  };
}

async function fetchFromApiNinjas(apiKey: string, forceAll: boolean): Promise<{
  payload: Partial<GroundedMarketPayload>;
  sources: GroundedSource[];
  summaryParts: string[];
  usedUpstreamCalls: number;
}> {
  const nowMs = Date.now();
  const prev = getPreviousMarketValues();
  const coreTtlMs = isWeekendUtc()
    ? WEEKEND_CORE_TTL_MS
    : isActiveWeekdayMarketWindowUtc()
      ? Math.max(CORE_OIL_FX_TTL_MS, cachedState.intervalMinutes * 60 * 1000)
      : OVERNIGHT_CORE_TTL_MS;

  const shouldFetchCore =
    forceAll || lastCoreSyncMs === 0 || nowMs - lastCoreSyncMs >= coreTtlMs - 60_000;
  const shouldFetchEquities =
    forceAll ||
    lastEquitiesSyncMs === 0 ||
    (!isWeekendUtc() && nowMs - lastEquitiesSyncMs >= EQUITIES_TTL_MS);
  const shouldFetchMetalsGas =
    forceAll || lastMetalsGasSyncMs === 0 || nowMs - lastMetalsGasSyncMs >= METALS_GAS_TTL_MS;
  const shouldFetchTreasury =
    forceAll || lastTreasurySyncMs === 0 || nowMs - lastTreasurySyncMs >= TREASURY_TTL_MS;

  const plannedCalls =
    (shouldFetchCore ? 3 : 0) +
    (shouldFetchEquities ? 2 : 0) +
    (shouldFetchMetalsGas ? 3 : 0) +
    (shouldFetchTreasury ? 1 : 0);

  if (plannedCalls === 0) {
    return {
      payload: { ...prev },
      sources: cachedState.sources,
      summaryParts: [],
      usedUpstreamCalls: 0,
    };
  }

  if (!canSpendApiNinjasCalls(plannedCalls)) {
    // Respect daily 95-request safety cap (< 3,000/month) gracefully
    return {
      payload: { ...prev },
      sources: cachedState.sources,
      summaryParts: [`Quota guard active (${dailyApiNinjasCalls}/${MAX_DAILY_API_NINJAS_CALLS} calls today)`],
      usedUpstreamCalls: 0,
    };
  }

  const [brentRes, wtiRes, fxRes] = shouldFetchCore
    ? await Promise.allSettled([
        fetchApiNinjasEndpoint<ApiNinjasCommodityResponse>('/v1/commodityprice?name=brent_crude_oil', apiKey),
        fetchApiNinjasEndpoint<ApiNinjasCommodityResponse>('/v1/commodityprice?name=crude_oil', apiKey),
        fetchApiNinjasEndpoint<ApiNinjasExchangeRateResponse>('/v1/exchangerate?pair=USD_INR', apiKey),
      ])
    : [null, null, null];

  const [niftyRes, vixRes] = shouldFetchEquities
    ? await Promise.allSettled([
        fetchApiNinjasEndpoint<ApiNinjasStockResponse>('/v1/stockprice?ticker=%5ENSEI', apiKey),
        fetchApiNinjasEndpoint<ApiNinjasStockResponse>('/v1/stockprice?ticker=%5EVIX', apiKey),
      ])
    : [null, null];

  const [goldRes, silverRes, natGasRes] = shouldFetchMetalsGas
    ? await Promise.allSettled([
        fetchApiNinjasEndpoint<ApiNinjasCommodityResponse>('/v1/commodityprice?name=gold', apiKey),
        fetchApiNinjasEndpoint<ApiNinjasCommodityResponse>('/v1/commodityprice?name=silver', apiKey),
        fetchApiNinjasEndpoint<ApiNinjasCommodityResponse>('/v1/commodityprice?name=natural_gas', apiKey),
      ])
    : [null, null, null];

  const treasuryRes = shouldFetchTreasury
    ? await fetchApiNinjasEndpoint<ApiNinjasTreasuryResponse>('/v1/treasuryyield', apiKey).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason })
      )
    : null;

  const payload: Partial<GroundedMarketPayload> = {
    brentCo1: prev.brentCo1,
    wtiCl1: prev.wtiCl1,
    usdInr: prev.usdInr,
    nifty50: prev.nifty50,
    vix: prev.vix,
    goldSpot: prev.goldSpot,
    silverSpot: prev.silverSpot,
  };
  const notes: Record<string, string> = {};
  const summaryParts: string[] = [];
  const sources: GroundedSource[] = [
    { title: 'API Ninjas · Commodities (ICE Brent & WTI)', uri: 'https://api-ninjas.com/api/commodityprice' },
    { title: 'API Ninjas · FX Exchange Rate (USD/INR)', uri: 'https://api-ninjas.com/api/exchangerate' },
    { title: 'API Ninjas · Index Quotes (Nifty 50 & VIX)', uri: 'https://api-ninjas.com/api/stockprice' },
    { title: 'API Ninjas · US Treasury Yield Curve', uri: 'https://api-ninjas.com/api/treasuryyield' },
  ];

  let okCount = 0;

  if (brentRes?.status === 'fulfilled' && Number.isFinite(brentRes.value.price)) {
    const b = brentRes.value;
    payload.brentCo1 = Number(b.price!.toFixed(2));
    okCount += 1;
    const pct = Number.isFinite(b.change_24h_percent) ? b.change_24h_percent! : 0;
    const pctLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    const contract = b.futures_contract ? ` · ${b.futures_contract}` : '';
    notes['brent-co1'] = `ICE Brent ${pctLabel} 24h (H: $${Number(b.high_24h ?? b.price).toFixed(2)} / L: $${Number(b.low_24h ?? b.price).toFixed(2)}${contract})`;
  }

  if (wtiRes?.status === 'fulfilled' && Number.isFinite(wtiRes.value.price)) {
    const w = wtiRes.value;
    payload.wtiCl1 = Number(w.price!.toFixed(2));
    okCount += 1;
    const pct = Number.isFinite(w.change_24h_percent) ? w.change_24h_percent! : 0;
    const pctLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    const brentVal = payload.brentCo1 ?? prev.brentCo1;
    const spread = brentVal - payload.wtiCl1;
    notes['wti-cl1'] = `CME WTI ${pctLabel} 24h · $${Math.abs(spread).toFixed(2)} ${spread >= 0 ? 'discount' : 'premium'} vs Brent`;
  }

  if (fxRes?.status === 'fulfilled' && Number.isFinite(fxRes.value.exchange_rate)) {
    payload.usdInr = Number(fxRes.value.exchange_rate!.toFixed(2));
    okCount += 1;
    const cushion = 95 - payload.usdInr;
    notes['usd-inr'] =
      cushion > 0
        ? `Live FX spot · ${cushion.toFixed(2)} INR cushion below 95.00 stress line`
        : `Live FX spot · ${Math.abs(cushion).toFixed(2)} INR above 95.00 stress line`;
  }

  if (shouldFetchCore && okCount > 0) {
    lastCoreSyncMs = nowMs;
  }

  let equitiesOk = 0;
  if (niftyRes?.status === 'fulfilled' && Number.isFinite(niftyRes.value.price)) {
    payload.nifty50 = Math.round(niftyRes.value.price!);
    equitiesOk += 1;
    okCount += 1;
  }
  if (vixRes?.status === 'fulfilled' && Number.isFinite(vixRes.value.price)) {
    payload.vix = Number(vixRes.value.price!.toFixed(2));
    equitiesOk += 1;
    okCount += 1;
  }
  if (shouldFetchEquities && equitiesOk > 0) {
    lastEquitiesSyncMs = nowMs;
  }

  let metalsOk = 0;
  if (goldRes?.status === 'fulfilled' && Number.isFinite(goldRes.value.price)) {
    payload.goldSpot = Math.round(goldRes.value.price!);
    metalsOk += 1;
    okCount += 1;
  }
  if (silverRes?.status === 'fulfilled' && Number.isFinite(silverRes.value.price)) {
    payload.silverSpot = Number(silverRes.value.price!.toFixed(2));
    metalsOk += 1;
    okCount += 1;
  }
  if (natGasRes?.status === 'fulfilled' && Number.isFinite(natGasRes.value.price)) {
    cachedNatGasPrice = Number(natGasRes.value.price!.toFixed(2));
    metalsOk += 1;
    okCount += 1;
    notes['ttf-gas'] = `US Henry Hub live $${cachedNatGasPrice.toFixed(2)}/MMBtu · European TTF baseline €85.31/MWh`;
  }
  if (shouldFetchMetalsGas && metalsOk > 0) {
    lastMetalsGasSyncMs = nowMs;
  }

  if (treasuryRes?.status === 'fulfilled' && Number.isFinite(treasuryRes.value.rates?.year_10)) {
    cachedUs10Y = Number(treasuryRes.value.rates!.year_10!.toFixed(2));
    lastTreasurySyncMs = nowMs;
    okCount += 1;
  }

  if (okCount === 0) {
    const firstRejection = [brentRes, wtiRes, fxRes, niftyRes, goldRes].find(
      (r): r is PromiseRejectedResult => Boolean(r && r.status === 'rejected')
    );
    throw new Error(
      firstRejection?.reason instanceof Error
        ? firstRejection.reason.message
        : 'API Ninjas did not return any valid live market quotes.'
    );
  }

  summaryParts.push(`Brent $${(payload.brentCo1 ?? prev.brentCo1).toFixed(2)}/bbl`);
  summaryParts.push(`WTI $${(payload.wtiCl1 ?? prev.wtiCl1).toFixed(2)}/bbl`);
  summaryParts.push(`USD/INR ${(payload.usdInr ?? prev.usdInr).toFixed(2)}`);
  summaryParts.push(`Nifty 50 ${(payload.nifty50 ?? prev.nifty50).toLocaleString('en-IN')}`);
  summaryParts.push(`VIX ${(payload.vix ?? prev.vix).toFixed(2)}`);
  summaryParts.push(`Gold $${(payload.goldSpot ?? prev.goldSpot).toLocaleString('en-US')}/oz`);
  summaryParts.push(`Silver $${(payload.silverSpot ?? prev.silverSpot).toFixed(2)}/oz`);
  if (cachedNatGasPrice !== null) {
    summaryParts.push(`Nat Gas $${cachedNatGasPrice.toFixed(2)}/MMBtu`);
  }
  if (cachedUs10Y !== null) {
    summaryParts.push(`US 10Y ${cachedUs10Y.toFixed(2)}%`);
  }

  payload.notes = notes;
  return { payload, sources, summaryParts, usedUpstreamCalls: plannedCalls };
}

function formatIstTimestamp(date: Date): string {
  try {
    const datePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
    const timePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
    return `${datePart} · ${timePart} IST`.slice(0, 80);
  } catch {
    return date.toISOString();
  }
}

function formatInstrumentValue(id: string, num: number): string {
  if (id === 'm1-m2') {
    const sign = num >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(num).toFixed(2)}`;
  }
  if (id === 'vlcc-freight') {
    return `~$${Math.round(num)}/bbl`;
  }
  if (id === 'usd-inr') {
    return num.toFixed(2);
  }
  if (id === 'ttf-gas') {
    return `€${num.toFixed(2)}/MWh`;
  }
  return `$${num.toFixed(2)}`;
}

function evaluateInstrumentSignal(
  id: string,
  num: number
): { signal: SignalLevel; signalLabel: string } {
  if (id === 'm1-m2') {
    if (num > 2.5) return { signal: 'danger', signalLabel: 'Danger' };
    if (num >= 1.5) return { signal: 'watch', signalLabel: 'Watch' };
    return { signal: 'relief', signalLabel: 'Relief' };
  }
  if (id === 'usd-inr') {
    if (num >= 95.0) return { signal: 'danger', signalLabel: 'Danger' };
    if (num >= 94.0) return { signal: 'watch', signalLabel: 'Watch' };
    return { signal: 'relief', signalLabel: 'Relief' };
  }
  if (id === 'vlcc-freight') {
    if (num >= 18) return { signal: 'danger', signalLabel: 'Danger' };
    if (num >= 12) return { signal: 'watch', signalLabel: 'Watch' };
    return { signal: 'relief', signalLabel: 'Relief' };
  }
  if (id === 'brent-co1' || id === 'dated-brent') {
    if (num >= 105) return { signal: 'danger', signalLabel: 'Danger' };
    if (num >= 85) return { signal: 'watch', signalLabel: 'Watch' };
    return { signal: 'relief', signalLabel: 'Relief' };
  }
  if (id === 'wti-cl1') {
    if (num >= 98) return { signal: 'danger', signalLabel: 'Danger' };
    if (num >= 80) return { signal: 'watch', signalLabel: 'Watch' };
    return { signal: 'relief', signalLabel: 'Relief' };
  }
  if (id === 'ttf-gas') {
    if (num >= 110) return { signal: 'danger', signalLabel: 'Danger' };
    if (num >= 95) return { signal: 'watch', signalLabel: 'Watch' };
    return { signal: 'relief', signalLabel: 'Relief' };
  }
  return { signal: 'watch', signalLabel: 'Watch' };
}

function extractJsonObject(rawText: string): GroundedMarketPayload | null {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as GroundedMarketPayload;
  } catch {
    return null;
  }
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Number(num.toFixed(2))));
}

function buildInstrumentsFromPayload(payload: GroundedMarketPayload): OilInstrument[] {
  const defs: Array<{
    id: string;
    name: string;
    ticker: string;
    unit: string;
    numericValue: number;
    isPmCore?: boolean;
  }> = [
    {
      id: 'brent-co1',
      name: 'Brent CO1',
      ticker: 'CO1 Comdty',
      unit: 'USD/bbl',
      numericValue: sanitizeNumber(payload.brentCo1, 92.69, 25, 220),
      isPmCore: true,
    },
    {
      id: 'wti-cl1',
      name: 'WTI CL1',
      ticker: 'CL1 Comdty',
      unit: 'USD/bbl',
      numericValue: sanitizeNumber(payload.wtiCl1, 85.08, 20, 210),
    },
    {
      id: 'm1-m2',
      name: 'M1–M2 Backwardation',
      ticker: 'CO1–CO2',
      unit: 'USD/bbl',
      numericValue: sanitizeNumber(payload.m1m2, 2.73, -5, 15),
      isPmCore: true,
    },
    {
      id: 'dated-brent',
      name: 'Dated Brent',
      ticker: 'PCAAS00',
      unit: 'USD/bbl',
      numericValue: sanitizeNumber(payload.datedBrent, 93.03, 25, 230),
      isPmCore: true,
    },
    {
      id: 'vlcc-freight',
      name: 'VLCC Freight',
      ticker: 'TD3C / Gulf-India',
      unit: 'USD/bbl',
      numericValue: sanitizeNumber(payload.vlccFreight, 20, 2, 60),
    },
    {
      id: 'usd-inr',
      name: 'USD/INR',
      ticker: 'INR Spot',
      unit: 'INR per USD',
      numericValue: sanitizeNumber(payload.usdInr, 93.41, 70, 120),
    },
    {
      id: 'ttf-gas',
      name: 'TTF Gas',
      ticker: 'TZT1 Comdty',
      unit: 'EUR/MWh',
      numericValue: sanitizeNumber(payload.ttfGas, 85.31, 10, 300),
    },
  ];

  return defs.map((def) => {
    const { signal, signalLabel } = evaluateInstrumentSignal(def.id, def.numericValue);
    const customNote = payload.notes?.[def.id];
    const interpretation = (
      typeof customNote === 'string' && customNote.trim().length > 3
        ? customNote.trim()
        : DEFAULT_NOTES[def.id]
    ).slice(0, 240);

    return {
      id: def.id,
      name: def.name,
      ticker: def.ticker,
      value: formatInstrumentValue(def.id, def.numericValue),
      numericValue: def.numericValue,
      unit: def.unit,
      signal,
      signalLabel,
      interpretation,
      isPmCore: def.isPmCore,
    };
  });
}

async function persistSyncToCloudSql(
  triggeredBy: string,
  intervalMinutes: number,
  status: 'success' | 'error' | 'quota-guard',
  summary: string,
  sources: GroundedSource[],
  instruments: OilInstrument[]
): Promise<void> {
  if (!isSqlConfigured()) return;
  try {
    const [run] = await db
      .insert(marketSyncRuns)
      .values({
        triggeredBy,
        intervalMinutes,
        status,
        summary: summary.slice(0, 500),
        sourcesJson: JSON.stringify(sources.slice(0, 10)),
      })
      .returning();

    if (run && status === 'success' && instruments.length > 0) {
      await db.insert(marketQuoteHistory).values(
        instruments.map((inst) => ({
          syncRunId: run.id,
          instrumentId: inst.id,
          instrumentName: inst.name,
          ticker: inst.ticker,
          displayValue: inst.value,
          numericValue: inst.numericValue,
          signal: inst.signal,
          interpretation: inst.interpretation,
        }))
      );
    }
  } catch (err) {
    console.error('Failed to persist market sync run to Cloud SQL:', err);
  }
}

export async function runGoogleMarketSync(
  triggeredBy: 'scheduler' | 'manual' | 'startup' | 'client-background' = 'manual',
  force: boolean = triggeredBy === 'manual'
): Promise<LiveGoogleMarketState> {
  if (inFlightSync) {
    return inFlightSync;
  }

  // Respect cache freshness to protect the 3,000 requests/month API Ninjas quota
  const minFreshWindowMs = Math.max(
    (MIN_SYNC_INTERVAL_MINUTES - 1) * 60 * 1000,
    (cachedState.intervalMinutes - 1) * 60 * 1000
  );
  if (
    !force &&
    cachedState.isGrounded &&
    cachedState.lastSyncedAt &&
    Date.now() - new Date(cachedState.lastSyncedAt).getTime() < minFreshWindowMs
  ) {
    return cachedState;
  }

  inFlightSync = (async () => {
    const apiNinjasKey = process.env.API_NINJAS_KEY?.trim();
    const ai = createAiClient();
    const nextRunMs = Date.now() + cachedState.intervalMinutes * 60 * 1000;
    const nextSyncIso = new Date(nextRunMs).toISOString();

    if (!apiNinjasKey && !ai) {
      cachedState = {
        ...cachedState,
        status: 'error',
        nextSyncAt: nextSyncIso,
        syncError: 'Configure API_NINJAS_KEY or GEMINI_API_KEY in server environment.',
      };
      return cachedState;
    }

    cachedState = {
      ...cachedState,
      status: 'syncing',
      syncError: null,
    };

    try {
      const mergedPayload: GroundedMarketPayload = {
        ...getPreviousMarketValues(),
        summary: '',
        notes: {},
      };
      const sourcesMap = new Map<string, GroundedSource>();
      let ninjasSummaryParts: string[] = [];
      let usedApiCalls = 0;

      // 1. Tiered live feed via API Ninjas (conserves 3,000 req/month free quota)
      if (apiNinjasKey) {
        const ninjas = await fetchFromApiNinjas(apiNinjasKey, force);
        usedApiCalls = ninjas.usedUpstreamCalls;
        Object.assign(mergedPayload, {
          ...ninjas.payload,
          notes: { ...mergedPayload.notes, ...ninjas.payload.notes },
        });
        ninjasSummaryParts = ninjas.summaryParts;
        for (const src of ninjas.sources) {
          if (!sourcesMap.has(src.uri)) {
            sourcesMap.set(src.uri, src);
          }
        }
        if (usedApiCalls === 0 && cachedState.isGrounded) {
          if (dailyApiNinjasCalls >= MAX_DAILY_API_NINJAS_CALLS) {
            await persistSyncToCloudSql(
              triggeredBy,
              cachedState.intervalMinutes,
              'quota-guard',
              `Skipped upstream fetch at daily quota guard (${dailyApiNinjasCalls}/${MAX_DAILY_API_NINJAS_CALLS} calls used today).`,
              cachedState.sources,
              []
            );
          }
          cachedState = {
            ...cachedState,
            dailyCallsUsed: dailyApiNinjasCalls,
            dailyCallsLimit: MAX_DAILY_API_NINJAS_CALLS,
            status: 'ready',
            nextSyncAt: nextSyncIso,
          };
          return cachedState;
        }
      }

      // 2. Optional Google Search Grounding enrichment for spreads (Dated Brent, M1-M2, VLCC, OAS, MOVE)
      let geminiSummary = '';
      if (ai) {
        try {
          const prompt = [
            'Use Google Search to fetch the latest live or most recent closing market quotes as of right now.',
            'Return ONLY a single valid JSON object (no markdown commentary outside JSON) with these numeric fields:',
            '{',
            '  "brentCo1": number, // ICE Brent Crude price USD/bbl',
            '  "wtiCl1": number, // NYMEX WTI Crude price USD/bbl',
            '  "datedBrent": number, // Dated Brent price USD/bbl (or estimate closely aligned to Brent)',
            '  "m1m2": number, // Brent prompt M1-M2 futures spread in USD/bbl',
            '  "vlccFreight": number, // VLCC Middle East to Asia crude freight USD/bbl equivalent',
            '  "usdInr": number, // USD to INR spot exchange rate',
            '  "ttfGas": number, // Dutch TTF Natural Gas EUR/MWh',
            '  "nifty50": number, // NSE Nifty 50 index level',
            '  "rbiRepoRate": number, // RBI Policy Repo Rate % (e.g. 5.5 or 6.25)',
            '  "vix": number, // CBOE VIX index level',
            '  "moveIndex": number, // ICE BofA MOVE bond volatility index level',
            '  "igOasBps": number, // US Investment Grade corporate OAS spread in bps',
            '  "hyOasBps": number, // US High Yield corporate OAS spread in bps',
            '  "goldSpot": number, // Gold spot price XAU/USD per oz',
            '  "silverSpot": number, // Silver spot price XAG/USD per oz',
            '  "summary": string, // 1 concise analyst sentence summarizing live moves found via Google Search',
            '  "notes": {',
            '    "brent-co1": string,',
            '    "wti-cl1": string,',
            '    "m1-m2": string,',
            '    "dated-brent": string,',
            '    "vlcc-freight": string,',
            '    "usd-inr": string,',
            '    "ttf-gas": string',
            '  }',
            '}',
          ].join('\n');

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });

          const rawText = response.text ?? '';
          const parsedGemini = extractJsonObject(rawText);

          if (parsedGemini) {
            // Preserve deterministic API Ninjas exchange quotes if present
            const preservedNotes = { ...mergedPayload.notes };
            const combined = {
              ...mergedPayload,
              ...parsedGemini,
              ...(apiNinjasKey
                ? {
                    brentCo1: mergedPayload.brentCo1,
                    wtiCl1: mergedPayload.wtiCl1,
                    usdInr: mergedPayload.usdInr,
                    nifty50: mergedPayload.nifty50,
                    vix: mergedPayload.vix,
                    goldSpot: mergedPayload.goldSpot,
                    silverSpot: mergedPayload.silverSpot,
                  }
                : {}),
              notes: { ...(parsedGemini.notes ?? {}), ...preservedNotes },
            };
            Object.assign(mergedPayload, combined);
            if (typeof parsedGemini.summary === 'string' && parsedGemini.summary.trim().length > 5) {
              geminiSummary = parsedGemini.summary.trim();
            }
          }

          const groundingChunks =
            response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          for (const chunk of groundingChunks) {
            const uri = chunk?.web?.uri;
            const title = chunk?.web?.title;
            if (uri && !sourcesMap.has(uri)) {
              sourcesMap.set(uri, {
                title: title || uri,
                uri,
              });
            }
          }
        } catch (geminiErr) {
          // If API Ninjas succeeded, do not fail the whole sync because Gemini hit quota
          if (!apiNinjasKey) {
            throw geminiErr;
          }
        }
      }

      const sources = Array.from(sourcesMap.values()).slice(0, 8);
      const summary = (
        geminiSummary ||
        (ninjasSummaryParts.length > 0
          ? `Live market sync (API Ninjas): ${ninjasSummaryParts.join(' · ')}.`
          : 'Live energy, FX, and macro indicators refreshed.')
      ).slice(0, 480);

      const sourceUrls = sources
        .map((s) => s.uri.slice(0, 300))
        .filter((u) => u.length > 0)
        .slice(0, 8);

      const instruments = buildInstrumentsFromPayload(mergedPayload);
      const now = new Date();
      const snapshot: MarketSnapshotData = {
        id: 'current',
        updatedLabel: formatIstTimestamp(now),
        nifty50: Math.round(sanitizeNumber(mergedPayload.nifty50, 25371, 10000, 60000)),
        rbiRepoRate: sanitizeNumber(mergedPayload.rbiRepoRate, 5.5, 2, 12),
        igOasBps: Math.round(sanitizeNumber(mergedPayload.igOasBps, 88, 30, 500)),
        hyOasBps: Math.round(sanitizeNumber(mergedPayload.hyOasBps, 320, 120, 1500)),
        vix: sanitizeNumber(mergedPayload.vix, 18.38, 8, 90),
        moveIndex: sanitizeNumber(mergedPayload.moveIndex, 92.43, 35, 220),
        goldSpot: Math.round(sanitizeNumber(mergedPayload.goldSpot, 3945, 1500, 8000)),
        silverSpot: sanitizeNumber(mergedPayload.silverSpot, 51.27, 15, 200),
        ...(cachedUs10Y !== null ? { us10yYield: cachedUs10Y } : {}),
        ...(cachedNatGasPrice !== null ? { natGasSpot: cachedNatGasPrice } : {}),
        macroSummary: summary,
        sourceUrls,
        isPublic: true,
      };

      await persistSyncToCloudSql(
        triggeredBy,
        cachedState.intervalMinutes,
        'success',
        summary,
        sources,
        instruments
      );

      cachedState = {
        isGrounded: true,
        dataSourceKind: 'live-api',
        dailyCallsUsed: dailyApiNinjasCalls,
        dailyCallsLimit: MAX_DAILY_API_NINJAS_CALLS,
        status: 'ready',
        intervalMinutes: cachedState.intervalMinutes,
        lastSyncedAt: now.toISOString(),
        nextSyncAt: new Date(Date.now() + cachedState.intervalMinutes * 60 * 1000).toISOString(),
        summary,
        sources,
        syncError: null,
        instruments,
        snapshot,
      };
      return cachedState;
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'Live market data sync failed.';
      let cleanMessage = rawMessage;
      try {
        const parsedErr = JSON.parse(rawMessage) as {
          error?: { code?: number; message?: string; status?: string };
        };
        if (parsedErr?.error?.message) {
          cleanMessage = parsedErr.error.message;
        }
      } catch {
        // Keep rawMessage as-is when not a JSON error payload
      }
      await persistSyncToCloudSql(
        triggeredBy,
        cachedState.intervalMinutes,
        'error',
        cleanMessage,
        [],
        []
      );
      cachedState = {
        ...cachedState,
        dataSourceKind: cachedState.isGrounded ? cachedState.dataSourceKind : 'error',
        dailyCallsUsed: dailyApiNinjasCalls,
        dailyCallsLimit: MAX_DAILY_API_NINJAS_CALLS,
        status: 'error',
        nextSyncAt: nextSyncIso,
        syncError: cleanMessage,
      };
      return cachedState;
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

export function getLiveGoogleMarketState(): LiveGoogleMarketState {
  resetDailyCounterIfNeeded();
  return {
    ...cachedState,
    dailyCallsUsed: dailyApiNinjasCalls,
    dailyCallsLimit: MAX_DAILY_API_NINJAS_CALLS,
  };
}

export function setGoogleSyncIntervalMinutes(minutes: number): LiveGoogleMarketState {
  const clamped = Math.min(
    MAX_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(minutes))
  );
  cachedState = {
    ...cachedState,
    intervalMinutes: clamped,
    nextSyncAt: new Date(Date.now() + clamped * 60 * 1000).toISOString(),
  };
  startGoogleMarketScheduler(clamped);
  return cachedState;
}

export function startGoogleMarketScheduler(intervalMinutes: number = cachedState.intervalMinutes) {
  const clamped = Math.min(
    MAX_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(intervalMinutes))
  );
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  cachedState = {
    ...cachedState,
    intervalMinutes: clamped,
    nextSyncAt: new Date(Date.now() + clamped * 60 * 1000).toISOString(),
  };

  schedulerTimer = setInterval(() => {
    void runGoogleMarketSync('scheduler', false);
  }, clamped * 60 * 1000);
}

/**
 * On cold start, hydrate in-memory cache from the latest Cloud SQL sync run
 * so container restarts inside the 60-minute cache window cost 0 API Ninjas calls.
 */
export async function hydrateMarketCacheFromSql(): Promise<void> {
  if (!isSqlConfigured()) return;
  try {
    const [latestRun] = await db
      .select()
      .from(marketSyncRuns)
      .orderBy(desc(marketSyncRuns.createdAt))
      .limit(1);

    if (!latestRun || latestRun.status !== 'success') return;

    const quoteRows = await db
      .select()
      .from(marketQuoteHistory)
      .where(eq(marketQuoteHistory.syncRunId, latestRun.id));

    if (quoteRows.length === 0) return;

    const ageMs = Date.now() - latestRun.createdAt.getTime();
    if (ageMs > EQUITIES_TTL_MS) return;

    const rowMap = new Map(quoteRows.map((q) => [q.instrumentId, q]));
    const summaryText = latestRun.summary || '';
    const extractMetric = (regex: RegExp, fallback: number): number => {
      const m = summaryText.match(regex);
      if (!m) return fallback;
      const n = Number(m[1].replace(/,/g, ''));
      return Number.isFinite(n) ? n : fallback;
    };

    const hydratedPayload: GroundedMarketPayload = {
      brentCo1: rowMap.get('brent-co1')?.numericValue ?? BASELINE_VALUES.brentCo1,
      wtiCl1: rowMap.get('wti-cl1')?.numericValue ?? BASELINE_VALUES.wtiCl1,
      datedBrent: rowMap.get('dated-brent')?.numericValue ?? BASELINE_VALUES.datedBrent,
      m1m2: rowMap.get('m1-m2')?.numericValue ?? BASELINE_VALUES.m1m2,
      vlccFreight: rowMap.get('vlcc-freight')?.numericValue ?? BASELINE_VALUES.vlccFreight,
      usdInr: rowMap.get('usd-inr')?.numericValue ?? BASELINE_VALUES.usdInr,
      ttfGas: rowMap.get('ttf-gas')?.numericValue ?? BASELINE_VALUES.ttfGas,
      nifty50: Math.round(extractMetric(/Nifty 50 ([\d,]+)/i, BASELINE_VALUES.nifty50)),
      rbiRepoRate: BASELINE_VALUES.rbiRepoRate,
      vix: extractMetric(/VIX ([\d.]+)/i, BASELINE_VALUES.vix),
      moveIndex: BASELINE_VALUES.moveIndex,
      igOasBps: BASELINE_VALUES.igOasBps,
      hyOasBps: BASELINE_VALUES.hyOasBps,
      goldSpot: Math.round(extractMetric(/Gold \$([\d,]+)/i, BASELINE_VALUES.goldSpot)),
      silverSpot: extractMetric(/Silver \$([\d.]+)/i, BASELINE_VALUES.silverSpot),
      summary: summaryText,
      notes: Object.fromEntries(quoteRows.map((q) => [q.instrumentId, q.interpretation])),
    };

    let parsedSources: GroundedSource[] = [];
    try {
      parsedSources = JSON.parse(latestRun.sourcesJson) as GroundedSource[];
    } catch {
      parsedSources = [];
    }

    const hydratedUs10y = extractMetric(/US 10Y ([\d.]+)%/i, 5.01);
    const hydratedNatGas = extractMetric(/Nat Gas \$([\d.]+)/i, 0);
    if (Number.isFinite(hydratedUs10y)) cachedUs10Y = hydratedUs10y;
    if (hydratedNatGas > 0) cachedNatGasPrice = hydratedNatGas;

    const instruments = buildInstrumentsFromPayload(hydratedPayload);
    const syncedAtMs = latestRun.createdAt.getTime();
    lastCoreSyncMs = syncedAtMs;
    lastEquitiesSyncMs = syncedAtMs;
    lastMetalsGasSyncMs = syncedAtMs;
    lastTreasurySyncMs = syncedAtMs;

    cachedState = {
      isGrounded: true,
      dataSourceKind: 'sql-cache',
      dailyCallsUsed: dailyApiNinjasCalls,
      dailyCallsLimit: MAX_DAILY_API_NINJAS_CALLS,
      status: 'ready',
      intervalMinutes: cachedState.intervalMinutes,
      lastSyncedAt: latestRun.createdAt.toISOString(),
      nextSyncAt: new Date(
        Math.max(Date.now() + 60_000, syncedAtMs + cachedState.intervalMinutes * 60 * 1000)
      ).toISOString(),
      summary: summaryText,
      sources: Array.isArray(parsedSources) ? parsedSources : [],
      syncError: null,
      instruments,
      snapshot: {
        id: 'current',
        updatedLabel: formatIstTimestamp(latestRun.createdAt),
        nifty50: hydratedPayload.nifty50,
        rbiRepoRate: hydratedPayload.rbiRepoRate,
        igOasBps: hydratedPayload.igOasBps,
        hyOasBps: hydratedPayload.hyOasBps,
        vix: hydratedPayload.vix,
        moveIndex: hydratedPayload.moveIndex,
        goldSpot: hydratedPayload.goldSpot,
        silverSpot: hydratedPayload.silverSpot,
        us10yYield: hydratedUs10y,
        ...(hydratedNatGas > 0 ? { natGasSpot: hydratedNatGas } : {}),
        macroSummary: summaryText,
        sourceUrls: parsedSources.map((s) => s.uri).slice(0, 8),
        isPublic: true,
      },
    };
  } catch (err) {
    console.warn('Could not hydrate market cache from Cloud SQL:', err);
  }
}

export async function getRecentSyncRunsFromSql(): Promise<MarketSyncRunItem[]> {
  if (!isSqlConfigured()) return [];
  try {
    const runs = await db
      .select()
      .from(marketSyncRuns)
      .orderBy(desc(marketSyncRuns.createdAt))
      .limit(20);

    if (runs.length === 0) return [];

    const runIds = runs.map((r) => r.id);
    const quoteRows = await db
      .select()
      .from(marketQuoteHistory)
      .where(inArray(marketQuoteHistory.syncRunId, runIds));

    const quotesByRun = new Map<number, MarketSyncRunQuoteSummary>();
    for (const q of quoteRows) {
      const existing = quotesByRun.get(q.syncRunId) ?? {};
      if (q.instrumentId === 'brent-co1') existing.brent = q.displayValue;
      if (q.instrumentId === 'wti-cl1') existing.wti = q.displayValue;
      if (q.instrumentId === 'usd-inr') existing.usdInr = q.displayValue;
      quotesByRun.set(q.syncRunId, existing);
    }

    return runs.map((r) => {
      let parsedSources: GroundedSource[] = [];
      try {
        parsedSources = JSON.parse(r.sourcesJson) as GroundedSource[];
      } catch {
        parsedSources = [];
      }
      return {
        id: r.id,
        triggeredBy: r.triggeredBy,
        intervalMinutes: r.intervalMinutes,
        status: r.status,
        summary: r.summary,
        sources: Array.isArray(parsedSources) ? parsedSources : [],
        quotes: quotesByRun.get(r.id),
        createdAt: r.createdAt.toISOString(),
      };
    });
  } catch (error) {
    console.error('Database query failed for sync history:', error);
    throw new Error('Failed to load sync history log.', { cause: error });
  }
}
