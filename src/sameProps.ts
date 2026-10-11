/**
 * Props comparison for React.memo that also treats arrays holding the same
 * items (by identity) as equal, so a list rebuilt from unchanged data doesn't
 * re-render the component.
 */
export function sameProps<P extends object>(a: P, b: P): boolean {
  const keys = Object.keys(a) as (keyof P)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(k => {
    const x = a[k];
    const y = b[k];
    if (Object.is(x, y)) return true;
    return (
      Array.isArray(x) &&
      Array.isArray(y) &&
      x.length === y.length &&
      x.every((v, i) => Object.is(v, y[i]))
    );
  });
}
