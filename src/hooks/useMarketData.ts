import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRIEF_META, OIL_INSTRUMENTS } from '../data/macroData';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import type {
  AlertDirection,
  AnalystNoteItem,
  DataSourceKind,
  GroundedSource,
  MarketSnapshotData,
  MarketSyncRunItem,
  OilInstrument,
  PriceAlertConfig,
  SignalLevel,
  TriggeredAlertNotice,
} from '../types/macro';

export const DEFAULT_SNAPSHOT: MarketSnapshotData = {
  id: 'current',
  updatedLabel: BRIEF_META.updatedAt,
  nifty50: 25371,
  rbiRepoRate: 5.5,
  igOasBps: 88,
  hyOasBps: 320,
  vix: 18.38,
  moveIndex: 92.43,
  goldSpot: 3945,
  silverSpot: 51.27,
  us10yYield: 5.01,
  isPublic: true,
};

interface LiveApiResponse {
  isGrounded: boolean;
  dataSourceKind?: DataSourceKind;
  dailyCallsUsed?: number;
  dailyCallsLimit?: number;
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

function formatIstNow(): string {
  try {
    const now = new Date();
    const datePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(now);
    const timePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now);
    return `${datePart} · ${timePart} IST`.slice(0, 80);
  } catch {
    return BRIEF_META.updatedAt;
  }
}

function sanitizePositive(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function sanitizeNonNegative(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function normalizeLabel(label: string | undefined): string {
  const trimmed = (label ?? '').trim();
  const base = trimmed.length >= 4 ? trimmed : formatIstNow();
  return base.slice(0, 80);
}

function normalizeSummary(summary: string | undefined): string {
  const trimmed = (summary ?? '').trim();
  if (trimmed.length >= 3) return trimmed.slice(0, 500);
  return 'Live energy, FX, and macro updates synced via Google Search Grounding.';
}

function normalizeSourceUrls(sources: GroundedSource[], rawUrls?: string[]): string[] {
  const collected =
    sources.length > 0
      ? sources.map((s) => s.uri)
      : Array.isArray(rawUrls)
        ? rawUrls
        : [];
  const unique: string[] = [];
  for (const url of collected) {
    if (typeof url !== 'string') continue;
    const clean = url.trim().slice(0, 300);
    if (clean && !unique.includes(clean)) {
      unique.push(clean);
    }
    if (unique.length >= 8) break;
  }
  return unique;
}

const LOCAL_ALERTS_KEY = 'macrolens.localAlerts.v1';

function readLocalAlerts(): PriceAlertConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PriceAlertConfig =>
        Boolean(item) &&
        typeof item.instrumentId === 'string' &&
        typeof item.thresholdPrice === 'number' &&
        Number.isFinite(item.thresholdPrice)
    );
  } catch {
    return [];
  }
}

function writeLocalAlerts(alerts: PriceAlertConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(alerts));
  } catch {
    // ignore storage quota errors
  }
}

function dispatchBrowserNotification(
  inst: OilInstrument,
  direction: AlertDirection,
  thresholdPrice: number
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const opLabel = direction === 'above' ? 'rose above' : 'dropped below';
  try {
    new Notification(`MacroLens Alert · ${inst.name}`, {
      body: `${inst.name} (${inst.ticker}) ${opLabel} your target ${thresholdPrice} — now ${inst.value}.`,
      tag: `macrolens-alert-${inst.id}`,
    });
  } catch {
    // Ignore restricted iframe notification constructors gracefully
  }
}

export interface SavePriceAlertInput {
  instrument: OilInstrument;
  direction: AlertDirection;
  thresholdPrice: number;
  notifyBrowser: boolean;
  notifyEmail: boolean;
  emailAddress: string;
  isActive: boolean;
}

export interface UseMarketDataResult {
  instruments: OilInstrument[];
  snapshot: MarketSnapshotData;
  derived: {
    brentCo1: number;
    datedBrent: number;
    m1m2: number;
    vlccFreight: number;
    usdInr: number;
    datedVsCo1Gap: number;
  };
  loading: boolean;
  isRefreshingMetrics: boolean;
  isLiveFromDb: boolean;
  isGoogleGrounded: boolean;
  dataSourceKind: DataSourceKind;
  dailyCallsUsed: number;
  dailyCallsLimit: number;
  googleStatus: 'idle' | 'syncing' | 'ready' | 'error';
  googleSummary: string;
  googleSources: GroundedSource[];
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  syncHistory: MarketSyncRunItem[];
  analystNotes: AnalystNoteItem[];
  priceAlerts: PriceAlertConfig[];
  triggeredAlerts: TriggeredAlertNotice[];
  lastSyncedAt: string | null;
  lastApiSyncIso: string | null;
  syncError: string | null;
  isBusy: boolean;
  user: User | null;
  authReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshFromGoogleSearch: () => Promise<void>;
  reloadSyncHistory: () => Promise<void>;
  setSyncIntervalMinutes: (minutes: number) => Promise<void>;
  addAnalystNote: (sectionId: string, note: string) => Promise<boolean>;
  savePriceAlert: (input: SavePriceAlertInput) => Promise<boolean>;
  deletePriceAlert: (instrumentId: string) => Promise<void>;
  dismissTriggeredAlert: (alertId: string) => void;
  seedBaselineToFirestore: () => Promise<void>;
  updateInstrumentPrice: (
    instrumentId: string,
    numericValue: number,
    customInterpretation?: string
  ) => Promise<void>;
  updateSnapshotMetrics: (
    patch: Partial<
      Pick<
        MarketSnapshotData,
        'nifty50' | 'rbiRepoRate' | 'igOasBps' | 'hyOasBps' | 'vix' | 'moveIndex' | 'goldSpot' | 'silverSpot'
      >
    >
  ) => Promise<void>;
  simulateMarketTick: () => Promise<void>;
}

export function useMarketData(): UseMarketDataResult {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [dbInstruments, setDbInstruments] = useState<OilInstrument[] | null>(null);
  const [dbSnapshot, setDbSnapshot] = useState<MarketSnapshotData | null>(null);

  const [googleInstruments, setGoogleInstruments] = useState<OilInstrument[] | null>(null);
  const [googleSnapshot, setGoogleSnapshot] = useState<MarketSnapshotData | null>(null);
  const [isGoogleGrounded, setIsGoogleGrounded] = useState(false);
  const [dataSourceKind, setDataSourceKind] = useState<DataSourceKind>('baseline-only');
  const [dailyCallsUsed, setDailyCallsUsed] = useState<number>(0);
  const [dailyCallsLimit, setDailyCallsLimit] = useState<number>(95);
  const [googleStatus, setGoogleStatus] = useState<'idle' | 'syncing' | 'ready' | 'error'>('idle');
  const [googleSummaryState, setGoogleSummaryState] = useState<string>(
    'Static desk baseline active — awaiting verified live market sync.'
  );
  const [googleSourcesState, setGoogleSourcesState] = useState<GroundedSource[]>([]);
  const [lastGoogleSyncIso, setLastGoogleSyncIso] = useState<string | null>(null);
  const [syncIntervalMinutes, setSyncIntervalMinutesState] = useState<number>(30);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);
  const [syncHistory, setSyncHistory] = useState<MarketSyncRunItem[]>([]);
  const [analystNotes, setAnalystNotes] = useState<AnalystNoteItem[]>([]);
  const [firestoreAlerts, setFirestoreAlerts] = useState<PriceAlertConfig[]>([]);
  const [localAlerts, setLocalAlerts] = useState<PriceAlertConfig[]>(() => readLocalAlerts());
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlertNotice[]>([]);

  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const dbInstrumentsRef = useRef<OilInstrument[] | null>(null);
  const dbSnapshotRef = useRef<MarketSnapshotData | null>(null);
  const lastPersistedSyncIsoRef = useRef<string | null>(null);
  const persistenceInFlightRef = useRef<boolean>(false);
  const firedAlertKeysRef = useRef<Set<string>>(new Set());

  if (fatalError) {
    throw fatalError;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dbInstrumentsRef.current = dbInstruments;
  }, [dbInstruments]);

  useEffect(() => {
    dbSnapshotRef.current = dbSnapshot;
  }, [dbSnapshot]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const fetchSyncHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/market/history');
      if (!res.ok) return;
      const data = (await res.json()) as { runs?: MarketSyncRunItem[] };
      if (mountedRef.current && Array.isArray(data.runs)) {
        setSyncHistory(data.runs);
      }
    } catch {
      // non-fatal history check
    }
  }, []);

  /**
   * Persist Google Search Grounding outputs into Firestore (`marketInstruments` and `marketSnapshots/current`)
   * so real-time `onSnapshot` listeners push the updates to all dashboard views and sessions.
   */
  const persistGroundedToFirestore = useCallback(
    async (
      groundedInstruments: OilInstrument[],
      groundedSnapshot: MarketSnapshotData,
      summary: string,
      sources: GroundedSource[],
      syncStampIso: string | null
    ) => {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.emailVerified) {
        return;
      }
      if (syncStampIso && lastPersistedSyncIsoRef.current === syncStampIso) {
        return;
      }
      if (persistenceInFlightRef.current) {
        return;
      }

      persistenceInFlightRef.current = true;
      try {
        const batch = writeBatch(db);
        const existingMap = new Map(
          (dbInstrumentsRef.current ?? []).map((item) => [item.id, item])
        );
        const groundedMap = new Map(groundedInstruments.map((item) => [item.id, item]));

        OIL_INSTRUMENTS.forEach((base, idx) => {
          const item = groundedMap.get(base.id) ?? base;
          const numericVal = Number.isFinite(item.numericValue)
            ? item.numericValue
            : base.numericValue;
          const formattedVal = formatInstrumentValue(base.id, numericVal).slice(0, 32);
          const { signal, signalLabel } = evaluateInstrumentSignal(base.id, numericVal);
          const rawInterp = (item.interpretation ?? base.interpretation).trim();
          const safeInterp = (rawInterp.length >= 3 ? rawInterp : base.interpretation).slice(
            0,
            240
          );

          const instRef = doc(db, 'marketInstruments', base.id);
          if (existingMap.has(base.id)) {
            batch.update(instRef, {
              value: formattedVal,
              numericValue: numericVal,
              signal,
              signalLabel: signalLabel.slice(0, 32),
              interpretation: safeInterp,
              updatedByUid: currentUser.uid,
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(instRef, {
              id: base.id.slice(0, 64),
              name: base.name.slice(0, 80),
              ticker: base.ticker.slice(0, 40),
              value: formattedVal,
              numericValue: numericVal,
              unit: base.unit.slice(0, 24),
              signal,
              signalLabel: signalLabel.slice(0, 32),
              interpretation: safeInterp,
              isPmCore: Boolean(base.isPmCore),
              sortOrder: idx,
              isPublic: true,
              updatedByUid: currentUser.uid,
              updatedAt: serverTimestamp(),
            });
          }
        });

        const safeSummary = normalizeSummary(summary || groundedSnapshot.macroSummary);
        const safeSourceUrls = normalizeSourceUrls(sources, groundedSnapshot.sourceUrls);
        const snapPayload = {
          updatedLabel: normalizeLabel(groundedSnapshot.updatedLabel),
          nifty50: sanitizePositive(groundedSnapshot.nifty50, DEFAULT_SNAPSHOT.nifty50),
          rbiRepoRate: sanitizeNonNegative(
            groundedSnapshot.rbiRepoRate,
            DEFAULT_SNAPSHOT.rbiRepoRate
          ),
          igOasBps: sanitizeNonNegative(groundedSnapshot.igOasBps, DEFAULT_SNAPSHOT.igOasBps),
          hyOasBps: sanitizeNonNegative(groundedSnapshot.hyOasBps, DEFAULT_SNAPSHOT.hyOasBps),
          vix: sanitizeNonNegative(groundedSnapshot.vix, DEFAULT_SNAPSHOT.vix),
          moveIndex: sanitizeNonNegative(groundedSnapshot.moveIndex, DEFAULT_SNAPSHOT.moveIndex),
          goldSpot: sanitizePositive(groundedSnapshot.goldSpot, DEFAULT_SNAPSHOT.goldSpot),
          silverSpot: sanitizePositive(groundedSnapshot.silverSpot, DEFAULT_SNAPSHOT.silverSpot),
          macroSummary: safeSummary,
          sourceUrls: safeSourceUrls,
          updatedByUid: currentUser.uid,
          updatedAt: serverTimestamp(),
        };

        const snapRef = doc(db, 'marketSnapshots', 'current');
        if (dbSnapshotRef.current) {
          batch.update(snapRef, snapPayload);
        } else {
          batch.set(snapRef, {
            id: 'current',
            ...snapPayload,
            isPublic: true,
          });
        }

        await batch.commit();
        if (syncStampIso) {
          lastPersistedSyncIsoRef.current = syncStampIso;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to store Google Search update in Firestore.';
        if (mountedRef.current) {
          setSyncError(message);
        }
        try {
          handleFirestoreError(err, OperationType.WRITE, 'marketInstruments & marketSnapshots/current');
        } catch (wrapped) {
          if (message.toLowerCase().includes('permission') && mountedRef.current) {
            setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      } finally {
        persistenceInFlightRef.current = false;
      }
    },
    []
  );

  const applyGoogleApiState = useCallback(
    async (data: LiveApiResponse) => {
      if (!mountedRef.current) return;
      setGoogleStatus(data.status);
      setSyncIntervalMinutesState(
        Math.min(240, Math.max(30, Math.round(data.intervalMinutes || 30)))
      );
      setNextSyncAt(data.nextSyncAt);
      setDailyCallsUsed(typeof data.dailyCallsUsed === 'number' ? data.dailyCallsUsed : 0);
      setDailyCallsLimit(typeof data.dailyCallsLimit === 'number' ? data.dailyCallsLimit : 95);

      const resolvedKind: DataSourceKind = data.dataSourceKind
        ? data.dataSourceKind
        : data.syncError && !data.isGrounded
          ? 'error'
          : data.isGrounded
            ? 'live-api'
            : 'baseline-only';
      setDataSourceKind(resolvedKind);

      if (data.summary) setGoogleSummaryState(data.summary);
      if (Array.isArray(data.sources)) setGoogleSourcesState(data.sources);
      if (data.syncError) {
        setSyncError(data.syncError);
      } else {
        setSyncError(null);
      }
      if (data.lastSyncedAt) {
        setLastGoogleSyncIso(data.lastSyncedAt);
        setLastSyncedAt(
          new Date(data.lastSyncedAt).toLocaleTimeString('en-IN', { hour12: true })
        );
      }

      if (data.isGrounded && data.instruments && data.snapshot) {
        setIsGoogleGrounded(true);
        setGoogleInstruments(data.instruments);
        setGoogleSnapshot(data.snapshot);

        await persistGroundedToFirestore(
          data.instruments,
          data.snapshot,
          data.summary,
          data.sources ?? [],
          data.lastSyncedAt
        );
      }
      void fetchSyncHistory();
      setLoading(false);
    },
    [fetchSyncHistory, persistGroundedToFirestore]
  );

  const runGoogleBackgroundFetch = useCallback(
    async (source: 'background' | 'manual', force: boolean) => {
      if (source === 'manual') {
        setIsBusy(true);
      }
      setGoogleStatus('syncing');
      setSyncError(null);
      try {
        const res = await fetch('/api/market/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source,
            force,
          }),
        });
        const data = (await res.json()) as LiveApiResponse;
        await applyGoogleApiState(data);
      } catch (err) {
        if (mountedRef.current) {
          setGoogleStatus('error');
          setDataSourceKind((prev) => (prev === 'baseline-only' ? 'error' : prev));
          setSyncError(err instanceof Error ? err.message : 'Market data sync failed.');
          void fetchSyncHistory();
        }
      } finally {
        if (source === 'manual' && mountedRef.current) {
          setIsBusy(false);
        }
      }
    },
    [applyGoogleApiState, fetchSyncHistory]
  );

  const pollLiveGoogleEndpoint = useCallback(async () => {
    try {
      const res = await fetch('/api/market/live');
      if (!res.ok) return null;
      const data = (await res.json()) as LiveApiResponse;
      await applyGoogleApiState(data);
      return data;
    } catch {
      return null;
    }
  }, [applyGoogleApiState]);

  // Initial load + quota-safe periodic sync (default 60m core / tiered endpoint TTLs)
  useEffect(() => {
    let cancelled = false;

    const bootstrapAndCheckStale = async () => {
      const liveData = await pollLiveGoogleEndpoint();
      void fetchSyncHistory();
      if (cancelled || !liveData) return;

      const staleMs = syncIntervalMinutes * 60 * 1000;
      const ageMs = liveData.lastSyncedAt
        ? Date.now() - new Date(liveData.lastSyncedAt).getTime()
        : Number.POSITIVE_INFINITY;

      if ((!liveData.isGrounded || ageMs >= staleMs) && liveData.status !== 'syncing') {
        await runGoogleBackgroundFetch('background', false);
      }
    };

    void bootstrapAndCheckStale();

    const intervalMs = Math.min(240, Math.max(30, syncIntervalMinutes)) * 60 * 1000;
    const backgroundFetchTimer = window.setInterval(() => {
      void runGoogleBackgroundFetch('background', false);
    }, intervalMs);

    // Secondary 5-min read-only poll of server cache (0 upstream API calls)
    const pollTimer = window.setInterval(() => {
      void pollLiveGoogleEndpoint();
    }, 5 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(backgroundFetchTimer);
      window.clearInterval(pollTimer);
    };
  }, [syncIntervalMinutes, pollLiveGoogleEndpoint, fetchSyncHistory, runGoogleBackgroundFetch]);

  // When an analyst signs in after a Google Search fetch already ran, flush latest grounded quotes into Firestore
  useEffect(() => {
    if (
      authReady &&
      user?.emailVerified &&
      isGoogleGrounded &&
      googleInstruments &&
      googleSnapshot
    ) {
      void persistGroundedToFirestore(
        googleInstruments,
        googleSnapshot,
        googleSummaryState,
        googleSourcesState,
        lastGoogleSyncIso
      );
    }
  }, [
    authReady,
    user,
    isGoogleGrounded,
    googleInstruments,
    googleSnapshot,
    googleSummaryState,
    googleSourcesState,
    lastGoogleSyncIso,
    persistGroundedToFirestore,
  ]);

  // Load authenticated user's private desk notes from Cloud SQL
  const fetchAnalystNotes = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setAnalystNotes([]);
      return;
    }
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/notes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { notes?: AnalystNoteItem[] };
      if (mountedRef.current && Array.isArray(data.notes)) {
        setAnalystNotes(data.notes);
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (authReady) {
      void fetchAnalystNotes(user);
    }
  }, [authReady, user, fetchAnalystNotes]);

  // Real-time Firestore listener for 7 market instruments (drives reactive UI re-renders)
  useEffect(() => {
    const instrumentsPath = 'marketInstruments';
    const instrumentsQuery = query(
      collection(db, instrumentsPath),
      where('isPublic', '==', true)
    );

    const unsubscribe = onSnapshot(
      instrumentsQuery,
      (querySnapshot) => {
        if (!querySnapshot.empty) {
          const rows: Array<OilInstrument & { sortOrder: number }> = [];
          querySnapshot.forEach((docSnap) => {
            const d = docSnap.data();
            rows.push({
              id: String(d.id ?? docSnap.id),
              name: String(d.name ?? ''),
              ticker: String(d.ticker ?? ''),
              value: String(d.value ?? ''),
              numericValue: Number(d.numericValue ?? 0),
              unit: String(d.unit ?? ''),
              signal: (d.signal as SignalLevel) ?? 'watch',
              signalLabel: String(d.signalLabel ?? 'Watch'),
              interpretation: String(d.interpretation ?? ''),
              isPmCore: Boolean(d.isPmCore),
              sortOrder: Number(d.sortOrder ?? 99),
            });
          });
          rows.sort((a, b) => a.sortOrder - b.sortOrder);
          setDbInstruments(rows.map(({ sortOrder: _sortOrder, ...rest }) => rest));
          setLastSyncedAt(new Date().toLocaleTimeString('en-IN', { hour12: true }));
        } else {
          setDbInstruments(null);
        }
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, instrumentsPath);
        } catch (wrapped) {
          if (err.message.toLowerCase().includes('permission')) {
            setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listener for macro & credit snapshot (drives reactive UI re-renders)
  useEffect(() => {
    const snapshotPath = 'marketSnapshots/current';
    const snapRef = doc(db, 'marketSnapshots', 'current');

    const unsubscribe = onSnapshot(
      snapRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setDbSnapshot({
            id: String(d.id ?? 'current'),
            updatedLabel: String(d.updatedLabel ?? BRIEF_META.updatedAt),
            nifty50: Number(d.nifty50 ?? DEFAULT_SNAPSHOT.nifty50),
            rbiRepoRate: Number(d.rbiRepoRate ?? DEFAULT_SNAPSHOT.rbiRepoRate),
            igOasBps: Number(d.igOasBps ?? DEFAULT_SNAPSHOT.igOasBps),
            hyOasBps: Number(d.hyOasBps ?? DEFAULT_SNAPSHOT.hyOasBps),
            vix: Number(d.vix ?? DEFAULT_SNAPSHOT.vix),
            moveIndex: Number(d.moveIndex ?? DEFAULT_SNAPSHOT.moveIndex),
            goldSpot: Number(d.goldSpot ?? DEFAULT_SNAPSHOT.goldSpot),
            silverSpot: Number(d.silverSpot ?? DEFAULT_SNAPSHOT.silverSpot),
            macroSummary: typeof d.macroSummary === 'string' ? d.macroSummary : undefined,
            sourceUrls: Array.isArray(d.sourceUrls)
              ? d.sourceUrls.filter((u): u is string => typeof u === 'string')
              : undefined,
            isPublic: Boolean(d.isPublic ?? true),
          });
          setLastSyncedAt(new Date().toLocaleTimeString('en-IN', { hour12: true }));
        } else {
          setDbSnapshot(null);
        }
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.GET, snapshotPath);
        } catch (wrapped) {
          if (err.message.toLowerCase().includes('permission')) {
            setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time owner-isolated Firestore listener for price alerts when signed in & verified
  useEffect(() => {
    if (!authReady || !user?.emailVerified) {
      setFirestoreAlerts([]);
      return;
    }

    const alertsPath = 'priceAlerts';
    const alertsQuery = query(
      collection(db, alertsPath),
      where('ownerUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      alertsQuery,
      (querySnapshot) => {
        const items: PriceAlertConfig[] = [];
        querySnapshot.forEach((docSnap) => {
          const d = docSnap.data();
          items.push({
            id: String(d.id ?? docSnap.id),
            ownerUid: String(d.ownerUid ?? user.uid),
            instrumentId: String(d.instrumentId ?? ''),
            instrumentName: String(d.instrumentName ?? ''),
            direction: d.direction === 'below' ? 'below' : 'above',
            thresholdPrice: Number(d.thresholdPrice ?? 0),
            notifyBrowser: Boolean(d.notifyBrowser),
            notifyEmail: Boolean(d.notifyEmail),
            emailAddress: String(d.emailAddress ?? ''),
            isActive: Boolean(d.isActive),
            lastTriggeredPrice:
              typeof d.lastTriggeredPrice === 'number' ? d.lastTriggeredPrice : undefined,
            triggeredAtIso:
              typeof d.triggeredAtIso === 'string' ? d.triggeredAtIso : undefined,
          });
        });
        setFirestoreAlerts(items);
      },
      (err) => {
        setSyncError(err.message);
        try {
          handleFirestoreError(err, OperationType.LIST, alertsPath);
        } catch (wrapped) {
          if (err.message.toLowerCase().includes('permission')) {
            setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  // Prefer live Firestore data from `onSnapshot` so all writes stored in Firestore drive UI re-renders automatically
  const instruments = useMemo(() => {
    if (dbInstruments && dbInstruments.length > 0) {
      const byId = new Map(dbInstruments.map((item) => [item.id, item]));
      return OIL_INSTRUMENTS.map((base) => byId.get(base.id) ?? base);
    }
    if (isGoogleGrounded && googleInstruments && googleInstruments.length > 0) {
      const byId = new Map(googleInstruments.map((item) => [item.id, item]));
      return OIL_INSTRUMENTS.map((base) => byId.get(base.id) ?? base);
    }
    return OIL_INSTRUMENTS;
  }, [dbInstruments, isGoogleGrounded, googleInstruments]);

  const snapshot = useMemo(() => {
    if (dbSnapshot) {
      return {
        ...dbSnapshot,
        us10yYield: dbSnapshot.us10yYield ?? googleSnapshot?.us10yYield ?? DEFAULT_SNAPSHOT.us10yYield,
        natGasSpot: dbSnapshot.natGasSpot ?? googleSnapshot?.natGasSpot,
      };
    }
    if (isGoogleGrounded && googleSnapshot) {
      return googleSnapshot;
    }
    return DEFAULT_SNAPSHOT;
  }, [dbSnapshot, isGoogleGrounded, googleSnapshot]);

  const googleSummary = useMemo(() => {
    if (dbSnapshot?.macroSummary && dbSnapshot.macroSummary.trim().length > 0) {
      return dbSnapshot.macroSummary;
    }
    return googleSummaryState;
  }, [dbSnapshot?.macroSummary, googleSummaryState]);

  const googleSources = useMemo(() => {
    if (googleSourcesState.length > 0) {
      return googleSourcesState;
    }
    if (dbSnapshot?.sourceUrls && dbSnapshot.sourceUrls.length > 0) {
      return dbSnapshot.sourceUrls.map((uri) => {
        try {
          return { title: new URL(uri).hostname.replace(/^www\./, ''), uri };
        } catch {
          return { title: uri, uri };
        }
      });
    }
    return [];
  }, [googleSourcesState, dbSnapshot?.sourceUrls]);

  const derived = useMemo(() => {
    const findNum = (id: string, fallback: number) =>
      instruments.find((i) => i.id === id)?.numericValue ?? fallback;
    const brentCo1 = findNum('brent-co1', 92.69);
    const datedBrent = findNum('dated-brent', 93.03);
    const m1m2 = findNum('m1-m2', 2.73);
    const vlccFreight = findNum('vlcc-freight', 20);
    const usdInr = findNum('usd-inr', 93.41);
    const datedVsCo1Gap = Number((datedBrent - brentCo1).toFixed(2));
    return { brentCo1, datedBrent, m1m2, vlccFreight, usdInr, datedVsCo1Gap };
  }, [instruments]);

  const priceAlerts = useMemo(() => {
    if (authReady && user?.emailVerified) {
      return firestoreAlerts;
    }
    return localAlerts;
  }, [authReady, user, firestoreAlerts, localAlerts]);

  // Evaluate active price threshold alerts whenever live instrument quotes or alert configs change
  useEffect(() => {
    if (priceAlerts.length === 0 || instruments.length === 0) return;

    const nowIso = new Date().toISOString().slice(0, 64);
    const newlyTriggered: Array<{
      alert: PriceAlertConfig;
      inst: OilInstrument;
      notice: TriggeredAlertNotice;
    }> = [];

    for (const alert of priceAlerts) {
      if (!alert.isActive) continue;
      if (!alert.notifyBrowser && !alert.notifyEmail) continue;

      const inst = instruments.find((i) => i.id === alert.instrumentId);
      if (!inst || !Number.isFinite(inst.numericValue)) continue;

      const hit =
        alert.direction === 'above'
          ? inst.numericValue >= alert.thresholdPrice
          : inst.numericValue <= alert.thresholdPrice;

      if (!hit) continue;

      const dedupeKey = `${alert.id}|${alert.direction}|${alert.thresholdPrice}|${inst.numericValue}`;
      if (firedAlertKeysRef.current.has(dedupeKey)) continue;
      firedAlertKeysRef.current.add(dedupeKey);

      if (alert.notifyBrowser) {
        dispatchBrowserNotification(inst, alert.direction, alert.thresholdPrice);
      }

      newlyTriggered.push({
        alert,
        inst,
        notice: {
          alertId: alert.id,
          instrumentId: inst.id,
          instrumentName: inst.name,
          direction: alert.direction,
          thresholdPrice: alert.thresholdPrice,
          currentPrice: inst.numericValue,
          formattedPrice: inst.value,
          notifyBrowser: alert.notifyBrowser,
          notifyEmail: alert.notifyEmail,
          emailAddress: alert.emailAddress,
          triggeredAtIso: nowIso,
        },
      });
    }

    if (newlyTriggered.length === 0) return;

    setTriggeredAlerts((prev) => {
      const existingIds = new Set(prev.map((p) => p.alertId));
      const fresh = newlyTriggered.map((t) => t.notice).filter((n) => !existingIds.has(n.alertId));
      return [...fresh, ...prev];
    });

    // Disarm triggered one-shot thresholds & record trigger metadata
    if (authReady && user?.emailVerified) {
      for (const { alert, inst } of newlyTriggered) {
        const alertRef = doc(db, 'priceAlerts', alert.id);
        void updateDoc(alertRef, {
          isActive: false,
          lastTriggeredPrice: inst.numericValue,
          triggeredAtIso: nowIso,
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          try {
            handleFirestoreError(err, OperationType.UPDATE, `priceAlerts/${alert.id}`);
          } catch {
            // non-fatal background disarm logging
          }
        });
      }
    } else {
      setLocalAlerts((prev) => {
        const triggeredMap = new Map(newlyTriggered.map((t) => [t.alert.instrumentId, t.inst.numericValue]));
        const next = prev.map((a) =>
          triggeredMap.has(a.instrumentId)
            ? {
                ...a,
                isActive: false,
                lastTriggeredPrice: triggeredMap.get(a.instrumentId),
                triggeredAtIso: nowIso,
              }
            : a
        );
        writeLocalAlerts(next);
        return next;
      });
    }
  }, [authReady, instruments, priceAlerts, user]);

  const signInWithGoogle = useCallback(async () => {
    setSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setSyncError(null);
    try {
      await signOut(auth);
      setAnalystNotes([]);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  }, []);

  const refreshFromGoogleSearch = useCallback(async () => {
    await runGoogleBackgroundFetch('manual', true);
  }, [runGoogleBackgroundFetch]);

  const setSyncIntervalMinutes = useCallback(async (minutes: number) => {
    const clamped = Math.min(240, Math.max(30, Math.round(minutes)));
    setSyncIntervalMinutesState(clamped);
    try {
      const res = await fetch('/api/market/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: clamped }),
      });
      if (res.ok) {
        const data = (await res.json()) as LiveApiResponse;
        setNextSyncAt(data.nextSyncAt);
      }
    } catch {
      // non-fatal schedule update
    }
  }, []);

  const addAnalystNote = useCallback(
    async (sectionId: string, noteText: string): Promise<boolean> => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setSyncError('Sign in with Google to save analyst desk notes.');
        return false;
      }
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sectionId, note: noteText }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          setSyncError(errBody.error || 'Could not save desk note.');
          return false;
        }
        await fetchAnalystNotes(currentUser);
        return true;
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Failed to save desk note.');
        return false;
      }
    },
    [fetchAnalystNotes]
  );

  const savePriceAlert = useCallback(
    async (input: SavePriceAlertInput): Promise<boolean> => {
      if (!Number.isFinite(input.thresholdPrice)) {
        setSyncError('Please enter a valid numeric threshold price.');
        return false;
      }

      const cleanEmail = input.emailAddress.trim().slice(0, 160);
      const cleanName = input.instrument.name.trim().slice(0, 80);
      const cleanInstId = input.instrument.id.slice(0, 64);

      setSyncError(null);
      setIsBusy(true);
      try {
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.emailVerified) {
          const safeUid = currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, '_');
          const alertId = `${safeUid}_${cleanInstId}`.slice(0, 128);
          const alertRef = doc(db, 'priceAlerts', alertId);
          const alreadyExists = firestoreAlerts.some((a) => a.id === alertId);

          if (alreadyExists) {
            await updateDoc(alertRef, {
              direction: input.direction,
              thresholdPrice: input.thresholdPrice,
              notifyBrowser: Boolean(input.notifyBrowser),
              notifyEmail: Boolean(input.notifyEmail),
              emailAddress: cleanEmail,
              isActive: Boolean(input.isActive),
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(alertRef, {
              id: alertId,
              ownerUid: currentUser.uid,
              instrumentId: cleanInstId,
              instrumentName: cleanName,
              direction: input.direction,
              thresholdPrice: input.thresholdPrice,
              notifyBrowser: Boolean(input.notifyBrowser),
              notifyEmail: Boolean(input.notifyEmail),
              emailAddress: cleanEmail,
              isActive: Boolean(input.isActive),
              updatedAt: serverTimestamp(),
            });
          }

          // Clear previous dedupe lock so re-armed alert can trigger again cleanly
          firedAlertKeysRef.current.forEach((k) => {
            if (k.startsWith(`${alertId}|`)) {
              firedAlertKeysRef.current.delete(k);
            }
          });
          setTriggeredAlerts((prev) => prev.filter((n) => n.instrumentId !== cleanInstId));
          return true;
        }

        // Unauthenticated browser fallback (persisted in localStorage)
        const localId = `local_${cleanInstId}`;
        const nextItem: PriceAlertConfig = {
          id: localId,
          ownerUid: 'local',
          instrumentId: cleanInstId,
          instrumentName: cleanName,
          direction: input.direction,
          thresholdPrice: input.thresholdPrice,
          notifyBrowser: Boolean(input.notifyBrowser),
          notifyEmail: Boolean(input.notifyEmail),
          emailAddress: cleanEmail,
          isActive: Boolean(input.isActive),
        };

        firedAlertKeysRef.current.forEach((k) => {
          if (k.startsWith(`${localId}|`)) {
            firedAlertKeysRef.current.delete(k);
          }
        });
        setTriggeredAlerts((prev) => prev.filter((n) => n.instrumentId !== cleanInstId));

        setLocalAlerts((prev) => {
          const filtered = prev.filter((a) => a.instrumentId !== cleanInstId);
          const next = [...filtered, nextItem];
          writeLocalAlerts(next);
          return next;
        });
        return true;
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Failed to save price alert.');
        handleFirestoreError(err, OperationType.WRITE, `priceAlerts/${input.instrument.id}`);
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [firestoreAlerts]
  );

  const deletePriceAlert = useCallback(
    async (instrumentId: string): Promise<void> => {
      setSyncError(null);
      setIsBusy(true);
      try {
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.emailVerified) {
          const existing = firestoreAlerts.find((a) => a.instrumentId === instrumentId);
          if (existing) {
            await deleteDoc(doc(db, 'priceAlerts', existing.id));
          }
        } else {
          setLocalAlerts((prev) => {
            const next = prev.filter((a) => a.instrumentId !== instrumentId);
            writeLocalAlerts(next);
            return next;
          });
        }
        setTriggeredAlerts((prev) => prev.filter((n) => n.instrumentId !== instrumentId));
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Failed to remove price alert.');
        handleFirestoreError(err, OperationType.DELETE, `priceAlerts/${instrumentId}`);
      } finally {
        setIsBusy(false);
      }
    },
    [firestoreAlerts]
  );

  const dismissTriggeredAlert = useCallback((alertId: string) => {
    setTriggeredAlerts((prev) => prev.filter((item) => item.alertId !== alertId));
  }, []);

  const seedBaselineToFirestore = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setSyncError('Sign in with Google first to sync live quotes to Firestore.');
      return;
    }
    setIsBusy(true);
    setSyncError(null);
    try {
      const batch = writeBatch(db);
      const existingMap = new Map((dbInstruments ?? []).map((item) => [item.id, item]));

      instruments.forEach((inst, idx) => {
        const ref = doc(db, 'marketInstruments', inst.id);
        if (existingMap.has(inst.id)) {
          batch.update(ref, {
            value: inst.value.slice(0, 32),
            numericValue: inst.numericValue,
            signal: inst.signal,
            signalLabel: inst.signalLabel.slice(0, 32),
            interpretation: inst.interpretation.slice(0, 240),
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, {
            id: inst.id.slice(0, 64),
            name: inst.name.slice(0, 80),
            ticker: inst.ticker.slice(0, 40),
            value: inst.value.slice(0, 32),
            numericValue: inst.numericValue,
            unit: inst.unit.slice(0, 24),
            signal: inst.signal,
            signalLabel: inst.signalLabel.slice(0, 32),
            interpretation: inst.interpretation.slice(0, 240),
            isPmCore: Boolean(inst.isPmCore),
            sortOrder: idx,
            isPublic: true,
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      const snapRef = doc(db, 'marketSnapshots', 'current');
      const snapUpdate = {
        updatedLabel: formatIstNow(),
        nifty50: sanitizePositive(snapshot.nifty50, DEFAULT_SNAPSHOT.nifty50),
        rbiRepoRate: sanitizeNonNegative(snapshot.rbiRepoRate, DEFAULT_SNAPSHOT.rbiRepoRate),
        igOasBps: sanitizeNonNegative(snapshot.igOasBps, DEFAULT_SNAPSHOT.igOasBps),
        hyOasBps: sanitizeNonNegative(snapshot.hyOasBps, DEFAULT_SNAPSHOT.hyOasBps),
        vix: sanitizeNonNegative(snapshot.vix, DEFAULT_SNAPSHOT.vix),
        moveIndex: sanitizeNonNegative(snapshot.moveIndex, DEFAULT_SNAPSHOT.moveIndex),
        goldSpot: sanitizePositive(snapshot.goldSpot, DEFAULT_SNAPSHOT.goldSpot),
        silverSpot: sanitizePositive(snapshot.silverSpot, DEFAULT_SNAPSHOT.silverSpot),
        macroSummary: normalizeSummary(googleSummary),
        sourceUrls: normalizeSourceUrls(googleSources, snapshot.sourceUrls),
        updatedByUid: currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      if (dbSnapshot) {
        batch.update(snapRef, snapUpdate);
      } else {
        batch.set(snapRef, {
          id: 'current',
          ...snapUpdate,
          isPublic: true,
        });
      }

      await batch.commit();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to initialize live database.');
      handleFirestoreError(err, OperationType.WRITE, 'marketInstruments & marketSnapshots/current');
    } finally {
      setIsBusy(false);
    }
  }, [dbInstruments, dbSnapshot, googleSources, googleSummary, instruments, snapshot]);

  const updateInstrumentPrice = useCallback(
    async (instrumentId: string, numericValue: number, customInterpretation?: string) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setSyncError('Sign in with Google to publish live quote updates.');
        return;
      }
      if (!Number.isFinite(numericValue)) return;

      const existing = instruments.find((i) => i.id === instrumentId);
      if (!existing) return;

      setIsBusy(true);
      setSyncError(null);
      const docPath = `marketInstruments/${instrumentId}`;
      try {
        const formattedValue = formatInstrumentValue(instrumentId, numericValue).slice(0, 32);
        const { signal, signalLabel } = evaluateInstrumentSignal(instrumentId, numericValue);
        const interpretation = (customInterpretation ?? existing.interpretation).slice(0, 240);

        const isSeeded = Boolean(dbInstruments?.some((i) => i.id === instrumentId));
        const instRef = doc(db, 'marketInstruments', instrumentId);

        if (isSeeded) {
          await updateDoc(instRef, {
            value: formattedValue,
            numericValue,
            signal,
            signalLabel: signalLabel.slice(0, 32),
            interpretation,
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          const sortOrder = OIL_INSTRUMENTS.findIndex((i) => i.id === instrumentId);
          await setDoc(instRef, {
            id: existing.id.slice(0, 64),
            name: existing.name.slice(0, 80),
            ticker: existing.ticker.slice(0, 40),
            value: formattedValue,
            numericValue,
            unit: existing.unit.slice(0, 24),
            signal,
            signalLabel: signalLabel.slice(0, 32),
            interpretation,
            isPmCore: Boolean(existing.isPmCore),
            sortOrder: sortOrder >= 0 ? sortOrder : 0,
            isPublic: true,
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }

        const snapRef = doc(db, 'marketSnapshots', 'current');
        if (dbSnapshot) {
          await updateDoc(snapRef, {
            updatedLabel: formatIstNow(),
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(snapRef, {
            ...DEFAULT_SNAPSHOT,
            id: 'current',
            updatedLabel: formatIstNow(),
            isPublic: true,
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Quote update failed.');
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      } finally {
        setIsBusy(false);
      }
    },
    [dbInstruments, dbSnapshot, instruments]
  );

  const updateSnapshotMetrics = useCallback(
    async (
      patch: Partial<
        Pick<
          MarketSnapshotData,
          'nifty50' | 'rbiRepoRate' | 'igOasBps' | 'hyOasBps' | 'vix' | 'moveIndex' | 'goldSpot' | 'silverSpot'
        >
      >
    ) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setSyncError('Sign in with Google to update live macro indicators.');
        return;
      }
      setIsBusy(true);
      setSyncError(null);
      const snapPath = 'marketSnapshots/current';
      try {
        const snapRef = doc(db, 'marketSnapshots', 'current');
        if (dbSnapshot) {
          await updateDoc(snapRef, {
            ...patch,
            updatedLabel: formatIstNow(),
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(snapRef, {
            ...DEFAULT_SNAPSHOT,
            ...patch,
            id: 'current',
            updatedLabel: formatIstNow(),
            isPublic: true,
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Snapshot update failed.');
        handleFirestoreError(err, OperationType.WRITE, snapPath);
      } finally {
        setIsBusy(false);
      }
    },
    [dbSnapshot]
  );

  const simulateMarketTick = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setSyncError('Sign in with Google to publish a live market tick.');
      return;
    }
    setIsBusy(true);
    setSyncError(null);
    try {
      const batch = writeBatch(db);
      const jitter = (step: number) => (Math.random() - 0.48) * step;

      const nextBrent = Number(Math.max(72, Math.min(130, derived.brentCo1 + jitter(1.6))).toFixed(2));
      const nextWti = Number(Math.max(66, Math.min(122, nextBrent - 7.5 + jitter(0.6))).toFixed(2));
      const nextDated = Number(Math.max(73, Math.min(132, nextBrent + 0.35 + jitter(0.8))).toFixed(2));
      const nextM1M2 = Number(Math.max(0.8, Math.min(3.9, derived.m1m2 + jitter(0.45))).toFixed(2));
      const nextInr = Number(Math.max(89.5, Math.min(96.5, derived.usdInr + jitter(0.28))).toFixed(2));

      const updates: Array<{ id: string; num: number }> = [
        { id: 'brent-co1', num: nextBrent },
        { id: 'wti-cl1', num: nextWti },
        { id: 'dated-brent', num: nextDated },
        { id: 'm1-m2', num: nextM1M2 },
        { id: 'usd-inr', num: nextInr },
      ];

      const existingMap = new Map((dbInstruments ?? []).map((item) => [item.id, item]));

      OIL_INSTRUMENTS.forEach((base, idx) => {
        const override = updates.find((u) => u.id === base.id);
        const current = instruments.find((i) => i.id === base.id) ?? base;
        const num = override ? override.num : current.numericValue;
        const { signal, signalLabel } = evaluateInstrumentSignal(base.id, num);
        const ref = doc(db, 'marketInstruments', base.id);

        if (existingMap.has(base.id)) {
          batch.update(ref, {
            value: formatInstrumentValue(base.id, num).slice(0, 32),
            numericValue: num,
            signal,
            signalLabel: signalLabel.slice(0, 32),
            interpretation: current.interpretation.slice(0, 240),
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, {
            id: base.id.slice(0, 64),
            name: base.name.slice(0, 80),
            ticker: base.ticker.slice(0, 40),
            value: formatInstrumentValue(base.id, num).slice(0, 32),
            numericValue: num,
            unit: base.unit.slice(0, 24),
            signal,
            signalLabel: signalLabel.slice(0, 32),
            interpretation: current.interpretation.slice(0, 240),
            isPmCore: Boolean(base.isPmCore),
            sortOrder: idx,
            isPublic: true,
            updatedByUid: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      const nextNifty = Math.round(snapshot.nifty50 + jitter(95));
      const nextVix = Number(Math.max(12, Math.min(35, snapshot.vix + jitter(0.9))).toFixed(2));
      const snapRef = doc(db, 'marketSnapshots', 'current');
      const snapPayload = {
        updatedLabel: formatIstNow(),
        nifty50: nextNifty,
        rbiRepoRate: snapshot.rbiRepoRate,
        igOasBps: snapshot.igOasBps,
        hyOasBps: snapshot.hyOasBps,
        vix: nextVix,
        moveIndex: snapshot.moveIndex,
        goldSpot: Math.round(snapshot.goldSpot + jitter(24)),
        silverSpot: Number((snapshot.silverSpot + jitter(0.5)).toFixed(2)),
        updatedByUid: currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      if (dbSnapshot) {
        batch.update(snapRef, snapPayload);
      } else {
        batch.set(snapRef, {
          id: 'current',
          ...snapPayload,
          isPublic: true,
        });
      }

      await batch.commit();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Market tick failed.');
      handleFirestoreError(err, OperationType.WRITE, 'marketInstruments & marketSnapshots/current');
    } finally {
      setIsBusy(false);
    }
  }, [dbInstruments, dbSnapshot, derived.brentCo1, derived.m1m2, derived.usdInr, instruments, snapshot]);

  return {
    instruments,
    snapshot,
    derived,
    loading,
    isRefreshingMetrics: isBusy || googleStatus === 'syncing',
    isLiveFromDb: Boolean(dbInstruments && dbInstruments.length > 0),
    isGoogleGrounded,
    dataSourceKind,
    dailyCallsUsed,
    dailyCallsLimit,
    googleStatus,
    googleSummary,
    googleSources,
    syncIntervalMinutes,
    nextSyncAt,
    syncHistory,
    analystNotes,
    priceAlerts,
    triggeredAlerts,
    lastSyncedAt,
    lastApiSyncIso: lastGoogleSyncIso,
    syncError,
    isBusy,
    user,
    authReady,
    signInWithGoogle,
    signOutUser,
    refreshFromGoogleSearch,
    reloadSyncHistory: fetchSyncHistory,
    setSyncIntervalMinutes,
    addAnalystNote,
    savePriceAlert,
    deletePriceAlert,
    dismissTriggeredAlert,
    seedBaselineToFirestore,
    updateInstrumentPrice,
    updateSnapshotMetrics,
    simulateMarketTick,
  };
}
