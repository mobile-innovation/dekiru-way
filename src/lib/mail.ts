import { env } from "@/lib/env";

/**
 * 管理者向け通知メールの送信 (Resend REST API)。
 *
 * 方針:
 *   - VPS 自体をメールサーバーにしない。外部サービス (Resend) の HTTP API を叩くだけ。
 *   - SDK は追加しない (`fetch` で十分・VPS の npm ci 事故を増やさない)。
 *   - 送信は必ずサーバー側 (このモジュールはクライアントから import されない)。
 *   - 失敗しても例外は投げない。呼び出し側 (登録処理) を絶対に巻き込まないため、
 *     成否は戻り値で返すだけにする。
 */

export interface SendMailResult {
  ok: boolean;
  /** 失敗理由 (ログ用。本文・宛先などの個人情報は含めない)。 */
  error?: string;
}

export interface SendMailInput {
  subject: string;
  text: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendAdminMail(input: SendMailInput): Promise<SendMailResult> {
  if (!env.mail.configured) {
    return { ok: false, error: "not_configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.mail.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.mail.fromAddress,
        to: [env.mail.adminEmail],
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!res.ok) {
      // レスポンス本文にエラー詳細が入るが、宛先・本文は含まれないので記録してよい。
      const body = await res.text().catch(() => "");
      return { ok: false, error: `resend_http_${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}
