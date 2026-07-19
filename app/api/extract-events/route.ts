import { NextResponse } from 'next/server';
import { extractEventsFromText } from '@/app/lib/ai/extractEventsFromText';
import { GeminiProviderError } from '@/app/lib/ai/providers/geminiProvider';

export async function POST(req: Request) {
  try {
    return NextResponse.json(await extractEventsFromText(await req.json()));
  } catch (error) {
    const status = error instanceof GeminiProviderError ? error.statusCode : 400;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'AI抽出に失敗しました。本文を見直して再試行してください。',
        retryable: error instanceof GeminiProviderError ? error.retryable : false,
      },
      { status },
    );
  }
}
