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

/**
 * Whether column `i` of `n` gets its label: every `every`th and the last,
 * but not one that would crowd the last.
 */
function showLabel(i: number, n: number, every: number): boolean {
  if (i === n - 1) return true;
  return i % every === 0 && n - 1 - i >= every / 2;
}

/** A step for gridlines that gives about four lines up to `max`. */
function niceStep(max: number): number {
  const raw = Math.max(1, max / 4);
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) ?? raw;
}

/** Climbs per week (or month), stacked by grade group, easiest at the bottom. */
export function Columns({
  label,
  groups,
  columns,
}: {
  label: string;
  groups: readonly string[];
  columns: readonly {label: string; counts: readonly number[]}[];
}) {
  const w = 360;
  const h = 170;
  const left = 24;
  const top = 8;
  const bottom = 22;
  const most = Math.max(
    1,
    ...columns.map(c => c.counts.reduce((a, n) => a + n, 0)),
  );
  const step = niceStep(most);
  const max = Math.ceil(most / step) * step;
  const band = (w - left) / Math.max(1, columns.length);
  const bar = Math.max(2, Math.min(18, band - 4));
  const y = (n: number) => top + (h - top - bottom) * (1 - n / max);
  const every = Math.ceil(columns.length / 4);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg">
        {groups.map((g, i) => (
          <span key={g} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{background: `var(--grade-${i + 1})`}}
            />
            {g}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label={label}
      >
        {Array.from({length: max / step + 1}, (_, i) => i * step).map(n => (
          <g key={n}>
            <line
              x1={left}
              x2={w}
              y1={y(n)}
              y2={y(n)}
              stroke="var(--color-line)"
            />
            <text
              x={left - 6}
              y={y(n) + 4}
              textAnchor="end"
              className="fill-dim text-[10px] tabular-nums"
            >
              {n}
            </text>
          </g>
        ))}
        {columns.map((c, i) => {
          const x = left + band * i + (band - bar) / 2;
          const total = c.counts.reduce((a, n) => a + n, 0);
          let base = 0;
          return (
            <g key={`${c.label}-${i}`}>
              {c.counts.map((n, g) => {
                if (!n) return null;
                const y0 = y(base);
                base += n;
                const y1 = y(base);
                // 2px of surface between segments.
                return (
                  <rect
                    key={g}
                    x={x}
                    y={y1 + 1}
                    width={bar}
                    height={Math.max(0, y0 - y1 - 2)}
                    rx={base === total ? 3 : 0}
                    fill={`var(--grade-${g + 1})`}
                  />
                );
              })}
              {showLabel(i, columns.length, every) && (
                <text
                  x={x + bar / 2}
                  y={h - 6}
                  textAnchor={i === columns.length - 1 ? 'end' : 'middle'}
                  className="fill-dim text-[10px]"
                >
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The typical (median) grade and the top-N average, column by column; a gap where there were no climbs. */
export function GradeLines({
  points,
  grades,
  topLabel,
}: {
  points: readonly {
    label: string;
    typical: number | null;
    top: number | null;
  }[];
  grades: readonly string[];
  topLabel: string;
}) {
  const w = 360;
  const h = 170;
  const left = 32;
  const right = 36;
  const top = 10;
  const bottom = 22;
  const values = points
    .flatMap(p => [p.typical, p.top])
    .filter((v): v is number => v !== null);
  if (!values.length) return null;
  const lo = Math.max(0, Math.floor(Math.min(...values)) - 1);
  const hi = Math.min(grades.length - 1, Math.ceil(Math.max(...values)) + 1);
  const steps = Math.max(1, hi - lo);
  const x = (i: number) =>
    left + (i * (w - left - right)) / Math.max(1, points.length - 1);
  const y = (v: number) => top + ((hi - v) * (h - top - bottom)) / steps;
  const path = (key: 'typical' | 'top') => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`;
      pen = true;
    });
    return d;
  };
  const lastOf = (key: 'typical' | 'top') => {
    for (let i = points.length - 1; i >= 0; i--) {
      const v = points[i][key];
      if (v !== null) return {i, v};
    }
    return null;
  };
  const every = Math.ceil(points.length / 3);
  const series = [
    {key: 'top' as const, colour: 'var(--series-1)', label: topLabel},
    {
      key: 'typical' as const,
      colour: 'var(--series-2)',
      label: 'Typical climb (median)',
    },
  ];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg">
        {series.map(s => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded"
              style={{background: s.colour}}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label="Grades over time"
      >
        {Array.from({length: steps + 1}, (_, i) => lo + i).map(r => (
          <g key={r}>
            <line
              x1={left}
              x2={w - right}
              y1={y(r)}
              y2={y(r)}
              stroke="var(--color-line)"
            />
            <text
              x={left - 6}
              y={y(r) + 4}
              textAnchor="end"
              className="fill-dim text-[10px]"
            >
              {grades[r]}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          showLabel(i, points.length, every) ? (
            <text
              key={i}
              x={x(i)}
              y={h - 6}
              textAnchor={
                i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'
              }
              className="fill-dim text-[10px]"
            >
              {p.label}
            </text>
          ) : null,
        )}
        {series.map(s => (
          <path
            key={s.key}
            d={path(s.key)}
            fill="none"
            stroke={s.colour}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map(s => {
          const end = lastOf(s.key);
          if (!end) return null;
          return (
            <g key={s.key}>
              <circle
                cx={x(end.i)}
                cy={y(end.v)}
                r={4}
                fill={s.colour}
                stroke="var(--color-raised)"
                strokeWidth={2}
              />
              <text
                x={x(end.i) + 8}
                y={y(end.v) + 4}
                className="fill-strong text-[11px] font-semibold"
              >
                {grades[Math.round(end.v)]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A table of a chart's numbers, for reading them exactly. */
export function Table({
  head,
  rows,
}: {
  head: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-dim">
            {head.map((h, i) => (
              <th
                key={h}
                className={`py-1 font-normal ${i ? 'text-right' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/70">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`py-1.5 ${j ? 'text-right' : 'text-fg'}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
