# コピペ予定AI

LINEやメール本文を貼り付けると，AIが予定候補を抽出し，ユーザー確認後にGoogleカレンダーへ追加できるNext.js App Routerアプリです。MVPではDBを使わず，Google OAuthトークンは暗号化Cookieセッション内で扱います。

## 実装内容

- トップ画面: 本文貼り付け，受信日，タイムゾーン，サンプル入力，Gemini Free Tier利用時の注意書き。

- 抽出結果確認画面: 予定候補のカード表示，タイトル/種別/日時/終日/場所/meetingUrl/説明/登録有無の編集，confidence，曖昧な点，不足情報，確認バッジ表示。

- AI Provider抽象化:
  - `AI_PROVIDER=mock`: APIキーなしで固定の予定候補を返します。
  - `AI_PROVIDER=gemini`: サーバー側のみで`GEMINI_API_KEY`を使いGemini APIへJSON抽出を依頼します。
- Zodによる入力・AI応答・カレンダー登録リクエスト検証。
- Google OAuth開始/Callback，`https://www.googleapis.com/auth/calendar.events`最小スコープで本人の`primary`カレンダーへ予定作成。
- 曖昧日時や不足情報は勝手に確定せず，確認理由をUIに表示します。

## 起動方法

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

ブラウザで <http://localhost:3000> を開きます。

> `.env.local`はGit管理しません。リポジトリには`.env.local.example`のみ含めています。

## 必要な環境変数

```bash
AI_PROVIDER=mock
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=change-me-to-at-least-32-characters
```

- 開発・テストは`AI_PROVIDER=mock`で可能です。Gemini APIキーは不要です。
- Geminiを使う場合だけ`AI_PROVIDER=gemini`にして`GEMINI_API_KEY`を設定してください。キーはサーバー側のみで使用し，フロントエンドには露出しません。
- `SESSION_SECRET`は32文字以上にしてください。

## Gemini APIキー設定手順

1. Google AI StudioなどでGemini APIキーを作成します。
2. `.env.local`に`AI_PROVIDER=gemini`と`GEMINI_API_KEY=...`を設定します。
3. Free Tier利用時も，貼り付ける本文に機密情報や他人の個人情報を含めないよう注意してください。まずはダミー文でテストしてください。

## Google Cloud側の設定手順

1. Google CloudでOAuth同意画面を設定します。
2. OAuth 2.0 クライアントID（Webアプリ）を作成します。
3. 承認済みリダイレクトURIに`http://localhost:3000/api/auth/google/callback`を追加します。
4. Google Calendar APIを有効化します。
5. `.env.local`に`GOOGLE_CLIENT_ID`，`GOOGLE_CLIENT_SECRET`，`GOOGLE_REDIRECT_URI`を設定します。

このMVPではCalendar APIとOAuthのみを使います。Cloud Run，Firestore，Cloud SQL，Secret Managerなどは使いません。

## サンプル入力

### 1. 面接メール

```text
山口様

6月30日（火）15:00よりオンライン面接を実施いたします。
所要時間は1時間程度を予定しております。
参加URLは前日までにお送りします。
```

### 2. 締切メール

```text
本メールより1週間以内に課題をご提出ください。
期限内にご提出いただけない場合は，選考辞退と判断させていただきます。
```

### 3. 複数日程メール

```text
以下の日程より説明会参加希望日をお選びください。
7月3日（金）10:00〜11:00
7月4日（土）14:00〜15:00
7月7日（火）18:00〜19:00
```


## 抽出仕様

- `meetingUrl`を予定候補のフィールドとして扱います。本文にURLがある場合は`meetingUrl`に入れ，説明にも「面接リンク: URL」の形で含めます。
- Zoom / Google Meet / Meet / Teams / URL / オンラインを検出した場合，場所は「オンライン」として扱います。
- 企業名抽出はMVPルールです。例: 「LINEヤフー採用担当の田中です。」は「LINEヤフー」を企業名として抽出し，面接タイトルは「LINEヤフー 面接」にします。「採用担当」「担当者名」「です」などはタイトルに含めません。
- 「6月24日14時から1時間」は開始`14:00`，終了`15:00`として扱います。
- 年が本文にない場合，受信日があれば受信日の年を使います。受信日もなければ現在年を仮定し，`needsConfirmation=true`にして`ambiguityNotes`に「年が明記されていないため現在年を仮定」を入れます。
- Google Calendar登録時の説明には`event.description`，`meetingUrl`，`sourceText`を含めます。


## APIルート

- `POST /api/extract-events`: 本文，受信日，タイムゾーンから予定候補を抽出します。
- `GET /api/auth/google`: Google OAuthを開始します。
- `GET /api/auth/google/callback`: OAuth callbackでトークンをセッションに保存します。
- `POST /api/calendar/create-events`: 確認済みイベントだけGoogleカレンダーへ登録します。

## 未実装・注意点 / TODO

- refresh tokenの永続保存はMVPでは未実装です。将来DBに保存する場合は，暗号化，アクセス制御，削除導線，漏洩時のローテーション，最小権限を必ず検討してください。
- 登録済みイベントの完全な重複検知は未実装です。
- 日本の祝日を考慮した営業日計算は未実装です。MVPでは土日のみ除外する方針です。
- Geminiの抽出精度はプロンプトとモデルに依存します。必ず確認画面で編集してから登録してください。

## 開発用コマンド

```bash
npm run lint
npm run typecheck
npm run test
```
