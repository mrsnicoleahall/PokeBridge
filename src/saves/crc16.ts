// CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, MSB-first, no reflection, no final xor.
// Used to protect Gen 4/5 save blocks.

export function crc16ccitt(data: Uint8Array, seed = 0xffff): number {
  let crc = seed;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc & 0xffff;
}

// CRC-16/X-25 (reflected poly 0x8408, init 0xFFFF, reflected, final XOR 0xFFFF) — PKHeX's "CRC16Invert",
// used to protect Gen 7 (SM/USUM) save blocks.
const X25_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? ((c >>> 1) ^ 0x8408) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

export function crc16x25(data: Uint8Array, start = 0, len = data.length - start): number {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) crc = (crc >>> 8) ^ X25_TABLE[(crc ^ data[start + i]!) & 0xff]!;
  return (~crc) & 0xffff;
}
