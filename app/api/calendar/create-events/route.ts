import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractedCalendarEventSchema } from '@/app/lib/ai/schema';
import { createGoogleEvent } from '@/app/lib/calendar/google';
import { getSession } from '@/app/lib/session/session';
const reqSchema = z.object({ events: z.array(extractedCalendarEventSchema) });
export async function POST(req: Request) { try { const { events } = reqSchema.parse(await req.json()); const session = await getSession(); const token = session.googleTokens?.access_token; if (!token) return NextResponse.json({ error: 'Googleログインが必要です。' }, { status: 401 }); const results = await Promise.all(events.map(async (event) => { try { if (!event.startDateTime || (!event.isAllDay && !event.endDateTime)) throw new Error('日時が不正です。'); const created = await createGoogleEvent(token, event); return { title: event.title, ok: true, htmlLink: created.htmlLink }; } catch(e) { return { title: event.title, ok: false, error: e instanceof Error ? e.message : '登録に失敗しました' }; } })); return NextResponse.json({ results }); } catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : '登録に失敗しました' }, { status: 400 }); } }
