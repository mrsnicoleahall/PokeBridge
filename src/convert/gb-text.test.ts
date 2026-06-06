import { describe, it, expect } from 'vitest';
import { decodeGbText } from './gb-text';

// Gen 1/2 charset: 0x80-0x99=A-Z, 0xA0-0xB9=a-z, 0xF6-0xFF=0-9, 0x7F=space, 0x50=terminator.
describe('Gen 1/2 text decoding', () => {
  it('decodes uppercase up to the 0x50 terminator (verified against a real RoC PK1)', () => {
    const bytes = new Uint8Array([0x81, 0x94, 0x8b, 0x81, 0x80, 0x92, 0x80, 0x94, 0x91, 0x50]);
    expect(decodeGbText(bytes, 0, 11)).toBe('BULBASAUR');
  });

  it('handles lowercase, space, and digits', () => {
    // "Mr 2": M=0x8C r=0xB1 space=0x7F 2=0xF8
    expect(decodeGbText(new Uint8Array([0x8c, 0xb1, 0x7f, 0xf8, 0x50]), 0, 11)).toBe('Mr 2');
  });
});
