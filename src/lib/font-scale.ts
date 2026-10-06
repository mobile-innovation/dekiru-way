/*
 * 文字サイズ切替（ヘッダーの「標準・大・特大」）の共通定義。
 * 実際の拡大は globals.css の html[data-font-scale] → --font-scale → html の font-size で行い、
 * 文字サイズは rem 指定のものすべてに効く（px 固定にすると拡大されないので使わない）。
 */

export type FontScale = "normal" | "large" | "xlarge";
export const FONT_SCALES: FontScale[] = ["normal", "large", "xlarge"];
export const FONT_SCALE_STORAGE_KEY = "dekiru:font-scale";

/*
 * <head> で描画前に実行するインラインスクリプト。
 * React の hydration を待ってから適用すると、ページを開くたびに（遅い端末では数秒）
 * 標準サイズで表示されてしまうため、保存値をここで先に html へ反映する。
 */
export const FONT_SCALE_INIT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(
  FONT_SCALE_STORAGE_KEY,
)});if(s==="large"||s==="xlarge")document.documentElement.setAttribute("data-font-scale",s)}catch(e){}`;
