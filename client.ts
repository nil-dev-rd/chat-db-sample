// db/client.ts - Drizzle クライアント（シングルトン）
import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";
import * as schema from "./schema";

/**
 * enableChangeListener: true で useLiveQuery が動作する
 * WALモードはDB初期化時に別途設定
 */
const expoDb = openDatabaseSync("chat_app.db", {
  enableChangeListener: true,
});

// WALモード有効化（読み書き並行処理の高速化）
expoDb.execSync("PRAGMA journal_mode = WAL;");
expoDb.execSync("PRAGMA foreign_keys = ON;");

/**
 * schema を渡すことでリレーショナルクエリ（db.query.messages.findMany等）が使える
 */
export const db = drizzle(expoDb, { schema });

/** Drizzle Studio プラグイン用にexpoDbもexport */
export { expoDb };
