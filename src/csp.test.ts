import {describe, expect, it} from 'vitest';
import html from '../index.html?raw';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('Content-Security-Policy in index.html', () => {
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
    html,
  )?.[1];

  it('comes before any script', () => {
    expect(csp).toBeDefined();
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(
      html.indexOf('<script'),
    );
  });

  it('allows each inline script by its exact hash', async () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(inline).not.toHaveLength(0);
    for (const [, body] of inline)
      expect(csp).toContain(`'sha256-${await sha256(body)}'`);
  });
});
