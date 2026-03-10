// App.tsx - エントリーポイント（マイグレーション + Drizzle Studio）
import React, { Suspense } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import { expoDb } from "./db/client";
import migrations from "./drizzle/migrations";
import ChatScreen from "./screens/ChatScreen";

const DATABASE_NAME = "chat_app.db";

function DevTools() {
  // 開発時のみ Drizzle Studio を有効化
  // shift + m → expo-drizzle-studio-plugin を選択してブラウザでDB確認
  if (__DEV__) {
    useDrizzleStudio(expoDb);
  }
  return null;
}

export default function App() {
  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 8 }}>データベースを初期化中...</Text>
        </View>
      }
    >
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        options={{ enableChangeListener: true }}
        useSuspense
        onInit={async (database) => {
          // WALモード
          database.execSync("PRAGMA journal_mode = WAL;");
          database.execSync("PRAGMA foreign_keys = ON;");

          // Drizzle マイグレーション実行
          const drizzleDb = drizzle(database);
          await migrate(drizzleDb, migrations);
        }}
      >
        <DevTools />
        <ChatScreen roomId="room_001" currentUserId="user_me" />
      </SQLiteProvider>
    </Suspense>
  );
}
