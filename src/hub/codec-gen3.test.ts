import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen3 } from '../saves/gen3';
import { gen3ReadMon, gen3WriteMon } from './codec-gen3';
import { gen3InternalToNational, nationalToGen3Internal } from '../convert/gen3-species';
import { decodeGen3Text, encodeGen3Text } from '../convert/gen3-text';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));
const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

describe('Gen 3 inverse helpers', () => {
  it('national↔internal species map round-trips', () => {
    for (const n of [1, 151, 251, 252, 300, 386]) {
      expect(gen3InternalToNational(nationalToGen3Internal(n))).toBe(n);
    }
    expect(nationalToGen3Internal(387)).toBe(0); // not in Gen 3
  });

  it('text encode∘decode round-trips a name', () => {
    const bytes = encodeGen3Text('PIKA', 10);
    expect(decodeGen3Text(bytes, 0, 10)).toBe('PIKA');
  });
});

describe('Gen 3 ⇄ Mon codec', () => {
  it('reads a real Emerald mon into the hub and writes it back, preserving carried fields', () => {
    const src = loadGen3(fixture('emerald.sav')).allBoxMon()[0]!.data; // decrypted PK3
    const mon = gen3ReadMon(src);
    const out = gen3WriteMon(mon);
    const a = dv(src);
    const b = dv(out);

    expect(b.getUint32(0x00, true)).toBe(a.getUint32(0x00, true)); // PID
    expect(b.getUint32(0x04, true)).toBe(a.getUint32(0x04, true)); // OT ID
    expect(b.getUint16(0x20, true)).toBe(a.getUint16(0x20, true)); // internal species
    expect(b.getUint32(0x24, true)).toBe(a.getUint32(0x24, true)); // exp
    expect(out[0x29]).toBe(src[0x29]); // friendship
    for (let i = 0; i < 4; i++) expect(b.getUint16(0x2c + i * 2, true)).toBe(a.getUint16(0x2c + i * 2, true)); // moves
    for (let i = 0; i < 4; i++) expect(out[0x34 + i]).toBe(src[0x34 + i]); // current PP
    expect(out[0x28]).toBe(src[0x28]); // PP-ups
    expect(Array.from(out.slice(0x38, 0x3e))).toEqual(Array.from(src.slice(0x38, 0x3e))); // EVs
    expect(b.getUint32(0x48, true)).toBe(a.getUint32(0x48, true)); // IV dword + ability bit (egg bit 0)
    expect(decodeGen3Text(out, 0x08, 10)).toBe(decodeGen3Text(src, 0x08, 10)); // nickname
    expect(decodeGen3Text(out, 0x14, 7)).toBe(decodeGen3Text(src, 0x14, 7)); // OT name
  });

  it('hub round-trip survives a full save write→reload', () => {
    const save = loadGen3(fixture('emerald.sav'));
    const original = save.allBoxMon()[0]!;
    const mon = gen3ReadMon(original.data);
    save.setBoxSlot(13, 27, gen3WriteMon(mon)); // park it in an out-of-the-way slot
    const back = loadGen3(save.toBytes());
    const reread = back.boxSlot(13, 27)!;
    expect(reread).not.toBeNull();
    const monBack = gen3ReadMon(reread);
    expect(monBack.nationalDex).toBe(mon.nationalDex);
    expect(monBack.pid).toBe(mon.pid);
    expect(monBack.ivs).toEqual(mon.ivs);
    expect(monBack.moves).toEqual(mon.moves);
    expect(monBack.nickname).toBe(mon.nickname);
  });
});
