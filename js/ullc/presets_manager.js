import { CHEVRON_ICON_SVG, EDIT_ICON_SVG, TRASH_ICON_SVG } from "./icons.js";
import { openLoraBrowser } from "./lora_browser.js";
import {
  clearEntryDisplay,
  openCivitaiToolkitLoraInfo,
  seedEntryDisplay,
} from "./civitai_toolkit_info.js";
import { openPysssssLoraInfo } from "./pysssss_info.js";
import { makeRow } from "./lora_row.js";
import { isLoraMissing } from "./lora_tree.js";
import { addEntryUnique, replaceEntryToEnd } from "./lora_stack.js";
import {
  deleteCategory,
  deletePreset,
  listCategories,
  listPresets,
  renameCategory,
  updatePreset,
} from "./presets_api.js";
import { cloneEntries, enrichPresetEntries } from "./presets_enrich.js";
import { openConfirmPopup, openPopup } from "./presets_popup.js";
import {
  UNCATEGORISED,
  buildFolderTree,
  matchesPresetQuery,
  normalizeShelfPath,
  openShelfPicker,
  shelfLeaf,
  sortedChildren,
  treeTotal,
} from "./presets_shelf.js";

function openEditPresetDialog(preset, { onSaved } = {}) {
  return openPopup({
    title: "Edit preset",
    width: 720,
    nested: true,
    render(body, { close }) {
      const title = document.createElement("input");
      title.className = "ullc-preset-input";
      title.type = "text";
      title.value = preset.title || "";
      title.placeholder = "preset name";

      const folderRow = document.createElement("div");
      folderRow.className = "ullc-preset-folder-row";

      const folder = document.createElement("input");
      folder.className = "ullc-preset-input";
      folder.type = "text";
      folder.value = preset.category || UNCATEGORISED;
      folder.placeholder = `${UNCATEGORISED} or path/sub`;

      const chooseBtn = document.createElement("button");
      chooseBtn.type = "button";
      chooseBtn.className = "ullc-preset-btn";
      chooseBtn.textContent = "Choose";
      folderRow.append(folder, chooseBtn);

      chooseBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const res = await listCategories();
        await openShelfPicker({
          categories: res.categories || [],
          current: folder.value.trim(),
          allowEmpty: true,
          allowCreate: true,
          onPick: (path) => {
            folder.value = path || UNCATEGORISED;
          },
        });
      });

      const desc = document.createElement("textarea");
      desc.className = "ullc-preset-textarea";
      desc.rows = 2;
      desc.value = preset.description || "";
      desc.placeholder = "notes (optional)";

      const toolbar = document.createElement("div");
      toolbar.className = "ullc-preset-edit-toolbar";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "ullc-preset-btn sm primary";
      addBtn.textContent = "+ Add LoRA";
      toolbar.appendChild(addBtn);

      const header = document.createElement("div");
      header.className = "fll-header-row ullc-preset-node-header";
      header.innerHTML = `
        <div class="fll-drag-handle"></div>
        <div class="fll-header-label" style="flex:0 0 26px;width:26px;text-align:center">#</div>
        <div class="fll-header-toggle-slot"></div>
        <div class="fll-header-preview-slot"></div>
        <div class="fll-header-label name-label">Name</div>
        <div class="fll-header-label strength-label">Model</div>
        <div class="fll-header-label strength-label">Clip</div>
        <div class="fll-header-info-pair">
          <div class="fll-header-info-slot"></div>
          <div class="fll-header-info-slot"></div>
        </div>
        <div class="fll-header-replace-slot"></div>
        <div class="fll-header-remove-slot"></div>
      `;

      const list = document.createElement("div");
      list.className = "ullc-preset-entry-list ullc-preset-node-list";

      const errorEl = document.createElement("div");
      errorEl.className = "ullc-preset-error";

      const actions = document.createElement("div");
      actions.className = "ullc-preset-actions";

      let working = cloneEntries(preset.entries || []);
      let missingFlags = working.map(() => false);
      let dragFrom = null;

      function paintList() {
        list.replaceChildren();
        header.style.display = working.length ? "flex" : "none";
        working.forEach((entry, idx) => {
          const shell = document.createElement("div");
          shell.className = "ullc-preset-node-row";
          // Only missing-on-disk gets a danger cue — not add/edit/heal diffs.
          if (missingFlags[idx]) shell.classList.add("missing");

          const row = makeRow(entry, {
            showClipStrength: true,
            currentPriority: idx + 1,
            onChange: () => {},
            onRemove: () => {
              working.splice(idx, 1);
              missingFlags = working.map((e) => isLoraMissing(e.lora));
              paintList();
            },
            onReplace: (loraPath) => {
              const next = replaceEntryToEnd(working, idx, loraPath);
              if (!next) return;
              clearEntryDisplay(next);
              seedEntryDisplay(next);
              missingFlags = working.map((e) => isLoraMissing(e.lora));
              paintList();
            },
            onInfoToolkit: (loraPath) => openCivitaiToolkitLoraInfo(loraPath),
            onInfoFull: (loraPath) => openPysssssLoraInfo(loraPath, null),
            onPriorityChange: (rawPriority) => {
              const target = Math.max(0, Math.min(working.length - 1, rawPriority - 1));
              if (target === idx) {
                paintList();
                return;
              }
              const [moved] = working.splice(idx, 1);
              working.splice(target, 0, moved);
              missingFlags = working.map((e) => isLoraMissing(e.lora));
              paintList();
            },
            onDragStart: (e, rowEl) => {
              dragFrom = idx;
              rowEl.classList.add("dragging");
            },
            onDragEnd: (e, rowEl) => {
              dragFrom = null;
              list.querySelectorAll(".fll-row").forEach((r) => {
                r.classList.remove("dragging", "drop-target-above", "drop-target-below");
              });
            },
            onDragOver: (e, rowEl) => {
              if (dragFrom === null || dragFrom === idx) return;
              const rect = rowEl.getBoundingClientRect();
              const above = e.clientY - rect.top < rect.height / 2;
              rowEl.classList.toggle("drop-target-above", above);
              rowEl.classList.toggle("drop-target-below", !above);
            },
            onDrop: (e, rowEl) => {
              if (dragFrom === null || dragFrom === idx) return;
              const rect = rowEl.getBoundingClientRect();
              const above = e.clientY - rect.top < rect.height / 2;
              let target = above ? idx : idx + 1;
              if (dragFrom < target) target -= 1;
              const from = dragFrom;
              dragFrom = null;
              const [moved] = working.splice(from, 1);
              working.splice(target, 0, moved);
              missingFlags = working.map((e) => isLoraMissing(e.lora));
              paintList();
            },
          });

          shell.appendChild(row);
          list.appendChild(shell);
        });
      }

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = addBtn.getBoundingClientRect();
        openLoraBrowser(rect.left, rect.bottom + 4, (loraPath) => {
          const entry = {
            lora: loraPath,
            enabled: true,
            strengthModel: 1.0,
            strengthClip: 1.0,
          };
          if (!addEntryUnique(working, entry)) return;
          seedEntryDisplay(entry);
          missingFlags = working.map((e) => isLoraMissing(e.lora));
          paintList();
        });
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ullc-preset-btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });

      const save = document.createElement("button");
      save.type = "button";
      save.className = "ullc-preset-btn primary";
      save.textContent = "Save";
      save.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!working.length) {
          errorEl.textContent = "Preset needs at least one LoRA";
          return;
        }
        save.disabled = true;
        errorEl.textContent = "Saving…";
        try {
          const enriched = await enrichPresetEntries(working);
          working = enriched.entries;
          const result = await updatePreset({
            id: preset.id,
            title: title.value.trim(),
            category: normalizeShelfPath(folder.value) || UNCATEGORISED,
            description: desc.value.trim(),
            entries: working,
          });
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            save.disabled = false;
            return;
          }
          onSaved?.(result);
          close();
        } catch (err) {
          errorEl.textContent = String(err?.message || err);
          save.disabled = false;
        }
      });

      actions.append(cancel, save);
      body.append(title, folderRow, desc, toolbar, header, list, errorEl, actions);
      paintList();

      enrichPresetEntries(working).then((result) => {
        working = result.entries;
        missingFlags = result.missingFlags;
        paintList();
      });
    },
  });
}

function makePresetRow(preset, { onEdit, onDelete }) {
  // Same card layout as Load: name · meta · icon actions in one row.
  const row = document.createElement("div");
  row.className = "ullc-preset-card";

  const head = document.createElement("div");
  head.className = "ullc-preset-card-head";

  const name = document.createElement("div");
  name.className = "ullc-preset-card-name";
  name.textContent = preset.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "ullc-preset-card-meta";
  const n = (preset.entries || []).length;
  meta.textContent = `${n} LoRA${n === 1 ? "" : "s"}`;

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "ullc-preset-icon-btn";
  edit.innerHTML = EDIT_ICON_SVG;
  edit.title = "Edit";
  edit.addEventListener("click", (e) => {
    e.stopPropagation();
    onEdit?.(preset);
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "ullc-preset-icon-btn danger";
  del.innerHTML = TRASH_ICON_SVG;
  del.title = "Delete";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete?.(preset);
  });

  head.append(name, meta, edit, del);
  row.appendChild(head);

  if ((preset.description || "").trim()) {
    const desc = document.createElement("div");
    desc.className = "ullc-preset-card-desc";
    desc.textContent = preset.description.trim();
    row.appendChild(desc);
  }

  return row;
}

function appendManageTree(host, node, handlers, depth = 0, { expandAll = false } = {}) {
  // Same rule as Load dialog: paint `node.items` once per level via recursion.
  for (const child of sortedChildren(node)) {
    const folder = document.createElement("div");
    folder.className =
      "ullc-preset-folder" + (expandAll || depth < 1 ? "" : " collapsed");

    const head = document.createElement("div");
    head.className = "ullc-preset-folder-head ullc-preset-folder-manage";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ullc-preset-folder-toggle";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      folder.classList.toggle("collapsed");
      const open = !folder.classList.contains("collapsed");
      toggle.title = open ? "Collapse" : "Expand";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    const chevron = document.createElement("span");
    chevron.className = "ullc-preset-folder-chevron";
    chevron.innerHTML = CHEVRON_ICON_SVG;

    const label = document.createElement("span");
    label.className = "ullc-preset-folder-name";
    label.textContent = shelfLeaf(child.path) || child.path;

    const countEl = document.createElement("span");
    countEl.className = "ullc-preset-folder-count";
    countEl.textContent = String(treeTotal(child));

    const open = !folder.classList.contains("collapsed");
    toggle.title = open ? "Collapse" : "Expand";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.append(chevron, label, countEl);

    const actions = document.createElement("div");
    actions.className = "ullc-preset-folder-actions";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ullc-preset-icon-btn";
    renameBtn.title = "Rename";
    renameBtn.innerHTML = EDIT_ICON_SVG;
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onRenameShelf?.(child.path);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ullc-preset-icon-btn danger";
    delBtn.title = "Delete";
    delBtn.innerHTML = TRASH_ICON_SVG;
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onDeleteShelf?.(child.path);
    });

    actions.append(renameBtn, delBtn);
    head.append(toggle, actions);
    const body = document.createElement("div");
    body.className = "ullc-preset-folder-body";
    appendManageTree(body, child, handlers, depth + 1, { expandAll });

    folder.append(head, body);
    host.appendChild(folder);
  }
  for (const item of node.items) {
    host.appendChild(
      makePresetRow(item, {
        onEdit: handlers.onEdit,
        onDelete: handlers.onDelete,
      }),
    );
  }
}

export function openManagePresetsDialog({ onChanged } = {}) {
  return openPopup({
    title: "Manage LoRA presets",
    width: 560,
    render(body, { close }) {
      const search = document.createElement("input");
      search.className = "ullc-preset-input";
      search.type = "search";
      search.placeholder = "Search…";

      const list = document.createElement("div");
      list.className = "ullc-preset-list";

      const status = document.createElement("div");
      status.className = "ullc-preset-hint";
      status.textContent = "Loading…";

      let presets = [];

      async function reload() {
        status.textContent = "Loading…";
        const res = await listPresets();
        if (!res.ok) {
          status.textContent = res.error || "Failed to load";
          return;
        }
        presets = res.presets || [];
        status.textContent = `${presets.length} preset${presets.length === 1 ? "" : "s"}`;
        paint();
        onChanged?.();
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
          empty.textContent = presets.length ? "No matches" : "No presets yet";
          list.appendChild(empty);
          return;
        }

        const handlers = {
          onEdit: (p) => {
            openEditPresetDialog(p, { onSaved: () => reload() });
          },
          onDelete: (p) => {
            openConfirmPopup({
              title: "Delete preset",
              message: `Delete “${p.title}”?`,
              confirmLabel: "Delete",
              danger: true,
              onConfirm: async () => {
                await deletePreset(p.id);
                reload();
              },
            });
          },
          onRenameShelf: (path) => {
            const next = window.prompt("Rename collection path", path);
            if (next == null) return;
            const name = normalizeShelfPath(next);
            if (!name || name === path) return;
            renameCategory({ name: path, newName: name }).then((res) => {
              if (!res.ok) {
                openConfirmPopup({
                  title: "Rename failed",
                  message: res.error || "Conflict",
                  confirmLabel: "OK",
                  showCancel: false,
                });
                return;
              }
              reload();
            });
          },
          onDeleteShelf: (path) => {
            openConfirmPopup({
              title: "Delete collection",
              message: `Delete “${path}” and all presets under it?`,
              confirmLabel: "Delete",
              danger: true,
              onConfirm: async () => {
                await deleteCategory(path);
                reload();
              },
            });
          },
        };

        // Keep shelf nesting on search (no flat list).
        const tree = buildFolderTree(filtered, "category");
        appendManageTree(list, tree, handlers, 0, { expandAll: !!q });
      }

      search.addEventListener("input", paint);

      const footer = document.createElement("div");
      footer.className = "ullc-preset-actions";
      const done = document.createElement("button");
      done.type = "button";
      done.className = "ullc-preset-btn primary";
      done.textContent = "Done";
      done.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
      footer.appendChild(done);

      body.append(search, status, list, footer);
      reload().catch((err) => {
        status.textContent = String(err?.message || err);
      });
    },
  });
}
