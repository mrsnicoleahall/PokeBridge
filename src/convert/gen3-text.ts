// Decode Gen 3 (Western) in-game text to a JS string. Covers the alphanumeric + space range that
// names use; unmapped symbols are dropped. 0xFF terminates.

function gen3Char(code: number): string {
  if (code === 0x00) return ' ';
  if (code >= 0xa1 && code <= 0xaa) return String.fromCharCode(48 + (code - 0xa1)); // 0-9
  if (code >= 0xbb && code <= 0xd4) return String.fromCharCode(65 + (code - 0xbb)); // A-Z
  if (code >= 0xd5 && code <= 0xee) return String.fromCharCode(97 + (code - 0xd5)); // a-z
  return ''; // punctuation/symbols not needed for display
}

export function decodeGen3Text(bytes: Uint8Array, start: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = bytes[start + i];
    if (c === undefined || c === 0xff) break;
    s += gen3Char(c);
  }
  return s.replace(/\s+$/, '');
}
