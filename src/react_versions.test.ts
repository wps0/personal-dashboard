import {createRequire} from 'node:module';
import {expect, it} from 'vitest';

const require = createRequire(import.meta.url);

it('react and react-dom are the same version, or React won’t start (error #527)', () => {
  expect(require('react-dom/package.json').version).toBe(
    require('react/package.json').version,
  );
});
