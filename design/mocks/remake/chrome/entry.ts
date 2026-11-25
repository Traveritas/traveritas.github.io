/* 原站的工具栏（星 + 同心轨道）、Ave（框 + 框后的晶体星）、声音，照原样打包进原型。
   build-chrome.mjs 用 esbuild 打成 chrome.js；reality 换成 reality-shim.ts。 */
import { initSound } from '../../../../src/scripts/sound';
import { initToolstar } from '../../../../src/scripts/toolstar';
import { initAve, aveEnterRoute } from '../../../../src/scripts/ave';
import { setFace, setMix, setFlipper } from './reality-shim';

export { setFace, setMix, setFlipper, aveEnterRoute };

export function initChrome() {
  initSound();
  initToolstar();
  initAve();
}
