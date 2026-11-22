import { app } from "../../../scripts/app.js";
import { loadConfig } from "./ullc/config.js";
import { injectStyles } from "./ullc/styles.js";
import {
  clearEntryDisplay,
  openCivitaiToolkitLoraInfo,
  onCivitaiMetaReady,
  prefetchCivitaiMeta,
  seedEntryDisplay,
  syncEntriesDisplayFromCache,
} from "./ullc/civitai_toolkit_info.js";
import { openPysssssLoraInfo } from "./ullc/pysssss_info.js";
import { fetchLoraTree, healMissingLoraPaths } from "./ullc/lora_tree.js";
import { openLoraBrowser } from "./ullc/lora_browser.js";
import { makeRow } from "./ullc/lora_row.js";
import {
  CLOSE_ICON_SVG,
  LOAD_ICON_SVG,
  RESET_ICON_SVG,
  SAVE_ICON_SVG,
  SETTINGS_ICON_SVG,
  TRASH_ICON_SVG,
} from "./ullc/icons.js";
import { openSavePresetDialog } from "./ullc/presets_save.js";
import { openLoadPresetDialog } from "./ullc/presets_load.js";
import { openManagePresetsDialog } from "./ullc/presets_manager.js";
import { openPopup } from "./ullc/presets_popup.js";
import { cloneEntries, enrichPresetEntries } from "./ullc/presets_enrich.js";
import {
  UI_PREFS_EVENT,
  getPrefs,
  listPresets,
  updatePrefs,
} from "./ullc/presets_api.js";
import {
  normalizeLoaded,
  parseLorasData,
  serializeLorasData,
} from "./ullc/presets_data.js";
import { addEntryUnique, replaceEntryToEnd } from "./ullc/lora_stack.js";

const config = await loadConfig();
injectStyles(config.style_id);

app.registerExtension({
  name: config.extension_name,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== config.node_class) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

      const node = this;

      // Double LiteGraph's usual default node width - the standard default
      // (based on title/socket label lengths) is cramped for this node's
      // content (lora names, strength stepper, trash icon all need to fit
      // on one row without truncating too aggressively). Only applied once
      // at creation time, not on every later resize, so it doesn't fight a
      // user's manual width choice on subsequent loads.
      if (node.size && node.size[0]) {
        node.setSize([node.size[0] * 2, node.size[1]]);
      }

      // ComfyUI auto-generates a visible widget row for the "loras_data"
      // STRING input. It MUST stay in node.widgets - that's where
      // ComfyUI's prompt-serialization step reads widget values from (via
      // widget.serializeValue() / widget.value) to send them to Python -
      // so we can't remove it from node.widgets. But *rendering* it is
      // handled inconsistently across ComfyUI versions: overriding
      // computeSize/draw/mouse worked in some render paths but not the
      // newer Vue-based widget rendering, which still drew a full text row.
      // The one thing that reliably works regardless of internal ComfyUI
      // version is hiding the actual DOM element once it exists - that's a
      // browser-level operation, not something routed through whatever
      // internal widget API ComfyUI happens to use this month.
      const dataWidget = node.widgets?.find((w) => w.name === "loras_data");
      if (dataWidget) {
        // keep these too - harmless, and still helps on canvas-rendered builds
        dataWidget.computeSize = () => [0, 0];
        dataWidget.draw = () => {};
        dataWidget.mouse = () => false;
      }

      function hideDataWidgetDom() {
        if (!dataWidget) return;
        // Known attribute names ComfyUI has used across versions for a
        // widget's mounted DOM element.
        const el = dataWidget.element || dataWidget.inputEl || dataWidget.textEl || dataWidget.domElement;
        if (el && el.style) {
          el.style.display = "none";
        }
        // Fallback: some ComfyUI versions render each widget row as a DOM
        // node inside the node's own HTML container rather than exposing
        // it directly on the widget object. Find it by matching the
        // widget's current value/name inside this node's DOM subtree.
        if (node.domElement || node.htmlElement) {
          const root = node.domElement || node.htmlElement;
          const rows = root.querySelectorAll?.("[data-widget-name], .comfy-widget, .p-inputtext") || [];
          rows.forEach((rowEl) => {
            const name = rowEl.getAttribute?.("data-widget-name");
            if (name === "loras_data") {
              const rowContainer = rowEl.closest?.(".comfy-widget-row, .widget-row") || rowEl;
              rowContainer.style.display = "none";
            }
          });
        }
      }

      // Last-resort fallback that doesn't depend on guessing ComfyUI's
      // internal class names at all: the loras_data widget's displayed
      // text is always our JSON array string (starts with "["), which is
      // distinctive enough to find directly. Scoped to this node's own
      // rendered area (container's parent chain) rather than the whole
      // document, so this stays cheap.
      let lorasWidgetObserver = null;
      function findNodeRootElement() {
        // container is appended into ComfyUI's DOM widget wrapper, which
        // itself lives inside this node's rendered element on the canvas.
        // Walk up a few levels from something we know is in the node's
        // subtree to find a stable ancestor to scope the observer to.
        let el = container.parentElement;
        for (let i = 0; i < 5 && el && el.parentElement; i++) {
          el = el.parentElement;
        }
        return el || container.parentElement || document.body;
      }
      function scanAndHideLorasWidget() {
        const root = findNodeRootElement();
        if (!root || !root.querySelectorAll) return;
        const candidates = root.querySelectorAll("input, textarea, div, span");
        candidates.forEach((elm) => {
          if (elm === container || container.contains(elm)) return; // never touch our own UI
          const val = elm.value !== undefined ? elm.value : elm.textContent;
          if (
            typeof val === "string" &&
            (val.trim().startsWith("[") || val.trim().startsWith("{")) &&
            val.includes('"lora"') &&
            val.includes('"enabled"')
          ) {
            const rowWrapper = elm.closest?.("label, .comfy-widget-row, .widget-row, li, tr") || elm;
            rowWrapper.style.display = "none";
          }
        });
      }
      function startLorasWidgetObserver() {
        if (lorasWidgetObserver) return;
        const root = findNodeRootElement();
        if (!root) return;
        lorasWidgetObserver = new MutationObserver(() => scanAndHideLorasWidget());
        lorasWidgetObserver.observe(root, { childList: true, subtree: true, characterData: true });
      }

      let entries = [];
      let loadedPreset = null;
      {
        const parsed = parseLorasData(dataWidget?.value);
        entries = parsed.entries;
        loadedPreset = parsed.loaded;
      }

      const container = document.createElement("div");
      container.className = "fll-container";
      container.style.boxSizing = "border-box";

      const headerRow = document.createElement("div");
      headerRow.className = "fll-header-row";

      const toggleAllSlot = document.createElement("div");
      toggleAllSlot.className = "fll-header-toggle-slot";
      const toggleAllSwitch = document.createElement("div");
      toggleAllSwitch.className = "fll-toggle-switch";
      const toggleAllKnob = document.createElement("div");
      toggleAllKnob.className = "fll-toggle-knob";
      toggleAllSwitch.appendChild(toggleAllKnob);
      toggleAllSlot.appendChild(toggleAllSwitch);

      const dragHandleSpacer = document.createElement("div");
      dragHandleSpacer.className = "fll-drag-handle";

      const priorityLabel = document.createElement("div");
      priorityLabel.className = "fll-header-label";
      priorityLabel.style.flex = "0 0 26px";
      priorityLabel.style.width = "26px";
      priorityLabel.style.textAlign = "center";
      priorityLabel.textContent = "#";

      const nameLabel = document.createElement("div");
      nameLabel.className = "fll-header-label name-label";
      nameLabel.textContent = "Name";

      const strengthLabel = document.createElement("div");
      strengthLabel.className = "fll-header-label strength-label";
      strengthLabel.textContent = "Strength";

      const clipStrengthLabel = document.createElement("div");
      clipStrengthLabel.className = "fll-header-label strength-label";
      clipStrengthLabel.textContent = "Clip";
      clipStrengthLabel.style.display = "none";

      const deleteAllSlot = document.createElement("div");
      deleteAllSlot.className = "fll-header-remove-slot";
      deleteAllSlot.innerHTML = TRASH_ICON_SVG;

      const infoHeaderPair = document.createElement("div");
      infoHeaderPair.className = "fll-header-info-pair";
      const infoHeaderSlotA = document.createElement("div");
      infoHeaderSlotA.className = "fll-header-info-slot";
      const infoHeaderSlotB = document.createElement("div");
      infoHeaderSlotB.className = "fll-header-info-slot";
      infoHeaderPair.appendChild(infoHeaderSlotA);
      infoHeaderPair.appendChild(infoHeaderSlotB);

      headerRow.appendChild(dragHandleSpacer);
      headerRow.appendChild(priorityLabel);
      headerRow.appendChild(toggleAllSlot);
      const previewHeaderSlot = document.createElement("div");
      previewHeaderSlot.className = "fll-header-preview-slot";
      headerRow.appendChild(previewHeaderSlot);
      headerRow.appendChild(nameLabel);
      headerRow.appendChild(strengthLabel);
      headerRow.appendChild(clipStrengthLabel);
      headerRow.appendChild(infoHeaderPair);
      const replaceHeaderSlot = document.createElement("div");
      replaceHeaderSlot.className = "fll-header-replace-slot";
      headerRow.appendChild(replaceHeaderSlot);
      headerRow.appendChild(deleteAllSlot);

      const rowsWrap = document.createElement("div");
      rowsWrap.style.display = "flex";
      rowsWrap.style.flexDirection = "column";
      rowsWrap.style.gap = "4px";
      rowsWrap.style.boxSizing = "border-box";

      const addSection = document.createElement("div");
      addSection.className = "fll-add-section";

      const presetBar = document.createElement("div");
      presetBar.className = "fll-preset-bar";

      const loadPresetBtn = document.createElement("div");
      loadPresetBtn.className = "fll-preset-btn";
      loadPresetBtn.innerHTML = `${LOAD_ICON_SVG}<span>Load</span>`;
      loadPresetBtn.title = "Load preset (Replace or Merge)";

      const savePresetBtn = document.createElement("div");
      savePresetBtn.className = "fll-preset-btn";
      savePresetBtn.innerHTML = `${SAVE_ICON_SVG}<span>Save</span>`;
      savePresetBtn.title = "Save current stack as preset";

      const managePresetBtn = document.createElement("div");
      managePresetBtn.className = "fll-preset-btn";
      managePresetBtn.textContent = "Manage";
      managePresetBtn.title = "Manage presets (edit / heal / swap missing)";

      presetBar.append(loadPresetBtn, savePresetBtn, managePresetBtn);

      const addRow = document.createElement("div");
      addRow.className = "fll-add-row";

      const addBtn = document.createElement("div");
      addBtn.className = "fll-add-btn";
      addBtn.innerHTML = `<span>Add Lora</span>`;

      const settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "fll-settings-btn";
      settingsBtn.innerHTML = SETTINGS_ICON_SVG;
      settingsBtn.title = "Node settings";

      addRow.append(addBtn, settingsBtn);

      const loadedRow = document.createElement("div");
      loadedRow.className = "fll-loaded-row";
      loadedRow.hidden = true;

      const loadedInfo = document.createElement("span");
      loadedInfo.className = "fll-loaded-info";
      const loadedLabel = document.createElement("span");
      loadedLabel.className = "fll-loaded-label";
      loadedInfo.appendChild(loadedLabel);

      const reloadLoadedBtn = document.createElement("button");
      reloadLoadedBtn.type = "button";
      reloadLoadedBtn.className = "fll-loaded-reset";
      reloadLoadedBtn.title = "Reload from saved preset";
      reloadLoadedBtn.innerHTML = RESET_ICON_SVG;

      const detachLoadedBtn = document.createElement("button");
      detachLoadedBtn.type = "button";
      detachLoadedBtn.className = "fll-loaded-clear";
      detachLoadedBtn.title = "Detach loaded preset";
      detachLoadedBtn.innerHTML = CLOSE_ICON_SVG;

      loadedRow.append(loadedInfo, reloadLoadedBtn, detachLoadedBtn);

      let showPresetBar = true;

      function applyPresetBarVisibility() {
        presetBar.hidden = !showPresetBar;
        settingsBtn.classList.toggle("active", showPresetBar);
        paintLoaded();
        resizeNode();
      }

      addSection.appendChild(presetBar);
      addSection.appendChild(addRow);
      addSection.appendChild(loadedRow);

      function syncShowPresetBar(next) {
        showPresetBar = !!next;
        applyPresetBarVisibility();
      }

      getPrefs()
        .then((res) => {
          if (res?.ok && res.prefs && "showPresetBar" in res.prefs) {
            syncShowPresetBar(res.prefs.showPresetBar);
          } else {
            applyPresetBarVisibility();
          }
        })
        .catch(() => {
          applyPresetBarVisibility();
        });

      // Global SQLite pref — every node copy listens and updates chrome together.
      function onGlobalPrefs(e) {
        const prefs = e?.detail?.prefs;
        if (!prefs || !("showPresetBar" in prefs)) return;
        syncShowPresetBar(prefs.showPresetBar);
      }
      window.addEventListener(UI_PREFS_EVENT, onGlobalPrefs);

      function paintLoaded() {
        const name = (loadedPreset?.title || "").trim();
        // Presets off → hide Load/Save/Manage and the loaded chip too.
        if (!showPresetBar || !name) {
          loadedRow.hidden = true;
          if (!name) {
            loadedLabel.textContent = "";
            loadedLabel.removeAttribute("title");
          }
          return;
        }
        loadedRow.hidden = false;
        loadedLabel.textContent = name;
        const shelf = (loadedPreset?.category || "").trim();
        loadedLabel.title = shelf ? `Loaded: ${shelf} / ${name}` : `Loaded: ${name}`;
      }

      function openNodeSettingsDialog() {
        openPopup({
          title: "Settings",
          width: 320,
          render(body) {
            const row = document.createElement("div");
            row.className = "ullc-preset-toggle-row";
            row.title =
              "Global for every Ultimate LoRA Loader node — hides Load / Save / Manage and the loaded chip";

            const toggle = document.createElement("div");
            toggle.className = "fll-toggle-switch" + (showPresetBar ? " on" : "");
            toggle.setAttribute("role", "switch");
            toggle.setAttribute(
              "aria-checked",
              showPresetBar ? "true" : "false",
            );
            const knob = document.createElement("div");
            knob.className = "fll-toggle-knob";
            toggle.appendChild(knob);

            const label = document.createElement("span");
            label.textContent = "Presets (Load · Save · Manage)";

            const hint = document.createElement("div");
            hint.className = "ullc-preset-hint";
            hint.textContent = showPresetBar
              ? "On for all nodes — toolbar + loaded chip"
              : "Off for all nodes — toolbar + loaded chip hidden";

            function paintToggle() {
              toggle.classList.toggle("on", showPresetBar);
              toggle.setAttribute(
                "aria-checked",
                showPresetBar ? "true" : "false",
              );
              hint.textContent = showPresetBar
                ? "On for all nodes — toolbar + loaded chip"
                : "Off for all nodes — toolbar + loaded chip hidden";
            }

            row.addEventListener("click", (e) => {
              e.stopPropagation();
              const next = !showPresetBar;
              // Persist first; event updates every node copy (including this one).
              updatePrefs({ showPresetBar: next })
                .then((res) => {
                  if (!res?.ok) syncShowPresetBar(next);
                  paintToggle();
                })
                .catch(() => {
                  syncShowPresetBar(next);
                  paintToggle();
                });
            });

            row.append(toggle, label);
            body.append(row, hint);
          },
        });
      }

      function setLoaded(next) {
        loadedPreset = normalizeLoaded(next);
        paintLoaded();
        resizeNode();
      }

      function persist() {
        if (dataWidget) {
          dataWidget.value = serializeLorasData(entries, loadedPreset);
        }
        node.setDirtyCanvas(true, true);
      }

      paintLoaded();

      function isClipConnected() {
        // clip is an optional input now - only show its strength control
        // when something is actually plugged in, since an editable-but-
        // inert control (Python forces strength_clip to 0 when clip is
        // None) would just be confusing UI clutter.
        const clipInput = node.inputs?.find((inp) => inp.name === "clip");
        return !!(clipInput && clipInput.link != null);
      }

      let draggedIndex = null;

      function render() {
        rowsWrap.innerHTML = "";
        const showClipStrength = isClipConnected();
        entries.forEach((entry, idx) => {
          const row = makeRow(entry, {
            onChange: persist,
            onRemove: () => {
              entries.splice(idx, 1);
              persist();
              render();
              resizeNode();
            },
            onReplace: (loraPath) => {
              const next = replaceEntryToEnd(entries, idx, loraPath);
              if (!next) return;
              clearEntryDisplay(next);
              seedEntryDisplay(next);
              persist();
              render();
              resizeNode();
            },
            onInfoToolkit: (loraPath) => {
              openCivitaiToolkitLoraInfo(loraPath);
            },
            onInfoFull: (loraPath) => {
              openPysssssLoraInfo(loraPath, node);
            },
            showClipStrength,
            currentPriority: idx + 1,
            onPriorityChange: (rawPriority) => {
              // Clamp to valid range and convert back to 0-indexed. Typing
              // a priority number is just another way to reorder - same
              // splice-based move as drag-and-drop, just driven by a typed
              // target position instead of a drop location.
              const targetIndex = Math.max(0, Math.min(entries.length - 1, rawPriority - 1));
              if (targetIndex === idx) {
                render(); // snap back to the correct value if unchanged/invalid
                return;
              }
              const [moved] = entries.splice(idx, 1);
              entries.splice(targetIndex, 0, moved);
              persist();
              render();
            },
            onDragStart: (e, rowEl) => {
              draggedIndex = idx;
              rowEl.classList.add("dragging");
            },
            onDragEnd: (e, rowEl) => {
              draggedIndex = null;
              // clear any lingering drop-target indicators on all rows,
              // not just this one, in case the drag ended outside a
              // valid drop target
              rowsWrap.querySelectorAll(".fll-row").forEach((r) => {
                r.classList.remove("dragging", "drop-target-above", "drop-target-below");
              });
            },
            onDragOver: (e, rowEl) => {
              if (draggedIndex === null || draggedIndex === idx) return;
              // show whether the dragged row would land above or below
              // this one, based on cursor position within the row's
              // height - gives clear visual feedback on drop position
              const rect = rowEl.getBoundingClientRect();
              const isAbove = e.clientY - rect.top < rect.height / 2;
              rowEl.classList.toggle("drop-target-above", isAbove);
              rowEl.classList.toggle("drop-target-below", !isAbove);
            },
            onDrop: (e, rowEl) => {
              if (draggedIndex === null || draggedIndex === idx) return;
              const rect = rowEl.getBoundingClientRect();
              const isAbove = e.clientY - rect.top < rect.height / 2;
              let targetIndex = isAbove ? idx : idx + 1;
              // account for the removal shifting indices when the dragged
              // row was originally before the target position
              if (draggedIndex < targetIndex) targetIndex -= 1;

              const [moved] = entries.splice(draggedIndex, 1);
              entries.splice(targetIndex, 0, moved);
              draggedIndex = null;
              persist();
              render();
            },
          });
          rowsWrap.appendChild(row);
        });
        headerRow.style.display = entries.length > 0 ? "flex" : "none";
        strengthLabel.textContent = showClipStrength ? "Model" : "Strength";
        clipStrengthLabel.style.display = showClipStrength ? "block" : "none";
        // reflect current state: switch shows "on" only when every row is enabled
        const allEnabled = entries.length > 0 && entries.every((e) => e.enabled);
        toggleAllSwitch.className = "fll-toggle-switch" + (allEnabled ? " on" : "");
      }

      toggleAllSlot.onclick = () => {
        if (entries.length === 0) return;
        // if every entry is already enabled, turn all off; otherwise turn all on
        const allEnabled = entries.every((e) => e.enabled);
        entries.forEach((e) => (e.enabled = !allEnabled));
        persist();
        render();
      };

      deleteAllSlot.onclick = () => {
        if (entries.length === 0) return;
        entries.length = 0;
        persist();
        render();
        resizeNode();
      };

      function syncWidth() {
        // Explicitly pin the container's pixel width to the node's current
        // width. Relying on CSS `width: 100%` here is what caused the
        // add-lora bar / text box to bleed past the node's rounded edge -
        // ComfyUI's DOM widget wrapper doesn't reliably constrain percentage
        // widths, so we compute and set an exact pixel value instead.
        //
        // Observed behavior: our content consistently sits closer to the
        // node's left edge than the right, meaning the wrapper ComfyUI's
        // Vue DOM widget system places container into likely insets it
        // from the left by some fixed amount that isn't part of our own
        // box model. A previous attempt shrank container's width from the
        // right to compensate, which was backwards - that makes the right
        // gap bigger, not smaller, since container is left-anchored with
        // no auto margin. Pulling container left with a negative margin
        // directly counteracts a left-side wrapper inset instead.
        const nodeWidth = node.size[0];
        const leftPull = 10; // negative margin to counteract the wrapper's left inset
        const w = Math.max(0, nodeWidth);
        container.style.width = w + "px";
        container.style.maxWidth = w + "px";
        container.style.marginLeft = -leftPull + "px";
        container.style.marginBottom = "0";
      }

      // Shared height calculation - used both to grow the node when loras
      // are added/removed, and to clamp the node back up (or let the list
      // scroll) if the user tries to manually drag it smaller than the
      // list's natural size.
      const ROW_HEIGHT = 44; // dual-line name + padding; strength column still fits
      const ROW_GAP = 4; // gap between rows in rowsWrap
      const HEADER_HEIGHT = 20; // .fll-header-row: toggle switch (16px) + row padding 2px*2 (4px)
      const ADD_BTN_HEIGHT = 28; // .fll-add-btn: ~14px text line + padding 6px*2 (12px) + border 1px*2 (2px)
      const PRESET_BAR_HEIGHT = 28; // Load / Save / Manage row
      const LOADED_ROW_HEIGHT = 24; // Loaded · chip under Add Lora
      const CONTAINER_PADDING_V = 12; // .fll-container top+bottom padding (6+6)
      const SOCKET_ROWS_HEIGHT = 56; // title bar + model/clip socket rows above the DOM widget
      const GAP_BETWEEN_SECTIONS = 4; // .fll-container's own `gap` between header/rowsWrap/addBtn
      const MIN_VISIBLE_ROWS = 2; // floor for the scrollable list area once the user shrinks the node below its natural size
      const BOTTOM_SLACK = 8; // extra buffer so bottom padding stays visually visible even if real rendered row height is a couple px taller than our ROW_HEIGHT estimate

      function computeRequiredHeights() {
        const rowCount = entries.length;
        const rowsHeightFull = rowCount > 0 ? rowCount * ROW_HEIGHT + (rowCount - 1) * ROW_GAP : 0;
        const headerHeight = rowCount > 0 ? HEADER_HEIGHT + GAP_BETWEEN_SECTIONS : 0;
        const loadedExtra = !loadedRow.hidden
          ? LOADED_ROW_HEIGHT + GAP_BETWEEN_SECTIONS
          : 0;
        const presetExtra = !presetBar.hidden
          ? PRESET_BAR_HEIGHT + GAP_BETWEEN_SECTIONS
          : 0;

        // "Chrome" = everything in the column except the row list itself:
        // add button, header row (+ its gap), and container's own vertical
        // padding (plus a small slack buffer so the bottom padding doesn't
        // visually disappear if real rendered content is a touch taller
        // than our fixed-constant estimate). Used both to size the node to
        // fit everything (natural), and to figure out how much space is
        // left for rowsWrap once the node is smaller than that (floor /
        // manual resize).
        const chromeHeight =
          presetExtra +
          ADD_BTN_HEIGHT +
          loadedExtra +
          headerHeight +
          (rowCount > 0 ? GAP_BETWEEN_SECTIONS : 0) +
          CONTAINER_PADDING_V +
          BOTTOM_SLACK;

        const minRowsVisible = Math.min(rowCount, MIN_VISIBLE_ROWS);
        const floorRowsHeight = minRowsVisible > 0 ? minRowsVisible * ROW_HEIGHT + (minRowsVisible - 1) * ROW_GAP : 0;

        return {
          // Node grows to fit every row with no scrolling - the
          // confirmed-working default behavior when adding/removing loras.
          naturalNodeHeight: SOCKET_ROWS_HEIGHT + chromeHeight + rowsHeightFull,
          // Smallest the node is ever allowed to shrink to manually - fits
          // the chrome plus at least MIN_VISIBLE_ROWS rows; beyond that the
          // list scrolls internally instead of spilling out or forcing the
          // node to keep growing.
          floorNodeHeight: SOCKET_ROWS_HEIGHT + chromeHeight + floorRowsHeight,
          chromeHeight,
        };
      }

      // Guards against onResize's manual-drag clamping logic firing as a
      // side effect of resizeNode()'s own programmatic node.setSize() calls.
      // node.setSize() triggers LiteGraph's onResize regardless of whether
      // a human dragged the corner or we called it ourselves to grow the
      // node - without this guard, every lora add/remove would immediately
      // have its "grow to fit everything, no scrolling" result overwritten
      // by onResize's "clamp to available space, scroll if needed" logic,
      // which is what caused the list to start scrolling again after only
      // 3 rows instead of continuing to grow.
      let isProgrammaticResize = false;

      function resizeNode() {
        syncWidth();
        // Both previous approaches to sizing this node (manual
        // delta-tracking, then widget.computeSize() reporting a measured
        // height) ended up fighting or looping with whatever height
        // ComfyUI's DOM widget wrapper imposes on `container` - measuring
        // container's height and then having that measurement feed back
        // into constraining container's height again is a trap. To
        // sidestep that failure mode entirely, this doesn't measure
        // anything - it computes the required height arithmetically from
        // known, fixed pixel sizes for each piece of UI, decoupled from
        // whatever the DOM wrapper does with container's actual rendered
        // box.
        const { naturalNodeHeight } = computeRequiredHeights();

        // Growing to fit every row (no scrolling) as loras are added is
        // the confirmed-working behavior from before - keep it as-is here.
        // rowsWrap only becomes scrollable when the user manually shrinks
        // the node smaller than this natural size (handled in onResize).
        rowsWrap.style.maxHeight = "";
        rowsWrap.style.overflowY = "visible";

        container.style.minHeight = naturalNodeHeight - SOCKET_ROWS_HEIGHT + "px";

        if (naturalNodeHeight > node.size[1]) {
          isProgrammaticResize = true;
          node.setSize([node.size[0], naturalNodeHeight]);
          node.setDirtyCanvas(true, true);
          isProgrammaticResize = false;
        }
      }

      // Keep width in sync whenever the user manually drags-resizes the node,
      // and enforce a minimum height so the row list can never spill out
      // past the node's border. Between the floor and the natural
      // (fits-everything) size, the row list scrolls internally to fit
      // whatever space the user has chosen; below the floor, the node
      // snaps back up to the floor instead of letting content clip.
      const onResize = node.onResize;
      node.onResize = function (size) {
        const r2 = onResize ? onResize.apply(this, arguments) : undefined;
        syncWidth();
        hideDataWidgetDom();

        // Skip the clamp/scroll logic entirely when this onResize firing
        // is just a side effect of resizeNode()'s own setSize call above -
        // resizeNode() already set the correct (unlimited/natural) rowsWrap
        // state, and we don't want to immediately clamp it back down.
        if (isProgrammaticResize) {
          return r2;
        }

        const { floorNodeHeight, chromeHeight } = computeRequiredHeights();

        if (node.size[1] < floorNodeHeight) {
          node.setSize([node.size[0], floorNodeHeight]);
        }

        // Whatever vertical space remains after the node's fixed chrome
        // (socket rows + button + header + padding) goes to the row list;
        // it scrolls internally to fit within that space.
        const availableForRows = node.size[1] - SOCKET_ROWS_HEIGHT - chromeHeight;
        rowsWrap.style.maxHeight = Math.max(availableForRows, ROW_HEIGHT) + "px";
        rowsWrap.style.overflowY = "auto";

        node.setDirtyCanvas(true, true);
        return r2;
      };

      // Fetch on-disk lora list + auto-heal entries moved within loras/
      // (unique basename match). Shared by create and workflow configure.
      function refreshTreeAndHeal() {
        return fetchLoraTree().then(() => {
          const healed = healMissingLoraPaths(entries);
          if (healed.length) {
            for (const entry of healed) {
              clearEntryDisplay(entry);
              seedEntryDisplay(entry);
            }
            persist();
          }
          render();
        });
      }

      // Re-neutralize the loras_data widget after workflow load/paste, since
      // onConfigure can rebuild widget state from serialized values.
      const onConfigure = node.onConfigure;
      node.onConfigure = function () {
        const r3 = onConfigure ? onConfigure.apply(this, arguments) : undefined;
        const w = node.widgets?.find((w2) => w2.name === "loras_data");
        if (w) {
          w.computeSize = () => [0, 0];
          w.draw = () => {};
          w.mouse = () => false;
        }
        {
          const parsed = parseLorasData(w?.value);
          entries = parsed.entries;
          loadedPreset = parsed.loaded;
          paintLoaded();
        }
        render();
        syncWidth();
        resizeNode();
        hideDataWidgetDom();
        // Heal after entries are loaded from the workflow (create-time heal
        // may have raced with an empty list before onConfigure ran).
        refreshTreeAndHeal();
        return r3;
      };

      // Re-render rows whenever clip is connected/disconnected, so the
      // clip-strength stepper appears or disappears immediately rather
      // than only updating on the next unrelated render.
      const onConnectionsChange = node.onConnectionsChange;
      node.onConnectionsChange = function (type, index, connected, link_info, ioSlot) {
        const r4 = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
        if (ioSlot?.name === "clip" || node.inputs?.[index]?.name === "clip") {
          render();
          resizeNode();
        }
        return r4;
      };

      function applyPresetEntries(nextEntries, meta = {}) {
        entries.length = 0;
        for (const entry of cloneEntries(nextEntries)) {
          seedEntryDisplay(entry);
          entries.push(entry);
        }
        // Replace rebinds to the loaded preset; Merge keeps the current bind.
        if (meta.mode === "replace") setLoaded(meta.loaded || null);
        persist();
        paintLoaded();
        render();
        resizeNode();
        hideDataWidgetDom();
      }

      async function reloadLoadedPreset() {
        const title = (loadedPreset?.title || "").trim();
        const category = (loadedPreset?.category || "").trim();
        if (!title) return;
        const result = await listPresets({ category });
        if (!result.ok) {
          console.error(config.log_prefix, result.error || "Failed to reload preset");
          return;
        }
        const key = title.toLowerCase();
        let preset = null;
        if (loadedPreset?.id) {
          preset = (result.presets || []).find((p) => p.id === loadedPreset.id) || null;
        }
        if (!preset) {
          preset =
            (result.presets || []).find(
              (p) => (p.title || "").trim().toLowerCase() === key,
            ) || null;
        }
        if (!preset) {
          console.warn(config.log_prefix, "Loaded preset not found in SQLite");
          return;
        }
        const { entries: next } = await enrichPresetEntries(preset.entries || []);
        applyPresetEntries(next, {
          mode: "replace",
          loaded: {
            id: preset.id,
            title: preset.title || title,
            category: preset.category || category,
          },
        });
      }

      loadPresetBtn.onclick = (e) => {
        e.stopPropagation();
        openLoadPresetDialog({
          currentEntries: entries,
          onLoad: (next, meta) => applyPresetEntries(next, meta),
        });
      };

      savePresetBtn.onclick = (e) => {
        e.stopPropagation();
        openSavePresetDialog({
          entries,
          loaded: loadedPreset,
          onSaved: (result) => {
            setLoaded({
              id: result.id,
              title: result.title,
              category: result.category,
            });
            persist();
          },
        });
      };

      managePresetBtn.onclick = (e) => {
        e.stopPropagation();
        openManagePresetsDialog();
      };

      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        openNodeSettingsDialog();
      };

      reloadLoadedBtn.onclick = (e) => {
        e.stopPropagation();
        reloadLoadedPreset().catch((err) => {
          console.error(config.log_prefix, err);
        });
      };

      detachLoadedBtn.onclick = (e) => {
        e.stopPropagation();
        setLoaded(null);
        persist();
      };

      addBtn.onclick = (e) => {
        e.stopPropagation();
        const rect = addBtn.getBoundingClientRect();
        openLoraBrowser(rect.left, rect.bottom + 4, (loraPath) => {
          const newEntry = {
            lora: loraPath,
            enabled: true,
            strengthModel: 1.0,
            strengthClip: 1.0,
          };
          if (!addEntryUnique(entries, newEntry)) return;
          seedEntryDisplay(newEntry);
          persist();
          render();
          resizeNode();
          hideDataWidgetDom();
        });
      };

      container.appendChild(addSection);
      container.appendChild(headerRow);
      container.appendChild(rowsWrap);

      node.addDOMWidget("ultimate_lora_loader_ui", "div", container, {
        serialize: false,
        hideOnZoom: false,
      });

      render();
      syncWidth();

      // Background: when Toolkit index is ready/refreshed, update persisted
      // display fields only if something changed — then one re-render.
      // Subsequent Comfy loads paint instantly from loras_data (no flicker).
      const unsubMeta = onCivitaiMetaReady(() => {
        if (syncEntriesDisplayFromCache(entries)) {
          persist();
          render();
        }
      });

      // Warm Toolkit index once (shared promise + path map).
      prefetchCivitaiMeta();

      refreshTreeAndHeal();

      // restore size sanity on load (also re-syncs width once ComfyUI has
      // finished laying out the node on the canvas, in case initial
      // node.size wasn't final yet at widget-creation time). Also retry
      // hiding the loras_data DOM element a few times with backoff, since
      // its DOM node may not exist yet at widget-creation time if it's
      // mounted asynchronously (e.g. Vue's next-tick rendering).
      setTimeout(() => {
        syncWidth();
        resizeNode();
        hideDataWidgetDom();
        scanAndHideLorasWidget();
        startLorasWidgetObserver();
      }, 0);
      [50, 150, 400, 1000].forEach((delay) => {
        setTimeout(() => {
          hideDataWidgetDom();
          scanAndHideLorasWidget();
        }, delay);
      });

      const onRemoved = node.onRemoved;
      node.onRemoved = function () {
        window.removeEventListener(UI_PREFS_EVENT, onGlobalPrefs);
        unsubMeta?.();
        if (lorasWidgetObserver) {
          lorasWidgetObserver.disconnect();
          lorasWidgetObserver = null;
        }
        return onRemoved ? onRemoved.apply(this, arguments) : undefined;
      };

      return r;
    };
  },
});
