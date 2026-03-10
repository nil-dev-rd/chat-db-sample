// hooks/useChatMessages.ts - チャットメッセージ用カスタムフック
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { messages as messagesTable, type Message, type NewMessage } from "../db/schema";
import {
  getMessages,
  insertMessage,
  markMessagesAsRead,
  type PaginatedResult,
} from "../db/messageRepository";

interface UseChatMessagesReturn {
  /** 表示用メッセージ（時系列順） */
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  /** 古いメッセージを追加読み込み（FlashList の onStartReached から呼ぶ） */
  loadOlderMessages: () => Promise<void>;
  /** 新規メッセージを追加（送信 / WebSocket 受信時） */
  addMessage: (message: NewMessage) => Promise<void>;
  /** 既読更新 */
  markAsRead: (upToCreatedAt: string) => Promise<void>;
}

/**
 * Drizzle useLiveQuery + カーソルページネーション
 *
 * 設計方針:
 *   - 最新メッセージは useLiveQuery で自動同期（INSERT するだけでUIに反映）
 *   - 古いメッセージはカーソルで手動追加読み込み
 *   - olderMessages (手動読み込み分) + liveMessages (最新分) を結合して表示
 */
export function useChatMessages(
  roomId: string,
  initialPageSize: number = 30
): UseChatMessagesReturn {
  // ── 古いメッセージ（手動読み込み分）──
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const cursorRef = useRef<string | undefined>(undefined);
  const isLoadingMoreRef = useRef(false);
  const oldestTimestampRef = useRef<string | undefined>(undefined);

  // ── 最新メッセージ（useLiveQuery でリアルタイム更新）──
  // DB に INSERT/UPDATE があると自動で再実行される
  const { data: liveMessages } = useLiveQuery(
    db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.roomId, roomId),
          eq(messagesTable.isDeleted, false)
        )
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(initialPageSize)
  );

  // ── 初回読み込み ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const result: PaginatedResult = await getMessages(
          roomId,
          undefined,
          initialPageSize
        );
        if (cancelled) return;

        setHasMore(result.hasMore);
        cursorRef.current = result.nextCursor ?? undefined;

        // 初回読み込み後の最古タイムスタンプを記録
        if (result.messages.length > 0) {
          oldestTimestampRef.current = result.messages[0].createdAt;
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, initialPageSize]);

  // ── 古いメッセージの追加読み込み ──
  const loadOlderMessages = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const result = await getMessages(roomId, cursorRef.current);

      setOlderMessages((prev) => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
      cursorRef.current = result.nextCursor ?? undefined;

      // 最古タイムスタンプを更新
      if (result.messages.length > 0) {
        oldestTimestampRef.current = result.messages[0].createdAt;
      }
    } catch (error) {
      console.error("Failed to load older messages:", error);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [roomId, hasMore]);

  // ── 新規メッセージ追加 ──
  // DB に INSERT すれば useLiveQuery が自動で検知するため、
  // state の手動更新は不要
  const addMessage = useCallback(async (message: NewMessage) => {
    await insertMessage(message);
  }, []);

  // ── 既読更新 ──
  const markAsRead = useCallback(
    async (upToCreatedAt: string) => {
      await markMessagesAsRead(roomId, upToCreatedAt);
    },
    [roomId]
  );

  // ── 結合: olderMessages + liveMessages ──
  // liveMessages は最新 N 件を DESC で持っている → reverse して時系列順
  // olderMessages はすでに時系列順
  // 重複排除して結合
  const combinedMessages = (() => {
    const live = [...(liveMessages ?? [])].reverse();
    if (olderMessages.length === 0) return live;

    // older の ID セットを作成して重複排除
    const olderIds = new Set(olderMessages.map((m) => m.id));
    const uniqueLive = live.filter((m) => !olderIds.has(m.id));

    return [...olderMessages, ...uniqueLive];
  })();

  return {
    messages: combinedMessages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadOlderMessages,
    addMessage,
    markAsRead,
  };
}
