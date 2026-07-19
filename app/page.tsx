'use client';

import { useMemo, useState } from 'react';
import type { ExtractedCalendarEvent, ExtractEventsResponse } from './lib/ai/schema';

const sample = `山口様

6月30日（火）15:00よりオンライン面接を実施いたします。
所要時間は1時間程度を予定しております。
参加URLは前日までにお送りします。`;

const categories: Record<ExtractedCalendarEvent['category'], string> = {
  interview: '面接',
  briefing: '説明会',
  deadline: '締切',
  web_test: 'Webテスト',
  lab: '研究室',
  part_time_job: 'アルバイト',
  other: 'その他',
};

function localValue(value: string | null) {
  return value ? value.slice(0, 16) : '';
}

function iso(value: string) {
  return value ? `${value}:00+09:00` : null;
}

export default function Home() {
  const [text, setText] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [timeZone, setTimeZone] = useState('Asia/Tokyo');
  const [result, setResult] = useState<ExtractEventsResponse | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const invalid = useMemo(
    () => result?.events.some((event, index) => selected[index] && (!event.startDateTime || (!event.isAllDay && !event.endDateTime))) ?? true,
    [result, selected],
  );

  async function extract() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/extract-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, receivedDate: receivedDate || null, timeZone }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setResult(json);
      setSelected(Object.fromEntries(json.events.map((_: unknown, index: number) => [index, true])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI抽出に失敗しました。再試行してください。');
    } finally {
      setLoading(false);
    }
  }

  function update(index: number, patch: Partial<ExtractedCalendarEvent>) {
    setResult((current) => current && {
      ...current,
      events: current.events.map((event, eventIndex) => (eventIndex === index ? { ...event, ...patch } : event)),
    });
  }

  async function createEvents() {
    setMessage('');
    if (!result) return;
    const events = result.events.filter((_, index) => selected[index]);
    const response = await fetch('/api/calendar/create-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(`${json.error} / 未ログインの場合は「Googleでログイン」を押してください。`);
      return;
    }
    setMessage(
      json.results
        .map((item: { ok: boolean; title: string; htmlLink?: string; error?: string }) => (
          item.ok ? `成功: ${item.title} ${item.htmlLink || ''}` : `失敗: ${item.title} ${item.error}`
        ))
        .join('\n'),
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="rounded-3xl bg-white p-8 shadow">
        <h1 className="text-4xl font-bold">コピペ予定AI</h1>
        <p className="mt-3 text-slate-600">LINEやメールを貼り付けるだけで，予定候補を抽出し，確認してGoogleカレンダーに追加できます</p>
        <textarea
          className="mt-6 h-56 w-full rounded-xl border p-4"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="LINEやメール本文を貼り付け"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            受信日
            <input type="date" className="mt-1 w-full rounded border p-2" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} />
          </label>
          <label>
            デフォルトのタイムゾーン
            <input className="mt-1 w-full rounded border p-2" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded bg-blue-600 px-5 py-2 text-white disabled:bg-slate-300" onClick={extract} disabled={!text || loading}>
            {loading ? '抽出中...' : '予定を抽出'}
          </button>
          <button className="rounded border px-5 py-2" onClick={() => setText(sample)}>サンプル入力を入れる</button>
          <a className="rounded border px-5 py-2" href="/api/auth/google">Googleでログイン</a>
        </div>
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          Gemini API Free Tierを使う場合，入力内容の取り扱いに注意してください．機密情報や他人の個人情報を含む本文は，まずダミー文でテストしてください
        </p>
      </section>

      {message && <pre className="whitespace-pre-wrap rounded bg-slate-900 p-4 text-white">{message}</pre>}

      {result && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">抽出結果確認</h2>
          {result.globalAmbiguityNotes.map((note) => <p key={note} className="text-amber-700">注意: {note}</p>)}
          {result.events.map((event, index) => (
            <article key={index} className="space-y-3 rounded-2xl bg-white p-5 shadow">
              <div className="flex justify-between">
                <label>
                  <input type="checkbox" checked={!!selected[index]} onChange={(changeEvent) => setSelected({ ...selected, [index]: changeEvent.target.checked })} />
                  Googleカレンダーへ登録する
                </label>
                {event.needsConfirmation && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700">確認が必要</span>}
              </div>
              <input className="w-full rounded border p-2 text-lg font-bold" value={event.title} onChange={(changeEvent) => update(index, { title: changeEvent.target.value })} />
              <select className="rounded border p-2" value={event.category} onChange={(changeEvent) => update(index, { category: changeEvent.target.value as ExtractedCalendarEvent['category'] })}>
                {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <label className="ml-3">
                <input type="checkbox" checked={event.isAllDay} onChange={(changeEvent) => update(index, { isAllDay: changeEvent.target.checked })} />
                終日予定
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  開始日時
                  <input type="datetime-local" className="w-full rounded border p-2" value={localValue(event.startDateTime)} onChange={(changeEvent) => update(index, { startDateTime: iso(changeEvent.target.value) })} />
                </label>
                <label>
                  終了日時
                  <input type="datetime-local" className="w-full rounded border p-2" value={localValue(event.endDateTime)} onChange={(changeEvent) => update(index, { endDateTime: iso(changeEvent.target.value) })} />
                </label>
              </div>
              <input className="w-full rounded border p-2" placeholder="場所" value={event.location || ''} onChange={(changeEvent) => update(index, { location: changeEvent.target.value || null })} />
              <input className="w-full rounded border p-2" placeholder="meetingUrl" value={event.meetingUrl || ''} onChange={(changeEvent) => update(index, { meetingUrl: changeEvent.target.value || null })} />
              <textarea className="w-full rounded border p-2" value={event.description} onChange={(changeEvent) => update(index, { description: changeEvent.target.value })} />
              <p>confidence: {event.confidence}</p>
              {event.ambiguityNotes.length > 0 && <p className="text-amber-700">曖昧な点: {event.ambiguityNotes.join(' / ')}</p>}
              {event.missingFields.length > 0 && <p className="text-red-700">不足している情報: {event.missingFields.join(' / ')}</p>}
            </article>
          ))}
          <button className="rounded bg-green-600 px-5 py-2 text-white disabled:bg-slate-300" disabled={invalid} onClick={createEvents}>選択した予定をGoogleカレンダーに追加</button>
          {invalid && <p className="text-red-700">日時が不正な選択予定があるため登録できません。</p>}
        </section>
      )}
    </main>
  );
}
