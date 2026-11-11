# Third-party files

Copied unchanged from npm, the same versions LureLens uses, so the site keeps
its rule of loading scripts only from its own address (no CDN).

| File | Package | Version | Licence | SHA-256 |
| --- | --- | --- | --- | --- |
| `supabase.js` | [@supabase/supabase-js](https://www.npmjs.com/package/@supabase/supabase-js) (`dist/umd/supabase.js`) | 2.117.3 | MIT | `d6a5c4414a5d4ce646d9c1de223aa7067d3ff664c15394ffeb7fcffc763354a3` |
| `three.min.js` | [three.js](https://github.com/mrdoob/three.js) r186, built from the repository (see below) | 0.186.1 | MIT (`three.LICENSE`) | `79e42a61ae02e6eb39d9c581a7f2439cccfbf6d72b0628b083cd23e01fc825a5` |
| `qrcode.js` | [qrcode-generator](https://www.npmjs.com/package/qrcode-generator) (`qrcode.js`) | 1.4.4 | MIT | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |

`supabase.js` handles sign-in, the database calls and live scoreboard updates.
It is loaded only when needed, after the game has started. `qrcode.js` draws
the join QR code on the big screen.

`three.min.js` is not a copy of a published file: it is the parts of three.js the
3D world uses, tree-shaken and minified into one file by `scripts/build-three.mjs`
from a checkout of the three.js repository at tag `r186`. It loads only when the
3D view is on, after the first screen. To rebuild or add a part of three.js, see
the comments at the top of that script.

To update: `npm pack @supabase/supabase-js@<version>`, copy `package/dist/umd/supabase.js`
here, and update the version and checksum above (`sha256sum assets/vendor/supabase.js`).
