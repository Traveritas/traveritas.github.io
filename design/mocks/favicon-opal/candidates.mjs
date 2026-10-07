import { extraCandidates } from './extra-candidates.mjs';

const svg = (id, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>
  <linearGradient id="p${id}" x1=".14" y1="0" x2=".82" y2="1"><stop stop-color="#F3EFF5"/><stop offset=".42" stop-color="#DFC5D4"/><stop offset="1" stop-color="#A597C5"/></linearGradient>
  <linearGradient id="v${id}" x1=".9" y1="0" x2=".2" y2="1"><stop stop-color="#EAE3F1"/><stop offset=".5" stop-color="#C5B6D9"/><stop offset="1" stop-color="#8C7CAD"/></linearGradient>
  <linearGradient id="w${id}" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#FAF7FA"/><stop offset=".5" stop-color="#DED5EA"/><stop offset="1" stop-color="#AE9BC8"/></linearGradient>
</defs>${body}</svg>`;

export const candidates = [
  {
    id: '01', name: '初绽', description: '三片晶瓣向上打开，长短与开角各不相同。',
    svg: svg('01', `
      <path d="M16.5 28C7 26 2.8 19 2 9C10 8.8 16.8 14 18.5 23Z" fill="url(#p01)" stroke="#95839E" stroke-width=".7"/>
      <path d="M15 28C14 18 19 9 29.5 5C30 18.5 24 27 15 28Z" fill="url(#v01)" stroke="#95839E" stroke-width=".7"/>
      <path d="M16.5 25C10.1 18.3 10.1 9.7 15.5 2C21.8 10.2 23.2 18.5 16.5 25Z" fill="url(#w01)" stroke="#95839E" stroke-width=".7"/>
      <path d="M15.5 2C14.7 12.2 15.3 18.8 16.5 25C10.1 18.3 10.1 9.7 15.5 2Z" fill="#FBF8FA" fill-opacity=".61"/>
      <path d="M3 10C9.5 15 12.3 20 16.5 27C9.5 24 5 18 3 10Z" fill="#D6BAD4" fill-opacity=".7"/>
    `),
  },
  {
    id: '02', name: '折光瓣', description: '一片饱满花瓣微微卷起，折面偏离中心。',
    svg: svg('02', `
      <path d="M27.5 2.8C29.8 12.5 28.8 23.8 19.5 28C10 32.3 1.6 26 3 17.8C4.5 9.4 16 5.3 27.5 2.8Z" fill="url(#p02)" stroke="#93819D" stroke-width=".8"/>
      <path d="M27.5 2.8C20.7 12.2 11 20 11.2 27.8C18.8 32 27 25 28.4 16.8Z" fill="url(#v02)"/>
      <path d="M27.5 2.8C20.7 12.2 11 20 11.2 27.8C7.8 20.5 16.5 10.6 27.5 2.8Z" fill="#F6F0F6"/>
      <path d="M4.4 16.2C6.6 10.7 14.1 7.7 20.8 6.3C11.9 10.7 8.2 15.9 7.8 21.1Z" fill="#F5EDF1" fill-opacity=".62"/>
    `),
  },
  {
    id: '03', name: '悬晶', description: '宽阔晶面上下分离，留住一瞬悬停。',
    svg: svg('03', `
      <path d="M15.5 2L29 17.5L3 17.5Z" fill="url(#w03)" stroke="#93829F" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M15.5 2L16.5 17.5H29Z" fill="url(#p03)"/>
      <path d="M3 17.5L15.5 11.4L16.5 17.5Z" fill="#C5B6D9"/>
      <path d="M4 21.5H28L16.5 30Z" fill="url(#v03)" stroke="#93829F" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M4 21.5H16.5V30Z" fill="#E7D6E6"/>
    `),
  },
  {
    id: '04', name: '回旋花', description: '三片宽瓣顺着同一方向旋开，中心保持连贯。',
    svg: svg('04', `
      <path d="M16 17C6 16 4.3 8.6 10 3.7C16.2-1.5 24 3.8 22.3 10.3C21.5 13.4 18.6 15.1 16 17Z" fill="url(#p04)" stroke="#9483A0" stroke-width=".7"/>
      <path d="M16 17C6 16 4.3 8.6 10 3.7C16.2-1.5 24 3.8 22.3 10.3C21.5 13.4 18.6 15.1 16 17Z" transform="rotate(120 16 16)" fill="url(#v04)" stroke="#9483A0" stroke-width=".7"/>
      <path d="M16 17C6 16 4.3 8.6 10 3.7C16.2-1.5 24 3.8 22.3 10.3C21.5 13.4 18.6 15.1 16 17Z" transform="rotate(240 16 16)" fill="url(#w04)" stroke="#9483A0" stroke-width=".7"/>
      <path d="M10 3.7C12 10 14.2 13.2 16 16C12 15.3 8.6 11.7 10 3.7Z" fill="#F6F1F7" fill-opacity=".75"/>
    `),
  },
  {
    id: '05', name: '重影', description: '两枚偏斜晶面错开，交叠处沉入更深的紫。',
    svg: svg('05', `
      <path d="M12.8 2L24 12.4L16.3 27L2 17Z" fill="url(#p05)" stroke="#9A86A4" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M20 4L30 16L20 30L9 17Z" fill="url(#v05)" stroke="#95819F" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M20 4L24 12.4L16.3 27L9 17Z" fill="#9E89BC" fill-opacity=".68"/>
      <path d="M20 4L18.3 17.4L30 16Z" fill="#F0E5F0"/>
      <path d="M12.8 2L2 17L9 17Z" fill="#EAD5E4"/>
    `),
  },
  {
    id: '06', name: '含光', description: '收拢的晶苞保留宽腰身，光从一侧透出。',
    svg: svg('06', `
      <path d="M16 1.7L28.5 17L16 30.3L3.5 17Z" fill="url(#v06)" stroke="#95849F" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M16 1.7L17.3 19.8L3.5 17Z" fill="url(#w06)"/>
      <path d="M16 1.7L28.5 17L17.3 19.8Z" fill="url(#p06)"/>
      <path d="M3.5 17L17.3 19.8L16 30.3Z" fill="#C3B4D7"/>
      <path d="M16 1.7L17.3 19.8L16 30.3L13.2 18.3Z" fill="#F8F2F7" fill-opacity=".88"/>
    `),
  },
  ...extraCandidates,
];
