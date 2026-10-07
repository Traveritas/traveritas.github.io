// Variants of the selected third-round eclipse. Each changes the ring's
// structure rather than relying on small hue differences at favicon size.
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>${defs}</defs>${body}</svg>`;

export const eclipseVariants = [
  {
    id: 'B1',
    name: '细银环',
    style: '细环 / 边缘清晰',
    group: 'eclipse',
    description: '收窄原稿的散光，用清晰的细银环围住暗心。',
    svg: svg(`
      <radialGradient id="eclipse-B1-dark" cx="16" cy="16" r="16" gradientUnits="userSpaceOnUse">
        <stop stop-color="#24212B"/>
        <stop offset=".57" stop-color="#24212B"/>
        <stop offset=".68" stop-color="#3F354B"/>
        <stop offset=".79" stop-color="#2D2636"/>
        <stop offset="1" stop-color="#24212B"/>
      </radialGradient>
    `, `
      <rect width="32" height="32" rx="3" fill="url(#eclipse-B1-dark)"/>
      <circle cx="16" cy="16" r="10.8" fill="none" stroke="#EFE5F5" stroke-width="1.8"/>
    `),
  },
  {
    id: 'B2',
    name: '雾紫散光',
    style: '宽环 / 柔和散光',
    group: 'eclipse',
    description: '扩大银环内外的雾紫光层，让亮部更宽、更柔和。',
    svg: svg(`
      <radialGradient id="eclipse-B2-haze" cx="16" cy="16" r="16" gradientUnits="userSpaceOnUse">
        <stop stop-color="#24212B"/>
        <stop offset=".33" stop-color="#24212B"/>
        <stop offset=".42" stop-color="#4A395D"/>
        <stop offset=".53" stop-color="#A187BF"/>
        <stop offset=".63" stop-color="#E8DCEF"/>
        <stop offset=".7" stop-color="#D8C2E9"/>
        <stop offset=".82" stop-color="#9C80B8"/>
        <stop offset=".94" stop-color="#514160"/>
        <stop offset="1" stop-color="#24212B"/>
      </radialGradient>
    `, `<rect width="32" height="32" rx="3" fill="url(#eclipse-B2-haze)"/>`),
  },
  {
    id: 'B3',
    name: '双重银环',
    style: '双环 / 拉开间距',
    group: 'eclipse',
    description: '缩小主环并增加一圈较暗的外环，两环之间保留深色间隔。',
    svg: svg(`
      <radialGradient id="eclipse-B3-space" cx="16" cy="16" r="16" gradientUnits="userSpaceOnUse">
        <stop stop-color="#24212B"/>
        <stop offset=".43" stop-color="#24212B"/>
        <stop offset=".53" stop-color="#544360"/>
        <stop offset=".66" stop-color="#2C2533"/>
        <stop offset=".81" stop-color="#31283B"/>
        <stop offset="1" stop-color="#24212B"/>
      </radialGradient>
    `, `
      <rect width="32" height="32" rx="3" fill="url(#eclipse-B3-space)"/>
      <circle cx="16" cy="16" r="13.2" fill="none" stroke="#9B86AE" stroke-width="1.5"/>
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#F0E6F5" stroke-width="2"/>
    `),
  },
  {
    id: 'B4',
    name: '独立光环',
    style: '透明底 / 完整暗心',
    group: 'eclipse',
    description: '移除方形深底，留下带深色外缘的独立暗心光环。',
    svg: svg(`
      <radialGradient id="eclipse-B4-free" cx="16" cy="16" r="14.5" gradientUnits="userSpaceOnUse">
        <stop stop-color="#24212B"/>
        <stop offset=".55" stop-color="#24212B"/>
        <stop offset=".61" stop-color="#51475D"/>
        <stop offset=".69" stop-color="#D7C7E7"/>
        <stop offset=".75" stop-color="#F5EDF8"/>
        <stop offset=".83" stop-color="#AD96C4"/>
        <stop offset=".92" stop-color="#61516F"/>
        <stop offset="1" stop-color="#40374A"/>
      </radialGradient>
    `, `<circle cx="16" cy="16" r="14.5" fill="url(#eclipse-B4-free)"/>`),
  },
];
