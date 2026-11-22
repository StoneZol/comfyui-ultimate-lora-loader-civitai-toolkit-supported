import { CHEVRON_ICON_SVG, LOAD_ICON_SVG, PLUS_ICON_SVG } from "./icons.js";
import { listPresets } from "./presets_api.js";
import {
  cloneEntries,
  enrichPresetEntries,
  mergeEntriesSkipDupes,
} from "./presets_enrich.js";
import { openConfirmPopup, openPopup } from "./presets_popup.js";
import {
  buildFolderTree,
  matchesPresetQuery,
  shelfLeaf,
  sortedChildren,
  treeTotal,
} from "./presets_shelf.js";

function makeFolder({ title, count, expanded, onApply }) {
  const folder = document.createElement("div");
  folder.className = "ullc-preset-folder" + (expanded ? "" : " collapsed");

  const head = document.createElement("button");
  head.type = "button";
  head.className = "ullc-preset-folder-head";

  const chevron = document.createElement("span");
  chevron.className = "ullc-preset-folder-chevron";
  chevron.innerHTML = CHEVRON_ICON_SVG;

  const label = document.createElement("span");
  label.className = "ullc-preset-folder-name";
  label.textContent = title;

  const countEl = document.createElement("span");
  countEl.className = "ullc-preset-folder-count";
  countEl.textContent = String(count);

  head.append(chevron, label, countEl);
  head.addEventListener("click", (e) => {
    e.stopPropagation();
    folder.classList.toggle("collapsed");
  });

  const body = document.createElement("div");
  body.className = "ullc-preset-folder-body";

  folder.append(head, body);
  return { folder, body, onApply };
}

function makePresetCard(preset, onApply) {
  const card = document.createElement("div");
  card.className = "ullc-preset-card";

  const head = document.createElement("div");
  head.className = "ullc-preset-card-head";

  const name = document.createElement("div");
  name.className = "ullc-preset-card-name";
  name.textContent = preset.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "ullc-preset-card-meta";
  const n = (preset.entries || []).length;
  meta.textContent = `${n} LoRA${n === 1 ? "" : "s"}`;

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "ullc-preset-icon-btn";
  replaceBtn.title = "Replace entire stack";
  replaceBtn.innerHTML = LOAD_ICON_SVG;
  replaceBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onApply?.(preset, "replace");
  });

  const mergeBtn = document.createElement("button");
  mergeBtn.type = "button";
  mergeBtn.className = "ullc-preset-icon-btn";
  mergeBtn.title = "Merge — add missing LoRAs (skip duplicates)";
  mergeBtn.innerHTML = PLUS_ICON_SVG;
  mergeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onApply?.(preset, "merge");
  });

  head.append(name, meta, replaceBtn, mergeBtn);
  card.appendChild(head);

  if ((preset.description || "").trim()) {
    const desc = document.createElement("div");
    desc.className = "ullc-preset-card-desc";
    desc.textContent = preset.description.trim();
    card.appendChild(desc);
  }

  return card;
}

function appendFolderNode(host, node, onApply, depth = 0, { expandAll = false } = {}) {
  // Items are rendered only via `node.items` at each level. Do NOT also
  // iterate child.items in the parent — recursion already paints those.
  for (const child of sortedChildren(node)) {
    const { folder, body } = makeFolder({
      title: shelfLeaf(child.path) || child.path,
      count: treeTotal(child),
      expanded: expandAll || depth < 1,
      onApply,
    });
    appendFolderNode(body, child, onApply, depth + 1, { expandAll });
    host.appendChild(folder);
  }
  for (const item of node.items) {
    host.appendChild(makePresetCard(item, onApply));
  }
}

export function openLoadPresetDialog({ currentEntries, onLoad } = {}) {
  return openPopup({
    title: "Load LoRA preset",
    width: 480,
    render(body, { close }) {
      const search = document.createElement("input");
      search.className = "ullc-preset-input";
      search.type = "search";
      search.placeholder = "Search presets…";

      const list = document.createElement("div");
      list.className = "ullc-preset-list";

      const status = document.createElement("div");
      status.className = "ullc-preset-hint";
      status.textContent = "Loading…";

      let presets = [];

      async function applyPreset(preset, mode) {
        status.textContent = "Preparing…";
        try {
          const { entries, healedCount, missingFlags } = await enrichPresetEntries(
            preset.entries || [],
          );
          let next;
          let note = "";
          if (mode === "merge") {
            const merged = mergeEntriesSkipDupes(currentEntries || [], entries);
            next = merged.entries;
            note = `Merged +${merged.added}, skipped ${merged.skipped} duplicate${merged.skipped === 1 ? "" : "s"}`;
          } else {
            next = cloneEntries(entries);
            note = `Replaced with ${next.length} LoRA${next.length === 1 ? "" : "s"}`;
          }
          const missing = missingFlags.filter(Boolean).length;
          if (healedCount) {
            note += ` · ${healedCount} path${healedCount === 1 ? "" : "s"} updated`;
          }
          if (missing) note += ` · ${missing} missing`;
          onLoad?.(next, {
            mode,
            note,
            healedCount,
            missing,
            loaded: {
              id: preset.id,
              title: preset.title || "",
              category: preset.category || "",
            },
          });
          close();
        } catch (err) {
          openConfirmPopup({
            title: "Load failed",
            message: String(err?.message || err),
            confirmLabel: "OK",
            showCancel: false,
          });
        }
      }

      function paint() {
        list.replaceChildren();
        const q = search.value.trim();
        const filtered = q
          ? presets.filter((p) => matchesPresetQuery(p, q))
          : presets;

        if (!filtered.length) {
          const empty = document.createElement("div");
          empty.className = "ullc-preset-message";
          empty.textContent = presets.length
            ? "No matches"
            : "No presets yet — Save one first";
          list.appendChild(empty);
          return;
        }

        // Always keep shelf nesting — never flatten search hits.
        const tree = buildFolderTree(filtered, "category");
        appendFolderNode(list, tree, applyPreset, 0, { expandAll: !!q });
      }

      search.addEventListener("input", paint);
      body.append(search, status, list);

      listPresets()
        .then((res) => {
          if (!res.ok) {
            status.textContent = res.error || "Failed to load";
            return;
          }
          presets = res.presets || [];
          status.textContent = `${presets.length} preset${presets.length === 1 ? "" : "s"} · ⬆ replace · + merge (skip dupes)`;
          paint();
          requestAnimationFrame(() => search.focus());
        })
        .catch((err) => {
          status.textContent = String(err?.message || err);
        });
    },
  });
}
