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
GEMINI_FALLBACK_MODELS=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=change-me-to-at-least-32-characters
```

- 開発・テストは`AI_PROVIDER=mock`で可能です。Gemini APIキーは不要です。
- Geminiを使う場合だけ`AI_PROVIDER=gemini`にして`GEMINI_API_KEY`を設定してください。キーはサーバー側のみで使用し，フロントエンドには露出しません。
- `SESSION_SECRET`は32文字以上にしてください。

### Gemini APIで429が返る場合

`429 RESOURCE_EXHAUSTED`は，Free Tierのモデル別リクエスト数・トークン数の上限，または短時間のリクエスト集中を示します。APIキーが正しくても発生します。本アプリは一時的な429/5xxに対して1回だけ待機して再試行し，解消しない場合はカレンダー登録へ進まずエラーを表示します。

まず，開発サーバーを止めずに別ターミナルで次の診断を実行してください。

```bash
npm run gemini:check
```

このコマンドは`.env.local`を読み，APIキーで利用可能な`generateContent`対応モデル一覧を取得して，選択中の`GEMINI_MODEL`へ最小リクエストを1回送ります。APIキー自体は表示しません。失敗時にはGeminiの元のエラーJSON（`quotaId`や`retryDelay`を含む場合があります）を表示します。

#### `Missing script: "gemini:check"`と表示される場合

このエラーはGemini APIからの応答ではなく，手元のソースコードが診断スクリプト追加前の版であることを意味します。次のコマンドで現在の状態を確認してください。

```bash
git status
git log -1 --oneline
npm pkg get scripts.gemini:check
test -f scripts/check-gemini.mjs && echo "diagnostic script exists"
```

`npm pkg get scripts.gemini:check`が`{}`を返すか，ファイル確認で何も表示されない場合は，GitHub上でこの変更を含むPRをmergeしてからローカルを更新します。

```bash
git switch main
git pull --ff-only
npm install
npm run gemini:check
```

main以外のブランチを利用している場合は，`git switch main`をそのブランチ名に置き換えてください。更新後の`package.json`には`"gemini:check": "node --env-file=.env.local scripts/check-gemini.mjs"`があり，`scripts/check-gemini.mjs`も存在する必要があります。npm scriptの登録だけを確認するには`npm run`を実行できます。

最新版へ更新済みでnpm scriptだけが認識されない場合は，同じ診断を直接実行できます。

```bash
node --env-file=.env.local scripts/check-gemini.mjs
```

この直接実行でも`scripts/check-gemini.mjs`が見つからない場合は，依然として診断スクリプト追加前のソースコードです。ファイルを手作業で作るのではなく，先にPRのmergeと`git pull`を完了してください。

- 選択中のモデルが一覧にない場合: 表示されたモデル名の1つを`GEMINI_MODEL`へ設定し，`npm run dev`を再起動してください。
- `429`と`retryDelay`が表示された場合: 表示時間以上待ち，抽出ボタンを連打せず再試行してください。
- モデル固有のクォータが原因で，別のFree Tier対応モデルを利用できる場合: `GEMINI_FALLBACK_MODELS=model-a,model-b`のように診断結果のモデル名を指定できます。primaryが再試行後も429の場合だけ，記載順に試します。
- 診断の最小リクエスト自体が429になる場合: アプリコードではなく，そのAPIキー/プロジェクト/モデルのクォータ側の制限です。Google AI Studioの使用量を確認し，クォータが回復するまで待ってください。

実際の本文を固定結果だと誤認しないよう，本番利用時の自動mockフォールバックは行いません。

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
