/** Unique-by-path LoRA stack helpers (one file = one slot). */

export function normLoraPath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

export function indexOfLora(entries, loraPath) {
  const key = normLoraPath(loraPath);
  if (!key) return -1;
  return (entries || []).findIndex((e) => normLoraPath(e?.lora) === key);
}

/**
 * Replace entry at `idx` in place (keeps stack position).
 * Drops any other copies of `loraPath`. Keeps enabled / strengths from the slot.
 * Returns the updated entry, or null if no-op.
 */
export function replaceEntryAt(entries, idx, loraPath) {
  if (!Array.isArray(entries) || idx < 0 || idx >= entries.length || !loraPath) {
    return null;
  }
  const key = normLoraPath(loraPath);
  const cur = entries[idx];
  if (normLoraPath(cur?.lora) === key) return null;

  // Remove other slots that already hold this path (idx stays stable if we go high→low).
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (i === idx) continue;
    if (normLoraPath(entries[i]?.lora) === key) {
      entries.splice(i, 1);
      if (i < idx) idx -= 1;
    }
  }

  const next = {
    lora: loraPath,
    enabled: cur?.enabled !== false,
    strengthModel: Number(cur?.strengthModel ?? cur?.strength ?? 1) || 0,
    strengthClip: Number(cur?.strengthClip ?? cur?.strength ?? 1) || 0,
  };
  // Drop stale Toolkit display fields — re-seed from cache on next paint.
  entries[idx] = next;
  return next;
}

/** @deprecated use replaceEntryAt — kept as alias for older call sites */
export const replaceEntryToEnd = replaceEntryAt;

/**
 * Add LoRA: new → append at end.
 * Duplicate path → enable if off, always move that slot to the end (no second copy).
 * Returns { entry, added } or null.
 */
export function addOrBumpEntry(entries, entry) {
  if (!Array.isArray(entries) || !entry?.lora) return null;

  const existingIdx = indexOfLora(entries, entry.lora);
  if (existingIdx < 0) {
    entries.push(entry);
    return { entry, added: true };
  }

  const [existing] = entries.splice(existingIdx, 1);
  existing.enabled = true;
  // Prefer kept strengths; refresh path string in case separators differ.
  existing.lora = entry.lora;
  entries.push(existing);
  return { entry: existing, added: false };
}

/**
 * Push only if path is missing. Prefer addOrBumpEntry for Add Lora UX.
 * Returns true when added.
 */
export function addEntryUnique(entries, entry) {
  const result = addOrBumpEntry(entries, entry);
  return Boolean(result?.added);
}
