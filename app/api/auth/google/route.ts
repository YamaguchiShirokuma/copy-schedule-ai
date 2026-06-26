import { NextResponse } from 'next/server';
import { googleAuthUrl } from '@/app/lib/calendar/google';
export async function GET() { try { return NextResponse.redirect(googleAuthUrl()); } catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'OAuth開始に失敗しました' }, { status: 500 }); } }
