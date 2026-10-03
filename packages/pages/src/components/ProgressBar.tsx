import { useEffect, useState } from '@lynx-js/react';

interface ProgressBarProps {
  /** Filled fraction in [0, 1]. */
  fraction: number;
  color?: string;
}

/** Thin rounded progress track with a percentage-width fill. */
export function ProgressBar({ fraction, color = '#2ABB7A' }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedWidth(pct), 50);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <view className="ProgressBar">
      <view
        className="ProgressBar-fill"
        style={{ width: `${animatedWidth}%`, backgroundColor: color }}
      />
    </view>
  );
}
