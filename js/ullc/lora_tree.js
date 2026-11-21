import { api } from "../../../scripts/api.js";
import { getConfig } from "./config.js";

// Lora tree fetch (cached per session, refetch on popup open if stale)

let _treeCache = null;
let _treeCacheTime = 0;
const TREE_CACHE_MS = 15000; // refresh at most every 15s so new files show up reasonably fast

// Flat set of every valid lora path the backend reports (the exact strings
// get_filename_list("loras") returns, which is what an entry's `lora` field
// stores). Stays null until the first successful tree fetch so we never flag
// rows as "missing" before we actually know what's on disk.
let validLoraPaths = null;

// basename (lower) → array of exact relative paths from the tree.
// Used to auto-heal entries whose file was moved to another folder.
let loraPathsByBasename = null;

function _normLora(p) {
  // Normalize separators so a workflow saved on one OS doesn't read as
  // "missing" on another; the flag is purely cosmetic so being lenient here
  // only ever avoids false positives.
  return String(p).replace(/\\/g, "/");
}

function _basename(p) {
  const n = _normLora(p);
  const i = n.lastIndexOf("/");
  return (i >= 0 ? n.slice(i + 1) : n).toLowerCase();
}

// Walk the nested tree collecting every value in every __full_paths__ map -
// those values are the full relative paths, i.e. the source of truth for
// what's installed. Rebuilt on each tree fetch so added/removed files show up.
function _rebuildValidLoraPaths(tree) {
  const set = new Set();
  const byBase = new Map();
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    const fp = node.__full_paths__;
    if (fp) {
      for (const k in fp) {
        const full = fp[k];
        const norm = _normLora(full);
        set.add(norm);
        // Keep the original string too — Comfy may use `\` on Windows and
        // entry.lora must match get_filename_list exactly for load.
        const base = _basename(full);
        if (!byBase.has(base)) byBase.set(base, []);
        const list = byBase.get(base);
        if (!list.some((p) => _normLora(p) === norm)) list.push(full);
      }
    }
    for (const key in node) {
      if (key === "__files__" || key === "__full_paths__") continue;
      walk(node[key]);
    }
  })(tree);
  validLoraPaths = set;
  loraPathsByBasename = byBase;
}

// True only when we have a loaded list AND this lora isn't in it. Unknown
// (list not loaded yet / fetch failed) -> false, so we fail safe toward
// "not missing" rather than lighting up every row red on a transient hiccup.
export function isLoraMissing(loraName) {
  if (!validLoraPaths || !loraName) return false;
  return !validLoraPaths.has(_normLora(loraName));
}

/**
 * If `loraPath` is missing but exactly one file with the same basename
 * exists under loras/, return that path (moved file). Ambiguous or gone → null.
 * If the original path still exists, return it unchanged.
 */
export function resolveLoraPath(loraPath) {
  if (!loraPath || !validLoraPaths || !loraPathsByBasename) return null;
  const norm = _normLora(loraPath);
  if (validLoraPaths.has(norm)) return loraPath;

  const matches = loraPathsByBasename.get(_basename(loraPath)) || [];
  if (matches.length === 1) return matches[0];
  return null;
}

/**
 * Auto-heal stack entries whose files were moved within the loras tree.
 * Updates entry.lora in place when a unique basename match is found.
 * Returns the list of healed entries (may be empty).
 */
export function healMissingLoraPaths(entries) {
  if (!Array.isArray(entries) || !validLoraPaths) return [];
  const healed = [];
  for (const entry of entries) {
    if (!entry?.lora) continue;
    if (!isLoraMissing(entry.lora)) continue;
    const resolved = resolveLoraPath(entry.lora);
    if (!resolved || _normLora(resolved) === _normLora(entry.lora)) continue;
    entry.lora = resolved;
    healed.push(entry);
  }
  return healed;
}

export async function fetchLoraTree(force = false) {
  const now = Date.now();
  if (!force && _treeCache && now - _treeCacheTime < TREE_CACHE_MS) {
    return _treeCache;
  }
  const { api_prefix, log_prefix } = getConfig();
  try {
    const res = await api.fetchApi(`${api_prefix}/tree`);
    const data = await res.json();
    _treeCache = data;
    _treeCacheTime = now;
    _rebuildValidLoraPaths(data);
    return data;
  } catch (e) {
    console.error(`${log_prefix} Failed to fetch lora tree`, e);
    return _treeCache || { __files__: [] };
  }
}
