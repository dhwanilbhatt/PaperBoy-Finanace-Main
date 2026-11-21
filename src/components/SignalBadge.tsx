import type { SignalLevel } from '../types/macro';

interface SignalBadgeProps {
  signal: SignalLevel;
  label?: string;
}

const SIGNAL_STYLES: Record<
  SignalLevel,
  { bg: string; dot: string; text: string; defaultLabel: string }
> = {
  relief: {
    bg: 'bg-[#ECFDF3] dark:bg-emerald-950/60',
    dot: 'bg-[#15803D] dark:bg-emerald-400',
    text: 'text-[#166534] dark:text-emerald-300',
    defaultLabel: 'Relief',
  },
  watch: {
    bg: 'bg-[#FEF3C7]/70 dark:bg-amber-950/60',
    dot: 'bg-[#D97706] dark:bg-amber-400',
    text: 'text-[#92400E] dark:text-amber-300',
    defaultLabel: 'Watch',
  },
  danger: {
    bg: 'bg-[#FEE2E2]/80 dark:bg-red-950/60',
    dot: 'bg-[#DC2626] dark:bg-red-400',
    text: 'text-[#991B1B] dark:text-red-300',
    defaultLabel: 'Danger',
  },
};

export function SignalBadge({ signal, label }: SignalBadgeProps) {
  const style = SIGNAL_STYLES[signal];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 border border-black/5 dark:border-white/10 ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} aria-hidden="true" />
      <span>{label ?? style.defaultLabel}</span>
    </span>
  );
}
