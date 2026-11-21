export type SignalLevel = 'relief' | 'watch' | 'danger';

export type DeskPageId =
  | 'home'
  | 'oil-dashboard'
  | 'war-room'
  | 'india-transmission'
  | 'capital-markets'
  | 'policy-desk';

export type SectionId =
  | 'oil-dashboard'
  | 'war-room'
  | 'india-transmission'
  | 'capital-markets'
  | 'policy-desk'
  | 'full-brief';

export type DataSourceKind = 'live-api' | 'sql-cache' | 'baseline-only' | 'error';

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface MarketSyncRunQuoteSummary {
  brent?: string;
  wti?: string;
  usdInr?: string;
}

export interface MarketSyncRunItem {
  id: number;
  triggeredBy: string;
  intervalMinutes: number;
  status: string;
  summary: string;
  sources: GroundedSource[];
  quotes?: MarketSyncRunQuoteSummary;
  createdAt: string;
}

export interface AnalystNoteItem {
  id: number;
  sectionId: string;
  note: string;
  createdAt: string;
}

export interface OilInstrument {
  id: string;
  name: string;
  ticker: string;
  value: string;
  numericValue: number;
  unit: string;
  signal: SignalLevel;
  signalLabel: string;
  interpretation: string;
  isPmCore?: boolean;
}

export interface BrentJourneyPoint {
  date: string;
  price: number;
  catalyst: string;
  note: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  detail: string;
  category: 'military' | 'diplomacy' | 'market';
  brentTag?: string;
  signal: SignalLevel;
}

export interface WarStatusItem {
  id: string;
  label: string;
  status: string;
  signal: SignalLevel;
  detail: string;
}

export interface ScenarioItem {
  id: 'deal' | 'limbo' | 'strike';
  name: string;
  brentRange: string;
  brentMid: number;
  vlccAssumption: number;
  inrImpact: string;
  probability: number;
  signal: SignalLevel;
  isBaseCase?: boolean;
  trigger: string;
}

export interface TransmissionStep {
  id: string;
  label: string;
  direction: 'up' | 'down' | 'neutral';
  signal: SignalLevel;
  statusText: string;
}

export interface ImportMixItem {
  source: string;
  shareNov: number;
  shareJul: number;
  note: string;
  colorClass: string;
}

export interface CreditMetric {
  id: string;
  name: string;
  ticker: string;
  value: string;
  watchThreshold: string;
  signal: SignalLevel;
  statusLabel: string;
  interpretation: string;
}

export interface DataCenterDeal {
  company: string;
  amountBn: number;
  capacity: string;
  location: string;
  note: string;
}

export interface PolicyDateItem {
  date: string;
  event: string;
  impact: string;
  signal: SignalLevel;
}

export interface MarketSnapshotData {
  id: string;
  updatedLabel: string;
  nifty50: number;
  rbiRepoRate: number;
  igOasBps: number;
  hyOasBps: number;
  vix: number;
  moveIndex: number;
  goldSpot: number;
  silverSpot: number;
  us10yYield?: number;
  natGasSpot?: number;
  macroSummary?: string;
  sourceUrls?: string[];
  isPublic?: boolean;
  updatedByUid?: string;
}

export type AlertDirection = 'above' | 'below';

export interface PriceAlertConfig {
  id: string;
  ownerUid: string;
  instrumentId: string;
  instrumentName: string;
  direction: AlertDirection;
  thresholdPrice: number;
  notifyBrowser: boolean;
  notifyEmail: boolean;
  emailAddress: string;
  isActive: boolean;
  lastTriggeredPrice?: number;
  triggeredAtIso?: string;
}

export interface TriggeredAlertNotice {
  alertId: string;
  instrumentId: string;
  instrumentName: string;
  direction: AlertDirection;
  thresholdPrice: number;
  currentPrice: number;
  formattedPrice: string;
  notifyBrowser: boolean;
  notifyEmail: boolean;
  emailAddress: string;
  triggeredAtIso: string;
}

