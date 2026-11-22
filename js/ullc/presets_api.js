import { api } from "../../../scripts/api.js";
import { getConfig } from "./config.js";

function base(path) {
  return `${getConfig().api_prefix}${path}`;
}

async function readJson(res) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok && !data.error && !data.conflicts) {
    data.error = `Request failed (HTTP ${res.status})`;
  }
  return data;
}

export async function savePreset({
  category,
  title,
  description = "",
  entries,
  overwrite = false,
}) {
  const res = await api.fetchApi(base("/presets"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, title, description, entries, overwrite }),
  });
  return readJson(res);
}

export async function listPresets({ category = "", recursive = false } = {}) {
  let url = base("/presets");
  const qs = [];
  if (category) qs.push(`category=${encodeURIComponent(category)}`);
  if (recursive) qs.push("recursive=1");
  if (qs.length) url += `?${qs.join("&")}`;
  const res = await api.fetchApi(url);
  return readJson(res);
}

export async function updatePreset({
  id,
  title,
  description,
  category,
  entries,
  overwrite = false,
}) {
  const body = { id, overwrite };
  if (title !== undefined) body.title = title;
  if (description !== undefined) body.description = description;
  if (category !== undefined) body.category = category;
  if (entries !== undefined) body.entries = entries;
  const res = await api.fetchApi(base("/presets"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function deletePreset(id) {
  const res = await api.fetchApi(`${base("/presets")}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return readJson(res);
}

export async function listCategories() {
  const res = await api.fetchApi(base("/categories"));
  return readJson(res);
}

export async function renameCategory({ name, newName }) {
  const res = await api.fetchApi(base("/categories"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, new_name: newName }),
  });
  return readJson(res);
}

export async function deleteCategory(name) {
  const res = await api.fetchApi(
    `${base("/categories")}?name=${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  return readJson(res);
}

/** Fired after prefs PATCH succeeds — all node copies should refresh chrome. */
export const UI_PREFS_EVENT = "ullc-ui-prefs-changed";

export async function getPrefs() {
  const res = await api.fetchApi(base("/prefs"));
  return readJson(res);
}

export async function updatePrefs(prefs) {
  const res = await api.fetchApi(base("/prefs"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefs }),
  });
  const data = await readJson(res);
  if (data?.ok) {
    window.dispatchEvent(
      new CustomEvent(UI_PREFS_EVENT, {
        detail: { prefs: data.prefs || prefs || {} },
      }),
    );
  }
  return data;
}
