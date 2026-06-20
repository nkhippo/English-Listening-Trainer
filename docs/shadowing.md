# シャドーイングシェル仕様

アーキテクチャ全体は [architecture.md](./architecture.md)。

## 1. 設計原則

- **理解 → その後シャドー** の段階化
- 素材は **理解済みのもの**（多聴で読んだ / 精聴 Cloze 80%+）
- 対象は文法反復ではなく **チャンク・プロソディ・連結**（`target_features` ベース）

v1 [background.md](./background.md) では産出側はスコープ外だったが、本シェルに限り解禁。

## 2. 素材の供給

| 経路 | 条件 |
|---|---|
| 精聴 | Cloze 80% 以上 → 自動候補（理解済みバッジ） |
| 多聴 | 「シャドーに追加」ボタン |
| シャドー画面 | CEFR + シーン + 構造フラグでその場生成 |

キュー上限 50 件。Drive で端末間同期（`elt_shadow_queue`）。

## 3. Stage 設計（手動切替）

| Stage | UI | 鍛える回路 |
|---|---|---|
| 1 Sync | スクリプト + モデル音声 | 視覚補助下でリズムに乗る |
| 2 Shadow | 音声のみ | 音→産出の直結 |
| 3 Prosody | `target_features` ハイライト + 音声 | 弱形・連結・縮約を意識 |

完了判定: STT 照合 `match_score >= 0.8` で Stage ✓。

## 4. フィードバック

| 種別 | 実装 |
|---|---|
| 自己照合 | MediaRecorder + モデル/自分の切替再生 |
| STT照合 | Web Speech API → 単語単位 diff |
| プロソディ可視化 | テキストハイライトのみ（ピッチ可視化は将来） |

録音履歴: localStorage + Drive 同期。

## 5. スコープ外（当面）

- ピッチ・波形可視化（pitch.js 等）
- Whisper STT への切替
- 理解度テスト（理解済み素材前提）

## 6. 実装

- `src/shells/shadowing/ShadowingApp.jsx`
- `src/shells/shadowing/ShadowStageController.jsx`
- `src/shells/shadowing/RecordCompare.jsx`
- `src/core/scoring/stt.js`
- `src/core/shared/materialQueue.js`

---

*Ver. 1.0 — シャドーイングシェル仕様*
