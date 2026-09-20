import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function setMailEnv() {
  process.env.MAIL_PROVIDER_API_KEY = "test-key";
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
  process.env.MAIL_FROM_ADDRESS = "noreply@example.com";
}

function clearMailEnv() {
  delete process.env.MAIL_PROVIDER_API_KEY;
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  delete process.env.MAIL_FROM_ADDRESS;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("sendAdminMail", () => {
  it("環境変数が揃っていないと送信せず not_configured を返す", async () => {
    clearMailEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendAdminMail } = await import("@/lib/mail");

    const result = await sendAdminMail({ subject: "件名", text: "本文" });

    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Resend API に from/to/subject/text を渡し、成功なら ok:true", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { sendAdminMail } = await import("@/lib/mail");

    const result = await sendAdminMail({ subject: "【できる道】新しい登録があります", text: "本文" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      from: "noreply@example.com",
      to: ["admin@example.com"],
      subject: "【できる道】新しい登録があります",
      text: "本文",
    });
  });

  it("API キーをリクエストヘッダ以外 (URL 等) に出さない", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { sendAdminMail } = await import("@/lib/mail");

    await sendAdminMail({ subject: "s", text: "t" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect(JSON.stringify(init.body)).not.toContain("test-key");
  });

  it("HTTP エラー応答は ok:false とステータス・本文を含むエラーを返す (例外を投げない)", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "invalid from address",
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { sendAdminMail } = await import("@/lib/mail");

    const result = await sendAdminMail({ subject: "s", text: "t" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("422");
    expect(result.error).toContain("invalid from address");
  });

  it("ネットワークエラーでも例外を投げず ok:false を返す", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const { sendAdminMail } = await import("@/lib/mail");

    const result = await sendAdminMail({ subject: "s", text: "t" });

    expect(result).toEqual({ ok: false, error: "network down" });
  });
});
