import { candidates as previous } from './candidates-round3.mjs';
import { eclipseVariants } from './eclipse-variants.mjs';

const svg = (body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" ${extra}>${body}</svg>`;
const baseline = (source, id, group) => ({ ...previous.find(c => c.id === source), id, group, name: '原版', style: '第三轮原稿', description: '保留原版，作为这一组变体的对照。' });
const pixelOriginal = baseline('02', 'A0', 'pixel');

// Each cell is exactly one physical pixel at a 16px / 1× rendering.
function pixels(kind) {
  const occupied = (x, y) => {
    const dx = Math.abs(x + .5 - 8), dy = Math.abs(y + .5 - 8);
    const hi = Math.max(dx, dy), lo = Math.min(dx, dy);
    if (kind === 'open') return hi <= 6.5 && (dx + dy <= 7 || lo < 1) && !(dx < 2 && dy < 2);
    if (kind === 'eight') return (dx + dy <= 5 || lo < 1 && hi <= 6.5 || Math.abs(dx - dy) < .1 && hi <= 5.5);
    return hi <= 5.5 && (dx + dy <= 6 || lo < 1);
  };
  let cells = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!occupied(x, y)) continue;
    const d = Math.abs(x + .5 - 8) + Math.abs(y + .5 - 8);
    const edge = [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b]) => !occupied(x+a,y+b));
    const color = edge ? '#89719F' : d <= 2 ? '#F6F0F8' : d <= 4 ? '#E6D9EE' : '#C2ACD7';
    cells += `<rect x="${x*2}" y="${y*2}" width="2" height="2" fill="${color}"/>`;
  }
  return svg(cells, 'shape-rendering="crispEdges"');
}

const originalPixelBody = pixelOriginal.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const colorBody = `<rect width="32" height="32" fill="#795F8D"/><rect x="16" width="16" height="16" fill="#ADCBC2"/><rect y="16" width="16" height="16" fill="#D9B8CE"/>`;

export const groups = [
  { id:'pixel', name:'A · 像素微芒', note:'轮廓、密度与背景', anchor:'pixel' },
  { id:'eclipse', name:'B · 银蚀', note:'环宽、散光与边界', anchor:'eclipse' },
  { id:'color', name:'C · 四色之间', note:'中央留白与色块关系', anchor:'color' },
];

export const candidates = [
  pixelOriginal,
  { id:'A1', group:'pixel', name:'紧凑光心', style:'短芒 / 饱满中心', description:'缩短四端、加宽中心，让亮色在小尺寸里更集中。', svg:pixels('compact') },
  { id:'A2', group:'pixel', name:'八向微芒', style:'八向 / 对角延伸', description:'四个对角方向加入像素光芒，形成八向轮廓。', svg:pixels('eight') },
  { id:'A3', group:'pixel', name:'空心微芒', style:'中心留空 / 宽轮廓', description:'中央留出四像素方孔，外圈保持连续阶梯。', svg:pixels('open') },
  { id:'A4', group:'pixel', name:'夜色底', style:'原轮廓 / 深底提亮', description:'原轮廓放在深底上，微芒边缘和中间层一起提亮。', svg:svg(`<rect width="32" height="32" rx="3" fill="#282332"/><g shape-rendering="crispEdges">${originalPixelBody.replaceAll('#79618E','#AD94C9').replaceAll('#C5B1D9','#D9C5E7')}</g>`) },
  baseline('04','B0','eclipse'),
  ...eclipseVariants,
  baseline('05','C0','color'),
  { id:'C1', group:'color', name:'宽幅留白', style:'方心放大 / 色面收窄', description:'中央方形由六像素扩大到八像素，四角色面更克制。', svg:svg(`${colorBody}<rect x="8" y="8" width="16" height="16" fill="#F2EDF3"/>`, 'shape-rendering="crispEdges"') },
  { id:'C2', group:'color', name:'菱形留白', style:'旋转光心 / 方格不变', description:'中央改为菱形，四块色面保持原来的位置与颜色。', svg:svg(`${colorBody}<path d="M16 7L25 16L16 25L7 16Z" fill="#F2EDF3"/>`) },
  { id:'C3', group:'color', name:'透空方心', style:'透明中心 / 随背景变化', description:'中央白色改为透明方孔，深浅标签栏呈现不同读法。', svg:svg(`<defs><clipPath id="r4-c3-hole"><path d="M0 0H32V32H0ZM10 10V22H22V10Z" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#r4-c3-hole)">${colorBody}</g>`, 'shape-rendering="crispEdges"') },
  { id:'C4', group:'color', name:'阶梯光心', style:'四色 × 像素微芒', description:'四色布局保留，中央的银白变成阶梯状微芒。', svg:svg(`${colorBody}<path d="M14 6H18V12H20V14H26V18H20V20H18V26H14V20H12V18H6V14H12V12H14Z" fill="#F2EDF3"/>`, 'shape-rendering="crispEdges"') },
];
