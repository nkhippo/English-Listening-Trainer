# English Listening Trainer

日本人学習者向け、リスニング層3（連結部）集中型のディクテーション練習アプリ。

## 機能

- **3モード**: Cloze（空欄補充）/ Full Dictation（全文書き起こし）/ Minimal Pair（聞き分け）
- **3シーン**: 電話口 / 店舗・カフェ / 職場の会話
- **5レベル**: Lv1 教科書英語 → Lv5 対話・複数話者（自然速度＋縮約）
- **層別診断**: 各問の `target_features` に基づき、weak_form / linking / reduction のどれを聞き落としたかをレビューで可視化
- **段階的ヒント**: 2回失敗すると 0.75x スロー再生が解放（無限リプレイ過学習を防ぐ）

## アーキテクチャ

```
┌─────────────────┐   Anthropic API    ┌──────────────────┐
│ Browser (React) │ ─────────────────► │ claude-haiku-4-5 │  文生成
│                 │ ◄───────────────── │                  │
│                 │
│                 │   POST JSON        ┌──────────────────┐    ┌────────────┐
│                 │ ─────────────────► │ GAS Web App      │ ─► │ OpenAI TTS │
│                 │ ◄───────────────── │ (cache + proxy)  │ ◄─ │ gpt-4o-mini│
└─────────────────┘  base64 mp3        └────────┬─────────┘    └────────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │ Google Drive    │  mp3 cache
                                       │ (cache folder)  │
                                       └─────────────────┘
```

- **Anthropic API キー**: ブラウザ localStorage（`elt_anthropic_key`）
- **OpenAI API キー**: GAS Script Properties（ブラウザに露出しない）
- **TTS 音声キャッシュ**: Google Drive。キーは `sha256(voice|speed|instructions|text)`

## ローカル開発

```bash
npm install
npm run dev
```

## デプロイ

`main` への push で GitHub Pages に自動デプロイ（`.github/workflows/deploy.yml`）。

GitHub の Settings → Pages → Build and deployment を **GitHub Actions** に設定すること。

## GAS のセットアップ

1. Google Drive で TTS キャッシュ用のフォルダを作成し、URL からフォルダ ID を控える
2. https://script.google.com で新規プロジェクト作成、`gas/Code.gs` の内容を貼り付け
3. プロジェクト設定 → スクリプトのプロパティ:
   - `OPENAI_API_KEY`: OpenAI の API キー（TTS 使用権限あり）
   - `CACHE_FOLDER_ID`: 上記フォルダ ID
4. デプロイ → ウェブアプリ
   - 実行: 自分
   - アクセス: 全員
5. 発行された `/exec` URL をアプリの「GAS Endpoint URL」欄に入力

## 設計判断

- **モード × シーン × レベル の3軸**: シーン＝何を話すか（語彙・レジスター）、レベル＝どう話すか（速度・縮約密度・対話）。混ぜると進捗管理が壊れるため分離。
- **Cloze がデフォルト**: 全文ディクテーションは綴りミスのノイズが大きく、層3の診断精度が下がる。空欄を機能語・連結箇所にピンポイントで配置することで、認知資源を診断価値の高い場所に集中させる。
- **gpt-4o-mini-tts の制約対応**: API が単一話者なので、対話は行ごとに別声で生成 → GAS 側で連結。

## このアプリで習得「できないもの」

- 産出側（発音・流暢性）
- 層5（イントネーション）の細かいニュアンス — テキスト化でピッチ情報が落ちる
- リアルタイム会話の予測・turn-taking

これらは Pines Academy の 1-on-1 など、別チャネルで補完。

## ライセンス

Private use.
