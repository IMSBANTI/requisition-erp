const HIERARCHY_PREFIX_RE = /^(Executive|KAM|Manager|Director|MD)(\s*,\s*.*)?$/i;

/**
 * Synchronizes seeded or standard "<Level>, <Dept>" designations when a user's
 * hierarchy levelLabel (e.g. "Executive" -> "KAM") changes, while preserving
 * custom titles such as "Sr. Manager, Information & Transformation".
 */
export function syncDesignationWithLevel(
  designation: string | null | undefined,
  levelLabel: string | null | undefined
): string {
  const raw = (designation || "").trim();
  const lvl = (levelLabel || "").trim();
  if (!lvl) return raw;
  if (!raw) return lvl;
  const match = raw.match(HIERARCHY_PREFIX_RE);
  if (!match) return raw;
  const suffix = match[2] || "";
  return `${lvl}${suffix}`;
}
