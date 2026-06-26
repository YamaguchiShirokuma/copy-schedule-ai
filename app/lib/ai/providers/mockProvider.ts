import type { ExtractEventsRequest, ExtractEventsResponse } from '../schema';

const tz = '+09:00';
export async function extractWithMock(input: ExtractEventsRequest): Promise<ExtractEventsResponse> {
  const text = input.text;
  if (text.includes('1週間以内')) {
    const base = input.receivedDate ? new Date(`${input.receivedDate}T00:00:00${tz}`) : null;
    const deadline = base ? new Date(base.getTime() + 7 * 86400000).toISOString().replace('Z', tz) : null;
    return { events: [{ title: '課題提出期限', category: 'deadline', isAllDay: false, startDateTime: deadline, endDateTime: deadline, location: null, description: '本メールより1週間以内に課題提出', sourceText: text, confidence: 0.84, needsConfirmation: !base, missingFields: base ? [] : ['受信日'], ambiguityNotes: base ? ['受信日から7日後の23:59相当として確認してください'] : ['受信日がないため「本メールより1週間以内」を確定できません'] }], globalAmbiguityNotes: [] };
  }
  if (text.includes('説明会')) {
    return { events: ['2026-07-03T10:00:00+09:00','2026-07-04T14:00:00+09:00','2026-07-07T18:00:00+09:00'].map((start, i) => ({ title: `説明会候補 ${i + 1}`, category: 'briefing' as const, isAllDay: false, startDateTime: start, endDateTime: start.replace(/T(10|14|18):00:00/, (_, h) => `T${String(Number(h)+1).padStart(2,'0')}:00:00`), location: null, description: '説明会参加希望日の候補', sourceText: text, confidence: 0.9, needsConfirmation: true, missingFields: ['参加する日程の選択'], ambiguityNotes: ['複数候補のため登録対象を選択してください'] })), globalAmbiguityNotes: ['曜日はMVPでは厳密検証していません'] };
  }
  return { events: [{ title: 'オンライン面接', category: 'interview', isAllDay: false, startDateTime: '2026-06-30T15:00:00+09:00', endDateTime: '2026-06-30T16:00:00+09:00', location: 'オンライン', description: '所要時間は1時間程度。参加URLは前日までに送付。', sourceText: text, confidence: 0.92, needsConfirmation: false, missingFields: [], ambiguityNotes: [] }], globalAmbiguityNotes: [] };
}
