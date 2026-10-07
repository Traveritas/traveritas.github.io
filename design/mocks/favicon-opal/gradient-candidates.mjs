// Full-canvas color studies. Broad, mirrored color fields are intentional:
// the composition should survive a reduction from 32px to a 16px favicon.
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>${defs}</defs>${body}</svg>`;

export const gradientCandidates = [
  {
    id: '06',
    name: '中央白光',
    description: '珠白从正中央均匀展开，四角保留较深的银紫。',
    svg: svg(`
      <radialGradient id="gradient06-light" cx="50%" cy="50%" r="68%">
        <stop stop-color="#FFF9FC"/>
        <stop offset=".25" stop-color="#F7EDF5"/>
        <stop offset=".55" stop-color="#DBC8E2"/>
        <stop offset=".82" stop-color="#B19DC6"/>
        <stop offset="1" stop-color="#9180AA"/>
      </radialGradient>
    `, `<rect width="32" height="32" fill="url(#gradient06-light)"/>`),
  },
  {
    id: '07',
    name: '横向霞带',
    description: '一道横贯画面的粉白光带，上下对称渐入丁香紫。',
    svg: svg(`
      <linearGradient id="gradient07-bands" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="#9580B4"/>
        <stop offset=".2" stop-color="#BAA4CF"/>
        <stop offset=".37" stop-color="#E6C6DB"/>
        <stop offset=".5" stop-color="#FFF5F7"/>
        <stop offset=".63" stop-color="#E6C6DB"/>
        <stop offset=".8" stop-color="#BAA4CF"/>
        <stop offset="1" stop-color="#9580B4"/>
      </linearGradient>
    `, `<rect width="32" height="32" fill="url(#gradient07-bands)"/>`),
  },
  {
    id: '08',
    name: '丁香紫心',
    description: '中心是一团清晰的丁香紫，向四角缓缓褪成粉白。',
    svg: svg(`
      <radialGradient id="gradient08-heart" cx="50%" cy="50%" r="70%">
        <stop stop-color="#9676B5"/>
        <stop offset=".19" stop-color="#A287BF"/>
        <stop offset=".46" stop-color="#C5AAD6"/>
        <stop offset=".7" stop-color="#E6C5D8"/>
        <stop offset=".86" stop-color="#EEDDE8"/>
        <stop offset="1" stop-color="#F9F2F6"/>
      </radialGradient>
    `, `<rect width="32" height="32" fill="url(#gradient08-heart)"/>`),
  },
  {
    id: '09',
    name: '双轴柔光',
    description: '灰粉从左右靠近，雾青从上下淡入，中央留一小片乳白。',
    svg: svg(`
      <linearGradient id="gradient09-pink" x1="0" y1="0" x2="1" y2="0">
        <stop stop-color="#BE92AE"/>
        <stop offset=".23" stop-color="#D6B5CF"/>
        <stop offset=".5" stop-color="#F6ECF1"/>
        <stop offset=".77" stop-color="#D6B5CF"/>
        <stop offset="1" stop-color="#BE92AE"/>
      </linearGradient>
      <linearGradient id="gradient09-mist" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="#BAD5D0" stop-opacity=".94"/>
        <stop offset=".24" stop-color="#CADDD9" stop-opacity=".5"/>
        <stop offset=".5" stop-color="#CADDD9" stop-opacity="0"/>
        <stop offset=".76" stop-color="#CADDD9" stop-opacity=".5"/>
        <stop offset="1" stop-color="#BAD5D0" stop-opacity=".94"/>
      </linearGradient>
    `, `
      <rect width="32" height="32" rx="4" fill="url(#gradient09-pink)"/>
      <rect width="32" height="32" rx="4" fill="url(#gradient09-mist)"/>
    `),
  },
  {
    id: '10',
    name: '成对光晕',
    description: '两团粉白光上下相映，中央保留一道柔和紫色。',
    svg: svg(`
      <radialGradient id="gradient10-upper" cx="50%" cy="16%" r="55%" gradientTransform="translate(0 .056) scale(1 .65)">
        <stop stop-color="#F9E8F3"/>
        <stop offset=".22" stop-color="#F9E8F3" stop-opacity=".98"/>
        <stop offset=".53" stop-color="#F9E8F3" stop-opacity=".67"/>
        <stop offset="1" stop-color="#F9E8F3" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="gradient10-lower" cx="50%" cy="84%" r="55%" gradientTransform="translate(0 .294) scale(1 .65)">
        <stop stop-color="#F9E8F3"/>
        <stop offset=".22" stop-color="#F9E8F3" stop-opacity=".98"/>
        <stop offset=".53" stop-color="#F9E8F3" stop-opacity=".67"/>
        <stop offset="1" stop-color="#F9E8F3" stop-opacity="0"/>
      </radialGradient>
    `, `
      <rect width="32" height="32" rx="4" fill="#9F85B6"/>
      <rect width="32" height="32" rx="4" fill="url(#gradient10-upper)"/>
      <rect width="32" height="32" rx="4" fill="url(#gradient10-lower)"/>
    `),
  },
];
