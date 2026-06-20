> **廃止** — 現行仕様は [architecture.md](../architecture.md)、[extensive.md](../extensive.md)、[shadowing.md](../shadowing.md) を参照。

# Work Request: Listening Trainer v2 — 3シェル統合アーキテクチャ

> **改修種別**: アーキテクチャ再構成（既存機能の保持＋新シェル2つの追加）
> **想定実装ツール**: Cursor
> **前提ドキュメント**: `docs/background.md`（既存）、本ファイル
> **段階的に**: Phase 1 から順に実装すること。各Phase完了時に動作確認＋次Phaseへ。

---

## 0. このドキュメントの読み方

本ファイルは Cursor に渡す **work-request** である。Cursor は Phase 1 から順に実装する。各 Phase の **Acceptance Criteria（完了条件）** を満たしてから次へ進む。

- **§1〜§5**: 設計（What & How）
- **§6**: 実装フェーズ（Cursor が手を動かす範囲）
- **§7**: 受け入れ条件
- **§8**: スコープ外
- **§9**: Cursor から Naoya への質問項目

既存アプリ（`docs/background.md`）の設計思想——層3特化・診断精度＞完遂量・産出スコープ外——は**精聴シェル**には引き続き適用される。一方、新規追加する**多聴シェル・シャドーイングシェル**は意図的に異なる設計原則を持つ。混同しないこと。

---

## 1. アーキテクチャ概観

### 1.1 全体構造

```
┌─────────────────────────────────────────────────────────┐
│                    Shared Core                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────┐ │
│  │ Generation      │  │ Audio           │  │ CEFR    │ │
│  │  (Claude API)   │  │  (OpenAI TTS    │  │  Config │ │
│  │  + features     │  │   + Drive cache)│  │         │ │
│  └─────────────────┘  └─────────────────┘  └─────────┘ │
└─────────────┬─────────────────┬──────────────┬──────────┘
              │                 │              │
       ┌──────▼──────┐  ┌───────▼────────┐  ┌──▼──────────┐
       │ Intensive   │  │ Extensive      │  │ Shadowing   │
       │ Shell (精聴) │  │ Shell (多聴)    │  │ Shell        │
       │ - 診断       │  │ - 流量・没入    │  │ - 産出運動   │
       │ - Cloze     │  │ - 連続再生      │  │ - STT照合   │
       │ - 制約UI    │  │ - 低摩擦UI      │  │ - 反復再生   │
       │ (既存)       │  │ (新規)          │  │ (新規)       │
       └─────────────┘  └────────────────┘  └─────────────┘
```

### 1.2 3シェルの分担（MECE — 鍛える回路で区分）

| シェル | 主たる回路 | UX設計の方針 | 既存 background.md との関係 |
|---|---|---|---|
| **精聴 (Intensive)** | 知覚：層3の**どこを**落としたか診断 | 難・少・制約 | §1〜§5 そのまま維持 |
| **多聴 (Extensive)** | 知覚：音→意味の**自動化**（速度に間に合う処理）| 易・多・無摩擦 | §5「スコープ外」を *補完先として外部化* せず *新シェルとして取り込み* |
| **シャドーイング (Shadowing)** | 産出：運動記憶・プロソディの定着 | 中・反復・段階解放 | §5「産出側スコープ外」を **解禁** する |

**MECE注記**：3シェルは「鍛える回路」軸では排他的だが、**使用する素材は共有**しうる（多聴で読んだパッセージをシャドーイングに回す等）。素材の物理層ではなく、回路と訓練意図で分割している。

### 1.3 設計上の核心原則

1. **既存の精聴シェルは Phase 4 まで一切挙動を変えない**（後方互換性が最優先）
2. **共有コアは「層3豊富な文と忠実なTTS」を提供する基盤**であり、シェルから見れば *単一のAPI* として振る舞う
3. **CEFR と 音韻Lv は直交軸**として扱う（§2.1）
4. **音声は Google Drive にキャッシュ**し、同一パラメータの再生成を防ぐ（§5）

---

## 2. CEFR 階梯設計

### 2.1 3軸モデル（軸の追加）

既存の2軸（シーン × 音韻Lv）に **CEFR軸**を追加する。3軸は **MECE**（独立に変えられる属性）。

| 軸 | 意味 | 値 |
|---|---|---|
| シーン | 何を話すか（語彙ドメイン）| phone / shop / workplace / friends / travel / ... |
| **CEFR**（**新規**）| **どの語彙・チャンクで話すか**（語彙の複雑性）| **A1+A2 / B1 / B2** |
| 音韻Lv | どう話すか（速度・縮約・連結）| 1 / 2 / 3 / 4 / 5 |

### 2.2 CEFR × 音韻Lv の推奨マトリクス

CEFR と音韻Lv は独立に選べるが、学習効率上の **推奨組み合わせ** を提示する。UIではこの推奨をデフォルトとし、ユーザは自由に外せる。

| CEFR | 推奨 音韻Lv | 既定の組み合わせ理由 |
|---|---|---|
| A1+A2 | Lv1〜2 | 語彙負荷が低いうちは音韻も低負荷で「音→意味」回路を形成 |
| B1 | Lv2〜4 | 語彙が安定したら音韻負荷を上げ、自然速度に適応 |
| B2 | Lv3〜5 | 自然速度・対話・縮約を主戦場に |

### 2.3 CEFR レベル別の語彙・チャンク数（curriculum scope）

ターゲット数値は **Cambridge English Vocabulary Profile (EVP)** を参考にした概算。実装時は §3.4 のデータ構造に従い、EVP / OPAL / Academic Phrase Bank 等から取り込む。

| CEFR | 累積語数（headword）| 累積チャンク数（MWE）| 増加分 vs 前段階 |
|---|---|---|---|
| A1 | 約 600 | 約 100 | — |
| A2 | 約 1,300 | 約 350 | +700 語 / +250 チャンク |
| B1 | 約 2,200 | 約 800 | +900 語 / +450 チャンク |
| B2 | 約 3,400 | 約 1,800 | +1,200 語 / +1,000 チャンク |

**読み方**：
- 「累積」とはその段階までに**累計で扱う**頭語/チャンク数。B1段階のコンテンツ生成では A1+A2+B1 の語彙プール（合計 ~2,200 語）を使える。
- チャンク数は EVP の phrase 系統エントリ概算。実装で参照すべき実体カタログは §3.4 を参照。
- **A1単独・A2単独で分けず A1+A2 で1段階**とする。ユーザ要件「A1&2 → B1 → B2」に整合。

### 2.4 CEFR別の生成量見積もり（音声キャッシュ容量計画用）

| CEFR | シーン数 | シーン×Lvあたり生成文数（目標）| 合計文数 | 音声合計（@~80KB/文）|
|---|---|---|---|---|
| A1+A2 | 6 | 50 × 5Lv = 250 | 1,500 | ~120 MB |
| B1 | 6 | 50 × 5Lv = 250 | 1,500 | ~120 MB |
| B2 | 6 | 50 × 5Lv = 250 | 1,500 | ~120 MB |
| **合計** | | | **4,500** | **~360 MB** |

多聴・シャドーイングは精聴で生成済みの素材を再利用するため**追加生成は最小限**。Google Drive 無料枠 15GB に対して十分余裕。

---

## 3. 共有コア仕様

### 3.1 ディレクトリ構造（提案）

既存の `src/` 配下を再構成する。具体パスは既存構造に合わせて調整可。

```
src/
  core/                            # ★ NEW: 共有コア
    generation/
      prompts.js                   # ← src/lib/prompts.js から移動
      cefrConstraints.js           # ★ NEW: CEFR制約の組み立て
      targetFeatures.js            # ← target_features カタログを分離
    audio/
      ttsClient.js                 # OpenAI TTS 呼び出し（GAS経由）
      driveCache.js                # ★ NEW: Drive キャッシュ層
      audioManifest.js             # ★ NEW: ハッシュ → メタデータ
    scoring/
      cloze.js                     # ← 既存 scoring.js から
      dictation.js
      stt.js                       # ★ NEW: STT 照合（シャドー用）
    shared/
      cefr.js                      # ★ NEW: CEFR 設定
      sceneConfig.js               # シーン定義
      levels.js                    # 音韻Lv 定義（既存ロジック）
  shells/
    intensive/                     # ★ 精聴（既存を移動・薄ラップ）
      IntensiveApp.jsx
      ClozeView.jsx
      ReviewView.jsx
    extensive/                     # ★ NEW: 多聴
      ExtensiveApp.jsx
      PassagePlayer.jsx
      ListenOnlyView.jsx
    shadowing/                     # ★ NEW: シャドーイング
      ShadowingApp.jsx
      ShadowStageController.jsx
      RecordCompare.jsx
  App.jsx                          # シェル選択（ルーター）
```

### 3.2 generation モジュール

#### 3.2.1 公開API（シェルから見たコア）

```typescript
// core/generation/index.js
async function generateContent(params: {
  shell: 'intensive' | 'extensive' | 'shadowing',
  scene: SceneId,
  cefr: 'A1A2' | 'B1' | 'B2',
  level: 1 | 2 | 3 | 4 | 5,
  mode?: 'cloze' | 'full_dictation' | 'minimal_pair',  // intensive のみ
  length?: 'sentence' | 'short_passage' | 'long_passage' | 'dialogue',
  variantSeed?: string,
}): Promise<GenerationResult>
```

`GenerationResult` の構造：

```typescript
type GenerationResult = {
  id: string,                      // sha256(text|voice|speed|instructions)
  text: string | string[],         // 単文または対話の各ターン
  speakers?: Array<'A' | 'B'>,     // 対話のとき
  translation_ja: string,
  target_features: string[],       // 既存スキーマ準拠
  cefr_metadata: {
    used_words_above_level: string[],   // 想定外語彙の検出（要バリデーション）
    used_chunks: string[],
  },
  tts_instructions: string,
  speed: number,
  voice: 'nova' | 'onyx' | 'alloy' | 'shimmer',
  blanks?: BlankSpec[],            // cloze のとき
  minimal_pair_target?: MinimalPairSpec,
}
```

#### 3.2.2 CEFR制約の実装

`core/generation/cefrConstraints.js`:

```javascript
// CEFRレベルに応じてプロンプトに注入する制約を生成
export function buildCefrConstraint(cefr) {
  return {
    A1A2: {
      vocab_pool_description: 'top 1300 most frequent English words (CEFR A1-A2)',
      max_unknown_words: 0,
      sentence_complexity: 'simple sentences, present/past tense, no relative clauses',
      forbidden_constructions: ['perfect aspect', 'subjunctive', 'inversion'],
    },
    B1: {
      vocab_pool_description: 'top 2200 words (CEFR up to B1)',
      max_unknown_words: 1,
      sentence_complexity: 'compound sentences, all basic tenses, simple relative clauses',
      forbidden_constructions: ['subjunctive', 'cleft sentences'],
    },
    B2: {
      vocab_pool_description: 'top 3400 words (CEFR up to B2)',
      max_unknown_words: 2,
      sentence_complexity: 'complex sentences, perfect aspects, relative clauses, conditionals',
      forbidden_constructions: [],
    },
  }[cefr]
}
```

#### 3.2.3 prompts.js の拡張ポイント

既存 `buildGenerationPrompt` を CEFR 対応に拡張：

1. **語彙制約セクション**: `buildCefrConstraint(cefr).vocab_pool_description` をシステムプロンプトに注入
2. **Claude にCEFR検証を要求**: 出力 JSON に `cefr_metadata.used_words_above_level` フィールド追加。Claude 自身が「想定外語彙」を申告する
3. **複雑性制約**: `sentence_complexity` と `forbidden_constructions` を Lv とは独立に注入
4. **検証**: Claude が空配列で `used_words_above_level` を返したものを採用、非空なら再生成（最大3回）

### 3.3 audio モジュール

#### 3.3.1 公開API

```typescript
// core/audio/index.js
async function fetchAudio(params: {
  text: string | string[],
  voice: string,
  speed: number,
  instructions: string,
  cefr: 'A1A2' | 'B1' | 'B2',     // キャッシュ階層化のため
  shell: 'intensive' | 'extensive' | 'shadowing',
}): Promise<{ url: string, cached: boolean, sizeBytes: number }>
```

#### 3.3.2 Drive キャッシュ層

`core/audio/driveCache.js`:

```javascript
// 1. cacheKey = sha256(text|voice|speed|instructions)  ※既存 background.md §4.7 準拠
// 2. manifest（後述）に存在 → Drive URL 返却（cached: true）
// 3. 不在 → OpenAI TTS 呼び出し → Drive アップロード → manifest 更新 → URL 返却
```

Drive 上の格納構造：

```
/ListeningTrainer/
  /audio/
    /A1A2/
      /intensive/
        {hash}.mp3
      /extensive/
        {hash}.mp3
    /B1/
      /intensive/
        {hash}.mp3
      ...
    /B2/
      ...
  /manifest/
    audio_manifest.json
```

#### 3.3.3 Manifest（audio_manifest.json）

```typescript
type AudioManifest = {
  version: string,
  updated_at: ISO8601,
  entries: {
    [hash: string]: {
      drive_file_id: string,
      drive_url: string,
      cefr: 'A1A2' | 'B1' | 'B2',
      shell: 'intensive' | 'extensive' | 'shadowing',
      text_preview: string,        // 検索用先頭40文字
      voice: string,
      speed: number,
      size_bytes: number,
      created_at: ISO8601,
      last_accessed_at: ISO8601,
      access_count: number,
    }
  }
}
```

**運用ルール**：
- Manifest は GAS で読み書き。フロントから直接 Drive を触らない（権限管理の単純化）。
- 各シェルが `fetchAudio` を呼ぶたびに `last_accessed_at` `access_count` を更新（書き込み頻度が問題ならバッチ化）。
- **LRU クリーンアップ**：manifest のサイズが閾値（例: 5000エントリ）を超えたら、`last_accessed_at` の古い順に削除する GAS バッチを月次で走らせる。

#### 3.3.4 ttsClient.js

OpenAI TTS の呼び出しは既存実装を再利用。引数は generation の `tts_instructions` `speed` `voice` を受け取る。**重要**: TTS 呼び出しは Drive キャッシュミス時のみ走る。

### 3.4 CEFR データ参照

#### 3.4.1 構造（提案）

```
src/data/cefr/
  a1a2_words.json        # 約 1,300 語の headword リスト
  b1_words.json          # +900 語
  b2_words.json          # +1,200 語
  a1a2_chunks.json       # 約 350 MWE
  b1_chunks.json         # +450
  b2_chunks.json         # +1,000
```

各JSONの構造：

```typescript
type CefrEntry = {
  text: string,             // 語またはチャンク
  pos?: string,             // 品詞（語のみ）
  cefr: 'A1' | 'A2' | 'B1' | 'B2',
  type: 'word' | 'chunk',
  example?: string,
}
```

#### 3.4.2 データ取得元

実装時に Naoya が用意するか、もしくは以下から取り込むスクリプトを Cursor が書く：

| ソース | URL | 用途 |
|---|---|---|
| English Vocabulary Profile (EVP) | https://www.englishprofile.org/ | 語・MWE の CEFR タグ |
| Oxford 3000 / 5000 | https://www.oxfordlearnersdictionaries.com/ | CEFR 別頭語リスト |
| OPAL (Academic Phrasal) | https://www.eapfoundation.com/vocab/academic/opal/ | アカデミックチャンク |

※ 実データ取り込みは **Phase 2 のサブタスク**として扱う。Phase 1 では空のスタブで構造のみ作成。

---

## 4. シェル別仕様

### 4.1 精聴シェル（既存を保持しつつコア化）

#### 4.1.1 変更点

**機能変更なし**。内部的にコア API を呼ぶようリファクタするのみ。

- `src/lib/prompts.js` → `core/generation/prompts.js` に移動
- 既存の `LEVELS` `SCENES` 定義は `core/shared/sceneConfig.js` `core/shared/levels.js` へ
- シェル内コンポーネントは `shells/intensive/` 配下に集約

#### 4.1.2 CEFR 軸の追加

- UI: シーン選択画面に CEFR 選択を追加（A1+A2 / B1 / B2）
- デフォルト: §2.2 の推奨マトリクスに従う
- 既存ユーザの進捗データ（localStorage）は `cefr: 'B1'` をデフォルトとしてマイグレーション

#### 4.1.3 Acceptance（精聴シェル）

- [ ] CEFR選択UIが表示される
- [ ] 同じシーン×Lvで CEFR を切り替えると、生成される文の語彙レベルが目視で異なる
- [ ] 既存のCloze・Full Dictation・Minimal Pair 全モードが従来通り動作
- [ ] target_features ベースの診断が従来通り動作

### 4.2 多聴シェル（新規）

#### 4.2.1 設計原則（背景）

既存アプリの「制約が学習を作る」「診断精度＞完遂量」を **意図的に逆転** させる：

| 既存（精聴） | 多聴 |
|---|---|
| 自然速度のみ、リプレイ制限 | リプレイ自由・倍速可・連続再生 |
| Cloze で診断 | 診断なし、ただ理解できる量を浴びる |
| 1問単位の摩擦UI | スワイプで次へ・低摩擦 |
| 語彙制限（CEFR A2-B1）で診断ノイズ抑制 | CEFR で意味取得を保証（i+1） |
| 単文中心 | **連続パッセージ・対話**（リズムは長い流れで育つ）|

#### 4.2.2 機能仕様

- **コンテンツ単位**: 3〜6文のパッセージ、または 4〜8ターンの対話
- **生成**: コア API を `length: 'short_passage' | 'long_passage' | 'dialogue'` で呼び出す
- **再生フロー**:
  1. **Read+Listen モード**（dual coding）: 英語スクリプト＋翻訳を表示しつつ自動再生
  2. **Listen Only モード**: スクリプト非表示、音声のみ。タップで翻訳一時表示。
  3. ユーザは自分の段階を選んで切替
- **連続再生**: パッセージ終了で自動的に次の生成を開始（バックグラウンドで先読み）
- **スキップ/戻る**: 上下スワイプで前後パッセージ
- **目標構造の集中投入（input flooding）**:
  - 「関係詞節を浴びたい」「分詞構文を浴びたい」等の **構造フラッグ** を選べる
  - フラッグが立つと、生成プロンプトに「**この構造を各パッセージに2回以上含めること**」が注入される
  - ユーザの§Q1（瞬発力訓練）の核心仕様

#### 4.2.3 診断は行わない

これは設計判断。代わりに「**累計接触統計**」をトラッキング：

| 指標 | 用途 |
|---|---|
| 累計再生時間（分）| 多聴の総量 |
| 各構造フラッグの累計接触回数 | 「関係詞節：342回」のような可視化 |
| 各チャンクの異なる文脈での遭遇数 | チャンク自動化の進捗 |

**正答率を測らない**。多聴の効果は遭遇量で測る。

#### 4.2.4 Acceptance（多聴シェル）

- [ ] 3つのCEFRから選んで起動できる
- [ ] パッセージが自動連続再生される（次の音声を先読み）
- [ ] Read+Listen / Listen Only の切替ができる
- [ ] 構造フラッグを ON にすると、その構造を含む文が **80%以上**の頻度で生成される
- [ ] Drive キャッシュにより、同じパッセージの再生時は OpenAI TTS が呼ばれない（ネットワークタブで確認）

### 4.3 シャドーイングシェル（新規）

#### 4.3.1 設計原則

既存 background.md §5 で「産出側スコープ外」とされていた領域を **新シェルとして正規に取り込む**。設計上の核心：

- **理解→その後シャドー**の段階化（前回エッセンス）
- 素材は **すでに理解済みのもの**（多聴で読んだ／精聴で診断したパッセージ）
- 「文法を反復発声で学ぶ」は低価値（既説）→ シャドー対象は **チャンク・プロソディ・連結**

#### 4.3.2 機能仕様

##### Stage 設計（3段階・段階解放）

| Stage | UI | 鍛える回路 |
|---|---|---|
| **1. Sync** | スクリプト表示＋音声再生＋自分も小声で追う | 視覚補助下でリズムに乗る |
| **2. Mumbling/Shadowing** | スクリプト非表示・音声のみ・直後に追って発声 | 音→産出運動の直結 |
| **3. Prosody-focused** | 強勢・連結箇所をハイライト表示、それに合わせる | プロソディ型の刷り込み |

Stage 1 → 2 → 3 はユーザが自分のタイミングで進む。完了条件は §4.3.4。

##### フィードバック（MECE — 検証対象で区分）

| 種別 | 仕組み | フィードバック内容 |
|---|---|---|
| **自己照合** | 自分の録音を再生してモデル音声と聴き比べ | 主観評価（録音保存可） |
| **STT照合** | Web Speech API または OpenAI Whisper でASR、認識結果とスクリプトを diff | 単語単位の一致／不一致をハイライト |
| **プロソディ可視化**（将来）| 音声波形・ピッチ抽出（pitch.js 等） | 強勢パターンのズレを視覚化 |

第3は Phase 5 では実装せず、将来拡張とする。

##### STT照合の実装

`core/scoring/stt.js`:

```typescript
async function compareWithScript(audioBlob: Blob, expectedText: string): Promise<{
  recognized_text: string,
  match_score: number,             // 0-1
  per_word: Array<{
    expected: string,
    recognized: string | null,
    matched: boolean,
  }>
}>
```

実装方針：
- **MVP**: Web Speech API（ブラウザ内、無料、精度はそこそこ）
- **将来**: OpenAI Whisper API（精度高い、有料）への切替を選択肢化
- 「誤認識＝発音のズレ」という解釈は background.md の精聴思想（**ズレを構造化して返す**）を産出側に転用したもの

#### 4.3.3 素材の流用

- 多聴で再生したパッセージを「シャドー対象に追加」ボタンで送り込める
- 精聴の Cloze で 80% 以上スコアしたパッセージは「理解済み」としてシャドー対象候補に
- 単独でも CEFR + 構造フラッグで生成可

#### 4.3.4 Acceptance（シャドーイングシェル）

- [ ] Stage 1 → 2 → 3 が手動で進める
- [ ] 録音→再生→モデル比較ができる
- [ ] STT照合で recognized_text と match_score が表示される
- [ ] match_score が一定（例 0.8）以上で Stage 完了マーク
- [ ] 多聴で再生済みのパッセージを送り込めるリンクUI

---

## 5. Google Drive 音声キャッシュ

### 5.1 アーキテクチャ

```
Frontend (Browser)
    │
    │ 1. fetchAudio({text, voice, ...})
    ▼
GAS Endpoint (cache check)
    │
    │ 2. manifest 検索
    ▼
   ┌── HIT ─────────────────────────┐
   │ Drive URL 返却                  │
   │ (manifest.last_accessed 更新)   │
   └─────────────────────────────────┘
   ┌── MISS ────────────────────────┐
   │ 3. OpenAI TTS 呼び出し          │
   │ 4. mp3 を Drive にアップロード   │
   │ 5. manifest に entry 追加        │
   │ 6. Drive URL 返却               │
   └─────────────────────────────────┘
```

### 5.2 キャッシュキー

既存 background.md §4.7 と同じ：

```javascript
cacheKey = sha256(`${text}|${voice}|${speed}|${instructions}`)
```

ただし `text` が対話の場合は配列を JSON.stringify したものを使う。

### 5.3 GAS エンドポイント仕様

```
POST /audio
  Body: { text, voice, speed, instructions, cefr, shell }
  Response: { url, cached, sizeBytes }
```

GAS スクリプトの責務：
1. 入力からキャッシュキー算出
2. `audio_manifest.json` を読んでヒット判定
3. ヒット → Drive 公開URL 返却（`drive_url`）
4. ミス → OpenAI TTS POST → 戻り mp3 を Drive にアップ → manifest 更新 → URL 返却

### 5.4 バッチ事前生成（任意・後回し可）

CEFR×シーン×Lv の組み合わせで頻出文を**事前生成**できるバッチを GAS スクリプトとして用意する。

- 初回ユーザがすぐ大量のキャッシュヒットを得る
- Phase 4 完了後の任意拡張

```
warmup_cache.gs:
  for cefr in ['A1A2', 'B1', 'B2']:
    for scene in SCENES:
      for level in [1..5]:
        for i in range(50):  # シーン×Lvあたり50文
          generate + cache
```

### 5.5 容量・コスト試算

| 項目 | 試算 |
|---|---|
| 想定キャッシュ規模 | 約 4,500 〜 10,000 mp3 |
| 平均ファイルサイズ | 60〜100 KB（自然速・10秒以内）|
| 合計容量 | ~360 MB 〜 1 GB |
| Drive 無料枠 | 15 GB（十分余裕）|
| OpenAI TTS コスト | $15/1M chars。1文 ~80 chars × 10000 = 800K chars ≈ $12 一回限り |

**結論**: 無料枠で運用可。事前生成バッチを走らせても初期コスト $15 程度。

---

## 6. 実装フェーズ

各 Phase は独立して動作確認できる単位。**前 Phase の Acceptance を満たしてから次へ**。

### Phase 1: 共有コアの抽出（既存挙動を変えない）

**目的**: 現行コードを `core/` と `shells/intensive/` に再配置するリファクタ。**挙動の差分はゼロ**であるべき。

**タスク**:
- [ ] `src/core/generation/prompts.js` に既存 prompts.js を移動
- [ ] `src/core/generation/targetFeatures.js` に target_features カタログを分離
- [ ] `src/core/audio/ttsClient.js` に TTS 呼び出しを集約
- [ ] `src/core/scoring/cloze.js` `dictation.js` に既存 scoring.js を分割
- [ ] `src/core/shared/sceneConfig.js` `levels.js` に既存定義を分離
- [ ] `src/shells/intensive/` に既存UIコンポーネントを移動
- [ ] `src/App.jsx` から精聴シェルが従来通り起動する

**Acceptance**:
- [ ] **既存の Cloze / Full Dictation / Minimal Pair 全モードが従来通り完全動作**
- [ ] 既存テストがあれば全て pass
- [ ] target_features ベースのレビュー画面が変わらず表示される
- [ ] **コミットは「リファクタのみ」と「機能追加」を分けること**

### Phase 2: CEFR 軸の追加

**目的**: 3軸目（CEFR）を追加し、精聴シェルで使えるようにする。

**タスク**:
- [ ] `src/core/shared/cefr.js` に CEFR 設定（§2.3 の表）を実装
- [ ] `src/core/generation/cefrConstraints.js` で §3.2.2 の制約オブジェクトを返す関数を実装
- [ ] `prompts.js` の `buildGenerationPrompt` に CEFR 制約を注入
- [ ] Claude 出力 JSON スキーマに `cefr_metadata.used_words_above_level` 追加
- [ ] 想定外語彙が出たら最大3回まで再生成する制御
- [ ] 精聴シェルのシーン選択画面に CEFR 選択UIを追加
- [ ] localStorage マイグレーション（既存ユーザは CEFR=B1 で開始）
- [ ] `src/data/cefr/` 配下に空スタブのJSON（実データは Naoya が後日提供）

**Acceptance**:
- [ ] CEFR=A1A2 / B1 / B2 で生成される文の語彙レベルが目視で明確に異なる
- [ ] B2 生成で perfect aspect が、A1A2 で禁止されている（プロンプト効果検証）
- [ ] §2.2 の推奨マトリクスがデフォルトで選択される
- [ ] **既存の精聴シェル全機能が引き続き動作**（CEFR=B1既定で従来挙動と一致）

### Phase 3: Drive 音声キャッシュ層

**目的**: OpenAI TTS の呼び出し回数を削減し、Driveに保管。

**タスク**:
- [ ] GAS で `/audio` エンドポイントを実装（§5.3）
- [ ] `audio_manifest.json` の初期化と読み書き
- [ ] Drive フォルダ構造の作成（`/ListeningTrainer/audio/{cefr}/{shell}/`）
- [ ] `src/core/audio/driveCache.js` でフロント側のキャッシュ呼び出し実装
- [ ] `src/core/audio/audioManifest.js` でmanifest更新（last_accessed_at）
- [ ] 既存 ttsClient.js を driveCache 経由に切り替え
- [ ] LRUクリーンアップの月次バッチ（GAS）

**Acceptance**:
- [ ] 同じ文を2度再生したとき、2度目は OpenAI TTS が呼ばれない（ネットワークタブで確認）
- [ ] Drive 上に mp3 が階層構造で保存されている
- [ ] manifest.json が更新される（access_count 増加）
- [ ] 精聴シェルの応答時間が初回より2回目以降が明確に速い

### Phase 4: 多聴シェル

**目的**: 多聴専用UIを新規構築。既存とは別アプリ的に独立。

**タスク**:
- [ ] `src/shells/extensive/ExtensiveApp.jsx` で多聴シェルのエントリ
- [ ] `core/generation/` に `length: 'short_passage' | 'long_passage' | 'dialogue'` のサポート追加
- [ ] パッセージ・対話用プロンプトの拡張
- [ ] `PassagePlayer.jsx`: Read+Listen UI（スクリプト＋翻訳＋音声）
- [ ] `ListenOnlyView.jsx`: 音声のみUI、タップで翻訳一時表示
- [ ] 上下スワイプで前後パッセージ移動
- [ ] バックグラウンド先読み（次パッセージを再生中に生成）
- [ ] 構造フラッグ UI（関係詞節 / 分詞構文 / 仮定法 等）
- [ ] 構造フラッグをプロンプトに注入する制御
- [ ] 累計統計のlocalStorage 保存

**Acceptance**:
- [ ] CEFR 3段階から選んで起動
- [ ] パッセージが自動連続再生
- [ ] Read+Listen / Listen Only の切替が即時
- [ ] 構造フラッグONで該当構造が **80%以上**の頻度で生成される（10パッセージ生成して目視確認）
- [ ] Drive キャッシュにヒットして TTS 呼び出しが減る
- [ ] 累計再生時間・構造別接触回数が表示される

### Phase 5: シャドーイングシェル

**目的**: 産出側を取り込んだ新シェル。

**タスク**:
- [ ] `src/shells/shadowing/ShadowingApp.jsx`
- [ ] Stage 1 (Sync) / Stage 2 (Mumbling) / Stage 3 (Prosody) のコントローラ
- [ ] `RecordCompare.jsx`: ブラウザMediaRecorder で録音
- [ ] 録音再生UI（モデル音声と切替再生）
- [ ] `core/scoring/stt.js` に Web Speech API ベースの STT 照合実装
- [ ] STT結果と script の単語単位 diff 表示
- [ ] match_score 計算と Stage 完了判定
- [ ] 多聴シェルから「シャドー対象に追加」ボタン
- [ ] 精聴シェルから「Cloze 80%以上→シャドー対象候補」連携
- [ ] 録音履歴の localStorage 保存

**Acceptance**:
- [ ] Stage 1〜3 を順に進められる
- [ ] 録音→再生→モデル比較が動作
- [ ] STT照合で recognized_text と単語単位の差分が表示される
- [ ] match_score 0.8 以上で Stage 完了マーク
- [ ] 多聴・精聴からの素材送り込みが動作

---

## 7. 受け入れ条件（全体）

Phase 1〜5 完了時点で：

- [ ] 既存の精聴シェルは全機能が **後方互換** で動作（既存ユーザの体験を損なわない）
- [ ] 多聴シェル・シャドーイングシェルが独立に起動・動作
- [ ] 3シェルすべてで CEFR 軸が選択でき、生成内容に反映される
- [ ] 同じ音声パラメータでの OpenAI TTS 呼び出しは **2回目以降ゼロ**
- [ ] Drive 上に階層化されたキャッシュが保存され、manifest で参照可
- [ ] 構造フラッグによる input flooding が機能している
- [ ] STT照合がブラウザ内で動作（Web Speech API）

---

## 8. スコープ外（Phase 5 までで扱わない）

| 項目 | 補完先・将来 |
|---|---|
| ピッチ可視化・プロソディスコアリング | 将来 Phase 6 |
| OpenAI Whisper への STT 切替 | 将来 Phase 6 |
| C1・C2 レベル | 当面 B2 まで |
| 進捗の Drive 永続化 | 当面 localStorage |
| **語彙・チャンク多読アプリ（前回 Q2）** | **別仕様書**（必要なら別途依頼）|
| CEFR データの自動取り込みスクリプト | Naoya が手動投入またはPhase 2.5として別途 |
| イントネーション学習 | background.md §5 通り Pines / Speaking教材 |

---

## 9. Cursor → Naoya への確認事項

実装着手前に以下を確認すること：

1. **CEFR データの実体**：`src/data/cefr/*.json` の中身を Naoya が用意するか、Cursor が EVP 等から取り込むスクリプトを書くか
2. **既存ディレクトリ構造**：`src/lib/` `src/components/` の現状ファイル一覧を Cursor が確認し、§3.1 の提案構造と差異を Naoya に報告
3. **GAS スクリプトのデプロイ環境**：既存の GAS デプロイ URL を再利用するか新規にするか
4. **localStorage マイグレーション**：既存ユーザの CEFR デフォルトを B1 で問題ないか
5. **構造フラッグの対象構造リスト**：多聴シェルで提示する構造（関係詞節・分詞構文・仮定法・倒置 等）の確定リスト

---

## 10. 補足：本仕様書と既存 background.md の関係

既存 `docs/background.md` は **精聴シェル単独の設計書** として今後も維持される。本仕様書（v2 work request）の実装後、`docs/background.md` は次のように整理されるべき（**Phase 5 完了後の宿題**）：

```
docs/
  background.md            ← 精聴シェル（既存をそのまま）
  architecture.md          ← 3シェル統合アーキテクチャ（本仕様の昇格版）
  extensive.md             ← 多聴シェル設計書（新規）
  shadowing.md             ← シャドーイングシェル設計書（新規）
```

これは Phase 完了後の整理作業であり、Phase 1〜5 のコード実装には含まれない。

---

*Ver. 1.0 — 3シェル統合アーキテクチャ仕様 / Cursor work-request*
