import { describe, it, expect } from 'vitest';
import { decodeGen3Text } from './gen3-text';

// Gen 3 Western charset: 0xBB='A'.. , 0xD5='a'.., 0xA1='0'.., 0x00=space, 0xFF=terminator
const enc = (s: string): number[] => {
  const out: number[] = [];
  for (const ch of s) {
    if (ch === ' ') out.push(0x00);
    else if (ch >= '0' && ch <= '9') out.push(0xa1 + (ch.charCodeAt(0) - 48));
    else if (ch >= 'A' && ch <= 'Z') out.push(0xbb + (ch.charCodeAt(0) - 65));
    else if (ch >= 'a' && ch <= 'z') out.push(0xd5 + (ch.charCodeAt(0) - 97));
  }
  out.push(0xff);
  return out;
};

describe('Gen 3 text decoding', () => {
  it('decodes uppercase, lowercase, and digits', () => {
    const bytes = new Uint8Array(enc('PIKA'));
    expect(decodeGen3Text(bytes, 0, 10)).toBe('PIKA');
    expect(decodeGen3Text(new Uint8Array(enc('Mew2')), 0, 10)).toBe('Mew2');
  });

  it('stops at the 0xFF terminator', () => {
    const bytes = new Uint8Array([...enc('AB'), 0xbb, 0xbb]); // junk after terminator ignored
    expect(decodeGen3Text(bytes, 0, 10)).toBe('AB');
  });
});
