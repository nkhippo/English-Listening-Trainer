# English Listening Trainer — 仕様書

Ver.0.2（3シェル構成）

設計思想（why）は [background.md](./background.md)。3シェル全体は [architecture.md](./architecture.md)。多聴は [extensive.md](./extensive.md)、シャドーは [shadowing.md](./shadowing.md)。

**本書のスコープ: 精聴（Intensive）シェル** — Cloze / Dictation / Minimal Pair の what（機能・データ構造）。

## 1. 目的

日本人学習者向けに、リスニングの「層3：連結部（リンキング・弱形・脱落・縮約）」を集中的に鍛える Web アプリ。添付の `english_speech_structure.md` の優先度マトリクスに基づき、最も訓練価値が高く、かつテキスト書き起こしというモダリティで診断可能な層を主戦場とする。

## 2. スコープ

### 習得できる層
- 層3：連結部（主戦場）
- 層4：分節音（ミニマルペア経由）
- 層2：文強勢・リズム（弱形復元を通じて間接的に）

### スコープ外
- 層5：イントネーション（テキスト化でピッチ情報が落ちる）
- リアルタイム会話の予測・turn-taking

産出側（発音・流暢性）は v1 ではスコープ外だったが、**シャドーイングシェル**で取り込む（[shadowing.md](./shadowing.md)）。多聴は [extensive.md](./extensive.md)。

## 3. 軸の設計

### モード（3）
| キー | 名称 | 内容 |
|---|---|---|
| `cloze` | Cloze（空欄補充） | 機能語・連結箇所のみ空欄。デフォルト。 |
| `dictation` | Full Dictation | 全文書き起こし。週次総合チェック。 |
| `minimal_pair` | Minimal Pair | 紛らわしい音の択一。層4の弱点矯正。 |

### シーン（3）
| キー | 名称 | レジスター | 想定定型句 |
|---|---|---|---|
| `phone` | 電話口 | やや formal | `Could I have...` `Hold on please` |
| `store` | 店舗・カフェ | neutral | `Can I get...` `That'll be...` |
| `workplace` | 職場の会話 | semi-formal | `Did you get a chance to...` |

### レベル（5）
| Lv | 速度 | 縮約 | 文長 | 形態 |
|---|---|---|---|---|
| 1 | 0.85x | なし | 5–8語 | 単文 |
| 2 | 0.9x | 弱形のみ | 8–10語 | 単文 |
| 3 | 1.0x | 弱形＋連結 | 10–12語 | 単文〜短ターン |
| 4 | 1.05x | 弱形＋連結＋縮約 | 12–16語 | 単文 |
| 5 | 1.05x | フル自然 | 6–14語 × 2–4ターン | 対話（複数話者） |

### 制約
- Lv5 × Minimal Pair は非対応（対話で1語を狙い撃ちする設計が不自然なため）

## 4. データモデル

Claude API が返す JSON：

```json
{
  "sentence": "I was gonna pick it up at the office.",
  "lines": [{ "speaker": "A", "text": "I was gonna pick it up at the office." }],
  "translation_ja": "オフィスで受け取ろうと思ってた。",
  "target_features": ["weak_form:was", "reduction:gonna", "linking:pick_it", "linking:at_the"],
  "blanks": [
    { "answer": "was", "hint": "weak form" },
    { "answer": "gonna", "hint": "reduction" },
    { "answer": "pick it up", "hint": "linking" }
  ],
  "minimal_pair_target": null,
  "tts_instructions": "Friendly office tone, natural pace, with mild linking."
}
```

## 5. スコアリング

- **Cloze**: 各空欄を `scoreClozeBlank` で個別判定。`gonna` ↔ `going to` 等の等価形を許容。
- **Dictation**: 単語レベルの Levenshtein 距離で `accuracy = 1 - edits/totalWords`。
- **Minimal Pair**: 完全一致のみ正解。
- **層別診断**: `target_features` を Cloze 結果と突き合わせ、`weak_form / linking / reduction` のどれを聞き落としたかをレビューで可視化。

## 6. 段階的ヒント

- 再生は何度でも可だが、`replays` カウンタを表示
- 2回再生後に 0.75x スロー再生ボタンが解放
- 無限リプレイによる過学習を防ぐ設計

## 7. API・モデル

| 用途 | サービス | モデル |
|---|---|---|
| 文生成 | Anthropic | `claude-haiku-4-5-20251001` |
| 音声合成 | OpenAI (via GAS) | `gpt-4o-mini-tts` |
| 音声キャッシュ | Google Drive (via GAS) | — |

### TTS の対話実装
`gpt-4o-mini-tts` は単一呼び出しで単一話者のみ。Lv5 対話は GAS が行ごとに別ボイスで生成し、MP3 を連結して返す。デフォルト声：A=`nova`（女性）、B=`onyx`（男性）。

## 8. セキュリティ

- Anthropic キー: ブラウザ localStorage（API キーの直接ブラウザ呼び出しのため `anthropic-dangerous-direct-browser-access: true` ヘッダ使用）
- OpenAI キー: GAS Script Properties（ブラウザに露出しない）
- GAS Web App は「Anyone」アクセスだが OpenAI キーは含まないため漏洩リスクは限定的

## 9. 今後の拡張候補

- ユーザー進捗の永続化（GAS + Sheets で feature 別正答率を蓄積）
- 弱点 feature を自動的に出題頻度に反映するスパース・リピート
- 音素レベルの可視化（IPA 表示オプション）
- BBC Learning English の音声ライブラリ参照モード（TTS ではなく実音声）
