import { PNG } from 'pngjs';
import { Data } from 'resedit';

export const WINDOWS_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;

function resize(source: PNG, size: number): PNG {
  const result = new PNG({ width: size, height: size });
  if (source.width === size) {
    result.data = Buffer.from(source.data);
    return result;
  }
  const scale = source.width / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const left = x * scale;
      const top = y * scale;
      const right = (x + 1) * scale;
      const bottom = (y + 1) * scale;
      let red = 0,
        green = 0,
        blue = 0,
        alpha = 0;
      for (let sy = Math.floor(top); sy < Math.min(source.height, Math.ceil(bottom)); sy++)
        for (let sx = Math.floor(left); sx < Math.min(source.width, Math.ceil(right)); sx++) {
          const weight =
            (Math.min(right, sx + 1) - Math.max(left, sx)) *
            (Math.min(bottom, sy + 1) - Math.max(top, sy));
          const at = (sy * source.width + sx) * 4;
          const a = source.data[at + 3]! * weight;
          alpha += a;
          red += source.data[at]! * a;
          green += source.data[at + 1]! * a;
          blue += source.data[at + 2]! * a;
        }
      const at = (y * size + x) * 4;
      result.data[at] = alpha ? Math.round(red / alpha) : 0;
      result.data[at + 1] = alpha ? Math.round(green / alpha) : 0;
      result.data[at + 2] = alpha ? Math.round(blue / alpha) : 0;
      result.data[at + 3] = Math.round(alpha / (scale * scale));
    }
  return result;
}

function bitmap(image: PNG): Buffer {
  const size = image.width;
  const pixelBytes = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const result = Buffer.alloc(40 + pixelBytes + maskStride * size);
  result.writeUInt32LE(40);
  result.writeInt32LE(size, 4);
  result.writeInt32LE(size * 2, 8);
  result.writeUInt16LE(1, 12);
  result.writeUInt16LE(32, 14);
  result.writeUInt32LE(pixelBytes, 20);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const input = (y * size + x) * 4;
      const row = size - y - 1;
      const output = 40 + (row * size + x) * 4;
      result[output] = image.data[input + 2]!;
      result[output + 1] = image.data[input + 1]!;
      result[output + 2] = image.data[input]!;
      result[output + 3] = image.data[input + 3]!;
      if (!image.data[input + 3]) {
        const mask = 40 + pixelBytes + row * maskStride + (x >> 3);
        result[mask] = result[mask]! | (0x80 >> (x % 8));
      }
    }
  return result;
}

export function createWindowsIco(png: Buffer): Buffer {
  const source = PNG.sync.read(png);
  if (source.width !== source.height) throw new Error('图标源图必须为正方形 PNG');
  const ico = new Data.IconFile();
  ico.icons = WINDOWS_ICON_SIZES.map((size) => {
    const image = resize(source, size);
    return {
      width: size,
      height: size,
      planes: 1,
      bitCount: 32,
      data:
        size === 256
          ? Data.RawIconItem.from(PNG.sync.write(image), size, size, 32)
          : Data.IconItem.from(size, size, bitmap(image)),
    };
  });
  return Buffer.from(ico.generate());
}
