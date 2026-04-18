/**
 * Cycle order for new categories (from Styles.md):
 * vermillion → amber → teal → cobalt → hotpink → citrus → navy → blush → crimson → periwinkle → espresso
 */
const CAT_COLORS = [
  "cat-vermillion",
  "cat-amber",
  "cat-teal",
  "cat-cobalt",
  "cat-hotpink",
  "cat-citrus",
  "cat-navy",
  "cat-blush",
  "cat-crimson",
  "cat-periwinkle",
  "cat-espresso",
];

/** Deterministically map a tag name to one of 11 category color classes. */
export function tagToColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return CAT_COLORS[hash % CAT_COLORS.length];
}
