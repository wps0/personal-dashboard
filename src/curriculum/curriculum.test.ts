import ex1Text from '../../docs/curriculum-import/example-1.txt?raw';
import ex1Expected from '../../docs/curriculum-import/example-1.expected.json';
import ex2Text from '../../docs/curriculum-import/example-2.txt?raw';
import ex2Expected from '../../docs/curriculum-import/example-2.expected.json';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ItemKind} from '../model/types';
import {
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  extractCurriculum,
  isVerbatim,
  itemsFromTopics,
  lectureNumber,
  notVerbatim,
  parseResponse,
  validateResult,
  type CurriculumResult,
} from './curriculum';

const ex1 = {text: ex1Text, expected: ex1Expected as CurriculumResult};
const ex2 = {text: ex2Text, expected: ex2Expected as CurriculumResult};

/** A generateContent response carrying `json` as the model's text. */
function reply(json: unknown) {
  return {
    candidates: [
      {content: {parts: [{text: JSON.stringify(json)}]}, finishReason: 'STOP'},
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('validateResult / parseResponse', () => {
  it('accepts the expected answers for both examples', () => {
    expect(parseResponse(reply(ex1.expected))).toEqual(ex1.expected);
    expect(parseResponse(reply(ex2.expected))).toEqual(ex2.expected);
  });

  it('rejects malformed answers with a readable error', () => {
    expect(() => validateResult({})).toThrow(/no topic list/);
    expect(() => validateResult({topics: [{description: 'x'}]})).toThrow(
      /Topic 1 .* incomplete/,
    );
    expect(() =>
      validateResult({
        topics: [{title: 'T', description: '', lectureFrom: 'one'}],
      }),
    ).toThrow(/invalid lecture numbers/);
  });

  it('fills a missing half of a lecture range and optional fields', () => {
    expect(validateResult({topics: [{title: ' T ', lectureFrom: 3}]})).toEqual({
      topics: [{title: 'T', description: '', lectureFrom: 3, lectureTo: 3}],
      courseNotes: '',
      warnings: [],
      corrections: [],
    });
  });

  it('drops lecture numbers that are not plausible, keeping the topic', () => {
    const topic = (lectureFrom: unknown, lectureTo: unknown) =>
      validateResult({topics: [{title: 'T', lectureFrom, lectureTo}]})
        .topics[0];
    const range = (from: unknown, to: unknown) => {
      const t = topic(from, to);
      return [t.lectureFrom, t.lectureTo];
    };
    expect(range(0, 0)).toEqual([null, null]);
    expect(range(1.5, null)).toEqual([null, null]);
    expect(range(-2, 4)).toEqual([4, 4]);
    expect(range(1, 2_000_000_000)).toEqual([1, 1]);
    expect(range(501, 502)).toEqual([null, null]);
    expect(range(500, 500)).toEqual([500, 500]);
  });

  it('puts reversed ranges in order and caps their length', () => {
    const range = (lectureFrom: number, lectureTo: number) => {
      const [t] = validateResult({
        topics: [{title: 'T', lectureFrom, lectureTo}],
      }).topics;
      return [t.lectureFrom, t.lectureTo];
    };
    expect(range(5, 3)).toEqual([3, 5]);
    expect(range(1, 300)).toEqual([1, 100]);
    expect(range(400, 200)).toEqual([200, 299]);
  });

  it('explains blocked, cut-off and non-JSON answers', () => {
    expect(() =>
      parseResponse({promptFeedback: {blockReason: 'SAFETY'}}),
    ).toThrow(/refused/);
    expect(() =>
      parseResponse({
        candidates: [
          {content: {parts: [{text: '{"to'}]}, finishReason: 'MAX_TOKENS'},
        ],
      }),
    ).toThrow(/cut off/);
    expect(() =>
      parseResponse({candidates: [{content: {parts: [{text: 'Sure!'}]}}]}),
    ).toThrow(/valid JSON/);
    expect(() => parseResponse({candidates: []})).toThrow(/no answer/);
  });

  it('explains answers stopped by a filter', () => {
    const stopped = (finishReason: string, text = '') =>
      parseResponse({
        candidates: [{content: {parts: [{text}]}, finishReason}],
      });
    expect(() => stopped('RECITATION', '{"topics": [{"ti')).toThrow(
      /recitation filter/,
    );
    expect(() => stopped('RECITATION')).toThrow(/recitation filter/);
    expect(() => stopped('SAFETY')).toThrow(/safety filter/);
    expect(() => stopped('PROHIBITED_CONTENT')).toThrow(/prohibited content/);
  });
});

describe('verbatim check', () => {
  it('finds every expected title, description and note in the source', () => {
    for (const {text, expected} of [ex1, ex2]) {
      const flags = notVerbatim(expected, text);
      expect(flags.topics.every(f => !f.title && !f.description)).toBe(true);
      expect(flags.courseNotes).toBe(false); // example 2 needs its correction undone
    }
  });

  it('ignores whitespace and line breaks', () => {
    expect(isVerbatim('Jak  rozmawiać z\ngrafikami', ex1.text)).toBe(true);
  });

  it('flags paraphrased or translated text', () => {
    const changed = structuredClone(ex1.expected);
    changed.topics[0].title = 'Giving presentations';
    changed.topics[2].description = 'Problemy etyczne technologii.';
    const flags = notVerbatim(changed, ex1.text);
    expect(flags.topics[0]).toEqual({title: true, description: false});
    expect(flags.topics[2]).toEqual({title: false, description: true});
  });

  it('flags a change the model did not report', () => {
    const notes = ex2.expected.courseNotes;
    expect(isVerbatim(notes, ex2.text, [])).toBe(false);
    expect(isVerbatim(notes, ex2.text, ex2.expected.corrections)).toBe(true);
  });
});

describe('itemsFromTopics', () => {
  it('one class item per topic, with its description as notes', () => {
    const items = itemsFromTopics(ex1.expected.topics, 'topic', 1.5);
    expect(items).toHaveLength(6);
    expect(items[1]).toEqual({
      kind: ItemKind.CLASS,
      estimateHours: 1.5,
      title: 'Pisanie prac naukowych (po angielsku)',
      notes: ex1.expected.topics[1].description,
    });
  });

  it('one item per lecture, merging lectures listed under two topics', () => {
    const items = itemsFromTopics(ex1.expected.topics, 'lecture');
    expect(items.map(i => i.title)).toEqual([
      '1. Wygłaszanie prezentacji',
      '2. Wygłaszanie prezentacji',
      '3. Wygłaszanie prezentacji',
      '4. Wygłaszanie prezentacji',
      '5. Pisanie prac naukowych (po angielsku)',
      '6. Pisanie prac naukowych (po angielsku)',
      '7. Pisanie prac naukowych (po angielsku)',
      '8. Pisanie prac naukowych (po angielsku) / Etyka',
      '9. Etyka / Komunikacja wizualna i projektowanie interfejsów',
      '10. Komunikacja wizualna i projektowanie interfejsów',
      '11. Prawo',
      '12. Prawo',
      '13. Własność intelektualna',
      '14. Własność intelektualna',
    ]);
    expect(items[7].notes).toBe(
      `${ex1.expected.topics[1].description}\n\n${ex1.expected.topics[2].description}`,
    );
  });

  it('single lectures without descriptions (example 2)', () => {
    const items = itemsFromTopics(ex2.expected.topics, 'lecture');
    expect(items).toHaveLength(17);
    expect(items[10]).toEqual({
      kind: ItemKind.CLASS,
      estimateHours: undefined,
      title: '11. Klawiatura multipleksowana 4 ✕ 4',
      notes: undefined,
    });
  });

  it('handles reversed and huge ranges typed in the review', () => {
    const topic = (lectureFrom: number, lectureTo: number) => ({
      title: 'T',
      description: '',
      lectureFrom,
      lectureTo,
    });
    expect(itemsFromTopics([topic(5, 3)], 'lecture').map(i => i.title)).toEqual(
      ['3. T', '4. T', '5. T'],
    );
    const t = Date.now();
    const items = itemsFromTopics([topic(1, 2_000_000_000)], 'lecture');
    expect(Date.now() - t).toBeLessThan(100);
    expect(items).toHaveLength(100);
    expect(items[99].title).toBe('100. T');
  });

  it('keeps topics without lecture numbers as one item each', () => {
    const items = itemsFromTopics(
      [{title: 'Wstęp', description: '', lectureFrom: null, lectureTo: null}],
      'lecture',
    );
    expect(items.map(i => i.title)).toEqual(['Wstęp']);
  });
});

describe('lectureNumber', () => {
  it('keeps positive integers up to 500, as typed in the review', () => {
    expect([1, 42, 500].map(lectureNumber)).toEqual([1, 42, 500]);
    expect([0, -1, 2.5, 501, NaN, null].map(lectureNumber)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('extractCurriculum', () => {
  it('asks Gemini for structured JSON at temperature 0, with the key in a header', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(reply(ex2.expected))),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await extractCurriculum(ex2.text, {
      apiKey: 'AIza-test',
      model: 'gemini-flash-latest',
    });
    expect(out.topics).toHaveLength(17);
    const [url, init = {}] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    );
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('AIza-test');
    expect(String(url)).not.toContain('AIza');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    });
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_INSTRUCTION);
    expect(body.contents[0].parts[0].text).toBe(ex2.text);
  });

  it('explains API errors', async () => {
    const fail = (status: number, message: string) =>
      vi.stubGlobal(
        'fetch',
        async () => new Response(JSON.stringify({error: {message}}), {status}),
      );
    const call = () => extractCurriculum('x', {apiKey: 'k', model: 'nope'});
    fail(400, 'API key not valid. Please pass a valid API key.');
    await expect(call()).rejects.toThrow(/API key/);
    fail(404, 'models/nope is not found');
    await expect(call()).rejects.toThrow(/model “nope”/);
    fail(429, 'Resource exhausted');
    await expect(call()).rejects.toThrow(/quota/);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(call()).rejects.toThrow(/offline/);
  });

  it('asks for a reload when the Gemini client can’t be loaded', async () => {
    vi.resetModules();
    vi.doMock('@google/genai', () => {
      throw new TypeError(
        'Failed to fetch dynamically imported module: https://x.example/assets/genai.js',
      );
    });
    try {
      const {extractCurriculum: extract} = await import('./curriculum');
      await expect(
        extract('x', {apiKey: 'k', model: 'gemini-flash-latest'}),
      ).rejects.toThrow('the app was probably updated: reload the page');
    } finally {
      vi.doUnmock('@google/genai');
      vi.resetModules();
    }
  });
});

/**
 * Opt-in live evaluation against the real API:
 *   GEMINI_API_KEY=… [GEMINI_MODEL=…] npm test -- curriculum
 */
const env =
  (globalThis as {process?: {env: Record<string, string | undefined>}}).process
    ?.env ?? {};
describe.skipIf(!env.GEMINI_API_KEY)('live Gemini evaluation', () => {
  const opts = {
    apiKey: env.GEMINI_API_KEY ?? '',
    model: env.GEMINI_MODEL ?? 'gemini-flash-latest',
  };
  for (const [name, ex] of [
    ['example 1', ex1],
    ['example 2', ex2],
  ] as const)
    it(`${name}: same topics, verbatim`, {timeout: 120_000}, async () => {
      const out = await extractCurriculum(ex.text, opts);
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      expect(
        out.topics.map(t => [
          norm(t.title),
          norm(t.description),
          t.lectureFrom,
          t.lectureTo,
        ]),
      ).toEqual(
        ex.expected.topics.map(t => [
          norm(t.title),
          norm(t.description),
          t.lectureFrom,
          t.lectureTo,
        ]),
      );
      const flags = notVerbatim(out, ex.text);
      expect(flags.topics.some(f => f.title || f.description)).toBe(false);
    });
});
