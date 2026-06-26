import { NextResponse } from 'next/server';
import { extractEventsFromText } from '@/app/lib/ai/extractEventsFromText';
export async function POST(req: Request) { try { return NextResponse.json(await extractEventsFromText(await req.json())); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'AI抽出に失敗しました。本文を見直して再試行してください。' }, { status: 400 }); } }
