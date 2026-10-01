"use client";

import { useEffect, useRef, useState } from "react";
import { IconMic } from "@/components/icons";

/* Web Speech API は TS 標準 lib に型が無いため最小限だけ宣言する */
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: { 0: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorLike {
  error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * 音声入力ボタン (指示書 6/9)。
 * - Web Speech API を使う。未対応・失敗時は黙って無効化し、テキスト入力だけで完結できる。
 * - 音声だけに依存しない: これは補助。
 */
export function VoiceInputButton({
  onResult,
  lang = "ja-JP",
  label = "音声で入力",
}: {
  onResult: (text: string) => void;
  lang?: string;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR =
      typeof window !== "undefined"
        ? (w.SpeechRecognition ?? w.webkitSpeechRecognition)
        : undefined;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) onResult(text);
    };
    rec.onerror = (e: SpeechRecognitionErrorLike) => {
      setNote(
        e?.error === "not-allowed"
          ? "マイクの使用が許可されていません。文字で入力してください。"
          : "音声を認識できませんでした。文字で入力してください。",
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    };
  }, [lang, onResult]);

  if (!supported) return null;

  function toggle() {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      return;
    }
    setNote(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        // 色は既存の主ボタンと同じトークン（--color-primary / -hover / -ink）。新しい色は足さない。
        // 聞き取り中は hover と同じ濃い緑にして、押されている状態だと分かるようにする。
        // 文字まわりの余白は控えめ（px-3・py-1・gap-1.5）。利用者の指示で、このボタンだけタップ領域の
        // 最小 44px（--tap-min、globals.css の @layer base）を min-h-0 で外し、高さ約 28px にしている（2026-10-01）。
        className={`inline-flex min-h-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1 text-sm font-semibold text-[var(--color-primary-ink)] hover:bg-[var(--color-primary-hover)] ${
          listening ? "bg-[var(--color-primary-hover)]" : "bg-[var(--color-primary)]"
        }`}
      >
        <IconMic aria-hidden="true" className="h-4 w-4 shrink-0" />
        {listening ? "聞き取り中…（押して停止）" : label}
      </button>
      <span aria-live="polite" className="sr-only">
        {listening ? "音声入力中です" : ""}
      </span>
      {note && (
        <p role="status" className="text-sm text-[var(--color-ink-muted)]">
          {note}
        </p>
      )}
    </>
  );
}
