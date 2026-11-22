import {
  clearEntryDisplay,
  prefetchCivitaiMeta,
  seedEntryDisplay,
  syncEntryDisplayFromMeta,
  getCachedLoraMeta,
  displayFieldsFromEntry,
} from "./civitai_toolkit_info.js";
import {
  fetchLoraTree,
  healMissingLoraPaths,
  isLoraMissing,
} from "./lora_tree.js";

function cloneEntry(entry) {
  return {
    lora: String(entry?.lora || ""),
    enabled: entry?.enabled !== false,
    strengthModel: Number(entry?.strengthModel ?? entry?.strength ?? 1) || 0,
    strengthClip: Number(entry?.strengthClip ?? entry?.strength ?? 1) || 0,
    ...(entry?.civitaiName ? { civitaiName: String(entry.civitaiName) } : {}),
    ...(entry?.coverPath ? { coverPath: String(entry.coverPath) } : {}),
    ...(entry?.baseModel ? { baseModel: String(entry.baseModel) } : {}),
  };
}

export function cloneEntries(entries) {
  return (entries || []).map(cloneEntry).filter((e) => e.lora);
}

function normPath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

/**
 * Heal moved paths + refresh Toolkit display fields onto a cloned entry list.
 * Returns { entries, healed, enriched, changedFlags } where changedFlags[i]
 * is true when path/name/cover differed from the original snapshot.
 */
export async function enrichPresetEntries(rawEntries, { warm = true } = {}) {
  const originals = cloneEntries(rawEntries);
  const entries = cloneEntries(rawEntries);

  await fetchLoraTree();
  if (warm) await prefetchCivitaiMeta();

  const healed = healMissingLoraPaths(entries);
  for (const entry of healed) {
    clearEntryDisplay(entry);
    seedEntryDisplay(entry);
  }

  let enriched = 0;
  for (const entry of entries) {
    if (!entry.lora) continue;
    const meta = getCachedLoraMeta(entry.lora);
    if (!meta) {
      // Still try seed (no-op if cold/missing)
      if (seedEntryDisplay(entry)) enriched += 1;
      continue;
    }
    if (syncEntryDisplayFromMeta(entry, meta)) enriched += 1;
  }

  const changedFlags = entries.map((entry, i) => {
    const prev = originals[i] || {};
    if (normPath(prev.lora) !== normPath(entry.lora)) return true;
    const a = displayFieldsFromEntry(prev);
    const b = displayFieldsFromEntry(entry);
    return (
      a.civitaiName !== b.civitaiName ||
      a.coverPath !== b.coverPath ||
      a.baseModel !== b.baseModel
    );
  });

  return {
    entries,
    healedCount: healed.length,
    enrichedCount: enriched,
    changedFlags,
    missingFlags: entries.map((e) => isLoraMissing(e.lora)),
  };
}

/**
 * Snapshot ready to persist into SQLite (after Toolkit enrich).
 * When skipDisabled is true, disabled rows are dropped before save.
 */
export async function prepareEntriesForSave(rawEntries, { skipDisabled = false } = {}) {
  const source = skipDisabled
    ? (rawEntries || []).filter((e) => e?.enabled !== false)
    : rawEntries;
  const { entries } = await enrichPresetEntries(source);
  return entries;
}

/**
 * Merge preset entries into current stack, skipping duplicate lora paths.
 * Returns { entries, added, skipped }.
 */
export function mergeEntriesSkipDupes(current, incoming) {
  const out = cloneEntries(current);
  const seen = new Set(out.map((e) => normPath(e.lora)));
  let added = 0;
  let skipped = 0;
  for (const entry of cloneEntries(incoming)) {
    const key = normPath(entry.lora);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    out.push(entry);
    added += 1;
  }
  return { entries: out, added, skipped };
}
