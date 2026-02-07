const fs = require("fs");
const zlib = require("zlib");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/preview_png.js <png-path>");
  process.exit(1);
}

const data = fs.readFileSync(input);
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!data.subarray(0, 8).equals(signature)) {
  console.error("Not a PNG file");
  process.exit(1);
}

let offset = 8;
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
const idatChunks = [];

while (offset < data.length) {
  const length = data.readUInt32BE(offset);
  const type = data.subarray(offset + 4, offset + 8).toString("ascii");
  const chunk = data.subarray(offset + 8, offset + 8 + length);
  if (type === "IHDR") {
    width = chunk.readUInt32BE(0);
    height = chunk.readUInt32BE(4);
    bitDepth = chunk.readUInt8(8);
    colorType = chunk.readUInt8(9);
  } else if (type === "IDAT") {
    idatChunks.push(chunk);
  } else if (type === "IEND") {
    break;
  }
  offset += 12 + length;
}

if (bitDepth !== 8) {
  console.error(`Unsupported bit depth ${bitDepth}`);
  process.exit(1);
}

const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
if (!bytesPerPixel) {
  console.error(`Unsupported color type ${colorType}`);
  process.exit(1);
}

const compressed = Buffer.concat(idatChunks);
const inflated = zlib.inflateSync(compressed);
const stride = width * bytesPerPixel;
const raw = Buffer.alloc(height * stride);

let srcOffset = 0;
let dstOffset = 0;

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

for (let y = 0; y < height; y++) {
  const filterType = inflated[srcOffset++];
  for (let x = 0; x < stride; x++) {
    const current = inflated[srcOffset++];
    const left = x >= bytesPerPixel ? raw[dstOffset + x - bytesPerPixel] : 0;
    const up = y > 0 ? raw[dstOffset + x - stride] : 0;
    const upLeft = y > 0 && x >= bytesPerPixel ? raw[dstOffset + x - stride - bytesPerPixel] : 0;
    let value = current;
    if (filterType === 1) value = (current + left) & 0xff;
    else if (filterType === 2) value = (current + up) & 0xff;
    else if (filterType === 3) value = (current + Math.floor((left + up) / 2)) & 0xff;
    else if (filterType === 4) value = (current + paethPredictor(left, up, upLeft)) & 0xff;
    raw[dstOffset + x] = value;
  }
  dstOffset += stride;
}

const targetWidth = 80;
const xStep = Math.max(1, Math.floor(width / targetWidth));
const yStep = xStep * 0.55;
const chars = " .:-=+*#%@";
let output = "";

for (let y = 0; y < height; y += Math.max(1, Math.floor(yStep))) {
  let line = "";
  for (let x = 0; x < width; x += xStep) {
    const idx = (Math.floor(y) * width + Math.floor(x)) * bytesPerPixel;
    const r = raw[idx] || 0;
    const g = raw[idx + 1] || 0;
    const b = raw[idx + 2] || 0;
    const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const charIndex = Math.min(chars.length - 1, Math.floor(brightness * (chars.length - 1)));
    line += chars[charIndex];
  }
  output += line + "\n";
}

console.log(`PNG ${width}x${height}`);
console.log(output);
