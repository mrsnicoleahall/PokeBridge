import { describe, it, expect } from 'vitest';
import { PK5_SIZE, pk5Checksum, encryptPk5, decryptPk5, readSpecies, isEmptySlot } from './pk5';

/** Build a synthetic *decrypted* 136-byte PK5 with a given PID and recognizable block data. */
function makeDecrypted(pid: number): Uint8Array {
  const buf = new Uint8Array(PK5_SIZE);
  new DataView(buf.buffer).setUint32(0x00, pid >>> 0, true); // PID at 0x00
  for (let i = 0x08; i < 0x88; i++) buf[i] = (i * 7 + 3) & 0xff; // block data
  return buf;
}

describe('PK5 codec', () => {
  it('checksum is the 16-bit word sum of the four data blocks (0x08–0x87)', () => {
    const buf = makeDecrypted(0x12345678);
    const dv = new DataView(buf.buffer);
    let sum = 0;
    for (let off = 0x08; off < 0x88; off += 2) sum = (sum + dv.getUint16(off, true)) & 0xffff;
    expect(pk5Checksum(buf)).toBe(sum);
  });

  it('encrypt then decrypt round-trips to byte-identical decrypted data', () => {
    const dec = makeDecrypted(0x0000abcd);
    const back = decryptPk5(encryptPk5(dec));
    expect(Array.from(back.slice(0, 4))).toEqual(Array.from(dec.slice(0, 4)));       // PID header
    expect(Array.from(back.slice(0x08, 0x88))).toEqual(Array.from(dec.slice(0x08, 0x88))); // blocks
  });

  it('round-trips correctly across many PIDs (every shuffle ordering exercised)', () => {
    for (let sv = 0; sv < 24; sv++) {
      const dec = makeDecrypted((sv << 13) | 0xa1);
      const back = decryptPk5(encryptPk5(dec));
      expect(Array.from(back.slice(0x08, 0x88))).toEqual(Array.from(dec.slice(0x08, 0x88)));
    }
  });

  it('actually encrypts: ciphertext block region differs from plaintext', () => {
    const dec = makeDecrypted(0x0000abcd);
    const enc = encryptPk5(dec);
    expect(Array.from(enc.slice(0x08, 0x88))).not.toEqual(Array.from(dec.slice(0x08, 0x88)));
  });

  it('writes the recomputed checksum into the 0x06 header field', () => {
    const dec = makeDecrypted(0x11112222);
    const enc = encryptPk5(dec);
    expect(new DataView(enc.buffer, enc.byteOffset).getUint16(0x06, true)).toBe(pk5Checksum(dec));
  });

  it('readSpecies returns the national dex id from offset 0x08 of decrypted data', () => {
    const dec = new Uint8Array(PK5_SIZE);
    new DataView(dec.buffer).setUint16(0x08, 646, true); // Kyurem
    expect(readSpecies(dec)).toBe(646);
  });

  it('isEmptySlot is true for an all-zero slot and false for a real mon', () => {
    expect(isEmptySlot(new Uint8Array(PK5_SIZE))).toBe(true);
    const dec = new Uint8Array(PK5_SIZE);
    new DataView(dec.buffer).setUint16(0x08, 500, true); // Emboar
    expect(isEmptySlot(encryptPk5(dec))).toBe(false);
  });
});
