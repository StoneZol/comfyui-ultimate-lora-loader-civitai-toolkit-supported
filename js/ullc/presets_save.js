import { getPrefs, listCategories, savePreset, updatePrefs } from "./presets_api.js";
import { prepareEntriesForSave } from "./presets_enrich.js";
import { openConfirmPopup, openPopup } from "./presets_popup.js";
import {
  UNCATEGORISED,
  normalizeShelfPath,
  openShelfPicker,
  splitShelfName,
} from "./presets_shelf.js";

export function openSavePresetDialog({ entries, loaded = null, onSaved } = {}) {
  if (!entries?.length) {
    openConfirmPopup({
      title: "Save preset",
      message: "Add at least one LoRA first.",
      confirmLabel: "OK",
      showCancel: false,
    });
    return;
  }

  return openPopup({
    title: "Save LoRA preset",
    width: 400,
    render(body, { close }) {
      const title = document.createElement("input");
      title.className = "ullc-preset-input";
      title.type = "text";
      title.placeholder = "preset name or path/name";
      if (loaded?.title) title.value = loaded.title;

      const folderRow = document.createElement("div");
      folderRow.className = "ullc-preset-folder-row";

      const folder = document.createElement("input");
      folder.className = "ullc-preset-input";
      folder.type = "text";
      folder.placeholder = `${UNCATEGORISED} or path/sub`;
      folder.value = loaded?.category || "";

      const chooseBtn = document.createElement("button");
      chooseBtn.type = "button";
      chooseBtn.className = "ullc-preset-btn";
      chooseBtn.textContent = "Choose";

      folderRow.append(folder, chooseBtn);

      const desc = document.createElement("textarea");
      desc.className = "ullc-preset-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 2;

      let skipDisabled = false;

      const skipRow = document.createElement("div");
      skipRow.className = "ullc-preset-toggle-row";
      skipRow.title =
        "When on, disabled rows are not written into the preset (saved in SQLite)";

      const skipToggle = document.createElement("div");
      skipToggle.className = "fll-toggle-switch";
      skipToggle.setAttribute("role", "switch");
      skipToggle.setAttribute("aria-checked", "false");
      const skipKnob = document.createElement("div");
      skipKnob.className = "fll-toggle-knob";
      skipToggle.appendChild(skipKnob);

      const skipLabel = document.createElement("span");
      skipLabel.textContent = "Skip disabled LoRAs";
      skipRow.append(skipToggle, skipLabel);

      const enabledCount = entries.filter((e) => e?.enabled !== false).length;
      const disabledCount = entries.length - enabledCount;

      const hint = document.createElement("div");
      hint.className = "ullc-preset-hint";

      function setSkipDisabled(on) {
        skipDisabled = !!on;
        skipToggle.classList.toggle("on", skipDisabled);
        skipToggle.setAttribute("aria-checked", skipDisabled ? "true" : "false");
        refreshHint();
      }

      function refreshHint() {
        const n = skipDisabled ? enabledCount : entries.length;
        let text = `${n} LoRA${n === 1 ? "" : "s"} will be saved`;
        if (skipDisabled && disabledCount) {
          text += ` · ${disabledCount} disabled skipped`;
        } else if (!skipDisabled && disabledCount) {
          text += ` · includes ${disabledCount} disabled`;
        }
        hint.textContent = text;
      }
      refreshHint();

      skipRow.addEventListener("click", (e) => {
        e.stopPropagation();
        setSkipDisabled(!skipDisabled);
        updatePrefs({ skipDisabledOnSave: skipDisabled }).catch(() => {});
      });

      const errorEl = document.createElement("div");
      errorEl.className = "ullc-preset-error";

      const actions = document.createElement("div");
      actions.className = "ullc-preset-actions";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ullc-preset-btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "ullc-preset-btn primary";
      confirm.textContent = "Save";

      let overwrite = false;
      let categories = [];
      let pickerBusy = false;

      function resetOverwrite() {
        if (!overwrite) return;
        overwrite = false;
        confirm.textContent = "Save";
        confirm.classList.remove("danger");
        confirm.classList.add("primary");
        errorEl.textContent = "";
      }

      function armOverwrite(message) {
        overwrite = true;
        errorEl.textContent = message;
        confirm.textContent = "Overwrite";
        confirm.classList.add("danger");
        confirm.classList.remove("primary");
      }

      title.addEventListener("input", resetOverwrite);
      folder.addEventListener("input", resetOverwrite);

      chooseBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (pickerBusy) return;
        pickerBusy = true;
        try {
          if (!categories.length) {
            const res = await listCategories();
            categories = res.categories || [];
          }
          await openShelfPicker({
            categories,
            current: folder.value.trim(),
            allowEmpty: true,
            allowCreate: true,
            onPick: (path) => {
              folder.value = path || "";
              resetOverwrite();
            },
            onClose: () => {
              pickerBusy = false;
            },
          });
        } catch {
          pickerBusy = false;
        }
      });

      async function doSave() {
        const split = splitShelfName(folder.value, title.value);
        const name = (split.name || "").trim();
        const category = normalizeShelfPath(split.folder) || UNCATEGORISED;
        if (!name) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        confirm.disabled = true;
        errorEl.textContent = overwrite ? "Overwriting…" : "Saving…";
        try {
          const prepared = await prepareEntriesForSave(entries, {
            skipDisabled,
          });
          if (!prepared.length) {
            errorEl.textContent = "Nothing to save — all LoRAs are disabled";
            confirm.disabled = false;
            return;
          }
          const result = await savePreset({
            category,
            title: name,
            description: desc.value.trim(),
            entries: prepared,
            overwrite,
          });
          if (result.conflicts && !overwrite) {
            armOverwrite(
              `Already exists in ${category}: ${name}. Click Overwrite to replace.`,
            );
            confirm.disabled = false;
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            confirm.disabled = false;
            return;
          }
          onSaved?.({
            ...result,
            title: result.title || name,
            category: result.category || category,
          });
          close();
        } catch (err) {
          errorEl.textContent = String(err?.message || err);
          confirm.disabled = false;
        }
      }

      confirm.addEventListener("click", (e) => {
        e.stopPropagation();
        doSave();
      });

      actions.append(cancel, confirm);
      body.append(title, folderRow, desc, skipRow, hint, errorEl, actions);

      getPrefs()
        .then((res) => {
          if (res.ok && res.prefs?.skipDisabledOnSave) {
            setSkipDisabled(true);
          }
        })
        .catch(() => {});

      listCategories()
        .then((res) => {
          categories = res.categories || [];
        })
        .catch(() => {});

      requestAnimationFrame(() => title.focus());
    },
  });
}
