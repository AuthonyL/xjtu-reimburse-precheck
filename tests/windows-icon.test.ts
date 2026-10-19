import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { Data } from 'resedit';
import { createWindowsIco } from '../scripts/lib/windows-ico.js';
import { generateIcon } from '../scripts/generate-icon.js';

function syntheticPng() {
  const png = new PNG({ width: 256, height: 256 });
  for (let n = 0; n < png.data.length; n += 4) {
    png.data[n] = 20;
    png.data[n + 1] = 120;
    png.data[n + 2] = 60;
    png.data[n + 3] = n === 0 ? 0 : 255;
  }
  return PNG.sync.write(png);
}

it('ICO包含七个要求尺寸，小尺寸为32位DIB，256像素保留PNG及透明通道', () => {
  const source = syntheticPng();
  const ico = Data.IconFile.from(createWindowsIco(source));
  expect(ico.icons.map((i) => [i.width || 256, i.height || 256])).toEqual(
    [16, 24, 32, 48, 64, 128, 256].map((s) => [s, s]),
  );
  for (const icon of ico.icons.slice(0, -1)) {
    expect(icon.data.isIcon()).toBe(true);
    if (icon.data.isIcon()) expect(icon.data.bitmapInfo.bitCount).toBe(32);
  }
  const largest = ico.icons.at(-1)!.data;
  expect(largest.isRaw()).toBe(true);
  if (largest.isRaw())
    expect(PNG.sync.read(Buffer.from(largest.bin)).data).toEqual(PNG.sync.read(source).data);
});

it('图标命令以已有PNG为唯一输入，不重写Mac使用的源图', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'precheck-ico-'));
  try {
    const source = syntheticPng();
    await writeFile(join(directory, 'icon.png'), source);
    await generateIcon(directory);
    expect(await readFile(join(directory, 'icon.png'))).toEqual(source);
    expect(Data.IconFile.from(await readFile(join(directory, 'icon.ico'))).icons).toHaveLength(7);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
