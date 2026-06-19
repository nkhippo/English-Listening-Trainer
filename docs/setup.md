# セットアップガイド

English Listening Trainer を動かすために必要な API キーと GAS（Google Apps Script）の設定手順です。

## 必要なもの

| 項目 | 用途 | 保存場所 |
|------|------|----------|
| Anthropic API キー | 例文の生成（Claude） | ブラウザ localStorage |
| OpenAI API キー | 音声合成（TTS） | GAS Script Properties |
| GAS Web App URL | TTS プロキシのエンドポイント | ブラウザ localStorage |
| Google Drive フォルダ | TTS 音声のサーバー側キャッシュ | GAS Script Properties |
| Google Drive フォルダ（同期用） | Listening / Speech データのクラウド同期 | GAS Script Properties |

---

## Anthropic API キー

文生成に `claude-haiku-4-5-20251001` を使用します。

### 取得手順

1. [Anthropic Console](https://console.anthropic.com/) にログイン（アカウントがなければ作成）
2. 左メニュー **API Keys** を開く
3. **Create Key** をクリックし、名前（例: `english-listening-trainer`）を入力
4. 表示された `sk-ant-...` 形式のキーをコピー
5. アプリの **Anthropic API Key** 欄に貼り付け

### 注意

- キーはこのブラウザの localStorage にのみ保存されます（GitHub や GAS には送られません）
- ブラウザから Anthropic API を直接呼び出すため、CORS 対応ヘッダを使用しています
- 使用量・課金は [Anthropic Console の Usage](https://console.anthropic.com/settings/usage) で確認できます

---

## GAS TTS プロキシのセットアップ

OpenAI の TTS API キーをブラウザに露出させないため、Google Apps Script が仲介します。GAS 側では Google Drive に MP3 をキャッシュするため、同じ文の 2 回目以降は OpenAI へのリクエストも省略されます。

### 1. Google Drive にキャッシュフォルダを作成

1. [Google Drive](https://drive.google.com/) を開く
2. 新規フォルダを作成（例: `ELT TTS Cache`）
3. フォルダを開き、URL からフォルダ ID を控える  
   例: `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp` → `1AbCdEfGhIjKlMnOp`

### 2. Apps Script プロジェクトを作成

1. [Google Apps Script](https://script.google.com/) を開く
2. **新しいプロジェクト** を作成
3. デフォルトの `Code.gs` の内容を、このリポジトリの [`gas/Code.gs`](../gas/Code.gs) で置き換える
4. プロジェクト名を `English Listening Trainer TTS` などに変更

### 3. スクリプトプロパティを設定

1. 左メニュー **プロジェクトの設定**（歯車アイコン）を開く
2. **スクリプト プロパティ** セクションで **プロパティを追加**:

| プロパティ | 値 |
|------------|-----|
| `OPENAI_API_KEY` | OpenAI の API キー（`sk-...`） |
| `CACHE_FOLDER_ID` | 手順 1 で控えた Drive フォルダ ID |
| `SYNC_FOLDER_ID` | クラウド同期用 Drive フォルダ ID（後述） |

### 4. OpenAI API キーの取得

1. [OpenAI Platform](https://platform.openai.com/) にログイン
2. **API keys** → **Create new secret key**
3. キーをコピーし、上記 `OPENAI_API_KEY` に設定
4. TTS モデル `gpt-4o-mini-tts` が利用可能なアカウントであることを確認
5. [Usage limits / Billing](https://platform.openai.com/settings/organization/billing/overview) でクレジットが有効であることを確認

### 5. Web アプリとしてデプロイ

1. Apps Script エディタ右上 **デプロイ** → **新しいデプロイ**
2. 種類: **ウェブアプリ**
3. 設定:
   - **説明**: `TTS proxy v1`（任意）
   - **次のユーザーとして実行**: **自分**
   - **アクセスできるユーザー**: **全員**
4. **デプロイ** をクリック
5. 初回は Google アカウントの承認が必要（「詳細」→「安全でないページに移動」→ 許可）
6. 表示された **ウェブアプリ URL**（`https://script.google.com/macros/s/.../exec`）をコピー

### 6. 動作確認

ブラウザで Web アプリ URL を開くと、次の JSON が返れば OK です:

```json
{"status":"ok","service":"elt-tts-proxy"}
```

### 7. アプリに URL を入力

GitHub Pages 版またはローカル版の **GAS Endpoint URL** 欄に、上記 `/exec` URL を貼り付けます。

---

## ローカル開発

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173/English-Listening-Trainer/` を開きます（Vite の `base` 設定に合わせた URL）。

---

## クラウド同期（Listening + Speech + 音声）

Listening の **Past items**、Speech の **Saved items**、および各項目の **MP3 音声** を Google Drive に保存し、PC・iPhone などで自動的に同期します。操作は不要です（Sync Token なし・単一ユーザー運用向け）。

### Drive 上のファイル

| ファイル | 内容 |
|---------|------|
| `elt-user-data.json` | 過去問・Speech のメタデータ |
| `elt-audio-{id}.mp3` | 各項目の音声（再生済みのもの） |

同期用フォルダ: Script Properties の `SYNC_FOLDER_ID`

### GAS 側の設定

1. Google Drive に同期用フォルダを作成
2. Script Properties に `SYNC_FOLDER_ID` を設定
3. [`gas/Code.gs`](../gas/Code.gs) を最新版に更新し、Web アプリを **新しいデプロイ**
4. 再デプロイ後の `/exec` URL を `src/lib/config.js` の `DEFAULT_GAS_URL` に反映

### 同期の挙動

- **アプリを開く** と Drive からメタデータを取得し、ローカルとマージ
- **音声** は Drive にあれば localStorage へダウンロード（2 回目以降は API 不要）
- **新規再生** で生成した音声は Drive にアップロード
- 変更は約 2 秒後に自動反映
- 削除は他端末へも伝播（論理削除 + Drive 上の音声ファイル削除）

### 注意

- GAS Web App URL を知っている第三者がデータを読み書きできる可能性があります（個人利用想定）
- 初回同期時、音声ファイルが多いとダウンロードに時間がかかることがあります

---

## API リクエストの節約（アプリ側キャッシュ）

アプリは次の 2 段階で API コストを抑えます。

### 過去問（localStorage: `elt_history`）

- 一度出題した例文は **Past items** に保存されます
- 過去問から **Practice** を選ぶと Claude API は呼ばれません
- **▶** ボタンで音声のみ再生できます

### 音声キャッシュ（localStorage: `elt_audio:*`）

- 初回再生時に GAS から取得した MP3 をブラウザに保存します
- 同じ例文を 2 回目以降に聞くときは GAS / OpenAI へのリクエストがありません
- GAS 側の Drive キャッシュと組み合わせると、初回以外はほぼ無料で聞き返せます

### サーバー側キャッシュ（GAS + Drive）

- GAS が `sha256(voice|speed|instructions|text)` をキーに MP3 を Drive に保存
- 別ブラウザ・別端末から同じ文を再生しても OpenAI を呼ばない場合があります

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| `Claude API 401` | Anthropic キーが正しいか、残高があるか確認 |
| `Claude API 403` | ブラウザからの直接アクセスが制限されていないか確認 |
| `OPENAI_API_KEY not set` | GAS の Script Properties を確認 |
| `CACHE_FOLDER_ID not set` | Drive フォルダ ID が正しいか確認 |
| `TTS proxy 403/404` | Web アプリの「アクセス: 全員」で再デプロイ |
| CORS エラー | GAS URL が `/exec` で終わっているか確認 |
| `SYNC_FOLDER_ID not set` | 同期用 Drive フォルダ ID が Script Properties に設定されているか確認 |
| クラウド同期が動かない | GAS を最新版で再デプロイ済みか、`DEFAULT_GAS_URL` が新 URL か確認 |
| 音声が保存されない | ブラウザの localStorage 容量（約 5MB）が不足している可能性。古い過去問を削除 |

---

## セキュリティ上の注意

- Anthropic キーはユーザー各自のブラウザに保存されます。共有 PC では使用後にブラウザデータを削除してください
- OpenAI キーは GAS にのみ保存され、フロントエンドからは見えません
- GAS Web App は「全員」アクセスですが、リクエストボディに API キーは含まれません
