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
