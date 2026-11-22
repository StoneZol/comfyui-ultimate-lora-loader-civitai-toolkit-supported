/** Collection paths: `Characters/Anime/Face` — `/` separates nested shelves. */

export const SHELF_SEP = "/";
export const UNCATEGORISED = "Uncategorised";

export function normalizeShelfPath(raw) {
  return String(raw || "")
    .split(SHELF_SEP)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(SHELF_SEP);
}

export function splitShelfName(folder, name) {
  const shelf = normalizeShelfPath(folder);
  const raw = String(name || "").trim();
  if (!raw.includes(SHELF_SEP)) return { folder: shelf, name: raw };
  const parts = raw
    .split(SHELF_SEP)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { folder: shelf, name: "" };
  if (parts.length === 1) return { folder: shelf, name: parts[0] };
  const prefix = parts.slice(0, -1).join(SHELF_SEP);
  return {
    folder: normalizeShelfPath(shelf ? `${shelf}${SHELF_SEP}${prefix}` : prefix),
    name: parts[parts.length - 1],
  };
}

export function shelfSegments(path) {
  const normalized = normalizeShelfPath(path);
  return normalized ? normalized.split(SHELF_SEP) : [];
}

export function shelfLeaf(path) {
  const segments = shelfSegments(path);
  return segments[segments.length - 1] || "";
}

export function joinShelfPath(parent, child) {
  return normalizeShelfPath(`${parent || ""}${SHELF_SEP}${child || ""}`);
}

export function isInShelfTree(name, root) {
  const key = normalizeShelfPath(name).toLowerCase();
  const base = normalizeShelfPath(root).toLowerCase();
  if (!base) return Boolean(key);
  return key === base || key.startsWith(base + SHELF_SEP);
}

export function shelfChildren(entries, parent = "") {
  const base = normalizeShelfPath(parent);
  const depth = shelfSegments(base).length;
  const children = new Map();
  for (const entry of entries || []) {
    const name = normalizeShelfPath(typeof entry === "string" ? entry : entry?.name);
    if (!name || !isInShelfTree(name, base)) continue;
    const segments = name.split(SHELF_SEP);
    if (segments.length <= depth) continue;
    const path = segments.slice(0, depth + 1).join(SHELF_SEP);
    const key = path.toLowerCase();
    const child = children.get(key) || { path, leaf: segments[depth], total: 0 };
    child.total += Number(typeof entry === "string" ? 0 : entry?.count || 0);
    children.set(key, child);
  }
  return [...children.values()].sort((a, b) =>
    a.leaf.localeCompare(b.leaf, undefined, { sensitivity: "base" }),
  );
}

export function allShelfPaths(entries) {
  const paths = new Map();
  for (const entry of entries || []) {
    const segments = shelfSegments(typeof entry === "string" ? entry : entry?.name);
    for (let i = 1; i <= segments.length; i += 1) {
      const path = segments.slice(0, i).join(SHELF_SEP);
      if (!paths.has(path.toLowerCase())) paths.set(path.toLowerCase(), path);
    }
  }
  return [...paths.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function shelfTotal(entries, path) {
  const base = normalizeShelfPath(path).toLowerCase();
  let total = 0;
  for (const entry of entries || []) {
    const name = normalizeShelfPath(typeof entry === "string" ? entry : entry?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (key === base || key.startsWith(base + SHELF_SEP)) {
      total += Number(typeof entry === "string" ? 0 : entry?.count || 0);
    }
  }
  return total;
}

/** Match preset by title/desc/category; `folder/sub/name` drills shelves in order. */
export function matchesPresetQuery(preset, q) {
  const raw = String(q || "").trim().toLowerCase();
  if (!raw) return true;
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return true;

  const title = String(preset.title || "").toLowerCase();
  const desc = String(preset.description || "").toLowerCase();
  const catSegs = shelfSegments(preset.category || "").map((s) => s.toLowerCase());

  if (parts.length === 1) {
    const t = parts[0];
    if (title.includes(t) || desc.includes(t)) return true;
    if (catSegs.some((s) => s.includes(t))) return true;
    return catSegs.join("/").includes(t);
  }

  let i = 0;
  for (const seg of catSegs) {
    if (i < parts.length && seg.includes(parts[i])) i += 1;
  }
  if (i === parts.length) return true;
  if (i === parts.length - 1 && title.includes(parts[parts.length - 1])) {
    return true;
  }
  return false;
}

export function buildFolderTree(items, folderKey = "category") {
  const root = { path: "", items: [], children: new Map() };
  for (const item of items || []) {
    const path = normalizeShelfPath(item[folderKey]) || UNCATEGORISED;
    let node = root;
    for (const segment of shelfSegments(path)) {
      const key = segment.toLowerCase();
      if (!node.children.has(key)) {
        node.children.set(key, {
          path: node.path ? `${node.path}/${segment}` : segment,
          items: [],
          children: new Map(),
        });
      }
      node = node.children.get(key);
    }
    node.items.push(item);
  }
  return root;
}

export function treeTotal(node) {
  return (
    node.items.length +
    [...node.children.values()].reduce((sum, child) => sum + treeTotal(child), 0)
  );
}

export function sortedChildren(node) {
  return [...node.children.values()].sort((a, b) => {
    const aUncat = a.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    const bUncat = b.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    if (aUncat !== bUncat) return aUncat ? -1 : 1;
    return shelfLeaf(a.path).localeCompare(shelfLeaf(b.path), undefined, {
      sensitivity: "base",
    });
  });
}

function makeShelfCrumbs({ path, onNavigate }) {
  const crumbs = document.createElement("div");
  crumbs.className = "ullc-shelf-crumbs";
  const segments = shelfSegments(path);

  function add(label, target, isCurrent) {
    const crumb = document.createElement("button");
    crumb.type = "button";
    crumb.className = "ullc-shelf-crumb" + (isCurrent ? " current" : "");
    crumb.textContent = label;
    if (!isCurrent) {
      crumb.addEventListener("click", (e) => {
        e.stopPropagation();
        onNavigate?.(target);
      });
    }
    crumbs.appendChild(crumb);
  }

  add("All", "", !segments.length);
  for (let i = 0; i < segments.length; i += 1) {
    const sep = document.createElement("span");
    sep.className = "ullc-shelf-crumb-sep";
    sep.textContent = "›";
    crumbs.appendChild(sep);
    add(segments[i], segments.slice(0, i + 1).join(SHELF_SEP), i === segments.length - 1);
  }
  return crumbs;
}

/**
 * Nested collection picker (prompt-craft style).
 * `categories` — `{ name, count }[]` from listCategories.
 */
export function openShelfPicker({
  categories = [],
  current = "",
  onPick,
  onClose,
  nested = true,
  title = "Collection",
  allowEmpty = true,
  emptyLabel = UNCATEGORISED,
  allowCreate = true,
  width = 420,
} = {}) {
  // Lazy import to avoid circular deps if popup ever imports shelf helpers.
  return import("./presets_popup.js").then(({ openPopup }) =>
    openPopup({
      nested,
      title,
      width,
      onClose,
      render(body, { close }) {
        let path = normalizeShelfPath(current);
        const known = new Set(allShelfPaths(categories).map((p) => p.toLowerCase()));
        if (path && !known.has(path.toLowerCase())) {
          const parts = shelfSegments(path);
          while (parts.length && !known.has(parts.join(SHELF_SEP).toLowerCase())) {
            parts.pop();
          }
          path = parts.join(SHELF_SEP);
        }

        const crumbsHost = document.createElement("div");
        const filter = document.createElement("input");
        filter.className = "ullc-preset-input";
        filter.type = "text";
        filter.placeholder = "filter collections";

        const list = document.createElement("div");
        list.className = "ullc-shelf-pick-list";

        const newRow = document.createElement("div");
        newRow.className = "ullc-preset-folder-row";
        newRow.hidden = true;
        const newInput = document.createElement("input");
        newInput.className = "ullc-preset-input";
        newInput.type = "text";
        newInput.placeholder = "sub-folder name";
        const newConfirm = document.createElement("button");
        newConfirm.type = "button";
        newConfirm.className = "ullc-preset-btn primary";
        newConfirm.textContent = "Create";
        newRow.append(newInput, newConfirm);

        const actions = document.createElement("div");
        actions.className = "ullc-preset-actions";

        const newBtn = document.createElement("button");
        newBtn.type = "button";
        newBtn.className = "ullc-preset-btn";
        newBtn.textContent = "New folder";

        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "ullc-preset-btn primary";

        if (allowCreate) actions.append(newBtn, useBtn);
        else actions.appendChild(useBtn);

        function pick(value) {
          close();
          onPick?.(normalizeShelfPath(value));
        }

        function paint() {
          crumbsHost.replaceChildren(
            makeShelfCrumbs({
              path,
              onNavigate: (target) => {
                path = target;
                paint();
              },
            }),
          );
          useBtn.disabled = !(path || allowEmpty);
          useBtn.textContent = path
            ? `Use “${shelfLeaf(path)}”`
            : allowEmpty
              ? `Use “${emptyLabel}”`
              : "Pick a folder";

          list.replaceChildren();
          const q = filter.value.trim().toLowerCase();
          if (q) {
            const shown = allShelfPaths(categories).filter((p) =>
              p.toLowerCase().includes(q),
            );
            if (!shown.length) {
              const empty = document.createElement("div");
              empty.className = "ullc-preset-message";
              empty.textContent = "No matches";
              list.appendChild(empty);
            }
            for (const p of shown) {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "ullc-shelf-pick-item";
              btn.textContent = p;
              btn.addEventListener("click", (e) => {
                e.stopPropagation();
                pick(p);
              });
              list.appendChild(btn);
            }
            return;
          }

          const children = shelfChildren(categories, path);
          if (!children.length) {
            const empty = document.createElement("div");
            empty.className = "ullc-preset-message";
            empty.textContent = path ? "No sub-folders" : "No collections yet";
            list.appendChild(empty);
          }
          for (const child of children) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ullc-shelf-pick-item folder";
            btn.innerHTML = `<span>${child.leaf}</span><span class="ullc-shelf-pick-count">${child.total || shelfTotal(categories, child.path)}</span>`;
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              path = child.path;
              paint();
            });
            list.appendChild(btn);
          }
        }

        filter.addEventListener("input", paint);
        useBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (path || allowEmpty) pick(path);
        });
        if (allowCreate) {
          newBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            newRow.hidden = !newRow.hidden;
            if (!newRow.hidden) requestAnimationFrame(() => newInput.focus());
          });
          newConfirm.addEventListener("click", (e) => {
            e.stopPropagation();
            const name = normalizeShelfPath(newInput.value);
            if (!name) {
              newInput.focus();
              return;
            }
            pick(joinShelfPath(path, name));
          });
        }

        paint();
        if (allowCreate) body.append(crumbsHost, filter, list, newRow, actions);
        else body.append(crumbsHost, filter, list, actions);
        requestAnimationFrame(() => filter.focus());
      },
    }),
  );
}
