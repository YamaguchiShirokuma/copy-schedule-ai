import { describe, expect, it } from 'vitest';
import { extractEventsFromText } from '../app/lib/ai/extractEventsFromText';

const lineYahooInput = `LINEヤフー採用担当の田中です。

6月24日14時から1時間の面接を実施します。

リンクは以下です。
https://zoom.us`;

describe('mock provider', () => {
  it('extracts interview without api key', async () => {
    process.env.AI_PROVIDER = 'mock';
    const res = await extractEventsFromText({
      text: '6月30日（火）15:00よりオンライン面接を実施いたします。',
      receivedDate: null,
      timeZone: 'Asia/Tokyo',
    });
    expect(res.events[0].title).toContain('面接');
    expect(res.events[0].startDateTime).toBe('2026-06-30T15:00:00+09:00');
  });

  it('extracts LINE Yahoo interview details from realistic pasted text', async () => {
    process.env.AI_PROVIDER = 'mock';
    const res = await extractEventsFromText({
      text: lineYahooInput,
      receivedDate: null,
      timeZone: 'Asia/Tokyo',
    });

    expect(res.events[0]).toMatchObject({
      title: 'LINEヤフー 面接',
      category: 'interview',
      startDateTime: '2026-06-24T14:00:00+09:00',
      endDateTime: '2026-06-24T15:00:00+09:00',
      location: 'オンライン',
      meetingUrl: 'https://zoom.us',
      needsConfirmation: true,
    });
    expect(res.events[0].ambiguityNotes).toContain('年が明記されていないため現在年を仮定');
  });
});
