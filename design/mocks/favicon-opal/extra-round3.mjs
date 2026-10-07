// Four deliberately different graphic languages, designed for a 16px reading.
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;

export const extraRound3 = [
  {
    id: '07',
    name: '银色拱门',
    style: '装饰艺术',
    description: '阶梯外形包围银白拱门，深灰绿与亮色形成清楚的层次。',
    svg: svg(`
      <path d="M2 30V13H6V8H10V3H22V8H26V13H30V30Z" fill="#3F5550"/>
      <path d="M11 30V17A5 5 0 0 1 21 17V30Z" fill="#EEEDE4"/>
      <path d="M6 15H8V27H6ZM24 15H26V27H24Z" fill="#B5C0B5"/>
      <path d="M13 6H19V8H13Z" fill="#B5C0B5"/>
    `),
  },
  {
    id: '08',
    name: '叶脉印记',
    style: '现代版画',
    description: '乳白枝叶从整块墨紫中显现，三层分枝保持严格对称。',
    svg: svg(`
      <path d="M0 0H32V32H0Z" fill="#4C354E"/>
      <path d="M14 29V24L4 20V15L14 19V15L5 11V6L14 10V3H18V10L27 6V11L18 15V19L28 15V20L18 24V29Z" fill="#F0E9DD"/>
    `),
  },
  {
    id: '09',
    name: '展开的页',
    style: '纸雕折面',
    description: '左右纸页向中间折入，宽阔的亮面与实体暗面表现深度。',
    svg: svg(`
      <path d="M2 7L16 11L30 7V27L16 30L2 27Z" fill="#8F899D"/>
      <path d="M2 3L12 6L16 11V29L12 24L2 21Z" fill="#F0EDE7" stroke="#ABA4AF" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M30 3L20 6L16 11V29L20 24L30 21Z" fill="#F0EDE7" stroke="#ABA4AF" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M12 6L16 11V29L12 24Z" fill="#B7AEC6"/>
      <path d="M20 6L16 11V29L20 24Z" fill="#B7AEC6"/>
      <path d="M2 21L12 24L16 29L2 25ZM30 21L20 24L16 29L30 25Z" fill="#D4CEDA"/>
    `),
  },
  {
    id: '10',
    name: '静水月色',
    style: '极简风景',
    description: '灰粉天空、平直水面与居中倒影，组成一幅微小风景。',
    svg: svg(`
      <path d="M0 0H32V32H0Z" fill="#D9BCC9"/>
      <circle cx="16" cy="9" r="4.5" fill="#F7F3EC"/>
      <path d="M0 18H32V32H0Z" fill="#6C8480"/>
      <path d="M14.5 21H17.5L20 30H12Z" fill="#DFDCD1"/>
    `),
  },
];
