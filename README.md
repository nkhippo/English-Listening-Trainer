# English Listening Trainer

日本人学習者向け、リスニング層3（連結部）集中型の Web アプリ。**精聴・多聴・シャドーイング** の3シェル構成。

| ドキュメント | 内容 |
|---|---|
| [docs/background.md](docs/background.md) | 設計思想（層3・診断） |
| [docs/architecture.md](docs/architecture.md) | 3シェル全体構成 |
| [docs/specification.md](docs/specification.md) | 精聴シェル仕様 |
| [docs/extensive.md](docs/extensive.md) | 多聴シェル仕様 |
| [docs/shadowing.md](docs/shadowing.md) | シャドーイング仕様 |
| [docs/setup.md](docs/setup.md) | セットアップ手順 |

## 機能

### 精聴（Intensive）
- **3モード**: Cloze / Full Dictation / Minimal Pair
- **層別診断**: `target_features` ベースの weak_form / linking / reduction 可視化
- **段階的ヒント**: 2回失敗で 0.75x スロー再生

### 多聴（Extensive）
- 連続パッセージ再生・Read+Listen / Listen Only
- 構造フラグ（input flooding）・累計接触統計

### シャドーイング（Shadowing）
- Stage 1〜3・録音比較・STT 照合
- 多聴・精聴からの素材送り込み

### 共通
- **3軸**: シーン × CEFR（A1+A2 / B1 / B2）× 音韻Lv（1〜5）
- **音声キャッシュ**: Google Drive（GAS 経由 TTS）
- **クラウド同期**: Past items・シャドーキュー・統計

## アーキテクチャ

```
Browser (React) ──► Claude API（文生成）
                 ──► GAS ──► OpenAI TTS ──► Google Drive（キャッシュ）
```

## ローカル開発

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173/English-Listening-Trainer/` を開きます。

## 初回セットアップ

**[docs/setup.md](docs/setup.md)** を参照（Anthropic キー・GAS URL・Drive 同期）。

## デプロイ

`main` への push で GitHub Pages に自動デプロイ。

公開 URL: **https://nkhippo.github.io/English-Listening-Trainer/**

## このアプリで習得「できないもの」

- 層5（イントネーション）の細かいニュアンス
- リアルタイム会話の予測・turn-taking
- ピッチ可視化（将来拡張）

発音・プロソディの産出訓練は **シャドーイングシェル** で扱う。

## ライセンス

Private use.
