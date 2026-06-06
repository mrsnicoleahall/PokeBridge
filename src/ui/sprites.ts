// Gen 5 (Black/White) sprites by National Dex id, with a fallback to the default artwork set.
const BW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white';
const DEFAULT = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const spriteUrl = (dex: number): string => `${BW}/${dex}.png`;
export const spriteFallbackUrl = (dex: number): string => `${DEFAULT}/${dex}.png`;
