import {afterEach, describe, expect, it, vi} from 'vitest';
import {countStarted, generateJson, type GeminiProgress} from './gemini';

afterEach(() => vi.unstubAllGlobals());

/** A streamed answer: one server-sent event per piece of its text. */
function stream(pieces: string[], finishReason = 'STOP') {
  return pieces
    .map((text, i) => {
      const last = i === pieces.length - 1;
      const candidate = {
        content: {parts: [{text}]},
        ...(last && {finishReason}),
      };
      return `data: ${JSON.stringify({candidates: [candidate]})}\n\n`;
    })
    .join('');
}

const ask = (onProgress?: (p: GeminiProgress) => void) =>
  generateJson({
    apiKey: 'k',
    model: 'gemini-flash-latest',
    onProgress,
    system: 'Return JSON.',
    contents: 'x',
    schema: {type: 'OBJECT'},
  });

describe('generateJson', () => {
  it('puts the streamed answer together, and reports each stage', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          stream(['{"tasks": [{"title": "A"}, ', '{"title": "B"}]}']),
        ),
    );
    const seen: GeminiProgress[] = [];
    expect(await ask(p => seen.push(p))).toEqual({
      tasks: [{title: 'A'}, {title: 'B'}],
    });
    expect(seen).toEqual([
      {stage: 'loading', received: ''},
      {stage: 'waiting', received: ''},
      {stage: 'receiving', received: '{"tasks": [{"title": "A"}, '},
      {
        stage: 'receiving',
        received: '{"tasks": [{"title": "A"}, {"title": "B"}]}',
      },
      {
        stage: 'checking',
        received: '{"tasks": [{"title": "A"}, {"title": "B"}]}',
      },
    ]);
  });

  it('explains an answer cut off, and an error in the middle of the stream', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(stream(['{"tasks": ['], 'MAX_TOKENS')),
    );
    await expect(ask()).rejects.toThrow(/cut off/);
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          `${stream(['{"tasks": ['], '')}data: ${JSON.stringify({
            error: {code: 503, message: 'The model is overloaded.'},
          })}\n\n`,
        ),
    );
    await expect(ask()).rejects.toThrow('Gemini: The model is overloaded.');
  });
});

describe('countStarted', () => {
  it('counts the objects begun so far by a field, not the same words in text', () => {
    const text = JSON.stringify({
      tasks: [{title: 'A', notes: 'the "title" page'}, {title: 'B'}],
    });
    expect(countStarted(text, 'title')).toBe(2);
    expect(countStarted(text.slice(0, 30), 'title')).toBe(1);
    expect(countStarted('', 'title')).toBe(0);
  });
});
