import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { postDetail } from "@/lib/admin/queries";
import {
  StatusBadge,
  VerdictBadge,
  CATEGORY_LABEL,
  ACTION_LABEL,
} from "@/components/admin/post-card";
import { ResultBadge } from "@/components/ui";
import {
  ModerationDecisionButtons,
  PostAdminControls,
} from "@/components/admin/admin-actions";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-bold text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}

export default async function AdminPostDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireAdmin();
  const { attemptId } = await params;
  const data = await postDetail(attemptId);
  if (!data) notFound();
  const { attempt, audit } = data;

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/admin/moderation" className="underline">
          ← 経験を確認
        </Link>
      </p>

      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">経験の詳細</h1>
        <StatusBadge status={attempt.moderationStatus} />
        <VerdictBadge verdict={attempt.aiVerdict} />
      </header>

      {/* 操作 */}
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-bold">操作</h2>
        {attempt.moderationStatus === "pending" && (
          <ModerationDecisionButtons id={attempt.id} />
        )}
        <PostAdminControls id={attempt.id} moderationStatus={attempt.moderationStatus} />
        {attempt.moderatedAt && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            最終手動判断: {attempt.moderatedAt.toISOString().slice(0, 16).replace("T", " ")}
            {attempt.moderatedByAdmin
              ? ` / ${attempt.moderatedByAdmin.displayName ?? attempt.moderatedByAdmin.email}`
              : ""}
          </p>
        )}
        {attempt.moderationNote && (
          <p className="text-xs">運営メモ: {attempt.moderationNote}</p>
        )}
      </section>

      {/* AI 判定 */}
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-bold">AI 判定</h2>
        {attempt.aiCheckedAt ? (
          <>
            <p className="text-sm">
              <VerdictBadge verdict={attempt.aiVerdict} />{" "}
              <span className="text-xs text-[var(--color-ink-muted)]">
                {attempt.aiCheckedAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </p>
            {attempt.aiReason && <p className="text-sm">{attempt.aiReason}</p>}
            {attempt.aiCategories.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {attempt.aiCategories.map((c) => (
                  <li
                    key={c}
                    className="rounded-[var(--radius-pill)] border border-[var(--color-danger)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-danger)]"
                  >
                    {CATEGORY_LABEL[c] ?? c}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">まだ AI チェックされていません。</p>
        )}
      </section>

      {/* 経験の内容 */}
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-bold">経験の内容</h2>
        <dl className="space-y-3">
          <Field label="試したこと" value={attempt.method} />
          <div>
            <dt className="text-xs font-bold text-[var(--color-ink-muted)]">結果</dt>
            <dd>
              <ResultBadge result={attempt.result} />
            </dd>
          </div>
          <Field label="気づき" value={attempt.memo} />
          <Field label="そのときの気持ち" value={attempt.feeling} />
          <Field label="その後の状態" value={attempt.stateAfter} />
          <Field label="次に試すこと" value={attempt.nextAction} />
        </dl>
      </section>

      {/* 道の文脈 */}
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-bold">道の文脈</h2>
        <dl className="space-y-3">
          <Field label="以前できていたこと" value={attempt.road.previouslyAble} />
          <Field label="できなくなったこと" value={attempt.road.difficulty} />
          <Field label="やりたいこと" value={attempt.road.goal} />
          <Field label="困っている場面" value={attempt.road.situation} />
        </dl>
        {attempt.road.roadTags.length > 0 && (
          <ul className="flex flex-wrap gap-1 text-xs">
            {attempt.road.roadTags.map((rt) => (
              <li key={rt.tag.id} className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5">
                #{rt.tag.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 操作ログ */}
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-bold">この経験の操作ログ</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">まだありません。</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {audit.map((a) => (
              <li key={a.id}>
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                <span className="font-bold">{ACTION_LABEL[a.action] ?? a.action}</span> ·{" "}
                {a.admin.displayName ?? a.admin.email}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
