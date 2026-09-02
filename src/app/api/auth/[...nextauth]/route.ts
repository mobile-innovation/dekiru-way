import { handlers } from "@/auth";

// Auth.js の OAuth ハンドラ (/api/auth/*)。
// 指示書の POST /api/v1/auth/google, POST /api/v1/auth/logout はこれへのラッパ。
export const { GET, POST } = handlers;
