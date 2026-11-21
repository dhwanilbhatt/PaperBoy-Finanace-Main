import { Bell, BellRing, Check, Mail, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { AlertDirection, OilInstrument, PriceAlertConfig } from '../types/macro';
import { SignalBadge } from './SignalBadge';

interface PriceAlertModalProps {
  isOpen: boolean;
  instrument: OilInstrument | null;
  existingAlert?: PriceAlertConfig;
  userEmail?: string | null;
  isBusy?: boolean;
  onClose: () => void;
  onSave: (input: {
    instrument: OilInstrument;
    direction: AlertDirection;
    thresholdPrice: number;
    notifyBrowser: boolean;
    notifyEmail: boolean;
    emailAddress: string;
    isActive: boolean;
  }) => Promise<boolean>;
  onDelete: (instrumentId: string) => Promise<void>;
}

type BrowserPermState = 'default' | 'granted' | 'denied' | 'unsupported';

function getBrowserPermission(): BrowserPermState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function suggestInitialThreshold(inst: OilInstrument, dir: AlertDirection): string {
  const base = inst.numericValue;
  const factor = dir === 'above' ? 1.03 : 0.97;
  const next = base * factor;
  if (inst.id === 'vlcc-freight') {
    return String(Math.round(next));
  }
  return next.toFixed(2);
}

export function PriceAlertModal({
  isOpen,
  instrument,
  existingAlert,
  userEmail,
  isBusy = false,
  onClose,
  onSave,
  onDelete,
}: PriceAlertModalProps) {
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [thresholdInput, setThresholdInput] = useState<string>('');
  const [notifyBrowser, setNotifyBrowser] = useState<boolean>(true);
  const [notifyEmail, setNotifyEmail] = useState<boolean>(false);
  const [emailAddress, setEmailAddress] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [browserPerm, setBrowserPerm] = useState<BrowserPermState>(getBrowserPermission);
  const [formError, setFormError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !instrument) return;
    setBrowserPerm(getBrowserPermission());
    setFormError(null);
    setTestSent(false);

    if (existingAlert) {
      setDirection(existingAlert.direction);
      setThresholdInput(String(existingAlert.thresholdPrice));
      setNotifyBrowser(existingAlert.notifyBrowser);
      setNotifyEmail(existingAlert.notifyEmail);
      setEmailAddress(existingAlert.emailAddress || userEmail || '');
      // When reopening an already-triggered alert, default to re-arming it cleanly
      setIsActive(existingAlert.triggeredAtIso && !existingAlert.isActive ? true : existingAlert.isActive);
    } else {
      const defaultDir: AlertDirection = 'above';
      setDirection(defaultDir);
      setThresholdInput(suggestInitialThreshold(instrument, defaultDir));
      setNotifyBrowser(true);
      setNotifyEmail(Boolean(userEmail));
      setEmailAddress(userEmail ?? '');
      setIsActive(true);
    }
  }, [isOpen, instrument, existingAlert, userEmail]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !instrument) return null;

  const handleToggleBrowser = async () => {
    const next = !notifyBrowser;
    setFormError(null);
    setNotifyBrowser(next);

    if (next && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission();
          setBrowserPerm(result);
        } catch {
          setBrowserPerm(getBrowserPermission());
        }
      } else {
        setBrowserPerm(Notification.permission);
      }
    }
  };

  const handleSendTestBrowserNotification = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(`MacroLens Test · ${instrument.name}`, {
        body: `Browser threshold alerts are active for ${instrument.name} (live: ${instrument.value}).`,
        tag: `macrolens-test-${instrument.id}`,
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 2500);
    } catch {
      setFormError('Your browser context blocked popup notifications.');
    }
  };

  const handleApplyPreset = (pctDelta: number) => {
    const next = instrument.numericValue * (1 + pctDelta);
    setDirection(pctDelta >= 0 ? 'above' : 'below');
    setThresholdInput(instrument.id === 'vlcc-freight' ? String(Math.round(next)) : next.toFixed(2));
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = Number(thresholdInput);
    if (!Number.isFinite(parsed)) {
      setFormError('Enter a valid numeric threshold value.');
      return;
    }

    if (!notifyBrowser && !notifyEmail) {
      setFormError('Enable at least one notification channel (Browser or Email).');
      return;
    }

    const trimmedEmail = emailAddress.trim();
    if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Enter a valid email address for email alert notifications.');
      return;
    }

    const ok = await onSave({
      instrument,
      direction,
      thresholdPrice: parsed,
      notifyBrowser,
      notifyEmail,
      emailAddress: trimmedEmail,
      isActive,
    });
    if (ok) {
      onClose();
    }
  };

  const handleRemove = async () => {
    await onDelete(instrument.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-alert-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] rounded-[10px] shadow-xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#DDE4ED] dark:border-[#19324D] bg-[#F6F8FB] dark:bg-[#081829]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#63768A] dark:text-slate-400">
              <BellRing className="w-3.5 h-3.5 text-[#0D243C] dark:text-sky-300 shrink-0" aria-hidden="true" />
              <span className="font-mono uppercase tracking-wider">{instrument.ticker}</span>
              <SignalBadge signal={instrument.signal} label={instrument.signalLabel} />
            </div>
            <h3
              id="price-alert-modal-title"
              className="text-base font-bold text-[#0D243C] dark:text-white mt-1 truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Price Threshold Alert · {instrument.name}
            </h3>
            <p className="text-xs text-[#63768A] dark:text-slate-300 mt-0.5 tabular-nums">
              Current live quote: <strong className="font-mono text-[#0D243C] dark:text-white">{instrument.value}</strong> ({instrument.unit})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price alert settings"
            className="p-2 rounded-md text-[#63768A] hover:text-[#0D243C] dark:text-slate-400 dark:hover:text-white border border-[#DDE4ED] dark:border-[#19324D] bg-white dark:bg-[#0B1D31] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5">
          {/* Condition & Target Price */}
          <div className="space-y-2.5">
            <span className="block text-xs font-semibold text-[#0D243C] dark:text-slate-100">
              Trigger condition
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Threshold direction">
              <button
                type="button"
                onClick={() => setDirection('above')}
                aria-pressed={direction === 'above'}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                  direction === 'above'
                    ? 'bg-[#0D243C] text-white border-[#0D243C] dark:bg-white dark:text-[#081829] dark:border-white'
                    : 'bg-white dark:bg-[#06111D] text-[#3A4E63] dark:text-slate-300 border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45]'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Rises above (≥)</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('below')}
                aria-pressed={direction === 'below'}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                  direction === 'below'
                    ? 'bg-[#0D243C] text-white border-[#0D243C] dark:bg-white dark:text-[#081829] dark:border-white'
                    : 'bg-white dark:bg-[#06111D] text-[#3A4E63] dark:text-slate-300 border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45]'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Drops below (≤)</span>
              </button>
            </div>

            <div className="pt-1">
              <label
                htmlFor="alert-threshold-input"
                className="block text-xs font-semibold text-[#0D243C] dark:text-slate-100 mb-1.5"
              >
                Target price threshold ({instrument.unit})
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="alert-threshold-input"
                  type="number"
                  step="0.01"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md font-mono text-sm font-semibold bg-[#F6F8FB] dark:bg-[#06111D] border border-[#DDE4ED] dark:border-[#19324D] text-[#0D243C] dark:text-white focus:outline-2 focus:outline-[#0D243C] dark:focus:outline-sky-400 tabular-nums"
                  required
                />
                <span className="text-xs font-mono text-[#63768A] dark:text-slate-400 shrink-0">
                  {instrument.unit}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-[#63768A] dark:text-slate-400 mr-1">
                  Quick offsets:
                </span>
                {[
                  { label: '-5%', delta: -0.05 },
                  { label: '-2%', delta: -0.02 },
                  { label: '+2%', delta: 0.02 },
                  { label: '+5%', delta: 0.05 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleApplyPreset(preset.delta)}
                    className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#F6F8FB] dark:bg-[#081829] border border-[#DDE4ED] dark:border-[#19324D] text-[#3A4E63] dark:text-slate-300 hover:border-[#0D243C] dark:hover:border-sky-400 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notification Channels */}
          <div className="space-y-3 pt-3 border-t border-[#DDE4ED] dark:border-[#19324D]">
            <span className="block text-xs font-semibold text-[#0D243C] dark:text-slate-100">
              Notification channels
            </span>

            {/* Browser Notification Toggle */}
            <div className="p-3 rounded-[8px] border border-[#DDE4ED] dark:border-[#19324D] bg-[#F6F8FB]/70 dark:bg-[#06111D]/60 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Bell className="w-4 h-4 text-[#0D243C] dark:text-sky-300 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0D243C] dark:text-white">
                      Browser Notifications
                    </p>
                    <p className="text-[11px] text-[#63768A] dark:text-slate-400">
                      {browserPerm === 'granted'
                        ? 'Permission granted · instant desktop alert on threshold breach'
                        : browserPerm === 'denied'
                          ? 'Blocked in browser settings · in-app banner still fires'
                          : browserPerm === 'unsupported'
                            ? 'Web Notification API unavailable · in-app banner still fires'
                            : 'Requests browser notification permission when enabled'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyBrowser}
                  aria-label="Toggle browser notifications"
                  onClick={() => void handleToggleBrowser()}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    notifyBrowser
                      ? 'bg-[#0D243C] dark:bg-sky-400'
                      : 'bg-[#CBD5E1] dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-[#06111D] transition-transform ${
                      notifyBrowser ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {notifyBrowser && browserPerm === 'granted' && (
                <div className="pl-6">
                  <button
                    type="button"
                    onClick={handleSendTestBrowserNotification}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0D243C] dark:text-sky-300 hover:underline cursor-pointer"
                  >
                    {testSent ? (
                      <>
                        <Check className="w-3 h-3 text-[#2c8568]" aria-hidden="true" />
                        <span>Test browser notification dispatched</span>
                      </>
                    ) : (
                      <span>Send test browser notification</span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Email Notification Toggle */}
            <div className="p-3 rounded-[8px] border border-[#DDE4ED] dark:border-[#19324D] bg-[#F6F8FB]/70 dark:bg-[#06111D]/60 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Mail className="w-4 h-4 text-[#0D243C] dark:text-sky-300 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0D243C] dark:text-white">
                      Email Notifications
                    </p>
                    <p className="text-[11px] text-[#63768A] dark:text-slate-400">
                      Stores your recipient address &amp; prepares a pre-addressed alert dispatch when hit
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyEmail}
                  aria-label="Toggle email notifications"
                  onClick={() => {
                    setFormError(null);
                    setNotifyEmail((prev) => !prev);
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    notifyEmail
                      ? 'bg-[#0D243C] dark:bg-sky-400'
                      : 'bg-[#CBD5E1] dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-[#06111D] transition-transform ${
                      notifyEmail ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {notifyEmail && (
                <div className="pl-6">
                  <label htmlFor="alert-email-input" className="sr-only">
                    Recipient email address
                  </label>
                  <input
                    id="alert-email-input"
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="analyst@desk-domain.com"
                    className="w-full px-3 py-1.5 rounded-md text-xs bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] text-[#0D243C] dark:text-white focus:outline-2 focus:outline-[#0D243C] dark:focus:outline-sky-400"
                    required={notifyEmail}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Active Arm Toggle */}
          <div className="flex items-center justify-between px-3 py-2 rounded-md border border-[#DDE4ED] dark:border-[#19324D] text-xs">
            <span className="font-medium text-[#3A4E63] dark:text-slate-200">
              Monitor continuously during live syncs
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              aria-label="Toggle active alert monitoring"
              onClick={() => setIsActive((prev) => !prev)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                isActive
                  ? 'bg-[#e7f3ef] text-[#1e6a52] dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-[#EEF2F7] text-[#63768A] dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isActive ? 'Armed' : 'Paused'}
            </button>
          </div>

          {!userEmail && (
            <p className="text-[11px] text-[#63768A] dark:text-slate-400">
              Saved locally in this browser. Sign in with Google on Home to sync alerts privately to Firestore across sessions.
            </p>
          )}

          {formError && (
            <p className="text-xs font-medium text-[#b9443e] dark:text-red-300 bg-[#fdeeee] dark:bg-red-950/40 border border-[#f5c7c4] dark:border-red-900/50 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#DDE4ED] dark:border-[#19324D]">
            {existingAlert ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleRemove()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-[#b9443e] dark:text-red-300 hover:bg-[#fdeeee] dark:hover:bg-red-950/30 border border-transparent hover:border-[#f5c7c4] dark:hover:border-red-900/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Remove Alert</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-md text-xs font-semibold text-[#3A4E63] dark:text-slate-300 bg-white dark:bg-[#0B1D31] border border-[#DDE4ED] dark:border-[#19324D] hover:bg-[#F6F8FB] dark:hover:bg-[#112A45] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-[#0D243C] hover:bg-[#163A5F] dark:bg-white dark:text-[#081829] dark:hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{existingAlert ? 'Save Alert' : 'Arm Alert'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
