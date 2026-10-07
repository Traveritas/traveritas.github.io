import { gradientCandidates } from './gradient-candidates.mjs';

const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>${defs}</defs>${body}</svg>`;

export const candidates = [
  {
    id: '01', name: '合瓣', description: '三瓣沿中轴镜像展开，整朵花共用一片渐变。',
    svg: svg(`
      <linearGradient id="r2-01" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#E4CFEB"/><stop offset=".36" stop-color="#F7EDF4"/><stop offset=".7" stop-color="#C5B0D9"/><stop offset="1" stop-color="#917EBA"/></linearGradient>
      <radialGradient id="r2-01-light" cx=".5" cy=".42" r=".58"><stop stop-color="#FFFBFB" stop-opacity=".95"/><stop offset=".8" stop-color="#F4EDF8" stop-opacity="0"/></radialGradient>
    `, `
      <path d="M16 2Q10 8 10 13Q7 9 2 9C1 20 6 28 16 30C26 28 31 20 30 9Q25 9 22 13Q22 8 16 2Z" fill="url(#r2-01)" stroke="#A28DAF" stroke-width=".6" stroke-linejoin="round"/>
      <path d="M16 2Q10 8 10 13Q7 9 2 9C1 20 6 28 16 30C26 28 31 20 30 9Q25 9 22 13Q22 8 16 2Z" fill="url(#r2-01-light)"/>
      <path d="M10 13Q10 23 16 29Q22 23 22 13" fill="none" stroke="#AB95C2" stroke-opacity=".56" stroke-width=".85"/>
    `),
  },
  {
    id: '02', name: '四瓣', description: '四向旋转对称，珠白从中心过渡到淡紫边缘。',
    svg: svg(`
      <radialGradient id="r2-02" cx=".5" cy=".5" r=".6"><stop stop-color="#FFFAFC"/><stop offset=".34" stop-color="#EEE3F1"/><stop offset=".62" stop-color="#D9C1DB"/><stop offset=".84" stop-color="#BAA4D0"/><stop offset="1" stop-color="#A18ABD"/></radialGradient>
    `, `
      <path d="M16 2C22 2 23 7 21 11C25 9 30 10 30 16C30 22 25 23 21 21C23 25 22 30 16 30C10 30 9 25 11 21C7 23 2 22 2 16C2 10 7 9 11 11C9 7 10 2 16 2Z" fill="url(#r2-02)" stroke="#AA97B8" stroke-width=".55"/>
    `),
  },
  {
    id: '03', name: '六棱', description: '规则六边形承载整片色光，内部不分割切面。',
    svg: svg(`
      <linearGradient id="r2-03" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#AD96CC"/><stop offset=".27" stop-color="#EAD5E8"/><stop offset=".5" stop-color="#F5EEF6"/><stop offset=".73" stop-color="#D7CEE9"/><stop offset="1" stop-color="#9D8AC6"/></linearGradient>
      <radialGradient id="r2-03-light" cx=".5" cy=".46" r=".52"><stop stop-color="#FFFAF9" stop-opacity=".9"/><stop offset="1" stop-color="#FFFAF9" stop-opacity="0"/></radialGradient>
    `, `
      <path d="M16 1L28.9904 8.5V23.5L16 31L3.0096 23.5V8.5Z" fill="url(#r2-03)" stroke="#A997BB" stroke-width=".55" stroke-linejoin="round"/>
      <path d="M16 1L28.9904 8.5V23.5L16 31L3.0096 23.5V8.5Z" fill="url(#r2-03-light)"/>
    `),
  },
  {
    id: '04', name: '菱孔', description: '内外两个同心菱形，让规则的留白成为标记。',
    svg: svg(`
      <linearGradient id="r2-04" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#B99ED0"/><stop offset=".36" stop-color="#E6D4EB"/><stop offset=".5" stop-color="#F9F0F6"/><stop offset=".68" stop-color="#C1ADD9"/><stop offset="1" stop-color="#8971AF"/></linearGradient>
    `, `
      <path d="M16 1L31 16L16 31L1 16ZM16 10L10 16L16 22L22 16Z" fill="url(#r2-04)" fill-rule="evenodd" stroke="#A08AB5" stroke-width=".5" stroke-linejoin="round"/>
    `),
  },
  {
    id: '05', name: '圆光', description: '完整圆形，珍珠般的白光与粉紫在内部相融。',
    svg: svg(`
      <radialGradient id="r2-05" cx=".5" cy=".3" r=".72"><stop stop-color="#FDF9FC"/><stop offset=".22" stop-color="#F0DEEB"/><stop offset=".5" stop-color="#D6C3E5"/><stop offset=".76" stop-color="#B3A0D1"/><stop offset="1" stop-color="#8C7AB6"/></radialGradient>
      <radialGradient id="r2-05-mist" cx=".5" cy=".88" r=".48"><stop stop-color="#CDE4DF" stop-opacity=".68"/><stop offset="1" stop-color="#CDE4DF" stop-opacity="0"/></radialGradient>
    `, `
      <circle cx="16" cy="16" r="15" fill="url(#r2-05)"/>
      <circle cx="16" cy="16" r="15" fill="url(#r2-05-mist)"/>
    `),
  },
  ...gradientCandidates,
];
