// drizzle.config.ts - Drizzle Kit 設定
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "expo", // expo-sqlite 用ドライバ
});
