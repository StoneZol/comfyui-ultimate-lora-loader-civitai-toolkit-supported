const CSS = `    .fll-container {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 6px;
      gap: 4px;
      overflow: hidden;
    }

    .fll-row {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #2a2a2e;
      border-radius: 6px;
      padding: 4px 6px;
      box-sizing: border-box;
      width: 100%;
      border: 1px solid transparent;
    }

    .fll-row.disabled {
      opacity: 0.45;
    }

    .fll-row.enabled-highlight {
      background: #2f2b3d;
      border-color: #6d5aa8;
    }

    /* Missing on disk - wins over enabled-highlight's background/border so a
       broken row reads as broken whether it's toggled on or off. */
    .fll-row.missing,
    .fll-row.missing.enabled-highlight {
      background: #3a2323;
      border-color: #c0392b;
    }
    .fll-name.fll-name-missing {
      color: #ff8a80;
      cursor: pointer;
    }
    .fll-name.fll-name-missing:hover {
      text-decoration: underline;
    }

    /* --- Toggle switch (replaces checkbox) --- */
    .fll-toggle-switch {
      position: relative;
      flex: 0 0 30px;
      width: 30px;
      height: 16px;
      border-radius: 999px;
      background: #46464c;
      cursor: pointer;
      transition: background 0.15s ease;
      display: inline-block;
    }
    .fll-toggle-switch.on {
      background: #a78bfa;
    }
    .fll-toggle-switch .fll-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #e8e8ea;
      transition: left 0.15s ease;
    }
    .fll-toggle-switch.on .fll-toggle-knob {
      left: 16px;
    }

    .fll-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1px;
      color: #ddd;
      font-size: 12px;
      cursor: default;
      line-height: 1.2;
    }
    .fll-name-title,
    .fll-name-file {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fll-name-title {
      color: #e8e8ea;
      font-size: 12px;
    }
    .fll-name-file {
      color: #888;
      font-size: 10px;
    }
    .fll-name.fll-name-missing .fll-name-title {
      color: #ff8a80;
    }

    .fll-preview-btn {
      flex: 0 0 18px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #777;
      cursor: default;
      border-radius: 4px;
      user-select: none;
      opacity: 0.35;
    }
    .fll-preview-btn svg {
      width: 14px;
      height: 14px;
      display: block;
      pointer-events: none;
    }
    .fll-preview-btn.has-preview {
      opacity: 1;
      cursor: pointer;
      color: #aaa;
    }
    .fll-preview-btn.has-preview:hover {
      background: #3a3a3e;
      color: #c4b5fd;
    }
    .fll-header-preview-slot {
      flex: 0 0 18px;
      width: 18px;
    }
    .fll-base-model {
      flex: 0 0 78px;
      width: 78px;
      max-width: 78px;
      box-sizing: border-box;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 10px;
      line-height: 1.2;
      color: #c4b5fd;
      background: #2a2840;
      border: 1px solid #4a4568;
      border-radius: 4px;
      padding: 2px 5px;
      text-align: center;
      cursor: default;
      user-select: none;
    }
    .fll-base-model.empty {
      color: #666;
      background: transparent;
      border-color: transparent;
    }
    .fll-preview-tip {
      position: fixed;
      /* Above preset dialogs (12000/12100) so hover tips work in Manage/Edit */
      z-index: 13050;
      pointer-events: none;
      padding: 4px;
      background: #1c1c1f;
      border: 1px solid #555;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.55);
    }
    .fll-preview-tip img {
      display: block;
      max-width: 220px;
      max-height: 280px;
      object-fit: contain;
      border-radius: 4px;
    }

    .fll-drag-handle {
      flex: 0 0 16px;
      width: 16px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #777;
      cursor: grab;
      user-select: none;
    }
    .fll-drag-handle:active {
      cursor: grabbing;
    }
    .fll-drag-handle svg {
      width: 10px;
      height: 14px;
      fill: currentColor;
    }

    .fll-priority {
      flex: 0 0 26px;
      width: 26px;
      background: #1c1c1f;
      border: 1px solid #444;
      border-radius: 4px;
      color: #999;
      font-size: 11px;
      text-align: center;
      padding: 2px 0;
      box-sizing: border-box;
      cursor: pointer;
    }
    .fll-priority:focus {
      outline: none;
      border-color: #6d5aa8;
      color: #ddd;
    }
    .fll-priority::-webkit-outer-spin-button,
    .fll-priority::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .fll-priority[type="number"] {
      -moz-appearance: textfield;
    }

    .fll-row.dragging {
      opacity: 0.4;
    }

    .fll-row.drop-target-above {
      border-top: 2px solid #a78bfa;
    }
    .fll-row.drop-target-below {
      border-bottom: 2px solid #a78bfa;
    }

    .fll-strength-wrap {
      display: flex;
      align-items: center;
      flex: 0 0 74px;
      width: 74px;
      background: #1c1c1f;
      border: 1px solid #444;
      border-radius: 4px;
      box-sizing: border-box;
      overflow: hidden;
    }

    .fll-strength-arrow {
      flex: 0 0 18px;
      width: 18px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      cursor: pointer;
      user-select: none;
      font-size: 10px;
    }
    .fll-strength-arrow:hover {
      background: #2f2f34;
      color: #ddd;
    }

    .fll-strength {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      background: transparent;
      border: none;
      color: #ddd;
      font-size: 11px;
      text-align: center;
      padding: 2px 0;
      box-sizing: border-box;
      cursor: pointer;
    }
    .fll-strength:focus {
      outline: none;
    }
    /* hide native number spinner - we draw our own arrows */
    .fll-strength::-webkit-outer-spin-button,
    .fll-strength::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .fll-strength[type="number"] {
      -moz-appearance: textfield;
    }

    .fll-replace {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
    }
    .fll-replace:hover {
      background: #3a3a3e;
      color: #a78bfa;
    }
    .fll-replace svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
    }

    .fll-remove {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
    }
    .fll-remove:hover {
      background: #3a3a3e;
      color: #f87171;
    }
    .fll-remove svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
    }

    /* --- Header row (toggle-all / column labels / delete-all) --- */
    /* Matches .fll-row's column widths/gap/padding exactly so the toggle-all
       switch and delete-all icon line up with the switch/trash columns below. */
    .fll-header-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 6px;
      box-sizing: border-box;
      width: 100%;
    }
    .fll-header-label {
      font-size: 10px;
      color: #888;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fll-header-label.name-label {
      flex: 1 1 auto;
    }
    .fll-header-label.strength-label {
      flex: 0 0 74px;
      width: 74px;
      text-align: center;
    }
    .fll-header-toggle-slot {
      flex: 0 0 30px;
      width: 30px;
      display: flex;
      align-items: center;
    }
    .fll-header-replace-slot {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
    }
    .fll-header-remove-slot {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #888;
      cursor: pointer;
      border-radius: 4px;
    }
    .fll-header-remove-slot:hover {
      background: #3a3a3e;
      color: #f87171;
    }
    .fll-header-remove-slot svg {
      width: 12px;
      height: 12px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
    }

    .fll-add-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    .fll-add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 6px 0;
      background: #333338;
      border: 1px solid #46464c;
      border-radius: 6px;
      color: #ccc;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .fll-add-btn:hover {
      background: #3d3d43;
      border-color: #5a5a62;
    }
    .fll-heal-notice {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 6px 8px;
      background: #2a2840;
      border: 1px solid #4a4568;
      border-radius: 6px;
      color: #c4b5fd;
      font-size: 11px;
      line-height: 1.35;
    }
    .fll-heal-notice-text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .fll-heal-notice-close {
      flex: 0 0 auto;
      cursor: pointer;
      color: #888;
      font-size: 14px;
      line-height: 1;
      padding: 0 2px;
      user-select: none;
    }
    .fll-heal-notice-close:hover {
      color: #ddd;
    }

    /* --- Folder browser popup --- */

    .fll-popup-overlay {
      position: fixed;
      inset: 0;
      /* Above preset dialogs so Add/Replace LoRA picker is usable from Edit */
      z-index: 13000;
      background: rgba(0,0,0,0.35);
    }

    .fll-popup {
      position: fixed;
      z-index: 13001;
      min-width: 400px;
      max-width: 600px;
      width: min(600px, calc(100vw - 24px));
      max-height: 420px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #232326;
      border: 1px solid #46464c;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      padding: 0;
      box-sizing: border-box;
      font-size: 12px;
      color: #ddd;
    }

    .fll-popup-header {
      flex: 0 0 auto;
      padding: 4px 4px 0 4px;
      background: #232326;
      border-bottom: 1px solid #38383c;
      z-index: 1;
    }

    .fll-popup-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 6px 4px 4px 4px;
    }

    .fll-breadcrumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      padding: 4px 6px 6px 6px;
      margin-bottom: 0;
      border-bottom: none;
    }

    .fll-search {
      display: block;
      width: 75%;
      max-width: 75%;
      box-sizing: border-box;
      margin: 0 0 6px 0;
      padding: 6px 8px;
      background: #1c1c1f;
      border: 1px solid #444;
      border-radius: 5px;
      color: #ddd;
      font-size: 12px;
      outline: none;
    }
    .fll-search:focus {
      border-color: #6d5aa8;
    }
    .fll-search::placeholder {
      color: #777;
    }

    .fll-crumb {
      cursor: pointer;
      color: #a78bfa;
      white-space: nowrap;
      border-radius: 3px;
    }
    .fll-crumb:hover {
      text-decoration: underline;
    }
    .fll-crumb:focus-visible {
      outline: 1px solid #6d5aa8;
      outline-offset: 1px;
    }
    .fll-crumb-sep {
      color: #666;
      margin: 0 2px;
    }
    .fll-crumb.current {
      color: #ddd;
      cursor: default;
    }
    .fll-crumb.current:hover {
      text-decoration: none;
    }

    .fll-entry {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
    }
    .fll-entry:hover {
      background: #34343a;
    }
    .fll-entry:focus-visible {
      outline: 1px solid #6d5aa8;
      outline-offset: -1px;
      background: #34343a;
    }
    .fll-entry-icon {
      flex: 0 0 16px;
      text-align: center;
      opacity: 0.85;
    }
    .fll-entry-label {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fll-entry-label-wrap {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
      overflow: hidden;
    }
    .fll-search-group {
      padding: 6px 8px 4px 8px;
      margin-top: 2px;
      font-size: 11px;
      color: #a78bfa;
      border-bottom: 1px solid #38383c;
      user-select: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fll-search-group.clickable {
      cursor: pointer;
      border-radius: 4px;
    }
    .fll-search-group.clickable:hover {
      background: #2e2e34;
    }
    .fll-search-group:focus-visible {
      outline: 1px solid #6d5aa8;
      outline-offset: -1px;
    }
    .fll-entry-path {
      font-size: 10px;
      color: #a78bfa;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0.9;
    }
    .fll-entry-label-sub {
      font-size: 10px;
      color: #888;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fll-entry-arrow {
      flex: 0 0 auto;
      color: #888;
      font-size: 11px;
    }

    .fll-empty {
      padding: 14px 8px;
      color: #888;
      text-align: center;
    }

    /* --- Info buttons: Toolkit local (?) + pysssss full (i) --- */
    .fll-info {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      user-select: none;
    }
    .fll-info:hover {
      background: #3a3a3e;
      color: #a78bfa;
    }
    .fll-info.fll-info-full:hover {
      color: #60a5fa;
    }
    .fll-header-info-slot {
      flex: 0 0 20px;
      width: 20px;
    }
    .fll-header-info-pair {
      flex: 0 0 44px;
      width: 44px;
      display: flex;
      gap: 4px;
    }

    /* --- Civitai Toolkit-compatible info popup --- */
    .ullc-civitai-popup {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.75);
      /* Above preset dialogs when opened from Edit */
      z-index: 13100;
      display: flex;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(4px);
    }
    .ullc-civitai-popup .popup-content {
      background: var(--comfy-menu-bg, #2a2a2e);
      padding: 0;
      border-radius: 8px;
      max-width: 800px;
      width: 95%;
      border: 1px solid var(--border-color, #444);
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .ullc-civitai-popup .popup-header {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border-color, #444);
    }
    .ullc-civitai-popup .popup-header h2 {
      margin: 0;
      flex-grow: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--fg-color, #ddd);
      font-size: 1.15em;
    }
    .ullc-civitai-popup .popup-close {
      font-size: 28px;
      cursor: pointer;
      color: var(--fg-color, #ddd);
      margin-left: 15px;
      line-height: 1;
    }
    .ullc-civitai-popup .popup-close:hover { color: #f44; }
    .ullc-civitai-popup .popup-body {
      overflow-y: auto;
      word-break: break-word;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      color: var(--fg-color, #ddd);
    }
    .ullc-civitai-popup .model-description-content {
      font-size: 13px;
      background: rgba(0,0,0,0.2);
      padding: 12px;
      border-radius: 5px;
    }
    .ullc-civitai-popup .model-description-content.version-desc {
      background: rgba(80, 80, 0, 0.2);
    }
    .ullc-civitai-popup .model-description-content img {
      max-width: 100%;
      height: auto;
      border-radius: 5px;
      margin-top: 10px;
    }
    .ullc-civitai-popup .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .ullc-civitai-popup .info-item {
      background: var(--comfy-box-bg, #1c1c1f);
      padding: 8px;
      border-radius: 5px;
      font-size: 0.9em;
    }
    .ullc-civitai-popup .info-item strong {
      color: var(--desc-text-color, #999);
      margin-right: 8px;
    }
    .ullc-civitai-popup .info-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ullc-civitai-popup .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ullc-civitai-popup h4 { margin: 0; }
    .ullc-civitai-popup .detail-tags,
    .ullc-civitai-popup .triggers-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ullc-civitai-popup .detail-tag {
      background: var(--comfy-input-bg, #333);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
    }
    .ullc-civitai-popup .trigger-word {
      background: var(--comfy-input-bg, #333);
      padding: 5px 10px;
      border-radius: 5px;
      border: 1px solid var(--border-color, #444);
      cursor: pointer;
      user-select: none;
    }
    .ullc-civitai-popup .trigger-word:hover {
      border-color: var(--accent-color, #a78bfa);
      color: var(--accent-color, #a78bfa);
    }
    .ullc-civitai-popup .trigger-word.copied {
      border-color: #5f9;
      color: #5f9;
    }
    .ullc-civitai-popup .copy-btn,
    .ullc-civitai-popup .copy-all-btn {
      background: var(--comfy-input-bg, #333);
      border: 1px solid var(--border-color, #444);
      color: var(--input-text-color, #ddd);
      padding: 4px 10px;
      border-radius: 5px;
      cursor: pointer;
    }
    .ullc-civitai-popup .copy-btn:hover,
    .ullc-civitai-popup .copy-all-btn:hover {
      border-color: var(--accent-color, #a78bfa);
      color: var(--accent-color, #a78bfa);
    }
    .ullc-civitai-popup .copy-btn.copied,
    .ullc-civitai-popup .copy-all-btn.copied {
      border-color: #5f9;
      color: #5f9;
    }
    .ullc-civitai-popup .description-details summary {
      cursor: pointer;
      font-weight: bold;
      font-size: 1.1em;
    }
    .ullc-civitai-popup .hash-section {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--comfy-box-bg, #1c1c1f);
      padding: 10px;
      border-radius: 5px;
    }
    .ullc-civitai-popup .hash-section strong { flex-shrink: 0; }
    .ullc-civitai-popup .hash-code {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* --- Preset toolbar on node --- */
    .fll-preset-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .fll-preset-btn {
      flex: 1 1 auto;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 28px;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #444);
      background: var(--comfy-input-bg, #2a2a2e);
      color: var(--input-text, #ddd);
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      user-select: none;
      box-sizing: border-box;
    }
    .fll-preset-btn:hover {
      filter: brightness(1.15);
    }
    .fll-preset-btn svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      stroke: currentColor;
      fill: none;
    }

    /* Loaded · chip (prompt-craft style binding) */
    .fll-loaded-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 22px;
      padding: 0 2px;
      color: var(--descrip-text, #aaa);
      font-size: 11px;
    }
    .fll-loaded-row[hidden] {
      display: none !important;
    }
    .fll-loaded-info {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
    }
    .fll-loaded-label {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fll-loaded-label::before {
      content: "Loaded · ";
      color: var(--descrip-text, #777);
    }
    .fll-loaded-reset,
    .fll-loaded-clear {
      flex: 0 0 22px;
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--descrip-text, #888);
      cursor: pointer;
    }
    .fll-loaded-reset svg,
    .fll-loaded-clear svg {
      width: 13px;
      height: 13px;
      stroke: currentColor;
      fill: none;
    }
    .fll-loaded-reset:hover,
    .fll-loaded-clear:hover {
      border-color: var(--border-color, #555);
      color: var(--input-text, #ddd);
      background: var(--comfy-input-bg, #2a2a2e);
    }

    /* --- Preset dialogs --- */
    .ullc-preset-backdrop {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(3px);
    }
    .ullc-preset-backdrop.nested { z-index: 12100; }
    .ullc-preset-popup {
      position: relative;
      max-width: min(560px, calc(100vw - 32px));
      max-height: min(88vh, 760px);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid var(--border-color, #444);
      background: var(--comfy-menu-bg, #1e1e1e);
      color: var(--input-text, #ddd);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      font-family: inherit;
      font-size: 12px;
      overflow: hidden;
    }
    .ullc-preset-popup-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      flex-shrink: 0;
    }
    .ullc-preset-popup-title {
      flex: 1 1 auto;
      font-weight: 600;
      font-size: 14px;
    }
    .ullc-preset-popup-close {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: #aaa;
      cursor: pointer;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .ullc-preset-popup-close:hover { background: #333; color: #fff; }
    .ullc-preset-popup-close svg { width: 16px; height: 16px; }
    .ullc-preset-popup-body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
    }
    .ullc-preset-input,
    .ullc-preset-textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 7px 9px;
      border-radius: 6px;
      border: 1px solid #444;
      background: #2a2a2e;
      color: #ddd;
      font: inherit;
    }
    .ullc-preset-textarea { resize: vertical; min-height: 48px; }
    .ullc-preset-input:focus,
    .ullc-preset-textarea:focus {
      outline: none;
      border-color: #a78bfa;
    }
    .ullc-preset-hint {
      color: #888;
      font-size: 11px;
      line-height: 1.35;
    }
    .ullc-preset-message {
      color: #999;
      padding: 12px 4px;
      text-align: center;
    }
    .ullc-preset-error {
      color: #ff8a80;
      font-size: 11px;
      min-height: 1em;
    }
    .ullc-preset-banner {
      background: #3a2a1a;
      border: 1px solid #c07830;
      color: #ffcc80;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1.35;
    }
    .ullc-preset-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .ullc-preset-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #444);
      background: var(--comfy-input-bg, #2a2a2e);
      color: var(--input-text, #ddd);
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      box-sizing: border-box;
    }
    .ullc-preset-btn:hover:not(:disabled) { filter: brightness(1.15); }
    .ullc-preset-btn.primary {
      background: #2f2b3d;
      border-color: #6d5aa8;
      color: #e8e4f5;
    }
    .ullc-preset-btn.danger {
      background: #3a2323;
      border-color: #c0392b;
      color: #ff8a80;
    }
    .ullc-preset-btn.sm { height: 24px; padding: 0 8px; font-size: 11px; }
    .ullc-preset-btn:disabled { opacity: 0.4; cursor: default; }
    .ullc-preset-folder-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .ullc-preset-folder-row .ullc-preset-input { flex: 1 1 auto; min-width: 0; }
    .ullc-preset-folder-row .ullc-preset-btn { flex: 0 0 auto; }
    .ullc-shelf-crumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-bottom: 2px;
    }
    .ullc-shelf-crumb {
      border: none;
      background: transparent;
      color: #aaa;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .ullc-shelf-crumb:hover { color: #fff; background: #333; }
    .ullc-shelf-crumb.current {
      color: #e8e4f5;
      cursor: default;
      font-weight: 600;
    }
    .ullc-shelf-crumb-sep { color: #666; font-size: 11px; }
    .ullc-shelf-pick-list {
      flex: 1 1 auto;
      min-height: 140px;
      max-height: min(40vh, 320px);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ullc-shelf-pick-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      text-align: left;
      border: 1px solid #3a3a40;
      background: #2a2a2e;
      color: #ddd;
      border-radius: 6px;
      padding: 7px 9px;
      font: inherit;
      cursor: pointer;
    }
    .ullc-shelf-pick-item:hover { border-color: #6d5aa8; }
    .ullc-shelf-pick-item.folder::before {
      content: "›";
      color: #888;
      margin-right: 2px;
    }
    .ullc-shelf-pick-count { color: #888; font-size: 11px; }
    .ullc-preset-icon-btn {
      width: 26px;
      height: 26px;
      border: 1px solid transparent;
      background: transparent;
      color: #aaa;
      border-radius: 5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .ullc-preset-icon-btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; }
    .ullc-preset-icon-btn:hover { background: #333; color: #fff; }
    .ullc-preset-icon-btn.danger:hover { color: #ff8a80; }
    .ullc-preset-list {
      flex: 1 1 auto;
      min-height: 180px;
      max-height: min(52vh, 480px);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-right: 2px;
    }
    .ullc-preset-folder {
      border: 1px solid #333;
      border-radius: 8px;
      overflow: hidden;
      background: #252528;
    }
    .ullc-preset-folder.collapsed > .ullc-preset-folder-body { display: none; }
    .ullc-preset-folder-head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: none;
      background: #2c2c30;
      color: inherit;
      font: inherit;
      cursor: pointer;
      text-align: left;
      box-sizing: border-box;
    }
    .ullc-preset-folder-manage { cursor: default; }
    .ullc-preset-folder-toggle {
      border: none;
      background: transparent;
      color: #aaa;
      padding: 0;
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .ullc-preset-folder-chevron,
    .ullc-preset-folder-toggle svg {
      width: 14px;
      height: 14px;
      display: inline-flex;
      transition: transform 0.15s ease;
    }
    .ullc-preset-folder.collapsed .ullc-preset-folder-chevron,
    .ullc-preset-folder.collapsed .ullc-preset-folder-toggle svg {
      transform: rotate(-90deg);
    }
    .ullc-preset-folder-name {
      flex: 1 1 auto;
      min-width: 0;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ullc-preset-folder-count {
      color: #888;
      font-size: 11px;
      margin-right: 4px;
    }
    .ullc-preset-folder-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px;
    }
    .ullc-preset-card {
      border: 1px solid #3a3a40;
      border-radius: 7px;
      padding: 7px 8px;
      background: #2a2a2e;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ullc-preset-card-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
      justify-content: space-between;
    }
    .ullc-preset-card-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ullc-preset-card-meta { color: #888; font-size: 11px; flex-shrink: 0; }
    .ullc-preset-card-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      align-items: center;
    }
    .ullc-preset-card-desc {
      color: #999;
      font-size: 11px;
      line-height: 1.35;
    }
    .ullc-preset-entry-list {
      flex: 1 1 auto;
      min-height: 120px;
      max-height: min(40vh, 360px);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ullc-preset-entry-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid #3a3a40;
      background: #2a2a2e;
    }
    .ullc-preset-entry-row.changed {
      background: #3a2323;
      border-color: #c0392b;
    }
    .ullc-preset-entry-row.missing {
      background: #4a1f1f;
      border-color: #e74c3c;
    }
    .ullc-preset-entry-info {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ullc-preset-entry-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ullc-preset-entry-path {
      font-size: 10px;
      color: #888;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ullc-preset-entry-row.changed .ullc-preset-entry-name,
    .ullc-preset-entry-row.missing .ullc-preset-entry-name {
      color: #ff8a80;
    }
    .ullc-preset-entry-btns {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      align-items: center;
    }
    .ullc-preset-edit-toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-shrink: 0;
    }
    .ullc-preset-node-header {
      flex-shrink: 0;
      margin: 0;
    }
    .ullc-preset-node-list {
      gap: 4px;
    }
    .ullc-preset-node-row {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      box-sizing: border-box;
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 1px;
    }
    .ullc-preset-node-row .fll-row {
      flex: 1 1 auto;
      min-width: 0;
    }
    .ullc-preset-node-row.changed {
      border-color: #c0392b;
      background: rgba(192, 57, 43, 0.12);
    }
    .ullc-preset-node-row.missing {
      border-color: #e74c3c;
      background: rgba(231, 76, 60, 0.16);
    }
    .ullc-preset-popup {
      max-width: min(780px, calc(100vw - 32px));
    }
    .ullc-preset-check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      color: #ccc;
      font-size: 12px;
    }
    .ullc-preset-check {
      width: 14px;
      height: 14px;
      accent-color: #a78bfa;
    }
`;

export function injectStyles(
    styleId = "ultimate-lora-loader-civitai-styles",
) {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = CSS;
    document.head.appendChild(style);
}
