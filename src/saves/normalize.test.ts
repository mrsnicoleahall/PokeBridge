import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeSave } from './normalize';
import { loadGen5 } from './gen5';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('save input normalizer (emulator footers)', () => {
  it('strips the 122-byte DeSmuME footer down to a valid raw 512KB save', () => {
    const norm = normalizeSave(fixture('b2w2.dst')); // 524410 = 512KB + 122-byte footer
    expect(norm.length).toBe(0x80000);
    // a valid save: recomputing its box checksums is a no-op (matches stored)
    const save = loadGen5(norm);
    save.recomputeAllBoxChecksums();
    expect(Buffer.from(save.toBytes()).equals(Buffer.from(norm))).toBe(true);
  });

  it('leaves a raw save untouched', () => {
    const raw = fixture('b2w2.sav');
    const norm = normalizeSave(raw);
    expect(norm.length).toBe(raw.length);
    expect(Buffer.from(norm).equals(Buffer.from(raw))).toBe(true);
  });

  it('leaves a raw Gen 3 (128KB) save untouched', () => {
    expect(normalizeSave(fixture('emerald.sav')).length).toBe(131072);
  });
});
