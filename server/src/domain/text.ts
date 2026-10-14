/**
 * Search-friendly form of a name (FR-06): lowercase, no diacritics (đ → dj),
 * collapsed whitespace, trimmed. 'Đorđević' → 'djordjevic', 'Saša' → 'sasa'.
 */
export function normalizeName(s: string): string {
  return s
    .replace(/[Đđ]/g, 'dj')
    .replace(/[Ææ]/g, 'ae')
    .replace(/[Øø]/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/[Łł]/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
