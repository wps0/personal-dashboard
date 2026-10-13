import ex1Text from '../../docs/curriculum-import/example-1.txt?raw';
import ex1Expected from '../../docs/curriculum-import/example-1.expected.json';
import ex2Text from '../../docs/curriculum-import/example-2.txt?raw';
import ex2Expected from '../../docs/curriculum-import/example-2.expected.json';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  extractCurriculum,
  isVerbatim,
  itemsFromTopics,
  notVerbatim,
  parseResponse,
  validateResult,
  type CurriculumResult,
} from './curriculum';

const ex1 = {text: ex1Text, expected: ex1Expected as CurriculumResult};
const ex2 = {text: ex2Text, expected: ex2Expected as CurriculumResult};

/** A generateContent response carrying `json` as the model's text. */
const reply = (json: unknown) => ({
  candidates: [
    {content: {parts: [{text: JSON.stringify(json)}]}, finishReason: 'STOP'},
  ],
});

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
      kind: 'class',
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
      kind: 'class',
      estimateHours: undefined,
      title: '11. Klawiatura multipleksowana 4 ✕ 4',
      notes: undefined,
    });
  });

  it('keeps topics without lecture numbers as one item each', () => {
    const items = itemsFromTopics(
      [{title: 'Wstęp', description: '', lectureFrom: null, lectureTo: null}],
      'lecture',
    );
    expect(items.map(i => i.title)).toEqual(['Wstęp']);
  });
});

describe('extractCurriculum', () => {
  it('asks Gemini for structured JSON at temperature 0, with the key in a header', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(reply(ex2.expected))),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await extractCurriculum(ex2.text, {
      apiKey: 'k',
      model: 'gemini-flash-latest',
    });
    expect(out.topics).toHaveLength(17);
    const [url, init = {}] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    );
    expect(init.headers).toMatchObject({'x-goog-api-key': 'k'});
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
