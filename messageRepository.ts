// db/messageRepository.ts - Drizzle によるメッセージ CRUD
import { and, desc, eq, lt, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { messages, type Message, type NewMessage } from "./schema";

// ========================================
// 型定義
// ========================================
export interface PaginatedResult {
  messages: Message[];
  hasMore: boolean;
  /** 次ページ読み込み時に使うカーソル（最古の created_at） */
  nextCursor: string | null;
}

const PAGE_SIZE = 30;

// ========================================
// 読み取り（カーソルベースページネーション）
// ========================================

/**
 * カーソルベースでメッセージを取得
 *
 * OFFSETを使わない理由:
 *   OFFSET 300 → 先頭300件をスキャンしてから取得（O(n)）
 *   WHERE created_at < cursor → インデックスで直接ジャンプ（O(log n)）
 *
 * @param roomId  チャットルームID
 * @param cursor  前回取得の最古メッセージの created_at（初回は undefined）
 * @param limit   取得件数
 */
export async function getMessages(
  roomId: string,
  cursor?: string,
  limit: number = PAGE_SIZE
): Promise<PaginatedResult> {
  const conditions = [
    eq(messages.roomId, roomId),
    eq(messages.isDeleted, false),
  ];

  if (cursor) {
    conditions.push(lt(messages.createdAt, cursor));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1); // +1 で「まだ続きがあるか」を判定

  const hasMore = rows.length > limit;
  const result = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: result.reverse(), // 時系列順に戻す（表示用）
    hasMore,
    nextCursor: result.length > 0 ? result[0].createdAt : null,
  };
}

/**
 * 特定メッセージ1件を取得
 */
export async function getMessageById(
  messageId: string
): Promise<Message | undefined> {
  const [row] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  return row;
}

// ========================================
// 書き込み
// ========================================

/**
 * 1件挿入（ユーザー送信時）
 * - onConflictDoUpdate で重複時も安全
 */
export async function insertMessage(message: NewMessage): Promise<void> {
  await db
    .insert(messages)
    .values(message)
    .onConflictDoUpdate({
      target: messages.id,
      set: {
        content: message.content,
        updatedAt: new Date().toISOString(),
        isSynced: message.isSynced,
      },
    });
}

/**
 * バッチ挿入（サーバーからの同期時）
 *
 * Drizzle の .values() に配列を渡すだけで
 * 内部的に単一の INSERT 文にまとめてくれる
 */
export async function insertMessagesBatch(
  msgs: NewMessage[]
): Promise<void> {
  if (msgs.length === 0) return;

  // SQLite の変数上限（999）を考慮して分割
  const CHUNK_SIZE = 80; // 12カラム × 80 = 960 < 999

  for (let i = 0; i < msgs.length; i += CHUNK_SIZE) {
    const chunk = msgs.slice(i, i + CHUNK_SIZE);
    await db
      .insert(messages)
      .values(chunk)
      .onConflictDoNothing({ target: messages.id });
  }
}

// ========================================
// 更新・削除
// ========================================

/**
 * 既読フラグを一括更新
 */
export async function markMessagesAsRead(
  roomId: string,
  upToCreatedAt: string
): Promise<void> {
  await db
    .update(messages)
    .set({ isRead: true })
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.isRead, false),
        // created_at <= upToCreatedAt
        sql`${messages.createdAt} <= ${upToCreatedAt}`
      )
    );
}

/**
 * 論理削除
 */
export async function softDeleteMessage(messageId: string): Promise<void> {
  await db
    .update(messages)
    .set({
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(messages.id, messageId));
}

/**
 * 同期完了フラグを更新
 */
export async function markAsSynced(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  await db
    .update(messages)
    .set({ isSynced: true })
    .where(inArray(messages.id, messageIds));
}

/**
 * 未同期メッセージを取得（バックグラウンド同期用）
 */
export async function getUnsyncedMessages(): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.isSynced, false))
    .orderBy(messages.createdAt);
}
