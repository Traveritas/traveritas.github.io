#!/bin/sh
# PNG 帧 → WebP（带透明），并写出各序列体积
cd "$(dirname "$0")"
mkdir -p frames-webp
printf '{' > frames-webp/sizes.json
first=1
for s in wake open dream close; do
  mkdir -p frames-webp/$s
  for f in frames/$s/*.png; do
    magick "$f" -quality ${Q:-80} -define webp:alpha-quality=90 -define webp:method=6 "frames-webp/$s/$(basename "$f" .png).webp"
  done
  sz=$(cat frames-webp/$s/*.webp | wc -c)
  [ $first = 1 ] || printf ',' >> frames-webp/sizes.json
  printf '"%s":%s' "$s" "$sz" >> frames-webp/sizes.json
  first=0
done
printf '}\n' >> frames-webp/sizes.json
cat frames-webp/sizes.json
