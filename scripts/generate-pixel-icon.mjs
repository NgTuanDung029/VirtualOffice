import fs from 'fs';
import path from 'path';

// Palette definitions (RGBA)
const PAL = {
  _: [0, 0, 0, 0],           // Transparent
  K: [6, 8, 14, 255],        // Outline Black
  F: [27, 34, 52, 255],      // Frame Dark Navy
  H: [56, 71, 102, 255],     // Frame Highlight Slate
  B: [38, 50, 72, 255],      // Monitor Bezel
  S: [9, 14, 24, 255],       // CRT Screen Dark
  s: [14, 22, 36, 255],      // CRT Screen Scanline
  C: [56, 189, 248, 255],    // Cyan Accent
  c: [103, 232, 249, 255],   // Bright Cyan Glow
  G: [34, 197, 94, 255],     // Emerald Prompt
  g: [74, 222, 128, 255],    // Bright Green
  Y: [245, 158, 11, 255],    // Amber Gold
  y: [251, 191, 36, 255],    // Bright Amber
  L: [254, 240, 138, 255],   // Lamp Glow Yellow
  R: [239, 68, 68, 255],     // Crimson Red (Mug)
  r: [185, 28, 28, 255],     // Dark Red Shadow
  o: [120, 53, 15, 255],     // Coffee Liquid
  w: [226, 232, 240, 200],   // Steam Wisp
  M: [100, 116, 139, 255],   // Stand Metal
  m: [51, 65, 85, 255],      // Dark Metal
  W: [217, 119, 6, 255],     // Desk Highlight
  D: [180, 83, 9, 255],      // Desk Wood Face
  d: [120, 53, 15, 255],     // Desk Shadow
  P: [16, 185, 129, 255],    // Plant Green
  p: [5, 150, 105, 255],     // Dark Plant Green
};

// 32x32 Detailed Pixel Art Matrix
const ART_32 = [
  /* 00 */ "________________________________",
  /* 01 */ "___LL___________________________",
  /* 02 */ "__LLLL___KKKKKKKKKKKKKKKKK______",
  /* 03 */ "_LLYYLL_KHHHHHHHHHHHHHHHHHK_____",
  /* 04 */ "__YYYY_KFFFFFFFFFFFFFFFFFFFKK___",
  /* 05 */ "___YY_KFSSSSSSSSSSSSSSSSSSSFK___",
  /* 06 */ "___YY_KFsGgSSSSSSSSSSSYRGSssFK__",
  /* 07 */ "___YY_KFSGGSSSSSSSSSSSYRGSssFK__",
  /* 08 */ "__YY__KFsSSSSSSSSSSSSSSSSsssFK__",
  /* 09 */ "_YY___KFSSSSScSSScSSSSSSSSssFK__",
  /* 10 */ "_Y____KFsSSScScScScSSSSSSSssFK__",
  /* 11 */ "KYYK__KFsSSSScSSScSSSSSSSSssFK__",
  /* 12 */ "KKKK__KFSSSSSSSSSSSSSSSSSSssFK__",
  /* 13 */ "______KFsSSSSCcSSCcSSSSSSSssFK__",
  /* 14 */ "______KFSSSSSSCCCCSSSSSSSSssFK__",
  /* 15 */ "______KFsSSSSSSSSSSSSSSSSSssFK__",
  /* 16 */ "______KFSSSSSSSSSSSSSSSSSSssFK__",
  /* 17 */ "______KFsSSSSSSSSSSSSSSSSSssFK__",
  /* 18 */ "______KFSSSSSSSSSSSSSSSSSSssFK__",
  /* 19 */ "______KFFFFFFFFFFFFFFFFFFFFFK___",
  /* 20 */ "______KKKKKKKKKKKKKKKKKKKKKKK___",
  /* 21 */ "_____________KmmmmK_______ww____",
  /* 22 */ "_____________KMMMMK______ww_____",
  /* 23 */ "___PP________KMMMMK_____w_w_____",
  /* 24 */ "__PPPP_______KMMMMK____KRRRK____",
  /* 25 */ "_pPPPPp____KKKmmmmKKK__KRRoRK___",
  /* 26 */ "_KppppK___KMMMMMMMMMMK_KRRRRK_K_",
  /* 27 */ "_KppppK__KHHHHHHHHHHHHHKRRRRKKK_",
  /* 28 */ "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  /* 29 */ "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
  /* 30 */ "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  /* 31 */ "dddddddddddddddddddddddddddddddd",
];

// Helper to convert character matrix to RGBA buffer
function matrixToRgba(matrix, width, height) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = matrix[y] || "";
    for (let x = 0; x < width; x++) {
      const ch = row[x] || "_";
      const rgba = PAL[ch] || PAL._;
      const idx = (y * width + x) * 4;
      buf[idx] = rgba[0];
      buf[idx + 1] = rgba[1];
      buf[idx + 2] = rgba[2];
      buf[idx + 3] = rgba[3];
    }
  }
  return buf;
}

// Nearest-neighbor rescaler for crisp pixel art scaling
function scalePixelMatrix(srcBuf, srcW, srcH, targetW, targetH) {
  const outBuf = Buffer.alloc(targetW * targetH * 4);
  for (let ty = 0; ty < targetH; ty++) {
    const sy = Math.floor((ty / targetH) * srcH);
    for (let tx = 0; tx < targetW; tx++) {
      const sx = Math.floor((tx / targetW) * srcW);
      const srcIdx = (sy * srcW + sx) * 4;
      const targetIdx = (ty * targetW + tx) * 4;

      outBuf[targetIdx] = srcBuf[srcIdx];
      outBuf[targetIdx + 1] = srcBuf[srcIdx + 1];
      outBuf[targetIdx + 2] = srcBuf[srcIdx + 2];
      outBuf[targetIdx + 3] = srcBuf[srcIdx + 3];
    }
  }
  return outBuf;
}

// 16x16 Handcrafted Icon Matrix for perfect pixel alignment at small sizes
const ART_16 = [
  /* 00 */ "________________",
  /* 01 */ "_LL__KKKKKKKKK__",
  /* 02 */ "LYL_KHHHHHHHHHK_",
  /* 03 */ "_Y_KFSSSSSSSSSFK",
  /* 04 */ "YY_KFgSSSSSYRGsK",
  /* 05 */ "_Y_KFScScSSSSSFK",
  /* 06 */ "KY_KFSScSSScSSFK",
  /* 07 */ "KK_KFSSCCCCSSSFK",
  /* 08 */ "___KFSSSSSSSSSFK",
  /* 09 */ "___KKKKKKKKKKKKK",
  /* 10 */ "______KMMMKK__w_",
  /* 11 */ "_PP___KMMMKK_KRK",
  /* 12 */ "PPPP_KMMMMMMKRRo",
  /* 13 */ "KppK_KHHHHHHHRRK",
  /* 14 */ "WWWWWWWWWWWWWWWW",
  /* 15 */ "DDDDDDDDDDDDDDDD",
];

// Generates valid multi-resolution Windows ICO binary
function buildWindowsIco(images) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;

  let currentOffset = headerSize + dirEntrySize * numImages;
  const entries = [];
  const imageBuffers = [];

  for (const img of images) {
    const { width, height, rgba } = img;
    const bihSize = 40;
    const pixelBytes = width * height * 4;
    const andMaskRowBytes = Math.ceil(width / 32) * 4;
    const andMaskBytes = andMaskRowBytes * height;
    const totalImageSize = bihSize + pixelBytes + andMaskBytes;

    const imgBuf = Buffer.alloc(totalImageSize);
    let offset = 0;

    // BITMAPINFOHEADER (40 bytes)
    imgBuf.writeUInt32LE(bihSize, offset); offset += 4;
    imgBuf.writeInt32LE(width, offset); offset += 4;
    imgBuf.writeInt32LE(height * 2, offset); offset += 4; // Height doubled for icon format
    imgBuf.writeUInt16LE(1, offset); offset += 2; // Planes
    imgBuf.writeUInt16LE(32, offset); offset += 2; // BitCount (32-bit RGBA)
    imgBuf.writeUInt32LE(0, offset); offset += 4; // BI_RGB (uncompressed)
    imgBuf.writeUInt32LE(pixelBytes + andMaskBytes, offset); offset += 4;
    imgBuf.writeInt32LE(0, offset); offset += 4;
    imgBuf.writeInt32LE(0, offset); offset += 4;
    imgBuf.writeUInt32LE(0, offset); offset += 4;
    imgBuf.writeUInt32LE(0, offset); offset += 4;

    // Pixels (bottom-to-top, BGRA)
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const r = rgba[srcIdx];
        const g = rgba[srcIdx + 1];
        const b = rgba[srcIdx + 2];
        const a = rgba[srcIdx + 3];

        imgBuf[offset++] = b;
        imgBuf[offset++] = g;
        imgBuf[offset++] = r;
        imgBuf[offset++] = a;
      }
    }

    // 1bpp AND transparency mask
    imgBuf.fill(0, offset, offset + andMaskBytes);

    imageBuffers.push(imgBuf);

    // ICONDIRENTRY (16 bytes)
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // colorCount
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bitCount
    entry.writeUInt32LE(totalImageSize, 8); // bytesInRes
    entry.writeUInt32LE(currentOffset, 12); // imageOffset

    entries.push(entry);
    currentOffset += totalImageSize;
  }

  // ICONDIR header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved (must be 0)
  header.writeUInt16LE(1, 2); // Type 1 = Icon
  header.writeUInt16LE(numImages, 4);

  return Buffer.concat([header, ...entries, ...imageBuffers]);
}

export function generateAppIcon(targetPaths) {
  console.log('[IconGenerator] Building pixel-art multi-resolution Windows ICO...');

  const rgba16 = matrixToRgba(ART_16, 16, 16);
  const rgba32 = matrixToRgba(ART_32, 32, 32);
  const rgba48 = scalePixelMatrix(rgba32, 32, 32, 48, 48);
  const rgba64 = scalePixelMatrix(rgba32, 32, 32, 64, 64);
  const rgba128 = scalePixelMatrix(rgba32, 32, 32, 128, 128);
  const rgba256 = scalePixelMatrix(rgba32, 32, 32, 256, 256);

  const icoBuffer = buildWindowsIco([
    { width: 16, height: 16, rgba: rgba16 },
    { width: 32, height: 32, rgba: rgba32 },
    { width: 48, height: 48, rgba: rgba48 },
    { width: 64, height: 64, rgba: rgba64 },
    { width: 128, height: 128, rgba: rgba128 },
    { width: 256, height: 256, rgba: rgba256 },
  ]);

  for (const p of targetPaths) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, icoBuffer);
    console.log(`[IconGenerator] Created pixel icon at: ${p} (${icoBuffer.length} bytes)`);
  }

  return icoBuffer;
}

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('generate-pixel-icon.mjs')) {
  const rootDir = process.cwd();
  generateAppIcon([
    path.join(rootDir, 'app.ico'),
    path.join(rootDir, 'public', 'assets', 'app.ico'),
    path.join(rootDir, 'dist', 'client', 'assets', 'app.ico'),
  ]);
}
