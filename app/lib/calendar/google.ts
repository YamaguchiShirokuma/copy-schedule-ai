import type { ExtractedCalendarEvent } from '../ai/schema';


const scope = 'https://www.googleapis.com/auth/calendar.events';

export function googleAuthUrl() {
  const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth設定が未設定です。GOOGLE_CLIENT_ID と GOOGLE_REDIRECT_URI を設定してください。');
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export async function exchangeCode(code: string) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth設定が未設定です。Client ID/Secret/Redirect URIを設定してください。');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new Error('Google OAuthトークン交換に失敗しました。');
  return response.json();
}

function buildDescription(event: ExtractedCalendarEvent) {
  const parts = [event.description];
  if (event.meetingUrl && !event.description.includes(`面接リンク: ${event.meetingUrl}`)) {
    parts.push(`面接リンク: ${event.meetingUrl}`);
  }
  parts.push(`--- sourceText ---\n${event.sourceText}`);
  return parts.filter(Boolean).join('\n\n');
}

export async function createGoogleEvent(accessToken: string, event: ExtractedCalendarEvent) {
  const body: Record<string, unknown> = {
    summary: event.title,
    location: event.location || (event.meetingUrl ? 'オンライン' : undefined),
    description: buildDescription(event),
  };

  if (event.isAllDay) {
    const date = (event.startDateTime || '').slice(0, 10);
    body.start = { date };
    body.end = { date };
  } else {
    body.start = { dateTime: event.startDateTime, timeZone: 'Asia/Tokyo' };
    body.end = { dateTime: event.endDateTime || event.startDateTime, timeZone: 'Asia/Tokyo' };
  }

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

