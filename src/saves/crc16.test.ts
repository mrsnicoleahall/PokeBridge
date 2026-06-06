import { describe, it, expect } from 'vitest';
import { crc16ccitt, crc16x25 } from './crc16';

// Gen 4/5 save blocks are protected by CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection).
describe('CRC-16/CCITT-FALSE', () => {
  it('produces the canonical check value 0x29B1 for "123456789"', () => {
    expect(crc16ccitt(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });

  it('returns the seed (0xFFFF) for empty input', () => {
    expect(crc16ccitt(new Uint8Array(0))).toBe(0xffff);
  });

  it('CRC-16/X-25 (Gen 7) produces the canonical check value 0x906E for "123456789"', () => {
    expect(crc16x25(new TextEncoder().encode('123456789'))).toBe(0x906e);
  });

  it('stays within 16 bits', () => {
    const data = new Uint8Array(1000).map((_, i) => (i * 37) & 0xff);
    const crc = crc16ccitt(data);
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xffff);
  });
});
