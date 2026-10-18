/**
 * PWA configuration (`pwa.config.ts`): installable manifest (name, German description, standalone, icons that exist
 * with the declared sizes, colours from the design tokens) and the precache globs of the offline requirements.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRECACHE_GLOBS, PWA_BACKGROUND, pwaOptions, tokenColor } from '../../../pwa.config';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('pwa manifest', () => {
  const manifest = pwaOptions.manifest;
  if (!manifest) throw new Error('manifest missing');

  it('is installable: name, German description, standalone, start URL and scope', () => {
    expect(manifest.name).toBe('Zugzwang');
    expect(manifest.short_name).toBe('Zugzwang');
    expect(manifest.lang).toBe('de');
    expect(manifest.description).toMatch(/Schach lernen/);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('declares 192, 512 and maskable icons that exist with these sizes', () => {
    const icons = manifest.icons ?? [];
    const wanted = [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ];
    for (const [sizes, purpose] of wanted) {
      const icon = icons.find((i) => i.sizes === sizes && i.purpose === purpose);
      expect(icon, `${sizes} ${purpose}`).toBeDefined();
      const [w, h] = sizes!.split('x').map(Number);
      expect(pngSize(`${root}public${icon!.src}`)).toEqual({ width: w, height: h });
    }
  });

  it('takes theme and background colour from the design tokens', () => {
    const tokens = readFileSync(`${root}src/styles/tokens.css`, 'utf8');
    expect(PWA_BACKGROUND).toBe(tokenColor('--zz-bg', 'x', tokens));
    expect(PWA_BACKGROUND).toMatch(/^#[0-9A-F]{6}$/i);
    expect(manifest.theme_color).toBe(PWA_BACKGROUND);
    expect(manifest.background_color).toBe(PWA_BACKGROUND);
    expect(tokenColor('--zz-missing', '#000000', tokens)).toBe('#000000');
  });

  it('precaches the app shell, the engine, the puzzle bank and lesson chunks; registers with an update prompt', () => {
    expect(PRECACHE_GLOBS).toEqual(expect.arrayContaining(['**/*.{js,css,html,woff2}', 'engine/*.{js,wasm}', 'data/puzzles/**/*.json']));
    expect(pwaOptions.workbox?.navigateFallback).toBe('index.html');
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.devOptions?.enabled).toBe(false);
  });
});
