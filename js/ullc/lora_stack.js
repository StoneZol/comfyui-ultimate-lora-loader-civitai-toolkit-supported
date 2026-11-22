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
 * Replace entry at `idx`: remove it, drop any other copies of `loraPath`,
 * append one row at the end (keeps enabled/strengths from the removed row).
 * Returns the new entry, or null if no-op.
 */
export function replaceEntryToEnd(entries, idx, loraPath) {
  if (!Array.isArray(entries) || idx < 0 || idx >= entries.length || !loraPath) {
    return null;
  }
  const removed = entries[idx];
  const key = normLoraPath(loraPath);

  entries.splice(idx, 1);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (normLoraPath(entries[i]?.lora) === key) entries.splice(i, 1);
  }

  const next = {
    lora: loraPath,
    enabled: removed?.enabled !== false,
    strengthModel: Number(removed?.strengthModel ?? removed?.strength ?? 1) || 0,
    strengthClip: Number(removed?.strengthClip ?? removed?.strength ?? 1) || 0,
  };
  entries.push(next);
  return next;
}

/**
 * Push entry only if its path is not already in the stack.
 * Returns true when added.
 */
export function addEntryUnique(entries, entry) {
  if (!Array.isArray(entries) || !entry?.lora) return false;
  if (indexOfLora(entries, entry.lora) >= 0) return false;
  entries.push(entry);
  return true;
}
