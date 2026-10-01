interface ProgressBarProps {
  /** Filled fraction in [0, 1]. */
  fraction: number;
  color?: string;
}

/** Thin rounded progress track with a percentage-width fill. */
export function ProgressBar({ fraction, color = '#2ABB7A' }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <view className="ProgressBar">
      <view
        className="ProgressBar-fill"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </view>
  );
}
