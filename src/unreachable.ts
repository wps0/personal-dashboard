/**
 * For the `default` of a switch that handles every case: the compiler checks
 * none is missing, and it throws if a value outside the type gets there.
 */
export function unreachable(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
