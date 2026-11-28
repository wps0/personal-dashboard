/**
 * @fileoverview The log's charts and numbers: bars now against the past,
 * and number tiles. Colours are in climb.css (validated for both themes).
 */

import {TrendingDown, TrendingUp} from 'lucide-react';
import type {ReactNode} from 'react';
import type {GradeRow} from './model/stats';

/** A count as is, an average to one decimal. */
export function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A legend key: a filled swatch, or the long-dashed outline of the past. */
function Key({dashed, children}: {dashed?: boolean; children: ReactNode}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="10" aria-hidden>
        {dashed ? (
          <rect
            x="0.75"
            y="0.75"
            width="14.5"
            height="8.5"
            rx="2"
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
        ) : (
          <rect width="16" height="10" rx="2" fill="var(--series-1)" />
        )}
      </svg>
      {children}
    </span>
  );
}

/**
 * Horizontal bars, one row per grade: now filled, the past as a long-dashed
 * outline (not filled) on the same scale, and both numbers beside them.
 */
export function NowVsPast({
  rows,
  nowLabel,
  pastLabel,
}: {
  rows: readonly GradeRow[];
  nowLabel: string;
  pastLabel: string;
}) {
  const max = Math.max(...rows.flatMap(r => [r.now, r.past ?? 0]), 1);
  const pct = (n: number) => `${(n / max) * 100}%`;
  const past = rows.some(r => r.past !== null);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg">
        <Key>{nowLabel}</Key>
        {past && <Key dashed>{pastLabel}</Key>}
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[13px] text-fg">{r.label}</span>
            <svg
              className="h-6 min-w-0 flex-1 overflow-visible"
              role="img"
              aria-label={`${r.label}: ${num(r.now)}${r.past === null ? '' : `, ${pastLabel.toLowerCase()} ${num(r.past)}`}`}
            >
              {r.now > 0 && (
                <rect
                  x="0"
                  y="3"
                  width={pct(r.now)}
                  height="18"
                  rx="4"
                  fill="var(--series-1)"
                />
              )}
              {!!r.past && (
                <rect
                  x="0.75"
                  y="0.75"
                  width={`calc(${pct(r.past)} - 1.5px)`}
                  height="22.5"
                  rx="5"
                  fill="none"
                  stroke="var(--color-fg)"
                  strokeWidth="1.5"
                  strokeDasharray="7 4"
                />
              )}
            </svg>
            <span className="w-16 shrink-0 text-right text-[13px] text-fg tabular-nums">
              {num(r.now)}
              {r.past !== null && (
                <span className="text-dim"> / {num(r.past)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A number, and how it compares: which way it went, green when that's the
 * better way (up, but down for tries per climb).
 */
export function Tile({
  label,
  value,
  was,
  trend,
  better = 'up',
}: {
  label: string;
  value: ReactNode;
  was?: string;
  trend?: 'up' | 'down';
  better?: 'up' | 'down';
}) {
  const Icon = trend === 'up' ? TrendingUp : TrendingDown;
  const good = trend === better;
  return (
    <div className="rounded-2xl bg-raised px-4 py-3">
      <div className="text-[12px] text-dim">{label}</div>
      <div className="mt-0.5 text-[24px] font-semibold text-strong">
        {value}
      </div>
      {was && (
        <div className="flex items-center gap-1 text-[12px] text-dim">
          {trend && (
            <Icon
              size={13}
              className={good ? 'text-ok' : 'text-warn'}
              aria-label={`${trend}, ${good ? 'better' : 'worse'}`}
            />
          )}
          {was}
        </div>
      )}
    </div>
  );
}

/** Which way `now` went from `past`, if it moved. */
export function trendOf(
  now: number,
  past: number | null | undefined,
): 'up' | 'down' | undefined {
  if (past === null || past === undefined || now === past) return undefined;
  return now > past ? 'up' : 'down';
}
