import { describe, expect, it } from 'vitest';
import { extractEventsFromText } from '../app/lib/ai/extractEventsFromText';

describe('mock provider', () => {
  it('extracts interview without api key', async () => {
    process.env.AI_PROVIDER = 'mock';
    const res = await extractEventsFromText({ text: '6月30日（火）15:00よりオンライン面接を実施いたします。', receivedDate: null, timeZone: 'Asia/Tokyo' });
    expect(res.events[0].title).toContain('面接');
    expect(res.events[0].startDateTime).toBe('2026-06-30T15:00:00+09:00');
  });
});
