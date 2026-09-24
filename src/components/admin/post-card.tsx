import Link from "next/link";
import { ResultBadge } from "@/components/ui";
import { AdminBadge, type AdminTone } from "@/components/admin/admin-ui";

const CATEGORY_LABEL: Record<string, string> = {
  personal_info: "個人情報",
  medical_assertion: "医療的断定",
  defamation: "誹謗中傷",
  spam: "宣伝・スパム",
  inappropriate: "不適切表現",
  other: "その他",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "確認待ち",
  approved: "公開中",
  rejected: "公開停止",
};

/** moderationStatus → 意味ベースの色調。公開しない/停止はエラーではないため neutral (指示書 §8)。 */
const STATUS_TONE: Record<string, AdminTone> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
};

const VERDICT_LABEL: Record<string, string> = {
  ok: "問題なし",
  ng: "要確認",
  unknown: "判断できず",
};

/** AI 判定 → 意味ベースの色調。「不明」はシステムエラーと誤認しないよう neutral（指示書 §9）。 */
const VERDICT_TONE: Record<string, AdminTone> = {
  ok: "success",
  ng: "danger",
  unknown: "neutral",
};

/** 操作ログ (AdminAuditLog.action) の表示名。管理画面各所で共通利用する。 */
const ACTION_LABEL: Record<string, string> = {
  login: "ログイン",
  approve: "公開する",
  reject: "公開しない",
  hold: "保留する",
  unhold: "保留を解除",
  unpublish: "公開を停止",
  republish: "やっぱり公開する",
  requeue: "確認待ちに戻す",
  recheck: "AI でもう一度チェック",
  seed_create: "仮データを保存",
  seed_edit: "仮データを編集",
  seed_publish: "仮データを公開",
  seed_unpublish: "仮データを非公開に",
  seed_delete: "仮データを削除",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</AdminBadge>
  );
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  return (
    <AdminBadge tone={VERDICT_TONE[verdict] ?? "neutral"}>
      AI: {VERDICT_LABEL[verdict] ?? verdict}
    </AdminBadge>
  );
}

export interface AdminPostCardData {
  id: string;
  method: string;
  memo: string | null;
  result: string;
  moderationStatus: string;
  aiVerdict: string | null;
  aiReason: string | null;
  aiCategories: string[];
  aiCheckedAt: Date | null;
  moderationNote: string | null;
  moderationHeld: boolean;
  createdAt: Date;
  road: { id: string; difficulty: string | null; goal: string | null };
}

export function AdminPostCard({ post }: { post: AdminPostCardData }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={post.moderationStatus} />
        {post.moderationHeld && (
          <AdminBadge tone="warning" icon={null}>
            保留中
          </AdminBadge>
        )}
        <VerdictBadge verdict={post.aiVerdict} />
        <span className="text-xs text-[var(--color-ink-muted)]">
          {post.createdAt.toISOString().slice(0, 10)}
        </span>
        <Link
          href={`/admin/posts/${post.id}`}
          className="ml-auto text-sm font-semibold underline"
        >
          内容を見る
        </Link>
      </div>

      {post.moderationNote && (
        <p className="mt-2 inline-block rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--color-ink-muted)]">
          {post.moderationNote}
        </p>
      )}

      {/* 困ったこと → 試したこと → 結果 の順で読める */}
      <dl className="mt-2 space-y-1.5 text-sm">
        {post.road.difficulty && (
          <div>
            <dt className="text-xs font-bold text-[var(--color-ink-muted)]">困ったこと</dt>
            <dd className="line-clamp-2 whitespace-pre-wrap">{post.road.difficulty}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-bold text-[var(--color-ink-muted)]">試したこと</dt>
          <dd className="line-clamp-3 whitespace-pre-wrap font-medium">{post.method}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[var(--color-ink-muted)]">結果</dt>
          <dd>
            <ResultBadge result={post.result} size="sm" />
          </dd>
        </div>
        {post.memo && (
          <div>
            <dt className="text-xs font-bold text-[var(--color-ink-muted)]">気づき</dt>
            <dd className="line-clamp-2 whitespace-pre-wrap text-[var(--color-ink-muted)]">
              {post.memo}
            </dd>
          </div>
        )}
      </dl>

      {post.aiReason && (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] p-2 text-xs">
          AI の見立て: {post.aiReason}
        </p>
      )}
      {post.aiCategories.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {post.aiCategories.map((c) => (
            <li
              key={c}
              className="rounded-[var(--radius-pill)] border border-[var(--color-danger)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-danger)]"
            >
              {CATEGORY_LABEL[c] ?? c}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export { CATEGORY_LABEL, STATUS_LABEL, VERDICT_LABEL, ACTION_LABEL };
