// Decode Gen 1/2 (Western) in-game text. 0x50 terminates. Covers the alphanumeric + space range
// that names use; other symbols are dropped.

function gbChar(code: number): string {
  if (code === 0x7f) return ' ';
  if (code >= 0x80 && code <= 0x99) return String.fromCharCode(65 + (code - 0x80)); // A-Z
  if (code >= 0xa0 && code <= 0xb9) return String.fromCharCode(97 + (code - 0xa0)); // a-z
  if (code >= 0xf6 && code <= 0xff) return String.fromCharCode(48 + (code - 0xf6)); // 0-9
  return '';
}

export function decodeGbText(bytes: Uint8Array, start: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = bytes[start + i];
    if (c === undefined || c === 0x50) break;
    s += gbChar(c);
  }
  return s.replace(/\s+$/, '');
}
