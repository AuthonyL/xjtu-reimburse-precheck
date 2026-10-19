import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { createWindowsIco } from './lib/windows-ico.js';

type Point = [number, number];
const polygon = (x: number, y: number, points: Point[]) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
};
const rounded = (
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
) =>
  Math.hypot(
    x - Math.max(left + radius, Math.min(left + width - radius, x)),
    y - Math.max(top + radius, Math.min(top + height - radius, y)),
  ) <= radius;
const stroke = (x: number, y: number, a: Point, b: Point, width: number) => {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) /
        ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2),
    ),
  );
  return Math.hypot(x - a[0] - t * (b[0] - a[0]), y - a[1] - t * (b[1] - a[1])) <= width / 2;
};
const paper: Point[] = [
  [250, 170],
  [600, 170],
  [762, 332],
  [762, 838],
  [250, 838],
];
const fold: Point[] = [
  [600, 170],
  [600, 332],
  [762, 332],
];
function pixel(x: number, y: number): number[] {
  if (!rounded(x, y, 32, 32, 960, 960, 210)) return [0, 0, 0, 0];
  let color = [22, 84, 62, 255];
  if (polygon(x, y, paper)) color = [249, 253, 247, 255];
  if (polygon(x, y, fold)) color = [179, 214, 190, 255];
  if ([390, 478, 566].some((top) => rounded(x, y, 320, top, top === 566 ? 160 : 280, 26, 13)))
    color = [159, 185, 165, 255];
  const badge = Math.hypot(x - 697, y - 714);
  if (badge < 190) color = [249, 253, 247, 255];
  if (badge < 169) color = [35, 113, 77, 255];
  if (stroke(x, y, [608, 708], [675, 771], 44) || stroke(x, y, [675, 771], [793, 645], 44))
    color = [255, 255, 255, 255];
  return color;
}
function chunk(type: string, data: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length);
  header.write(type, 4);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([header, data, check]);
}
async function generateDefaultIcon(directory: string) {
  const size = 1024;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const colors = [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ].map(([dx, dy]) => pixel(x + dx!, y + dy!));
      for (let c = 0; c < 4; c++)
        raw[y * (size * 4 + 1) + 1 + x * 4 + c] = Math.round(
          colors.reduce((sum, color) => sum + color[c]!, 0) / 4,
        );
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'icon.png');
  await writeFile(file, png);
  console.log('已生成 1024px 图标：' + file);
}

export async function generateIcon(directory = 'build') {
  const pngFile = join(directory, 'icon.png');
  try {
    await readFile(pngFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await generateDefaultIcon(directory);
  }
  const icoFile = join(directory, 'icon.ico');
  await writeFile(icoFile, createWindowsIco(await readFile(pngFile)));
  console.log('已从现有 PNG 生成 Windows 多尺寸图标：' + icoFile);
}

if (process.argv[1]?.endsWith('generate-icon.ts')) await generateIcon();
