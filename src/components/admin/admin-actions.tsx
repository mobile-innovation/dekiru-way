"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";

const BTN =
  "tap-target inline-flex items-center justify-center gap-1 rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
const BTN_PRIMARY = `${BTN} border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]`;
const BTN_DANGER = `${BTN} border-[var(--color-danger)] bg-[var(--color-surface)] text-[var(--color-danger)]`;
const BTN_PLAIN = `${BTN} border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]`;

// 管理ログインの入力欄。16px（iOS の自動ズーム回避）＋ フォーカスで枠色とリング。
const LOGIN_INPUT =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-base transition-colors focus-visible:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-soft)]";

export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await api.post("/api/admin/logout");
          router.replace("/admin/login");
          router.refresh();
        })
      }
      className="underline disabled:opacity-50"
    >
      ログアウト
    </button>
  );
}

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await api.post("/api/admin/login", { email, password });
        router.replace("/admin");
        router.refresh();
      } catch (e2) {
        setErr(e2 instanceof ClientApiError ? e2.message : "ログインできませんでした");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="admin-email" className="block text-sm font-semibold">
          メールアドレス
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={LOGIN_INPUT}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="admin-password" className="block text-sm font-semibold">
          パスワード
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={LOGIN_INPUT}
        />
      </div>
      {err && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-danger)]"
        >
          {err}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="tap-target mt-1 flex w-full items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-primary-ink)] transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}

const endpoints = (id: string) => ({
  moderate: `/api/admin/moderation/${id}`,
  status: `/api/admin/posts/${id}`,
  recheck: `/api/admin/posts/${id}/recheck`,
  noun: "経験",
});

/** 確認キュー / 詳細の「公開する / 公開しない」。右端に「保留」(保留一覧では「保留を解除」)。 */
export function ModerationDecisionButtons({ id, held = false }: { id: string; held?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ep = endpoints(id);

  function run(action: "approve" | "reject" | "hold" | "unhold", done: string) {
    if (action === "reject" && !confirm(`この${ep.noun}は公開しない、でよろしいですか？`)) return;
    setMsg(null);
    start(async () => {
      try {
        await api.post(ep.moderate, { action });
        setMsg(done);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof ClientApiError ? e.message : "更新できませんでした");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run("approve", "公開しました")}
        className={BTN_PRIMARY}
      >
        公開する
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run("reject", "公開しないにしました")}
        className={BTN_DANGER}
      >
        公開しない
      </button>
      {held ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("unhold", "保留を解除しました")}
          className={`${BTN_PLAIN} ml-auto`}
        >
          保留を解除
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("hold", "保留にしました")}
          className={`${BTN_PLAIN} ml-auto`}
        >
          保留
        </button>
      )}
      {msg && <span className="w-full text-xs text-[var(--color-ink-muted)]">{msg}</span>}
    </div>
  );
}

/** 詳細の「取り下げ / 再公開 / AI 再チェック」。 */
export function PostAdminControls({
  id,
  moderationStatus,
}: {
  id: string;
  moderationStatus: "pending" | "approved" | "rejected";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ep = endpoints(id);

  function setStatus(next: "pending" | "approved" | "rejected", confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setMsg(null);
    start(async () => {
      try {
        await api.patch(ep.status, { moderationStatus: next });
        setMsg("更新しました");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof ClientApiError ? e.message : "更新できませんでした");
      }
    });
  }

  function recheck() {
    setMsg(null);
    start(async () => {
      try {
        await api.post(ep.recheck);
        setMsg("AI 再チェックしました");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof ClientApiError ? e.message : "再チェックできませんでした");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {moderationStatus === "approved" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus("pending", `公開中の${ep.noun}を公開停止して確認待ちに戻しますか？`)}
          className={BTN_DANGER}
        >
          公開を停止
        </button>
      )}
      {moderationStatus === "rejected" && (
        <button type="button" disabled={pending} onClick={() => setStatus("approved")} className={BTN_PRIMARY}>
          やっぱり公開する
        </button>
      )}
      <button type="button" disabled={pending} onClick={recheck} className={BTN_PLAIN}>
        AI でもう一度チェック
      </button>
      {msg && <span className="text-xs text-[var(--color-ink-muted)]">{msg}</span>}
    </div>
  );
}
