/* 选格：最大化最低分，同时限制相邻两格的剪影变化（IoU）落在「看得出换了面、但不闪」的带里。
   这才是「贪心、别均匀」这条要求的实质：均匀会把 #2 停在 ugly 区，而定格会把它停住 110ms。 */
import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const { BAKE, poseScores, poseAt } = await import(ROOT + 'bake.mjs?only=geo');

/* 复用 bake.mjs 的 maskOf 不可（未导出）。这里自己按同一口径重算一张 32×32 的粗掩码，
   只用来算相邻 IoU —— 不是给分数用的，粗一点足够。 */