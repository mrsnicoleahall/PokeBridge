// Normalize a save file as it arrives from various sources into the raw battery image the parsers
// expect. Currently strips the DeSmuME footer (.dsv/.dst): emulators append a 122-byte footer that
// ends with the magic "|-DESMUME SAVE-|". On a real cartridge / nds-bootstrap the save is already raw.

const DESMUME_MAGIC = '|-DESMUME SAVE-|';
const DESMUME_FOOTER_LEN = 0x7a; // 122 bytes

export function normalizeSave(bytes: Uint8Array): Uint8Array {
  const magic = new TextEncoder().encode(DESMUME_MAGIC);
  if (bytes.length > DESMUME_FOOTER_LEN) {
    const tail = bytes.subarray(bytes.length - magic.length);
    let isDesmume = true;
    for (let i = 0; i < magic.length; i++) {
      if (tail[i] !== magic[i]) { isDesmume = false; break; }
    }
    if (isDesmume) return bytes.slice(0, bytes.length - DESMUME_FOOTER_LEN);
  }
  return bytes;
}
