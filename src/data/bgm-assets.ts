/* 本文件由 design/audio/normalize-bgm.mjs 生成，勿手改。
   成片在 public/audio/，文件名固定；靠版本号把 URL 区分开，换稿后浏览器才会取
   新曲子而不是缓存里的旧曲子。OPEN_SEAM 是开场母带里 intro→loop 的边界（秒），
   开场中段被换面拦下时，运行时用它从 bed 接上 loop 的当前相位。换音频重跑流水线
   即可（边界若变，改流水线里的 OPEN_SEAM_SAMPLE），记得一起提交。 */
export const BGM_VERSION = '1095c874';
export const OPEN_SEAM = 25.4545625;
