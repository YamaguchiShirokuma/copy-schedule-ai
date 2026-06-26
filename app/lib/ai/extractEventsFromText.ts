import { extractEventsRequestSchema, extractEventsResponseSchema } from './schema';
import { extractWithGemini } from './providers/geminiProvider';
import { extractWithMock } from './providers/mockProvider';

export async function extractEventsFromText(raw: unknown) {
  const input = extractEventsRequestSchema.parse(raw);
  const provider = process.env.AI_PROVIDER || 'mock';
  const result = provider === 'gemini' ? await extractWithGemini(input) : await extractWithMock(input);
  return extractEventsResponseSchema.parse(result);
}
