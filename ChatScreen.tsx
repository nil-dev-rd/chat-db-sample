// screens/ChatScreen.tsx - FlashList を使ったチャット画面
import React, { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useChatMessages } from "../hooks/useChatMessages";
import type { Message } from "../db/schema";

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface ChatScreenProps {
  roomId: string;
  currentUserId: string;
}

export default function ChatScreen({ roomId, currentUserId }: ChatScreenProps) {
  const {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadOlderMessages,
    addMessage,
  } = useChatMessages(roomId);

  const flashListRef = useRef<FlashList<Message>>(null);
  const [inputText, setInputText] = React.useState("");

  // ── メッセージ送信 ──
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setInputText("");

    // DB に INSERT するだけで useLiveQuery が自動でUIを更新
    await addMessage({
      id: generateId(),
      roomId,
      senderId: currentUserId,
      content: trimmed,
      type: "text",
      createdAt: new Date().toISOString(),
      isRead: false,
      isDeleted: false,
      metadata: null,
      isSynced: false,
    });

    // 最下部にスクロール
    setTimeout(() => {
      flashListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [inputText, roomId, currentUserId, addMessage]);

  // ── リストアイテム描画 ──
  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const isMe = item.senderId === currentUserId;
      return (
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.myMessage : styles.theirMessage,
          ]}
        >
          <Text style={[styles.messageText, isMe && styles.myMessageText]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isMe && styles.myTimeText]}>
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      );
    },
    [currentUserId]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // getItemType で送信者別にビューリサイクルの精度を上げる
  const getItemType = useCallback(
    (item: Message) => (item.senderId === currentUserId ? "me" : "other"),
    [currentUserId]
  );

  const ListHeaderComponent = useMemo(
    () =>
      isLoadingMore ? (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color="#888" />
        </View>
      ) : null,
    [isLoadingMore]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlashList
        ref={flashListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        estimatedItemSize={80}
        onStartReached={hasMore ? loadOlderMessages : undefined}
        onStartReachedThreshold={0.3}
        drawDistance={300}
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="メッセージを入力..."
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !inputText.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Text style={styles.sendButtonText}>送信</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  loadingMore: { paddingVertical: 16, alignItems: "center" },
  messageBubble: {
    maxWidth: "75%",
    marginVertical: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  myMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#E8E8E8",
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 16, lineHeight: 22, color: "#333" },
  myMessageText: { color: "#fff" },
  timeText: { fontSize: 11, color: "#999", marginTop: 2, alignSelf: "flex-end" },
  myTimeText: { color: "rgba(255,255,255,0.7)" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#007AFF",
    borderRadius: 20,
  },
  sendButtonDisabled: { backgroundColor: "#ccc" },
  sendButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
