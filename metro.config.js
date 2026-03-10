// metro.config.js - .sql ファイルを Metro でバンドルするための設定
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle が生成する .sql マイグレーションファイルを読み込めるようにする
config.resolver.sourceExts.push("sql");

module.exports = config;
