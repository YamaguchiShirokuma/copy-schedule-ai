import { NextResponse } from 'next/server';
import { exchangeCode } from '@/app/lib/calendar/google';
import { setSession } from '@/app/lib/session/session';
export async function GET(req: Request) { try { const code = new URL(req.url).searchParams.get('code'); if (!code) throw new Error('codeがありません'); const tokens = await exchangeCode(code); await setSession({ googleTokens: tokens }); return NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'); } catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'OAuth callbackに失敗しました' }, { status: 500 }); } }
