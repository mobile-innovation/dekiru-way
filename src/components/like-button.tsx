"use client";

import { useState } from "react";
import Link from "next/link";
import { IconHeart } from "@/components/icons";
import { api, ClientApiError } from "@/lib/client/api";

/**
 * 経験詳細の「この経験は参考になりましたか？」のハートボタン (いいね指示書)。
 *
 * - いいね数は絶対に表示しない。
 * - 未評価 = 灰色のハート / 評価済み = 赤いハート。色だけに頼らず aria-label と文字で状態を示す。
 * - 自分の経験にはボタンを出さない (`isMine`)。
 * - 未ログイン (`loggedIn=false`) はボタンを押すとログイン案内を出す。
 */
export function LikeButton({
  attemptId,
  isMine,
  loggedIn,
  initialLiked,
  loginNext,
}: {
  attemptId: string;
  isMine: boolean;
  loggedIn: boolean;
  initialLiked: boolean;
  loginNext: string;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  if (isMine) {
    return (
      <p className="text-sm text-[var(--color-ink-muted)]">これはあなたの経験です。</p>
    );
  }

  const loginHref = `/login?next=${encodeURIComponent(loginNext)}`;

  async function toggle() {
    if (busy) return;
    setMessage(null);

    if (!loggedIn) {
      setNeedLogin(true);
      return;
    }

    const next = !liked;
    setLiked(next); // 楽観的更新
    setBusy(true);
    try {
      if (next) {
        await api.post(`/api/v1/attempts/${attemptId}/like`);
      } else {
        await api.del(`/api/v1/attempts/${attemptId}/like`);
      }
    } catch (err) {
      setLiked(!next); // 失敗したら戻す
      if (err instanceof ClientApiError && err.code === "unauthorized") {
        window.location.assign(loginHref);
        return;
      }
      setMessage(
        err instanceof ClientApiError ? err.message : "うまくいきませんでした。時間をおいて試してください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        aria-label={liked ? "いいねを取り消す" : "この経験をいいねする"}
        className="tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
        style={{
          borderColor: liked ? "var(--color-danger)" : "var(--color-border)",
          backgroundColor: liked ? "var(--color-accent-soft)" : "var(--color-surface)",
          color: liked ? "var(--color-danger)" : "var(--color-ink-muted)",
        }}
      >
        <IconHeart
          aria-hidden="true"
          className="h-5 w-5 shrink-0"
          fill={liked ? "currentColor" : "none"}
        />
        <span>{liked ? "参考になりました" : "参考になった"}</span>
      </button>

      {needLogin && (
        <p className="text-sm text-[var(--color-ink-muted)]">
          この経験にいいねを送るにはログインが必要です。{" "}
          <Link href={loginHref} className="font-semibold underline">
            ログインする
          </Link>
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {message}
        </p>
      )}
    </div>
  );
}
