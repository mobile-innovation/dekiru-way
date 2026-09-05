import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { roadDetail } from "@/lib/admin/queries";
import {
  StatusBadge,
  VerdictBadge,
  CATEGORY_LABEL,
  RESULT_LABEL,
  ACTION_LABEL,
} from "@/components/admin/post-card";
import { ModerationDecisionButtons, PostAdminControls } from "@/components/admin/admin-actions";

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

export default async function AdminRoadDetailPage({
  params,
}: {
  params: Promise<{ roadId: string }>;
}) {
  await requireAdmin();
  const { roadId } = await params;
  const data = await roadDetail(roadId);
  if (!data) notFound();
  const { road, audit } = data;

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/admin/roads" className="underline">
          ← 道の審査
        </Link>
      </p>

      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">道の詳細</h1>
        <StatusBadge status={road.moderationStatus} />
        <VerdictBadge verdict={road.aiVerdict} />
      </header>

      {/* 操作 */}
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-bold">操作</h2>
        {road.moderationStatus === "pending" && (
          <ModerationDecisionButtons id={road.id} target="road" />
        )}
        <PostAdminControls id={road.id} target="road" moderationStatus={road.moderationStatus} />
        {road.moderatedAt && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            最終手動判断: {road.moderatedAt.toISOString().slice(0, 16).replace("T", " ")}
            {road.moderatedByAdmin
              ? ` / ${road.moderatedByAdmin.displayName ?? road.moderatedByAdmin.email}`
              : ""}
          </p>
        )}
        {road.moderationNote && <p className="text-xs">運営メモ: {road.moderationNote}</p>}
        <p className="text-xs text-[var(--color-ink-muted)]">
          却下・確認待ちの間は、この道で「経験として公開」された記録も公開検索に出ません。
        </p>
      </section>

      {/* AI 判定 */}
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-bold">AI 判定</h2>
        {road.aiCheckedAt ? (
          <>
            <p className="text-sm">
              <VerdictBadge verdict={road.aiVerdict} />{" "}
              <span className="text-xs text-[var(--color-ink-muted)]">
                {road.aiCheckedAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </p>
            {road.aiReason && <p className="text-sm">{road.aiReason}</p>}
            {road.aiCategories.length > 0 && (
              <ul className="flex flex-wrap gap-1">
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
          </>
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">まだ AI チェックされていません。</p>
        )}
      </section>

      {/* 道の内容 */}
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-bold">道の内容</h2>
        <dl className="space-y-3">
          <Field label="タイトル" value={road.title} />
          <Field label="以前できていたこと" value={road.previouslyAble} />
          <Field label="できなくなったこと" value={road.difficulty} />
          <Field label="やりたいこと" value={road.goal} />
          <Field label="困っている場面" value={road.situation} />
          <Field label="いまの進捗" value={road.progress} />
          <Field label="次に試すこと" value={road.nextAction} />
          <Field label="状態" value={road.status} />
          <Field label="メモ" value={road.memo} />
        </dl>
        {road.roadTags.length > 0 && (
          <ul className="flex flex-wrap gap-1 text-xs">
            {road.roadTags.map((rt) => (
              <li
                key={rt.tag.id}
                className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5"
              >
                #{rt.tag.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* この道の試したこと */}
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-bold">この道の試したこと（{road.attempts.length}）</h2>
        {road.attempts.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">まだありません。</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {road.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {RESULT_LABEL[a.result] ?? a.result}
                </span>
                <span className="line-clamp-1">{a.method}</span>
                {a.isPublished && <StatusBadge status={a.moderationStatus} />}
                <Link href={`/admin/posts/${a.id}`} className="ml-auto text-xs underline">
                  経験の詳細 →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 操作ログ */}
      <section className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-bold">この道の操作ログ</h2>
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
