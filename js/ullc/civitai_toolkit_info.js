import { api } from "../../../scripts/api.js";

// Civitai Toolkit model info (soft dependency on /civitai_utils/*)
//
// Performance notes:
// - One shared in-flight fetch (no N parallel /get_local_models from N rows).
// - After fetch, build path/basename → model maps for O(1) lookup.
// - Slim display fields also live in a long-lived Map so re-renders /
//   new rows can paint names + cover URLs synchronously.

let _civitaiModelsCache = null;
let _civitaiModelsCacheTime = 0;
let _fetchPromise = null;
const CIVITAI_MODELS_CACHE_MS = 5 * 60 * 1000; // 5 min — Toolkit index rarely changes mid-session

/** @type {Map<string, object>} full/relative path → model */
let _metaByPath = new Map();
/** @type {Map<string, object>} basename → model (ambiguous fallback) */
let _metaByBasename = new Map();
/** @type {Set<() => void>} listeners notified when the index is rebuilt */
const _readyListeners = new Set();

function _normPath(p) {
  return String(p || "").replace(/\\/g, "/").toLowerCase();
}

function _basename(p) {
  const n = _normPath(p);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Keep only fields we need for UI paint (+ enough for Toolkit popup). */
function _slim(model) {
  if (!model) return null;
  return {
    filename: model.filename,
    model_type: model.model_type,
    civitai_model_name: model.civitai_model_name,
    local_cover_path: model.local_cover_path,
    base_model: model.base_model,
    version_name: model.version_name,
    trained_words: model.trained_words,
    tags: model.tags,
    model_description: model.model_description,
    version_description: model.version_description,
    hash: model.hash,
    civitai_stats: model.civitai_stats,
  };
}

function _indexKey(full, slim) {
  _metaByPath.set(full, slim);
  // Index every path suffix so absolute Toolkit paths still match
  // workflow-relative keys like "characters/foo.safetensors".
  const parts = full.split("/");
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join("/");
    if (suffix && !_metaByPath.has(suffix)) _metaByPath.set(suffix, slim);
  }
  const base = _basename(full);
  if (!_metaByBasename.has(base)) _metaByBasename.set(base, slim);
}

function _rebuildIndexes(models) {
  _metaByPath = new Map();
  _metaByBasename = new Map();
  if (!Array.isArray(models)) return;

  const loras = models.filter((m) => String(m.model_type || "").toLowerCase() === "loras");
  const pool = loras.length ? loras : models;

  for (const m of pool) {
    const slim = _slim(m);
    const full = _normPath(m.filename);
    if (!full) continue;
    _indexKey(full, slim);
  }

  for (const cb of _readyListeners) {
    try {
      cb();
    } catch (_) {
      /* listener errors shouldn't break the index */
    }
  }
}

/**
 * Subscribe to index rebuilds (node re-renders when Toolkit meta lands).
 * Returns an unsubscribe function.
 */
export function onCivitaiMetaReady(cb) {
  if (typeof cb !== "function") return () => {};
  _readyListeners.add(cb);
  if (_metaByPath.size) {
    queueMicrotask(() => {
      if (_readyListeners.has(cb)) cb();
    });
  }
  return () => _readyListeners.delete(cb);
}

export async function fetchCivitaiLocalModels(force = false) {
  const now = Date.now();
  if (!force && _civitaiModelsCache && now - _civitaiModelsCacheTime < CIVITAI_MODELS_CACHE_MS) {
    if (!_metaByPath.size) _rebuildIndexes(_civitaiModelsCache);
    return _civitaiModelsCache;
  }
  // Coalesce concurrent callers into one HTTP round-trip.
  if (!force && _fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    const res = await api.fetchApi("/civitai_utils/get_local_models");
    if (!res.ok) {
      throw new Error(`Civitai Toolkit API HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.models)) {
      throw new Error(data.message || "Civitai Toolkit returned no models");
    }
    _civitaiModelsCache = data.models;
    _civitaiModelsCacheTime = Date.now();
    _rebuildIndexes(data.models);
    return _civitaiModelsCache;
  })();

  try {
    return await _fetchPromise;
  } finally {
    _fetchPromise = null;
  }
}

/** Warm the index early (node create / first paint). Soft — never throws. */
export function prefetchCivitaiMeta(force = false) {
  return fetchCivitaiLocalModels(force).catch(() => null);
}

export function findCivitaiModel(models, loraPath) {
  // Prefer indexed maps when they match the current cache.
  if (_metaByPath.size && (!models || models === _civitaiModelsCache)) {
    const hit = getCachedLoraMeta(loraPath);
    if (hit) return hit;
  }
  if (!models) return null;
  const target = _normPath(loraPath);
  const basename = _basename(target);
  const loras = models.filter((m) => String(m.model_type || "").toLowerCase() === "loras");
  const pool = loras.length ? loras : models;
  const hit =
    pool.find((m) => _normPath(m.filename) === target) ||
    pool.find((m) => {
      const f = _normPath(m.filename);
      return f === basename || f.endsWith("/" + basename) || f.endsWith(target) || target.endsWith(f);
    }) ||
    null;
  return _slim(hit);
}

/**
 * Sync lookup from the path index (instant after first successful fetch).
 * Returns null if index cold / not found.
 */
export function getCachedLoraMeta(loraPath) {
  if (!loraPath || !_metaByPath.size) return null;
  const target = _normPath(loraPath);
  const direct = _metaByPath.get(target) || _metaByBasename.get(_basename(target));
  if (direct) return direct;
  // Last-resort scan for odd relative/absolute mismatches.
  for (const [key, meta] of _metaByPath) {
    if (key.endsWith("/" + target) || target.endsWith("/" + key)) return meta;
  }
  return null;
}

/** Soft lookup — returns null if Toolkit missing / not indexed. */
export async function getCivitaiLoraMeta(loraPath) {
  if (!loraPath) return null;
  const cached = getCachedLoraMeta(loraPath);
  if (cached) return cached;
  try {
    await fetchCivitaiLocalModels();
    return getCachedLoraMeta(loraPath);
  } catch (_) {
    return null;
  }
}

/**
 * Display fields persisted on each stack entry inside loras_data so the
 * node can paint Civitai names/covers on load without waiting for Toolkit.
 * Python ignores unknown keys.
 */
export function displayFieldsFromMeta(meta) {
  if (!meta) {
    return { civitaiName: "", coverPath: "", baseModel: "" };
  }
  return {
    civitaiName: String(meta.civitai_model_name || "").trim(),
    coverPath: String(meta.local_cover_path || "").trim(),
    baseModel: String(meta.base_model || "").trim(),
  };
}

/** Snapshot currently stored on an entry (empty strings if absent). */
export function displayFieldsFromEntry(entry) {
  return {
    civitaiName: String(entry?.civitaiName || "").trim(),
    coverPath: String(entry?.coverPath || "").trim(),
    baseModel: String(entry?.baseModel || "").trim(),
  };
}

/**
 * Write Toolkit display fields onto entry if they differ.
 * Returns true when entry was mutated (caller should persist).
 */
export function syncEntryDisplayFromMeta(entry, meta) {
  if (!entry || !meta) return false;
  const next = displayFieldsFromMeta(meta);
  const prev = displayFieldsFromEntry(entry);
  let changed = false;

  function setField(key, value) {
    const prevVal = prev[key] || "";
    const nextVal = value || "";
    if (prevVal === nextVal) return;
    if (nextVal) entry[key] = nextVal;
    else delete entry[key];
    changed = true;
  }

  setField("civitaiName", next.civitaiName);
  setField("coverPath", next.coverPath);
  setField("baseModel", next.baseModel);
  return changed;
}

/** Drop persisted Toolkit display fields (e.g. after replacing the file). */
export function clearEntryDisplay(entry) {
  if (!entry) return;
  delete entry.civitaiName;
  delete entry.coverPath;
  delete entry.baseModel;
}

/**
 * Refresh persisted display fields for a list of entries from the warm index.
 * Returns true if any entry changed.
 */
export function syncEntriesDisplayFromCache(entries) {
  if (!Array.isArray(entries) || !_metaByPath.size) return false;
  let changed = false;
  for (const entry of entries) {
    if (!entry?.lora) continue;
    const meta = getCachedLoraMeta(entry.lora);
    if (!meta) continue;
    if (syncEntryDisplayFromMeta(entry, meta)) changed = true;
  }
  return changed;
}

/** Seed display fields when adding/replacing a lora (sync, if index warm). */
export function seedEntryDisplay(entry) {
  if (!entry?.lora) return false;
  const meta = getCachedLoraMeta(entry.lora);
  if (!meta) return false;
  return syncEntryDisplayFromMeta(entry, meta);
}

export function createCivitaiModelInfoPopup(title, model) {
  const existing = document.querySelector(".ullc-civitai-popup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.className = "ullc-civitai-popup";
  const data = model;

  const copyToClipboard = (text, targetElement) => {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = targetElement.innerHTML;
      targetElement.innerHTML = "Copied!";
      targetElement.classList.add("copied");
      setTimeout(() => {
        targetElement.innerHTML = originalText;
        targetElement.classList.remove("copied");
      }, 1500);
    }).catch((err) => console.error("[UltimateLoraLoaderCivitai] copy failed:", err));
  };

  const parseHtml = (htmlString) =>
    new DOMParser().parseFromString(htmlString, "text/html").body.innerHTML;

  const versionDescriptionHTML = data.version_description
    ? parseHtml(data.version_description)
    : "";
  const modelDescriptionHTML = data.model_description
    ? parseHtml(data.model_description)
    : "<em>No description available.</em>";

  const triggersHTML =
    data.trained_words && data.trained_words.length > 0
      ? data.trained_words
          .map((tag) => `<code class="trigger-word" title="Click to copy">${tag}</code>`)
          .join("")
      : "<em>None specified</em>";

  const copyAllTriggersBtn =
    data.trained_words && data.trained_words.length > 0
      ? `<button class="copy-all-btn" data-text="${data.trained_words.join(", ")}">Copy All</button>`
      : "";

  const tagsHTML =
    data.tags && data.tags.length > 0
      ? `<div class="detail-tags">${data.tags.map((tag) => `<span class="detail-tag">${tag}</span>`).join("")}</div>`
      : "<em>No tags found.</em>";

  const ratingText =
    data.civitai_stats?.rating !== undefined
      ? `${data.civitai_stats.rating.toFixed(1)} (${data.civitai_stats.ratingCount})`
      : `👍 ${data.civitai_stats?.thumbsUpCount || 0}`;

  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h2>${title}</h2>
        <span class="popup-close" title="Close">&times;</span>
      </div>
      <div class="popup-body">
        <div class="info-grid">
          <div class="info-item"><strong>Civitai Name:</strong> <span>${data.civitai_model_name || "N/A"}</span></div>
          <div class="info-item"><strong>Version:</strong> <span>${data.version_name || "N/A"}</span></div>
          <div class="info-item"><strong>Base Model:</strong> <span>${data.base_model || "N/A"}</span></div>
          <div class="info-item"><strong>Downloads:</strong> <span>${data.civitai_stats?.downloadCount || 0}</span></div>
          <div class="info-item"><strong>Rating:</strong> <span>${ratingText}</span></div>
        </div>
        <div class="info-section">
          <h4>Tags</h4>
          ${tagsHTML}
        </div>
        <div class="info-section">
          <div class="section-header">
            <h4>Trigger Words</h4>
            ${copyAllTriggersBtn}
          </div>
          <div class="triggers-container">${triggersHTML}</div>
        </div>
        ${
          versionDescriptionHTML
            ? `<div class="info-section">
                <h4>Version Description</h4>
                <div class="model-description-content version-desc">${versionDescriptionHTML}</div>
              </div>`
            : ""
        }
        <div class="info-section">
          <details class="description-details" open>
            <summary>Model Description</summary>
            <div class="model-description-content">${modelDescriptionHTML}</div>
          </details>
        </div>
        <div class="info-section hash-section">
          <strong>Hash:</strong>
          <code class="hash-code">${data.hash || "N/A"}</code>
          <button class="copy-btn" data-text="${data.hash || ""}">Copy</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(popup);

  const close = () => popup.remove();
  popup.querySelector(".popup-close").onclick = close;
  popup.onclick = (e) => {
    if (e.target === popup) close();
  };

  popup.querySelectorAll(".trigger-word").forEach((el) => {
    el.onclick = () => copyToClipboard(el.textContent, el);
  });
  const copyAllBtn = popup.querySelector(".copy-all-btn");
  if (copyAllBtn) {
    copyAllBtn.onclick = (e) => copyToClipboard(e.target.dataset.text, e.target);
  }
  const copyHashBtn = popup.querySelector(".hash-section .copy-btn");
  if (copyHashBtn) {
    copyHashBtn.onclick = (e) => copyToClipboard(e.target.dataset.text, e.target);
  }
}

export async function openCivitaiToolkitLoraInfo(loraPath) {
  const displayName = String(loraPath || "").split(/[/\\]/).pop() || loraPath;
  try {
    await fetchCivitaiLocalModels();
    const model = getCachedLoraMeta(loraPath);
    if (!model) {
      alert(
        `Civitai Toolkit has no info for:\n${loraPath}\n\nMake sure the Toolkit scan finished and this LoRA is indexed.`
      );
      return;
    }
    createCivitaiModelInfoPopup(displayName, model);
  } catch (e) {
    console.error("[UltimateLoraLoaderCivitai] Toolkit info failed:", e);
    alert(
      `Could not open Toolkit info.\nIs Civitai Toolkit installed and loaded?\n\n${e.message || e}`
    );
  }
}
