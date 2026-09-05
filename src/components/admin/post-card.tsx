import Link from "next/link";

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

const VERDICT_LABEL: Record<string, string> = {
  ok: "問題なし",
  ng: "要確認",
  unknown: "判断できず",
};

const RESULT_LABEL: Record<string, string> = {
  success: "できるようになった",
  partial: "少しできた",
  no_change: "変化はなかった",
  failed: "うまくいかなかった",
  ongoing: "まだ試している",
};

/** 操作ログ (AdminAuditLog.action) の表示名。管理画面各所で共通利用する。 */
const ACTION_LABEL: Record<string, string> = {
  login: "ログイン",
  approve: "公開する",
  reject: "公開しない",
  unpublish: "公開を停止",
  republish: "やっぱり公開する",
  requeue: "確認待ちに戻す",
  recheck: "AI でもう一度チェック",
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "border-[var(--color-accent)] text-[var(--color-accent-strong)]"
      : status === "rejected"
        ? "border-[var(--color-danger)] text-[var(--color-danger)]"
        : "border-[var(--color-neutral)] text-[var(--color-ink-muted)]";
  return (
    <span
      className={`inline-flex rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-bold ${tone}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  const tone =
    verdict === "ok"
      ? "text-[var(--color-accent-strong)]"
      : verdict === "ng"
        ? "text-[var(--color-danger)]"
        : "text-[var(--color-ink-muted)]";
  return <span className={`text-xs font-bold ${tone}`}>AI: {VERDICT_LABEL[verdict] ?? verdict}</span>;
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
  createdAt: Date;
  road: { id: string; title: string | null; difficulty: string | null; goal: string | null };
}

export function AdminPostCard({ post }: { post: AdminPostCardData }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={post.moderationStatus} />
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

      {post.road.title && (
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">道「{post.road.title}」より</p>
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
          <dd>{RESULT_LABEL[post.result] ?? post.result}</dd>
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

export interface AdminRoadCardData {
  id: string;
  title: string | null;
  difficulty: string | null;
  goal: string | null;
  situation: string | null;
  moderationStatus: string;
  aiVerdict: string | null;
  aiReason: string | null;
  aiCategories: string[];
  createdAt: Date;
  _count: { attempts: number };
}

export function AdminRoadCard({ road }: { road: AdminRoadCardData }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={road.moderationStatus} />
        <VerdictBadge verdict={road.aiVerdict} />
        <span className="text-xs text-[var(--color-ink-muted)]">
          {road.createdAt.toISOString().slice(0, 10)} · この道で公開しようとしている経験 {road._count.attempts} 件
        </span>
        <Link href={`/admin/roads/${road.id}`} className="ml-auto text-sm font-semibold underline">
          内容を見る
        </Link>
      </div>

      <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm font-medium">
        {road.title ?? road.difficulty ?? "（無題の道）"}
      </p>
      <dl className="mt-1 space-y-1 text-xs">
        {road.difficulty && (
          <div>
            <dt className="font-bold text-[var(--color-ink-muted)]">できなくなったこと</dt>
            <dd className="line-clamp-2 whitespace-pre-wrap">{road.difficulty}</dd>
          </div>
        )}
        {road.goal && (
          <div>
            <dt className="font-bold text-[var(--color-ink-muted)]">やりたいこと</dt>
            <dd className="line-clamp-2 whitespace-pre-wrap">{road.goal}</dd>
          </div>
        )}
      </dl>

      {road.aiReason && (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] p-2 text-xs">
          {road.aiReason}
        </p>
      )}
      {road.aiCategories.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {road.aiCategories.map((c) => (
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

export { CATEGORY_LABEL, STATUS_LABEL, VERDICT_LABEL, RESULT_LABEL, ACTION_LABEL };
