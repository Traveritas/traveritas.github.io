// Independent favicon studies; all geometry is drawn for a 32-unit viewport.
// Keep broad, opaque faces readable when the artwork is rendered at 16px.
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>${defs}</defs>${body}</svg>`;

export const extraCandidates = [
  {
    id: '07',
    name: '偏斜冰月',
    description: '厚实月弧向右倾斜，内侧留出一块宽阔空白。',
    svg: svg(`
      <linearGradient id="candidate07-body" x1="7" y1="4" x2="23" y2="28" gradientUnits="userSpaceOnUse">
        <stop stop-color="#D8C4DE"/><stop offset=".42" stop-color="#EEE7F0"/><stop offset=".72" stop-color="#C5B6D9"/><stop offset="1" stop-color="#A597C5"/>
      </linearGradient>
      <linearGradient id="candidate07-face" x1="3" y1="13" x2="23" y2="23" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F3EFF5"/><stop offset="1" stop-color="#C5B6D9"/>
      </linearGradient>
    `, `
      <path d="M24.3 2.2C12.2.4 1.8 7.2 2 18C2.2 25.5 9.5 30.8 18.2 29.3C23.4 28.4 27.4 24.6 29.3 19.4C23.3 22.6 17.3 20.4 15.3 15.4C13.3 10.2 17.2 4.7 24.3 2.2Z" fill="url(#candidate07-body)" stroke="#94859F" stroke-width=".65" stroke-linejoin="round"/>
      <path d="M24.3 2.2C14 2.8 5.4 8.9 4.9 17.6L14.8 23.5L15.3 15.4C13.3 10.2 17.2 4.7 24.3 2.2Z" fill="url(#candidate07-face)"/>
      <path d="M4.9 17.6L14.8 23.5L29.3 19.4C25.7 25.4 22.8 27.9 18.2 29.3C12.2 30.1 7.6 26.9 4.9 17.6Z" fill="#A597C5" fill-opacity=".55"/>
      <path d="M14.8 23.5L15.3 15.4C17.3 20.4 23.3 22.6 29.3 19.4L14.8 23.5Z" fill="#F3EFF5" fill-opacity=".8"/>
    `),
  },
  {
    id: '08',
    name: '软方欧泊',
    description: '略微倾斜的圆钝晶面，把珠白与灰粉收进饱满轮廓。',
    svg: svg(`
      <linearGradient id="candidate08-body" x1="5" y1="4" x2="28" y2="29" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F3EFF5"/><stop offset=".35" stop-color="#D8C4DE"/><stop offset=".65" stop-color="#C5B6D9"/><stop offset="1" stop-color="#A597C5"/>
      </linearGradient>
      <radialGradient id="candidate08-pearl" cx=".28" cy=".28" r=".9">
        <stop stop-color="#F3EFF5"/><stop offset=".6" stop-color="#EEE7F0"/><stop offset="1" stop-color="#CADDD9"/>
      </radialGradient>
    `, `
      <path d="M8 3.5L23.2 2.2Q28 1.8 28.6 6.5L29.9 21.7Q30.3 26.2 25.6 27.2L10 29.7Q4.8 30.5 4 25.6L2.2 11Q1.5 6 8 3.5Z" fill="url(#candidate08-body)" stroke="#94859F" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M8 3.5L23.2 2.2L20.1 10.1L10.6 23.3L2.2 11Q1.5 6 8 3.5Z" fill="url(#candidate08-pearl)"/>
      <path d="M23.2 2.2Q28 1.8 28.6 6.5L29.9 21.7L20.1 10.1Z" fill="#D8C4DE"/>
      <path d="M20.1 10.1L29.9 21.7Q30.3 26.2 25.6 27.2L10 29.7L10.6 23.3Z" fill="#A597C5" fill-opacity=".53"/>
      <path d="M2.2 11L10.6 23.3L25.6 27.2L10 29.7Q4.8 30.5 4 25.6Z" fill="#D8C4DE"/>
      <path d="M20.1 10.1L10.6 23.3L25.6 27.2L12.9 21.6Z" fill="#F3EFF5" fill-opacity=".58"/>
    `),
  },
  {
    id: '09',
    name: '折叠光带',
    description: '一段宽光带两次折返，形成上下错开的三个面。',
    svg: svg(`
      <linearGradient id="candidate09-top" x1="4" y1="5" x2="22" y2="13" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F3EFF5"/><stop offset=".55" stop-color="#D8C4DE"/><stop offset="1" stop-color="#C5B6D9"/>
      </linearGradient>
      <linearGradient id="candidate09-front" x1="12" y1="12" x2="18" y2="25" gradientUnits="userSpaceOnUse">
        <stop stop-color="#EEE7F0"/><stop offset=".45" stop-color="#C5B6D9"/><stop offset="1" stop-color="#A597C5"/>
      </linearGradient>
      <linearGradient id="candidate09-base" x1="3" y1="23" x2="21" y2="25" gradientUnits="userSpaceOnUse">
        <stop stop-color="#D8C4DE"/><stop offset="1" stop-color="#81758F"/>
      </linearGradient>
    `, `
      <path d="M3 7L20 2L29.5 8L22 23L4 29.5L2 22L9 19L11 14Z" fill="#A597C5" stroke="#81758F" stroke-width=".65" stroke-linejoin="round"/>
      <path d="M2 22L13 18L22 23L4 29.5Z" fill="url(#candidate09-base)"/>
      <path d="M11 14L29.5 8L22 23L4 29.5Z" fill="url(#candidate09-front)"/>
      <path d="M3 7L20 2L29.5 8L11 14Z" fill="url(#candidate09-top)"/>
      <path d="M11 14L29.5 8L13 16.1L4 29.5Z" fill="#F3EFF5" fill-opacity=".7"/>
    `),
  },
  {
    id: '10',
    name: '错向双翼',
    description: '两片宽晶翼朝不同方向展开，在中间轻轻相接。',
    svg: svg(`
      <linearGradient id="candidate10-left" x1="4" y1="3" x2="17" y2="20" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F3EFF5"/><stop offset=".45" stop-color="#D8C4DE"/><stop offset="1" stop-color="#A597C5"/>
      </linearGradient>
      <linearGradient id="candidate10-right" x1="28" y1="9" x2="15" y2="29" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F3EFF5"/><stop offset=".4" stop-color="#C5B6D9"/><stop offset="1" stop-color="#A597C5"/>
      </linearGradient>
    `, `
      <path d="M3 2.5C11 3.1 18.7 9 17.3 18.5C24.1 17.4 27.5 12.9 29.5 7.5C31 19.8 26.2 28.7 14.6 29.5L14.8 19.7C6.4 19.4 1 12.9 3 2.5Z" fill="#C5B6D9" stroke="#94859F" stroke-width=".65" stroke-linejoin="round"/>
      <path d="M3 2.5C11 3.1 18.7 9 17.3 18.5L14.8 19.7C6.4 19.4 1 12.9 3 2.5Z" fill="url(#candidate10-left)"/>
      <path d="M17.3 18.5C24.1 17.4 27.5 12.9 29.5 7.5C31 19.8 26.2 28.7 14.6 29.5L14.8 19.7Z" fill="url(#candidate10-right)"/>
      <path d="M3 2.5L14.8 19.7C6.4 19.4 1 12.9 3 2.5Z" fill="#A597C5" fill-opacity=".44"/>
      <path d="M29.5 7.5L19.6 23.3L14.6 29.5L14.8 19.7L17.3 18.5C24.1 17.4 27.5 12.9 29.5 7.5Z" fill="#F3EFF5" fill-opacity=".57"/>
      <path d="M3 2.5L15.8 15L17.3 18.5L14.8 19.7Z" fill="#F3EFF5" fill-opacity=".61"/>
    `),
  },
];
