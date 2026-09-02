import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Auth.js (NextAuth v5) 設定。
 *
 * - セッションは JWT (HttpOnly Cookie)。DB アダプタは使わず、
 *   `users` テーブルは指示書 4 のスキーマのまま自前で upsert する。
 * - Google の `sub` (OpenID Connect subject) を `users.google_sub` に対応させる。
 * - Google クレデンシャル未設定でもアプリは起動する (公開検索はログイン不要)。
 */
export const AUTH_COOKIE_NAME = "authjs.session-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  secret: env.auth.secret || undefined,
  pages: {
    signIn: "/login",
  },
  providers: env.auth.googleConfigured
    ? [
        Google({
          clientId: env.auth.googleId,
          clientSecret: env.auth.googleSecret,
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account, profile }) {
      // 初回サインイン時のみ users を upsert する。
      if (account?.provider === "google" && profile?.sub) {
        const user = await prisma.user.upsert({
          where: { googleSub: profile.sub },
          create: {
            googleSub: profile.sub,
            displayName: typeof profile.name === "string" ? profile.name : null,
            avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
          },
          update: {
            displayName: typeof profile.name === "string" ? profile.name : undefined,
            avatarUrl: typeof profile.picture === "string" ? profile.picture : undefined,
          },
        });
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});
