#!/bin/sh
# 把 frames/ 的 PNG 导出为站点用的 WebP：public/hero-bud/{wake,open,dream,close}/NNN.webp
# 梦面按 3°/格取帧（渲染是 1.5°/帧 → 隔一帧取一帧，120° 循环 40 帧）
cd "$(dirname "$0")"
OUT=../../../public/hero-bud
Q=${Q:-78}
rm -rf "$OUT"
for s in wake open close; do
  mkdir -p "$OUT/$s"
  for f in frames/$s/*.png; do
    magick "$f" -quality $Q -define webp:alpha-quality=85 -define webp:method=6 "$OUT/$s/$(basename "$f" .png).webp"
  done
done
mkdir -p "$OUT/dream"
i=0
for n in $(seq 0 2 78); do
  magick "frames/dream/$(printf %03d $n).png" -quality $Q -define webp:alpha-quality=85 -define webp:method=6 "$OUT/dream/$(printf %03d $i).webp"
  i=$((i + 1))
done
for s in wake open dream close; do printf '%-6s %4s 帧 %6s KB\n' $s "$(ls "$OUT/$s" | wc -l)" "$(( $(cat "$OUT"/$s/*.webp | wc -c) / 1024 ))"; done
printf '合计 %s KB\n' "$(( $(cat "$OUT"/*/*.webp | wc -c) / 1024 ))"
