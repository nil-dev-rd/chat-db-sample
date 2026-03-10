# expo-sqlite + Drizzle チャットメッセージ永続化ガイド

## セットアップ

```bash
# 必須パッケージ
npx expo install expo-sqlite
npm install drizzle-orm
npm install -D drizzle-kit babel-plugin-inline-import

# FlashList
npx expo install @shopify/flash-list

# 開発ツール（任意）
npx expo install expo-drizzle-studio-plugin
```

`app.json` に FTS を有効化する場合:
```json
{
  "expo": {
    "plugins": [
      ["expo-sqlite", { "enableFTS": true }]
    ]
  }
}
```

## マイグレーション生成・適用

```bash
# スキーマ変更後にマイグレーションSQLを生成
npx drizzle-kit generate

# → ./drizzle/ 配下に .sql ファイルと migrations.js が生成される
# → アプリ起動時に App.tsx 内の migrate() で自動適用
```

## ファイル構成

```
├── App.tsx                      ← エントリーポイント・マイグレーション実行
├── drizzle.config.ts            ← Drizzle Kit 設定
├── metro.config.js              ← .sql ファイル対応
├── babel.config.js              ← inline-import プラグイン
├── db/
│   ├── schema.ts                ← テーブル定義（Drizzle スキーマ）
│   ├── client.ts                ← Drizzle クライアント（シングルトン）
│   └── messageRepository.ts     ← CRUD・カーソルページネーション
├── hooks/
│   └── useChatMessages.ts       ← useLiveQuery + ページネーション
├── screens/
│   └── ChatScreen.tsx           ← FlashList チャット画面
└── drizzle/                     ← 自動生成されるマイグレーションファイル
```

## Drizzle を使う主なメリット

### 1. 型安全なクエリ
```typescript
// スキーマから型が自動推論される
const rows = await db
  .select()
  .from(messages)
  .where(eq(messages.roomId, "room_001"));
// rows の型は Message[] と自動推論
```

### 2. useLiveQuery によるリアルタイム更新
```typescript
// DB に INSERT/UPDATE/DELETE すると自動で再レンダリング
const { data } = useLiveQuery(
  db.select().from(messages).where(eq(messages.roomId, roomId))
);
```
従来は「DB更新 → 手動でstateを更新」が必要だったが、
`useLiveQuery` は `enableChangeListener` と連携してDB変更を自動検知する。

**チャットでの活用:** `addMessage()` で DB に INSERT するだけでリストが更新される。
楽観的更新のための state 操作が不要になり、コードが大幅にシンプルになる。

### 3. Drizzle Kit によるマイグレーション管理
```bash
# スキーマを変更して
npx drizzle-kit generate
# → SQL ファイルが自動生成。アプリ起動時に自動適用
```

### 4. Drizzle Studio でデバッグ
開発時に `shift + m` → `expo-drizzle-studio-plugin` を選択すると、
ブラウザ上でDBの中身を直接確認・編集できる。

## パフォーマンス改善ポイント

| 施策 | 効果 | 実装箇所 |
|------|------|----------|
| WAL モード | 読み書き並行処理の高速化 | `db/client.ts` |
| 複合インデックス (room_id, created_at) | ページネーションクエリを O(log n) に | `db/schema.ts` |
| カーソルベースページネーション | OFFSET と違い件数が増えても一定速度 | `db/messageRepository.ts` |
| FlashList + getItemType | ビューリサイクルによるメモリ削減 | `screens/ChatScreen.tsx` |
| useLiveQuery | state 手動管理不要・自動再レンダリング | `hooks/useChatMessages.ts` |
| onConflictDoUpdate | 重複 INSERT を安全に処理 | `db/messageRepository.ts` |
| バッチ挿入（チャンク分割） | SQLite 変数上限を考慮した大量 INSERT | `db/messageRepository.ts` |

## useChatMessages フックの設計

```
┌─────────────────────────────────────────────┐
│              useChatMessages                 │
│                                              │
│  olderMessages (state)                       │
│  ← loadOlderMessages() で手動追加            │
│  ← カーソルベースで古い順に取得              │
│                                              │
│  liveMessages (useLiveQuery)                 │
│  ← DB 変更を自動検知して最新 N 件を保持     │
│  ← addMessage() で INSERT するだけでOK      │
│                                              │
│  combinedMessages                            │
│  = olderMessages + liveMessages (重複排除)   │
│  → FlashList の data に渡す                  │
└─────────────────────────────────────────────┘
```

## 発展: さらなる最適化

### 全文検索 (FTS5)
`app.json` で `enableFTS: true` を設定し、FTS仮想テーブルを作成:
```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid);
```

### SQLCipher（暗号化）
```json
["expo-sqlite", { "useSQLCipher": true }]
```

### TanStack Query との統合
サーバー同期部分は TanStack Query で管理し、
ローカルキャッシュは Drizzle + SQLite という分担も有効。
