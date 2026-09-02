import { describe, it, expect } from "vitest";
import { detectImageType } from "@/lib/storage";

const bytes = (arr: number[]) => new Uint8Array(arr);

describe("detectImageType (マジックバイト検証)", () => {
  it("JPEG を判定する", () => {
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({
      type: "image/jpeg",
      ext: "jpg",
    });
  });

  it("PNG を判定する", () => {
    expect(
      detectImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toEqual({ type: "image/png", ext: "png" });
  });

  it("GIF を判定する", () => {
    expect(detectImageType(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toEqual({
      type: "image/gif",
      ext: "gif",
    });
  });

  it("WebP を判定する", () => {
    const b = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(b)).toEqual({ type: "image/webp", ext: "webp" });
  });

  it("テキストや実行ファイルは弾く", () => {
    expect(detectImageType(bytes([0x68, 0x65, 0x6c, 0x6c, 0x6f]))).toBeNull(); // "hello"
    expect(detectImageType(bytes([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // PE header
  });
});
