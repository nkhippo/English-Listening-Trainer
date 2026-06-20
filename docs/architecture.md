# English Listening Trainer — アーキテクチャ（v2）

設計思想（why）は [background.md](./background.md)、精聴の機能仕様は [specification.md](./specification.md)。本書は **3シェル統合後の全体構造** を扱う。

## ドキュメント一覧

| ファイル | 役割 |
|---|---|
| [background.md](./background.md) | なぜそうなっているか（層3・診断思想） |
| [specification.md](./specification.md) | 精聴シェルの what（モード・データ・スコアリング） |
| **architecture.md**（本書） | 3シェル構成・共有コア・素材フロー |
| [extensive.md](./extensive.md) | 多聴シェル仕様 |
| [shadowing.md](./shadowing.md) | シャドーイングシェル仕様 |
| [setup.md](./setup.md) | API キー・GAS・Drive 同期の手順 |
| [archive/](./archive/) | 廃止した work-request / 中間サマリー |

## 全体構造

```
┌─────────────────────────────────────────────────────────┐
│                    Shared Core                          │
│  Generation (Claude) · Audio (TTS + Drive) · CEFR       │
└─────────────┬─────────────────┬──────────────┬──────────┘
              │                 │              │
       ┌──────▼──────┐  ┌───────▼────────┐  ┌──▼──────────┐
       │ Intensive   │  │ Extensive      │  │ Shadowing   │
       │ 精聴        │  │ 多聴           │  │ シャドー    │
       │ 診断・Cloze │  │ 流量・没入     │  │ 産出・STT   │
       └─────────────┘  └────────────────┘  └─────────────┘
```

## 3シェルの分担（MECE）

分割軸は **鍛える回路**。素材は共有する。

| シェル | 主たる回路 | UX方針 |
|---|---|---|
| **精聴** | 層3の**どこを**落としたか診断 | 難・少・制約 |
| **多聴** | 音→意味の**自動化**・input flooding | 易・多・無摩擦 |
| **シャドー** | 運動記憶・プロソディ定着 | 中・反復・段階解放 |

精聴は [background.md](./background.md) の思想（診断精度＞完遂量）を維持。多聴は意図的に逆転。シャドーは v1 ではスコープ外だった産出を **このシェルに限り** 取り込む。

## 設定軸（共有）

| 軸 | 意味 | 値 |
|---|---|---|
| シーン | 語彙ドメイン・レジスター | phone / store / workplace 等 |
| CEFR | 語彙・チャンクの複雑性 | A1+A2 / B1 / B2 |
| 音韻Lv | 速度・縮約・連結密度 | 1〜5 |

## 素材フロー

```
精聴（Cloze 80%+）──→ シャドーキュー（理解済み）
多聴（手動追加）    ──→ シャドーキュー
シャドー画面        ──→ その場生成
```

学習パスは固定しない。多聴 → シャドーの直行も想定。

## 共有コア（実装）

| モジュール | 責務 |
|---|---|
| `src/core/generation/` | Claude プロンプト・CEFR 制約・構造フラグ検証 |
| `src/core/audio/` | TTS（GAS 経由）・Drive キャッシュ |
| `src/core/scoring/` | Cloze / Dictation / STT（シャドー用） |
| `src/lib/sync.js` | Past items・キュー・統計の Drive 同期 |

## 実装状況（Phase 1〜5）

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | 共有コア抽出・精聴リファクタ | 完了 |
| 2 | CEFR 軸 | 完了 |
| 3 | Drive 音声キャッシュ | 完了 |
| 4 | 多聴シェル | 完了（input flooding UX 改修含む） |
| 5 | シャドーイングシェル | 完了 |

## スコープ外（当面）

| 項目 | 補完先 |
|---|---|
| ピッチ可視化・プロソディスコアリング | 将来拡張 |
| Whisper STT | 将来拡張（現状 Web Speech API） |
| C1・C2 | B2 まで |
| 語彙・チャンク多読アプリ | 別仕様 |

---

*Ver. 2.0 — 3シェル統合後のアーキテクチャ仕様*
