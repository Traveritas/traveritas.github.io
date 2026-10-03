import type { ImageMetadata } from 'astro';

/* 瞬间配图的两种写法（裸路径 / { src, alt }）统一成 { src, alt }，最多 9 张 */
export type MomentImage = ImageMetadata | { src: ImageMetadata; alt?: string };

export function normalize(images: MomentImage[]) {
  return images.slice(0, 9).map((s) =>
    'format' in s ? { src: s, alt: '' } : { src: s.src, alt: s.alt ?? '' }
  );
}

/** 大图层的锚点 id：断简 id + 第几张 */
export const boxId = (anchor: string, i: number) => `${anchor}-p${i + 1}`;
