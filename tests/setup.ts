import "@testing-library/jest-dom/vitest";

// .env を process.env に読み込む (DATABASE_URL 等をテストでも使う)
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* .env が無い環境 (CI で個別に注入) でも続行 */
}
