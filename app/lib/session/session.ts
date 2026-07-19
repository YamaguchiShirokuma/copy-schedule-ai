import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
export type SessionData = { googleTokens?: { access_token?: string; refresh_token?: string; expiry_date?: number } };
const name = 'copy-schedule-ai-session';
function password() { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error('SESSION_SECRET は32文字以上で設定してください。'); return s; }
export async function getSession(): Promise<SessionData> { const c = (await cookies()).get(name)?.value; if (!c) return {}; try { return await unsealData<SessionData>(c, { password: password() }); } catch { return {}; } }
export async function setSession(data: SessionData) { (await cookies()).set(name, await sealData(data, { password: password() }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }); }
