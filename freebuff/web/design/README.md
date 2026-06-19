# Design source assets

Editable sources for generated images in `freebuff/web/public/`.

## opengraph-image

Source: [`opengraph-image.svg`](./opengraph-image.svg) → output: `../public/opengraph-image.png` (1200×630).

Re-render after editing the SVG (run from repo root, uses repo-local `sharp`):

```js
// render-og.mjs
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
const svg = readFileSync('freebuff/web/design/opengraph-image.svg')
const png = await sharp(svg, { density: 288 }).resize(1200, 630, { fit: 'fill' }).png().toBuffer()
writeFileSync('freebuff/web/public/opengraph-image.png', png)
```

```sh
node render-og.mjs && rm render-og.mjs
```
