import { extraRound3 } from './extra-round3.mjs';

const svg = (defs, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" ${extra}><defs>${defs}</defs>${body}</svg>`;

export const candidates = [
  {
    id: '01', name: '书页上的 T', style: '衬线字标',
    description: '宽衬线、细曲线，用 Traveritas 的首字母形成印记。',
    svg: svg('', `
      <rect width="32" height="32" rx="3" fill="#EDE6EF"/>
      <path d="M5 5H27L27.5 12H25.8C25.2 8.8 23.7 7.4 19 7.4H18.5V23C18.5 26 19.5 26.2 23 26.5V28H9V26.5C12.5 26.2 13.5 26 13.5 23V7.4H13C8.3 7.4 6.8 8.8 6.2 12H4.5Z" fill="#4B375D"/>
    `),
  },
  {
    id: '02', name: '像素微芒', style: '像素图形',
    description: '用整像素阶梯构成对称微芒，银白中心保持清晰。',
    svg: svg('', `
      <path d="M14 2H18V8H20V12H24V14H30V18H24V20H20V24H18V30H14V24H12V20H8V18H2V14H8V12H12V8H14Z" fill="#79618E"/>
      <path d="M14 8H18V12H22V14H24V18H20V20H18V24H14V20H10V18H8V14H12V12H14Z" fill="#C5B1D9"/>
      <path d="M14 10H18V14H22V18H18V22H14V18H10V14H14Z" fill="#F2EDF6"/>
      <path d="M14 14H18V18H14Z" fill="#D0E4DC"/>
    `, 'shape-rendering="crispEdges"'),
  },
  {
    id: '03', name: '弯曲光栅', style: '光学艺术',
    description: '几道弧线穿过圆面，靠黑白节奏呈现弯曲感。',
    svg: svg('<clipPath id="r3-03-clip"><circle cx="16" cy="16" r="15"/></clipPath>', `
      <circle cx="16" cy="16" r="15" fill="#5A5264"/>
      <g clip-path="url(#r3-03-clip)" fill="none" stroke="#F3EDF5" stroke-width="3">
        ${[-8,-1,6,13,20,27].map(y=>`<path d="M-2 ${y}Q16 ${y+15} 34 ${y}"/>`).join('')}
      </g>
    `),
  },
  {
    id: '04', name: '银蚀', style: '暗室光影',
    description: '深底中的一圈银白光，边缘轻微散开。',
    svg: svg(`
      <radialGradient id="r3-04-eclipse" cx=".5" cy=".5" r=".58">
        <stop stop-color="#24212B"/><stop offset=".46" stop-color="#24212B"/>
        <stop offset=".49" stop-color="#5D526F"/><stop offset=".55" stop-color="#E8DDEF"/>
        <stop offset=".60" stop-color="#F5F0F7"/><stop offset=".66" stop-color="#9886B4"/>
        <stop offset=".83" stop-color="#3F374F"/><stop offset="1" stop-color="#24212B"/>
      </radialGradient>
    `, `<rect width="32" height="32" rx="3" fill="url(#r3-04-eclipse)"/>`),
  },
  {
    id: '05', name: '四色之间', style: '色面构成',
    description: '四块清晰色面围住银白方形，形成稳定的方格秩序。',
    svg: svg('', `
      <rect width="32" height="32" fill="#795F8D"/>
      <rect x="16" width="16" height="16" fill="#ADCBC2"/>
      <rect y="16" width="16" height="16" fill="#D9B8CE"/>
      <rect x="10" y="10" width="12" height="12" fill="#F2EDF3"/>
    `, 'shape-rendering="crispEdges"'),
  },
  {
    id: '06', name: '蝶印', style: '新艺术纹章',
    description: '上下两对弧形翅面，保留纤长且严格对称的身形。',
    svg: svg('', `
      <path id="r3-06-wing" d="M16 16C13 8 7 3 2 3C1 14 5 20 13 20C7 20 5 25 6 30C12 29 15 24 16 20Z" fill="#795872"/>
      <use href="#r3-06-wing" transform="translate(32 0) scale(-1 1)"/>
      <path id="r3-06-inlay" d="M5 7C10 9 12 12 13 17C8 15 6 12 5 7Z" fill="#E7CFDD"/>
      <use href="#r3-06-inlay" transform="translate(32 0) scale(-1 1)"/>
      <rect x="15" y="11" width="2" height="15" rx="1" fill="#795872"/>
    `),
  },
  ...extraRound3,
];
