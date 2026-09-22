// Generates the Play Store listing graphics — EPIC-6 story E6-3.
//
//   npm run app:playassets      ->  play/
//
// Play asks for two images before it will let you save a listing, and both have exact
// requirements that it enforces on upload:
//
//   icon              512 x 512, 32-bit PNG, NO transparency, NO rounded corners.
//                     Play applies its own mask; supplying a pre-rounded icon gets it
//                     rounded twice and the corners come out chewed. This is why the mark
//                     here is drawn square while the launcher icon in make-app-assets.mjs
//                     is drawn rounded — same artwork, different framing, on purpose.
//   feature graphic   1024 x 500, no transparency. Shown at the top of the listing and in
//                     several places where it is CROPPED and overlaid with the app title,
//                     so nothing that must survive goes near the edges or the centre-left.
//
// Same two tokens as every other surface, so the store listing, the installed app, the
// home-screen PWA and the website cannot drift apart.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'play');

const INK = '#0B1520';
const GOLD = '#C9A24B';
const CREAM = '#EDE6D6';
const DIM = '#9DA8B4';

/**
 * The store icon. Square, opaque, and with the mark inset far enough that Play's mask
 * cannot clip it — the mask is a circle on some surfaces and a squircle on others, and the
 * inscribed circle of a 512 square only reaches the corners at about 72% of the width.
 */
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${INK}"/>
  <text x="256" y="336" font-family="Georgia,serif" font-size="286" font-weight="700"
        fill="${GOLD}" text-anchor="middle">D</text>
</svg>`;

/**
 * The feature graphic. A candlestick run rising to the right, the wordmark on the left.
 *
 * Play overlays the app title and icon over the LEFT of this image on some surfaces and
 * crops the sides on others, so the type sits left-of-centre with generous margin and the
 * chart carries the right half where a crop is least likely to land on anything load-bearing.
 */
function featureSvg(){
  // A deterministic run of candles — not random, so regenerating never changes the image.
  const candles = [
    { x:  560, o: 300, c: 250, h: 230, l: 330, up: true  },
    { x:  610, o: 250, c: 285, h: 240, l: 300, up: false },
    { x:  660, o: 285, c: 215, h: 200, l: 300, up: true  },
    { x:  710, o: 215, c: 240, h: 205, l: 260, up: false },
    { x:  760, o: 240, c: 170, h: 155, l: 255, up: true  },
    { x:  810, o: 170, c: 195, h: 160, l: 215, up: false },
    { x:  860, o: 195, c: 130, h: 115, l: 210, up: true  },
    { x:  910, o: 130, c: 105, h:  90, l: 145, up: true  },
    { x:  960, o: 105, c: 140, h:  98, l: 158, up: false }
  ];
  const body = candles.map(k => {
    const colour = k.up ? GOLD : DIM;
    const top = Math.min(k.o, k.c);
    const height = Math.max(6, Math.abs(k.c - k.o));
    return `<rect x="${k.x - 1.5}" y="${k.h}" width="3" height="${k.l - k.h}" fill="${colour}" opacity="0.75"/>` +
           `<rect x="${k.x - 11}" y="${top}" width="22" height="${height}" rx="3" fill="${colour}"/>`;
  }).join('');

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">
  <rect width="1024" height="500" fill="${INK}"/>
  <g opacity="0.06">
    ${[120, 200, 280, 360].map(y => `<rect x="0" y="${y}" width="1024" height="1" fill="${CREAM}"/>`).join('')}
  </g>
  ${body}
  <text x="72" y="228" font-family="Georgia,serif" font-size="66" font-weight="700" fill="${CREAM}">Dalal Street</text>
  <text x="72" y="300" font-family="Georgia,serif" font-size="66" font-weight="700" font-style="italic" fill="${GOLD}">Live</text>
  <text x="74" y="352" font-family="Helvetica,Arial,sans-serif" font-size="23" fill="${DIM}"
        letter-spacing="1.5">NSE &amp; BSE equity research</text>
</svg>`;
}

async function png(svg, file, width, height){
  // flatten onto ink: Play rejects both of these with an alpha channel.
  const buf = await sharp(Buffer.from(svg))
    .resize(width, height)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(resolve(OUT, file), buf);
  const meta = await sharp(buf).metadata();
  console.log(`  ${file.padEnd(34)} ${meta.width}x${meta.height}  ${meta.channels} channels  ${(buf.length / 1024).toFixed(0)} KB`);
  return meta;
}

async function main(){
  await mkdir(OUT, { recursive: true });
  console.log('Play Store listing graphics ->  play/');
  const icon = await png(iconSvg, 'icon-512.png', 512, 512);
  const feature = await png(featureSvg(), 'feature-graphic-1024x500.png', 1024, 500);

  // Fail loudly rather than let a listing upload bounce on a dimension nobody checked.
  const problems = [];
  if (icon.width !== 512 || icon.height !== 512) problems.push('icon is not 512x512');
  if (icon.hasAlpha) problems.push('icon has an alpha channel; Play requires none');
  if (feature.width !== 1024 || feature.height !== 500) problems.push('feature graphic is not 1024x500');
  if (feature.hasAlpha) problems.push('feature graphic has an alpha channel; Play requires none');
  if (problems.length){
    console.error('\nFAILED:\n  ' + problems.join('\n  '));
    process.exit(1);
  }

  console.log('\nBoth meet Play’s requirements. Screenshots are not generated here:');
  console.log('take them on the device, because Play shows them to people deciding whether');
  console.log('to install and a real phone is the only honest source. Two minimum, 16:9 or');
  console.log('9:16, between 320px and 3840px on the long edge.');
}

main().catch(err => { console.error(err); process.exit(1); });
