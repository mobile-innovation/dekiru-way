"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { Button } from "@/components/ui";
import { IconCheckCircle, IconGlobe, IconLock, IconTrash } from "@/components/icons";

type PublishState = "private" | "reviewing" | "published" | "rejected";

/* 試したことの公開スイッチ (指示書 14: 個別 Attempt 単位で公開)。
   公開申請すると AI 審査が走り、OK なら公開 / NG・不明は運営レビュー待ち (確認中) になる。 */
export function AttemptPublishToggle({
  attemptId,
  initial,
  initialState = initial ? "published" : "private",
}: {
  attemptId: string;
  initial: boolean;
  initialState?: PublishState;
}) {
  const router = useRouter();
  const [state, setState] = useState<PublishState>(initialState);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 公開リクエストが出ているか (private 以外)。ボタンを押したときの向き（公開する/やめる）を決める。
  const hasPublishIntent = state !== "private";
  // 実際に他の人から見えているか。switch の aria-checked はこちらを使う
  // ("確認中"/"公開が見送られました" のときに checked=true と読み上げると矛盾するため)。
  const isLive = state === "published";

  async function toggle() {
    const publish = !hasPublishIntent;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.patch<{ publishState?: PublishState }>(
        `/api/v1/attempts/${attemptId}`,
        { isPublished: publish },
      );
      if (!publish) {
        setState("private");
        setMsg("公開をやめました");
      } else {
        const next = res?.publishState ?? "reviewing";
        setState(next);
        setMsg(
          next === "published"
            ? "公開しました"
            : next === "rejected"
              ? "この内容は公開が見送られました"
              : "内容を確認しています。確認できるまでお待ちください",
        );
      }
      router.refresh();
    } catch (e) {
      setMsg(e instanceof ClientApiError ? e.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const label =
    // 公開中は短く「公開中」（最終UI改善指示 §3）。表示だけの変更で、状態の判定は従来どおり。
    state === "published"
      ? "公開中"
      : state === "reviewing"
        ? "確認中"
        : state === "rejected"
          ? "公開が見送られました"
          : "自分だけに表示";

  const tone =
    state === "published"
      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      : state === "reviewing"
        ? "border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]"
        : state === "rejected"
          ? "border-[var(--color-danger)] bg-[var(--color-surface)] text-[var(--color-danger)]"
          : "border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isLive}
        onClick={toggle}
        disabled={busy}
        className={`tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${tone}`}
      >
        {isLive ? (
          <IconGlobe aria-hidden="true" className="h-4 w-4 shrink-0" />
        ) : (
          <IconLock aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {label}
      </button>
      {state === "reviewing" && (
        <span className="text-xs text-[var(--color-ink-muted)]">
          運営が内容を確認しています
        </span>
      )}
      <span role="status" aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
        {msg}
      </span>
    </span>
  );
}

/* 試したこと 1 件の削除（「試したこと」の削除確認UI改善）。
   ブラウザ標準の confirm() ではなく、そのカードから開く確認ダイアログ（<dialog> のモーダル）で、
   対象名「試したこと」と実際の文章を見せてから消す。道の削除（DeleteRoadButton）とは文言・見た目を分け、
   「この道を…」とは書かない。API は既存の DELETE /api/v1/attempts/{id} をそのまま使う。
   削除後は同じページのまま一覧を更新し（router.refresh）、ページ側の ToastRegion に短い通知を出す
   （カード自体は消えるので、通知はカードの外に置く）。 */
export function DeleteAttemptButton({ attemptId, method }: { attemptId: string; method: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 中身は開いている間だけ描く（閉じている間に対象の文章が DOM に二重に残らないように）。
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || !opened) return;
    // showModal が無い環境（古いブラウザ・テスト環境）では open 属性で表示する
    if (typeof d.showModal === "function") {
      if (!d.open) d.showModal();
    } else d.setAttribute("open", "");
  }, [opened]);

  function open() {
    setError(null);
    setOpened(true);
  }
  function close() {
    const d = dialogRef.current;
    if (d?.open && typeof d.close === "function") d.close();
    else d?.removeAttribute("open");
    setOpened(false);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/v1/attempts/${attemptId}`);
      close();
      showToast("試したことを削除しました。");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ClientApiError
          ? e.message
          : "削除できませんでした。時間をおいて、もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 通常時は控えめな文字リンク（「記録する」「保存する」より目立たせない） */}
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="tap-target inline-flex items-center text-sm text-[var(--color-danger)] underline"
      >
        削除
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        // 背景（ダイアログの外側）を押したら閉じる。削除中は閉じない。
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) close();
        }}
        onCancel={(e) => {
          e.preventDefault(); // Esc は close() に寄せて状態をそろえる
          if (!busy) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-card)] backdrop:bg-black/40"
      >
        {opened && (
          <div className="space-y-4 p-5">
            <h2 id={titleId} className="flex items-center gap-2 text-base font-bold">
              <IconTrash
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-[var(--color-danger)]"
              />
              この試したことを削除しますか？
            </h2>
            <div id={descId} className="space-y-3 text-sm">
              <p>
                削除すると、この試したことの記録が削除されます。
                <br />
                <strong>この操作は元に戻せません。</strong>
              </p>
              <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-3">
                <p className="text-xs font-bold text-[var(--color-ink-muted)]">試したこと</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words">{method}</p>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              {/* 初期フォーカスは安全な「キャンセル」 */}
              <Button variant="secondary" onClick={close} disabled={busy} autoFocus>
                キャンセル
              </Button>
              <Button variant="danger" onClick={remove} disabled={busy}>
                {busy ? "削除中…" : "削除する"}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/* ページ内の短い通知。showToast() で出し、数秒で消える（読み上げは role=status）。
   削除のように、通知を出した部品自体が画面から消える操作のためにページ側へ置く。 */
const TOAST_EVENT = "dekiru:toast";
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}
export function ToastRegion() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 4000);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => {
      window.removeEventListener(TOAST_EVENT, on);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {msg && (
        <p className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-primary-ink)] shadow-[var(--shadow-card)]">
          <IconCheckCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {msg}
        </p>
      )}
    </div>
  );
}

/* 道の削除（「自分の道」詳細 最終改善指示 §8）。
   ボタンを押しただけでは消さず、確認パネルで「消えるもの」と「取り消せないこと」を示す
   （アカウント削除 DeleteAccount と同じ形）。API 側で試したことは cascade で消える。 */
export function DeleteRoadButton({
  roadId,
  attemptCount,
}: {
  roadId: string;
  attemptCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/v1/roads/${roadId}`);
      router.push("/me");
      router.refresh();
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ClientApiError
          ? e.message
          : "削除できませんでした。時間をおいて、もう一度お試しください。",
      );
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)]"
      >
        <IconTrash aria-hidden="true" className="h-4 w-4 shrink-0" />
        この道を削除
      </button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="delete-road-title"
      aria-describedby="delete-road-desc"
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4"
    >
      <p id="delete-road-title" className="flex items-center gap-2 font-bold">
        <IconTrash aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-danger)]" />
        この道を削除しますか？
      </p>
      <div id="delete-road-desc" className="space-y-1 text-sm">
        <p>
          {attemptCount > 0
            ? `この道と、この道に記録されている試したこと（${attemptCount} 件）が削除されます。公開中の経験も見られなくなります。`
            : "この道が削除されます。"}
        </p>
        <p className="font-bold">この操作は取り消せません。</p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
          キャンセル
        </Button>
        <Button variant="danger" onClick={remove} disabled={busy}>
          {busy ? "削除中…" : "この道を削除"}
        </Button>
      </div>
    </div>
  );
}
