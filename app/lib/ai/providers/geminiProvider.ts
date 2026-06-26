import { extractEventsResponseSchema, type ExtractEventsRequest, type ExtractEventsResponse } from '../schema';

export async function extractWithGemini(input: ExtractEventsRequest): Promise<ExtractEventsResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です。AI_PROVIDER=mock で開発するか、サーバー環境変数に設定してください。');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `あなたは日本語本文から予定候補を抽出します。Asia/Tokyo基準。曖昧な日時は確定せずneedsConfirmation=true。JSONのみ返してください。型: {"events":[{"title":"","category":"interview|briefing|deadline|web_test|lab|part_time_job|other","isAllDay":false,"startDateTime":null,"endDateTime":null,"location":null,"description":"","sourceText":"","confidence":0.0,"needsConfirmation":true,"missingFields":[],"ambiguityNotes":[]}],"globalAmbiguityNotes":[]}。受信日:${input.receivedDate || '未指定'} TZ:${input.timeZone}\n本文:\n${input.text}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generationConfig: { responseMimeType: 'application/json' }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }) });
  if (!res.ok) throw new Error(`Gemini API 呼び出しに失敗しました (${res.status})。設定とFree Tierの制限を確認してください。`);
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof raw !== 'string') throw new Error('Gemini APIの応答形式が想定外です。再試行してください。');
  try { return extractEventsResponseSchema.parse(JSON.parse(raw)); } catch (e) { throw new Error(`GeminiのJSON検証に失敗しました。再試行してください。詳細: ${e instanceof Error ? e.message : 'unknown'}`); }
}
