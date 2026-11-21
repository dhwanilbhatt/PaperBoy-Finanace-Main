import type { ReactNode } from 'react';

interface MetricDisplayProps {
  children: ReactNode;
  loading?: boolean;
  syncing?: boolean;
  skeletonWidthClass?: string;
  skeletonHeightClass?: string;
  lightSkeleton?: boolean;
  className?: string;
}

/**
 * Wraps dashboard numeric metrics with a skeleton placeholder during initial boot
 * and a subtle pulse animation during background Google Search / Firestore fetches.
 */
export function MetricDisplay({
  children,
  loading = false,
  syncing = false,
  skeletonWidthClass = 'w-20',
  skeletonHeightClass = 'h-[1.05em]',
  lightSkeleton = false,
  className = '',
}: MetricDisplayProps) {
  if (loading) {
    return (
      <span
        aria-busy="true"
        aria-label="Loading live metric"
        className={`inline-block align-middle rounded ${skeletonWidthClass} ${skeletonHeightClass} ${
          lightSkeleton ? 'bg-white/25 animate-pulse' : 'metric-skeleton'
        } ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-block transition-opacity duration-200 ${
        syncing ? 'metric-sync-pulse' : ''
      } ${className}`}
    >
      {children}
    </span>
  );
}
