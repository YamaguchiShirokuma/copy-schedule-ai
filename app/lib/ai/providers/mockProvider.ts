import type { ExtractedCalendarEvent, ExtractEventsRequest, ExtractEventsResponse } from '../schema';

const JST_OFFSET = '+09:00';
const ASSUMED_YEAR_NOTE = '年が明記されていないため現在年を仮定';
const URL_RE = /https?:\/\/[^\s\u3000]+/;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toJstDateTime(year: number, month: number, day: number, hour: number, minute = 0) {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${JST_OFFSET}`;
}

function addHours(jstDateTime: string, hours: number) {
  const withoutOffset = jstDateTime.replace(JST_OFFSET, '+09:00');
  const date = new Date(withoutOffset);
  date.setHours(date.getHours() + hours);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00${JST_OFFSET}`;
}

function assumedYear(input: ExtractEventsRequest) {
  if (input.receivedDate) return Number(input.receivedDate.slice(0, 4));
  return new Date().getFullYear();
}

function hasExplicitYear(text: string) {
  return /\d{4}年/.test(text);
}

function extractUrl(text: string) {
  return text.match(URL_RE)?.[0] ?? null;
}

function extractCompanyName(text: string) {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  const match = firstLine.match(/^(.+?)(?:採用担当|人事担当|担当)/);
  if (match?.[1]) return match[1].replace(/様$/, '').trim();
  return null;
}

function onlineLocation(text: string, meetingUrl: string | null) {
  return meetingUrl || /Zoom|Meet|Teams|オンライン/i.test(text) ? 'オンライン' : null;
}

function baseEvent(text: string, patch: Partial<ExtractedCalendarEvent>): ExtractedCalendarEvent {
  return {
    title: '予定',
    category: 'other',
    isAllDay: false,
    startDateTime: null,
    endDateTime: null,
    location: null,
    meetingUrl: null,
    description: '',
    sourceText: text,
    confidence: 0.75,
    needsConfirmation: false,
    missingFields: [],
    ambiguityNotes: [],
    ...patch,
  };
}

function parseSingleInterview(input: ExtractEventsRequest): ExtractedCalendarEvent | null {
  const { text } = input;
  if (!/面接/.test(text)) return null;

  const dateTime = text.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2})(?::(\d{2})|時(?:([0-5]?\d)分?)?)/);
  const timeOnly = text.match(/(?:^|[^\d])(\d{1,2})(?::(\d{2})|時(?:([0-5]?\d)分?)?)\s*から/);
  if (!dateTime && !timeOnly) return null;

  const year = dateTime?.[1] ? Number(dateTime[1]) : assumedYear(input);
  const month = dateTime ? Number(dateTime[2]) : Number(input.receivedDate?.slice(5, 7) ?? 1);
  const day = dateTime ? Number(dateTime[3]) : Number(input.receivedDate?.slice(8, 10) ?? 1);
  const hour = Number(dateTime?.[4] ?? timeOnly?.[1]);
  const minute = Number(dateTime?.[5] ?? dateTime?.[6] ?? timeOnly?.[2] ?? timeOnly?.[3] ?? 0);
  const durationHours = Number(text.match(/(\d+)\s*時間/)?.[1] ?? 1);
  const startDateTime = toJstDateTime(year, month, day, hour, minute);
  const endDateTime = addHours(startDateTime, durationHours);
  const meetingUrl = extractUrl(text);
  const company = extractCompanyName(text);
  const yearAssumed = !hasExplicitYear(text);

  return baseEvent(text, {
    title: company ? `${company} 面接` : 'オンライン面接',
    category: 'interview',
    startDateTime,
    endDateTime,
    location: onlineLocation(text, meetingUrl),
    meetingUrl,
    description: meetingUrl ? `面接リンク: ${meetingUrl}` : '面接予定',
    confidence: 0.9,
    needsConfirmation: yearAssumed,
    ambiguityNotes: yearAssumed ? [ASSUMED_YEAR_NOTE] : [],
  });
}

function parseDeadline(input: ExtractEventsRequest): ExtractedCalendarEvent | null {
  if (!input.text.includes('1週間以内')) return null;
  const base = input.receivedDate ? new Date(`${input.receivedDate}T00:00:00${JST_OFFSET}`) : null;
  const deadline = base ? new Date(base.getTime() + 7 * 86400000) : null;
  const iso = deadline
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(deadline)
        .concat(`T23:59:00${JST_OFFSET}`)
    : null;
  return baseEvent(input.text, {
    title: '課題提出期限',
    category: 'deadline',
    startDateTime: iso,
    endDateTime: iso,
    description: '本メールより1週間以内に課題提出',
    confidence: 0.84,
    needsConfirmation: !base,
    missingFields: base ? [] : ['受信日'],
    ambiguityNotes: base
      ? ['受信日から7日後の23:59として解釈しました']
      : ['受信日がないため「本メールより1週間以内」を確定できません'],
  });
}

function parseBriefings(input: ExtractEventsRequest): ExtractedCalendarEvent[] {
  if (!input.text.includes('説明会')) return [];
  const year = assumedYear(input);
  return [...input.text.matchAll(/(\d{1,2})月\s*(\d{1,2})日[^\d]*(\d{1,2}):(\d{2})[〜~-](\d{1,2}):(\d{2})/g)].map(
    (match, index) => {
      const startDateTime = toJstDateTime(year, Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]));
      const endDateTime = toJstDateTime(year, Number(match[1]), Number(match[2]), Number(match[5]), Number(match[6]));
      return baseEvent(input.text, {
        title: `説明会候補 ${index + 1}`,
        category: 'briefing',
        startDateTime,
        endDateTime,
        description: '説明会参加希望日の候補',
        confidence: 0.9,
        needsConfirmation: true,
        missingFields: ['参加する日程の選択'],
        ambiguityNotes: ['複数候補のため登録対象を選択してください', ASSUMED_YEAR_NOTE],
      });
    },
  );
}

export async function extractWithMock(input: ExtractEventsRequest): Promise<ExtractEventsResponse> {
  const interview = parseSingleInterview(input);
  if (interview) return { events: [interview], globalAmbiguityNotes: [] };

  const deadline = parseDeadline(input);
  if (deadline) return { events: [deadline], globalAmbiguityNotes: [] };

  const briefings = parseBriefings(input);
  if (briefings.length > 0) return { events: briefings, globalAmbiguityNotes: ['曜日はMVPでは厳密検証していません'] };

  return {
    events: [
      baseEvent(input.text, {
        title: 'オンライン面接',
        category: 'interview',
        startDateTime: '2026-06-30T15:00:00+09:00',
        endDateTime: '2026-06-30T16:00:00+09:00',
        location: 'オンライン',
        description: '所要時間は1時間程度。参加URLは前日までに送付。',
        confidence: 0.7,
      }),
    ],
    globalAmbiguityNotes: [],
  };
}
