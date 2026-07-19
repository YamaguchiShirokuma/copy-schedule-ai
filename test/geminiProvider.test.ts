import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractWithGemini, GeminiProviderError } from '../app/lib/ai/providers/geminiProvider';

const input = {
  text: '6月24日14時から面接です。',
  receivedDate: null,
  timeZone: 'Asia/Tokyo',
};

const validGeminiResponse = {
  events: [{
    title: 'オンライン面接',
    category: 'interview',
    isAllDay: false,
    startDateTime: '2026-06-24T14:00:00+09:00',
    endDateTime: '2026-06-24T15:00:00+09:00',
    location: 'オンライン',
    meetingUrl: null,
    description: '面接',
    sourceText: input.text,
    confidence: 0.9,
    needsConfirmation: true,
    missingFields: [],
    ambiguityNotes: ['年が明記されていないため現在年を仮定'],
  }],
  globalAmbiguityNotes: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODELS;
});

describe('Gemini provider rate limit handling', () => {
  it('retries one transient 429 response and returns the validated result', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validGeminiResponse) }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(extractWithGemini(input)).resolves.toEqual(validGeminiResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns an actionable 429 error after the retry is exhausted', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'free tier quota exceeded' } }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } },
    ));

    const error = await extractWithGemini(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GeminiProviderError);
    expect(error).toMatchObject({ statusCode: 429, retryable: true });
    expect((error as Error).message).toContain('Free Tier利用上限');
    expect((error as Error).message).toContain('npm run gemini:check');
    expect((error as Error).message).toContain('gemini-2.5-flash');
  });

  it('tries a configured fallback model when the primary model remains rate limited', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.GEMINI_FALLBACK_MODELS = 'available-fallback-model';
    const rateLimitResponse = () => new Response(
      JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'model quota exceeded' } }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } },
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimitResponse())
      .mockResolvedValueOnce(rateLimitResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validGeminiResponse) }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(extractWithGemini(input)).resolves.toEqual(validGeminiResponse);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain('/available-fallback-model:generateContent');
  });
});
