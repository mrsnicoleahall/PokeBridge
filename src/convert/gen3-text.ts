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

/** Inverse of gen3Char for the alphanumeric + space range names use. Unknown chars map to space. */
function gen3Code(ch: string): number {
  const c = ch.charCodeAt(0);
  if (ch === ' ') return 0x00;
  if (c >= 48 && c <= 57) return 0xa1 + (c - 48); // 0-9
  if (c >= 65 && c <= 90) return 0xbb + (c - 65); // A-Z
  if (c >= 97 && c <= 122) return 0xd5 + (c - 97); // a-z
  return 0x00; // unsupported symbol → space
}

/** Encode a string to a fixed-width Gen 3 name field (0xFF-terminated/padded). */
export function encodeGen3Text(text: string, maxLen: number): Uint8Array {
  const out = new Uint8Array(maxLen).fill(0xff);
  let i = 0;
  for (const ch of text) {
    if (i >= maxLen) break;
    out[i++] = gen3Code(ch);
  }
  return out;
}
