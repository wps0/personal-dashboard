import {fmtH} from '../format';

/**
 * A week's work against its target: the hours logged, solid, then the
 * planned hours not logged yet, hatched in the same colour.
 */
export function WorkBar({
  logged,
  planned,
  target,
  label,
  className,
}: {
  logged: number;
  planned: number;
  target: number;
  /** Its name for screen readers; without one it's left to the text beside it. */
  label?: string;
  className: string;
}) {
  const share = (h: number) => Math.max(0, Math.min(100, (h / target) * 100));
  const done = share(logged);
  const ahead = Math.min(100 - done, share(planned));
  const text = `${fmtH(logged)} logged, ${fmtH(planned)} planned, of ${fmtH(target)}`;
  return (
    <div
      className={`flex overflow-hidden rounded-full bg-raised ${className}`}
      title={text}
      {...(label
        ? {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': target,
            'aria-valuenow': logged,
            'aria-valuetext': text,
          }
        : {'aria-hidden': true})}
    >
      <div className="h-full bg-accent" style={{width: `${done}%`}} />
      <div className="planned h-full" style={{width: `${ahead}%`}} />
    </div>
  );
}
