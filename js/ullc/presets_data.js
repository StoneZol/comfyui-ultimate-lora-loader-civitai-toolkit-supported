/**
 * loras_data wire format:
 *   Legacy: [entry, ...]
 *   Current: { entries: [...], loaded: { id?, title, category } | null }
 * Python only consumes the entries list.
 */

export function parseLorasData(raw) {
  let data = [];
  try {
    data = raw ? JSON.parse(raw) : [];
  } catch {
    return { entries: [], loaded: null };
  }
  if (Array.isArray(data)) {
    return { entries: data, loaded: null };
  }
  if (data && typeof data === "object") {
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      loaded: normalizeLoaded(data.loaded),
    };
  }
  return { entries: [], loaded: null };
}

export function normalizeLoaded(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim();
  if (!title) return null;
  const out = {
    title,
    category: String(raw.category || "").trim(),
  };
  const id = Number(raw.id);
  if (Number.isFinite(id) && id > 0) out.id = id;
  return out;
}

export function serializeLorasData(entries, loaded = null) {
  return JSON.stringify({
    entries: Array.isArray(entries) ? entries : [],
    loaded: normalizeLoaded(loaded),
  });
}
