// db/schema.ts - Drizzle スキーマ定義
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * メッセージテーブル
 *
 * インデックス設計のポイント:
 * - idx_room_created: ページネーションの核心。room_id でフィルタし created_at DESC で並べる
 * - idx_unsynced: 部分インデックスで未同期メッセージだけを高速検索
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    senderId: text("sender_id").notNull(),
    content: text("content").notNull(),
    type: text("type", { enum: ["text", "image", "file"] })
      .notNull()
      .default("text"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at"),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isDeleted: integer("is_deleted", { mode: "boolean" })
      .notNull()
      .default(false),
    metadata: text("metadata"), // JSON文字列
    isSynced: integer("is_synced", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("idx_messages_room_created").on(table.roomId, table.createdAt),
    index("idx_messages_sender").on(table.senderId),
    index("idx_messages_unsynced").on(table.isSynced),
  ]
);

// Drizzle が自動生成する型
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
