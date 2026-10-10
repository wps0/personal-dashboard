import { useEffect, useState } from 'react';

interface Props {
  percent: number;
  color: string;
  size?: number;
  stroke?: number;
}

/** Circular progress indicator that fills clockwise from 12 o'clock. */
export function ProgressRing({ percent, color, size = 56, stroke = 5 }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  // Start empty and fill up on mount, so the ring visibly "loads" its progress.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(p));
    return () => cancelAnimationFrame(raf);
  }, [p]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${p}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap={shown > 0 ? 'round' : 'butt'}
        strokeDasharray={`${(shown / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-fg tabular-nums"
        fontSize={size * 0.24}
      >
        {p}%
      </text>
    </svg>
  );
}
