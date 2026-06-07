// Shared dithered-photo codec (substrate piece #3): a tiny duotone/grayscale image baked into
// a capsule directive as indexed pixels, NOT a raw data: URI — the renderer GENERATES the BMP
// from validated indices, so an author payload carries only pixel levels (clamped) + depth/side
// (bounds-checked); there is no author-controlled image bytes and thus no data:-URI XSS surface
// ("generate, never sanitize"). Cousin of bio's @face (same idea, independent so bio's frozen
// NFC payloads are never touched). Inlined ahead of the recipe renderer/editor by build/build.js
// (between @build:photo markers). Pure JS (no canvas in here) so decode + encode unit-test.
//
// Payload bytes: [depth(1|2), side(1..200), …pixels packed depth-bits/px MSB-first, 0=dark…max=light].
// base64 (standard A–Za–z0–9+/, '=' padded).

const PHOTO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function photoB64ToBytes(s) {
  s = String(s).replace(/[^A-Za-z0-9+/]/g, "");
  const out = []; let buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) { buf = (buf << 6) | PHOTO_B64.indexOf(s[i]); bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); } }
  return out;
}
function photoBytesToB64(b) {
  let o = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    o += PHOTO_B64[(n >> 18) & 63] + PHOTO_B64[(n >> 12) & 63] + (i + 1 < b.length ? PHOTO_B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? PHOTO_B64[n & 63] : "=");
  }
  return o;
}

// duotone ramps [dark[r,g,b], light[r,g,b]] — the palette lerps between them per level
const PHOTO_PALS = {
  gray:  [[24, 22, 20], [245, 245, 240]],
  gb:    [[15, 56, 15], [155, 188, 15]],     // Game Boy green
  amber: [[40, 18, 0], [255, 176, 0]],
  sepia: [[44, 32, 22], [240, 220, 182]],
  ink:   [[10, 10, 14], [250, 250, 255]],
};

// build an 8bpp indexed BMP (rows bottom-up) from per-pixel level indices (0=darkest…levels-1)
function photoBmp(idx, side, levels, pal) {
  pal = pal || PHOTO_PALS.gray;
  const stride = (side + 3) & ~3;
  const off = 54 + levels * 4, data = stride * side, size = off + data;
  const b = new Uint8Array(size);
  const u16 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
  const u32 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >> 24) & 255; };
  b[0] = 0x42; b[1] = 0x4d; u32(2, size); u32(10, off);                         // BITMAPFILEHEADER
  u32(14, 40); u32(18, side); u32(22, side); u16(26, 1); u16(28, 8); u32(34, data); u32(46, levels); // INFOHEADER
  for (let i = 0; i < levels; i++) {                                            // palette entries B,G,R,0
    const t = levels <= 1 ? 0 : i / (levels - 1), p = 54 + i * 4;
    b[p]     = Math.round(pal[0][2] + (pal[1][2] - pal[0][2]) * t);
    b[p + 1] = Math.round(pal[0][1] + (pal[1][1] - pal[0][1]) * t);
    b[p + 2] = Math.round(pal[0][0] + (pal[1][0] - pal[0][0]) * t);
  }
  for (let y = 0; y < side; y++) {                                             // logical top row → last BMP row (upright)
    const dst = off + (side - 1 - y) * stride, src = y * side;
    for (let x = 0; x < side; x++) b[dst + x] = idx[src + x] | 0;
  }
  return b;
}

// payload (base64) → a safe `data:image/bmp;base64,…` URI, or null if malformed/oversized
function photoDecode(payload, palName) {
  try {
    const bytes = photoB64ToBytes(payload);
    if (bytes.length < 3) return null;
    const depth = bytes[0], side = bytes[1];
    if ((depth !== 1 && depth !== 2) || side < 1 || side > 200) return null;
    const levels = 1 << depth, need = Math.ceil((side * side * depth) / 8);
    if (bytes.length < 2 + need) return null;
    const idx = new Uint8Array(side * side);
    let bit = 0, pos = 2;
    for (let i = 0; i < idx.length; i++) {
      let v = 0;
      for (let d = 0; d < depth; d++) { v = (v << 1) | ((bytes[pos] >> (7 - bit)) & 1); if (++bit === 8) { bit = 0; pos++; } }
      idx[i] = v < levels ? v : levels - 1;
    }
    return "data:image/bmp;base64," + photoBytesToB64(photoBmp(idx, side, levels, PHOTO_PALS[palName] || PHOTO_PALS.gray));
  } catch (e) { return null; }
}

// browser side: RGBA ImageData (side×side, already drawn) → Floyd-Steinberg dither → payload base64.
// `depth` 1 (2 levels) or 2 (4 levels). Pure array math — the canvas/getImageData lives in the editor.
function photoEncode(rgba, side, depth) {
  const levels = 1 << depth, n = side * side, g = new Float32Array(n), idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = y * side + x, old = g[i] < 0 ? 0 : g[i] > 255 ? 255 : g[i];
    const lvl = Math.round((old / 255) * (levels - 1)), nv = (lvl / (levels - 1)) * 255, err = old - nv;
    idx[i] = lvl;
    if (x + 1 < side) g[i + 1] += err * 7 / 16;
    if (y + 1 < side) {
      if (x > 0) g[i + side - 1] += err * 3 / 16;
      g[i + side] += err * 5 / 16;
      if (x + 1 < side) g[i + side + 1] += err * 1 / 16;
    }
  }
  const need = Math.ceil((n * depth) / 8), bytes = new Uint8Array(2 + need);
  bytes[0] = depth; bytes[1] = side;
  let bit = 0, pos = 2;
  for (let i = 0; i < n; i++) for (let d = depth - 1; d >= 0; d--) { bytes[pos] |= ((idx[i] >> d) & 1) << (7 - bit); if (++bit === 8) { bit = 0; pos++; } }
  return photoBytesToB64(bytes);
}

if (typeof module !== "undefined" && module.exports) module.exports = { photoDecode, photoEncode, photoBmp, photoB64ToBytes, photoBytesToB64, PHOTO_PALS };
