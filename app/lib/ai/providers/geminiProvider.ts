import { extractEventsResponseSchema, type ExtractEventsRequest, type ExtractEventsResponse } from '../schema';

const MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;

type GeminiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GeminiProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'GeminiProviderError';
  }
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(DEFAULT_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readGeminiError(response: Response): Promise<GeminiErrorResponse> {
  try {
    return await response.json() as GeminiErrorResponse;
  } catch {
    return {};
  }
}

function createGeminiHttpError(status: number, details: GeminiErrorResponse, modelsTried: string[]) {
  const modelSummary = ` 試行モデル: ${modelsTried.join(', ')}。`;
  if (status === 429) {
    const reason = details.error?.message ? ` Geminiからの詳細: ${details.error.message}` : '';
    return new GeminiProviderError(
      `Gemini APIのFree Tier利用上限に達したか、短時間にリクエストが集中しました。少し時間を空けて再試行し、npm run gemini:checkで利用可能モデルとクォータ詳細を確認してください。${modelSummary}${reason}`,
      429,
      true,
    );
  }

  if (status === 401 || status === 403) {
    return new GeminiProviderError(
      'Gemini APIの認証に失敗しました。GEMINI_API_KEYの値と、キーでGemini APIを利用できるか確認してください。',
      status,
    );
  }

  const reason = details.error?.message ? ` 詳細: ${details.error.message}` : '';
  return new GeminiProviderError(
    `Gemini API呼び出しに失敗しました (${status})。時間を空けて再試行してください。${modelSummary}${reason}`,
    status >= 500 ? 503 : 502,
    status >= 500,
  );
}

export async function extractWithGemini(input: ExtractEventsRequest): Promise<ExtractEventsResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が未設定です。AI_PROVIDER=mock で開発するか、サーバー環境変数に設定してください。');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const models = [
    model,
    ...(process.env.GEMINI_FALLBACK_MODELS ?? '').split(',').map((item) => item.trim()).filter(Boolean),
  ].filter((item, index, all) => all.indexOf(item) === index);
  const currentYear = new Date().getFullYear();
  const prompt = `あなたは日本語のLINE/メール本文からGoogleカレンダー登録前の予定候補を抽出するアシスタントです。

必ずJSONのみを返してください。Markdownや説明文は禁止です。
返却形式は次のTypeScript型と完全一致させてください。
{
  "events": [{
    "title": "string",
    "category": "interview|briefing|deadline|web_test|lab|part_time_job|other",
    "isAllDay": false,
    "startDateTime": "ISO8601 with +09:00 or null",
    "endDateTime": "ISO8601 with +09:00 or null",
    "location": "string or null",
    "meetingUrl": "URL string or null",
    "description": "string",
    "sourceText": "string",
    "confidence": 0.0,
    "needsConfirmation": true,
    "missingFields": [],
    "ambiguityNotes": []
  }],
  "globalAmbiguityNotes": []
}

抽出ルール:
- タイムゾーンはAsia/Tokyo。日時は必ず+09:00のISO8601文字列。
- 企業名らしき文字列を予定タイトルに含める。例: 「LINEヤフー採用担当の田中です。」なら企業名は「LINEヤフー」、面接ならtitleは「LINEヤフー 面接」。
- 採用担当、担当者名、田中です、様、です等は予定タイトルに含めない。
- 企業名が取れない面接は「オンライン面接」など汎用タイトルにする。
- URLが本文にあればmeetingUrlに入れ、descriptionにも「面接リンク: URL」の形で含める。
- Zoom / Google Meet / Meet / Teams / URL / オンラインがある場合、locationは「オンライン」。
- 「6月24日14時から1時間」は開始を14:00、終了を15:00と解釈する。
- 「6月24日 14:00」や「14時から1時間」も可能な範囲で解釈する。ただし日付不足ならmissingFieldsに入れる。
- 年が本文になければ、受信日がある場合は受信日の年を使う。
- 年が本文になく受信日もなければ現在年(${currentYear})を仮定し、needsConfirmation=true、ambiguityNotesに「年が明記されていないため現在年を仮定」を必ず入れる。
- 「本メールより1週間以内」は受信日がある場合、受信日から7日後の23:59を締切として解釈し、その解釈をambiguityNotesに残す。受信日がなければ確定しない。
- 複数日程は候補ごとにeventsへ分ける。
- 曖昧な推測はambiguityNotesに残す。

受信日: ${input.receivedDate || '未指定'}
デフォルトタイムゾーン: ${input.timeZone}
本文:
${input.text}`;

  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4_096 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  } satisfies RequestInit;

  let res: Response | undefined;
  const modelsTried: string[] = [];
  for (const candidateModel of models) {
    modelsTried.push(candidateModel);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${apiKey}`,
        request,
      );
      if (res.ok) break;

      const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS - 1;
      if (shouldRetry) {
        await sleep(retryDelay(res, attempt));
        continue;
      }

      const details = await readGeminiError(res);
      const hasFallback = modelsTried.length < models.length;
      if (res.status === 429 && hasFallback) break;
      throw createGeminiHttpError(res.status, details, modelsTried);
    }
    if (res?.ok) break;
  }

  if (!res?.ok) throw new GeminiProviderError('Gemini APIから応答を取得できませんでした。', 503, true);

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof raw !== 'string') {
    throw new Error('Gemini APIの応答形式が想定外です。再試行してください。');
  }

  try {
    return extractEventsResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(`GeminiのJSON検証に失敗しました。再試行してください。詳細: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}
