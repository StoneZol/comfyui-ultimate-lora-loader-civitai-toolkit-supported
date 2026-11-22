import { fetchLoraTree } from "./lora_tree.js";
import {
    fetchCivitaiLocalModels,
    findCivitaiModel,
} from "./civitai_toolkit_info.js";
import {
    createPreviewButton,
    hidePreviewTip,
} from "./preview_tip.js";

// Folder browser popup

/**
 * Opens a folder-drill-down popup anchored near (x, y).
 * Calls onSelect(fullRelativePath) when a file is chosen.
 *
 * Search: empty = browse current folder; non-empty = recursive search
 * within the subtree rooted at the current breadcrumb path.
 */
export function openLoraBrowser(x, y, onSelect) {
    const overlay = document.createElement("div");
    overlay.className = "fll-popup-overlay";

    const popup = document.createElement("div");
    popup.className = "fll-popup";

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // position, clamped to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    popup.style.left = Math.min(x, vw - 620) + "px";
    popup.style.top = Math.min(y, vh - 440) + "px";

    const close = () => {
        if (searchTimer) clearTimeout(searchTimer);
        document.removeEventListener(
            "keydown",
            onPopupKeyDown,
            true,
        );
        hidePreviewTip();
        overlay.remove();
    };
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });

    function getFocusables() {
        const search = popup.querySelector(".fll-search");
        const crumbs = [
            ...popup.querySelectorAll(
                ".fll-crumb:not(.current)",
            ),
        ];
        const groups = [
            ...popup.querySelectorAll(
                ".fll-search-group.clickable",
            ),
        ];
        const entries = [
            ...popup.querySelectorAll(".fll-entry"),
        ];
        return [
            search,
            ...groups,
            ...entries,
            ...crumbs,
        ].filter(Boolean);
    }

    function cycleFocus(backward) {
        const items = getFocusables();
        if (!items.length) return;
        const active = document.activeElement;
        let i = items.indexOf(active);
        if (i === -1) i = backward ? 0 : -1;
        const next =
            items[
                (i + (backward ? -1 : 1) + items.length) %
                    items.length
            ];
        next.focus();
        if (next.classList.contains("fll-entry")) {
            next.scrollIntoView({ block: "nearest" });
        }
    }

    function onPopupKeyDown(e) {
        if (!overlay.isConnected) return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
        }
        if (e.key !== "Tab") return;
        // Keep Tab inside the popup; don't let Comfy steal focus.
        e.preventDefault();
        e.stopPropagation();
        cycleFocus(e.shiftKey);
    }
    document.addEventListener(
        "keydown",
        onPopupKeyDown,
        true,
    );

    // Enter / Space activate focused crumb or entry (Tab lands on them).
    popup.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const el = e.target;
        if (!(el instanceof HTMLElement)) return;
        if (
            el.classList.contains("fll-entry") ||
            el.classList.contains("fll-crumb") ||
            el.classList.contains("fll-search-group")
        ) {
            e.preventDefault();
            e.stopPropagation();
            el.click();
        }
    });

    let path = []; // array of folder names representing current drill-down position
    let searchQuery = "";
    let searchTimer = null;
    const SEARCH_DEBOUNCE_MS = 200;
    let civitaiModels = null; // Toolkit index (optional)

    Promise.all([
        fetchLoraTree(),
        fetchCivitaiLocalModels().catch(() => null),
    ]).then(([tree, models]) => {
        civitaiModels = models;
        renderLevel(tree, { focusSearch: true });
    });

    function metaForFile(fullPath) {
        if (!civitaiModels || !fullPath) return null;
        return findCivitaiModel(civitaiModels, fullPath);
    }

    /**
     * Path-aware search: `te/va/finalname` matches nested folders in order
     * (each `/`-segment must hit a later path segment via includes).
     * Plain queries (no `/`) still match filename / full path / Civitai / base.
     */
    function matchPathBySegments(query, pathStr) {
        const parts = String(query || "")
            .replace(/\\/g, "/")
            .split("/")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        if (!parts.length) return true;
        const hay = String(pathStr || "")
            .replace(/\\/g, "/")
            .toLowerCase();
        const segs = hay.split("/").filter(Boolean);
        if (parts.length === 1) {
            const q = parts[0];
            return (
                hay.includes(q) ||
                segs.some((s) => s.includes(q))
            );
        }
        // Ordered nesting: te → va → name across successive path levels.
        let i = 0;
        for (const seg of segs) {
            if (i < parts.length && seg.includes(parts[i]))
                i += 1;
        }
        return i === parts.length;
    }

    function matchesQuery(
        q,
        { file, full, relFromRoot },
        meta,
    ) {
        const raw = String(q || "").trim();
        if (!raw) return true;
        if (matchPathBySegments(raw, file)) return true;
        if (matchPathBySegments(raw, relFromRoot))
            return true;
        if (matchPathBySegments(raw, full)) return true;
        // Civitai / base: only for single-token queries (not path drills).
        if (!/[/\\]/.test(raw)) {
            const civitai = (
                meta?.civitai_model_name || ""
            ).toLowerCase();
            if (civitai.includes(raw.toLowerCase()))
                return true;
            const base = (
                meta?.base_model || ""
            ).toLowerCase();
            if (base.includes(raw.toLowerCase()))
                return true;
        } else {
            // Last segment may still hit Civitai display name.
            const leaf = raw
                .replace(/\\/g, "/")
                .split("/")
                .map((s) => s.trim())
                .filter(Boolean)
                .pop();
            const civitai = (
                meta?.civitai_model_name || ""
            ).toLowerCase();
            if (
                leaf &&
                civitai.includes(leaf.toLowerCase())
            ) {
                // Still require folder segments to match path.
                const folderQ = raw
                    .replace(/\\/g, "/")
                    .replace(/\/[^/]*$/, "");
                if (
                    matchPathBySegments(
                        folderQ,
                        relFromRoot,
                    ) ||
                    matchPathBySegments(folderQ, full)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    function goToPath(nextPath, tree) {
        path = nextPath;
        searchQuery = "";
        if (searchTimer) {
            clearTimeout(searchTimer);
            searchTimer = null;
        }
        renderLevel(tree, { focusSearch: true });
    }

    /** Keep only matching files + folders that still contain matches. */
    function pruneTreeForSearch(node, folderPrefix, q) {
        if (!node || typeof node !== "object") return null;

        const fullPaths = node.__full_paths__ || {};
        const keptFiles = [];
        const keptFull = {};
        for (const file of node.__files__ || []) {
            const full =
                fullPaths[file] ||
                [...folderPrefix, file].join("/");
            const relFromRoot = [
                ...folderPrefix,
                file,
            ].join("/");
            if (
                matchesQuery(
                    q,
                    { file, full, relFromRoot },
                    metaForFile(full),
                )
            ) {
                keptFiles.push(file);
                keptFull[file] = full;
            }
        }
        keptFiles.sort((a, b) => a.localeCompare(b));

        const children = {};
        for (const key of Object.keys(node)) {
            if (
                key === "__files__" ||
                key === "__full_paths__"
            )
                continue;
            const child = pruneTreeForSearch(
                node[key],
                [...folderPrefix, key],
                q,
            );
            if (child) children[key] = child;
        }

        if (
            !keptFiles.length &&
            !Object.keys(children).length
        )
            return null;
        return {
            ...children,
            __files__: keptFiles,
            __full_paths__: keptFull,
        };
    }

    /** Nested search results — same folder hierarchy as browse mode. */
    function renderSearchTree(
        list,
        pruned,
        folderPrefix,
        tree,
        depth,
    ) {
        const subfolders = Object.keys(pruned)
            .filter(
                (k) =>
                    k !== "__files__" &&
                    k !== "__full_paths__",
            )
            .sort((a, b) => a.localeCompare(b));

        for (const folder of subfolders) {
            const child = pruned[folder];
            const fileCount = countPrunedFiles(child);
            const row = document.createElement("div");
            row.className = "fll-search-group clickable";
            row.tabIndex = 0;
            row.style.paddingLeft = `${8 + depth * 14}px`;
            row.textContent = `📁 ${folder}  ·  ${fileCount}`;
            row.title = `Open folder: ${[...path, ...folderPrefix, folder].join("/")}`;
            row.onclick = () => {
                goToPath(
                    [...path, ...folderPrefix, folder],
                    tree,
                );
            };
            list.appendChild(row);
            renderSearchTree(
                list,
                child,
                [...folderPrefix, folder],
                tree,
                depth + 1,
            );
        }

        const fullPaths = pruned.__full_paths__ || {};
        for (const file of pruned.__files__ || []) {
            appendFileEntry(list, {
                file,
                full:
                    fullPaths[file] ||
                    [...folderPrefix, file].join("/"),
                pathHint: "",
                depth,
            });
        }
    }

    function countPrunedFiles(node) {
        if (!node) return 0;
        let n = (node.__files__ || []).length;
        for (const key of Object.keys(node)) {
            if (
                key === "__files__" ||
                key === "__full_paths__"
            )
                continue;
            n += countPrunedFiles(node[key]);
        }
        return n;
    }

    function focusSearchInput(search) {
        requestAnimationFrame(() => {
            search.focus();
            const len = search.value.length;
            try {
                search.setSelectionRange(len, len);
            } catch (_) {
                /* search inputs in some browsers are picky about selection */
            }
        });
    }

    function appendFileEntry(
        list,
        { file, full, pathHint, depth = 0 },
    ) {
        const entry = document.createElement("div");
        entry.className = "fll-entry";
        entry.tabIndex = 0;
        if (depth > 0)
            entry.style.paddingLeft = `${8 + depth * 14}px`;

        const icon = document.createElement("span");
        icon.className = "fll-entry-icon";
        icon.textContent = "🔹";

        const meta = metaForFile(full);
        const civitaiName = (
            meta?.civitai_model_name || ""
        ).trim();
        const coverUrl = meta?.local_cover_path || null;
        const previewBtn = createPreviewButton(coverUrl);

        const baseModel = document.createElement("div");
        baseModel.className = "fll-base-model";
        const bm = (meta?.base_model || "").trim();
        if (bm) {
            baseModel.textContent = bm;
            baseModel.title = bm;
        } else {
            baseModel.classList.add("empty");
            baseModel.textContent = "—";
        }

        const labelWrap = document.createElement("div");
        labelWrap.className = "fll-entry-label-wrap";

        // In search hits, show folder structure first so you see where it lives.
        if (pathHint) {
            const pathLine = document.createElement("span");
            pathLine.className = "fll-entry-path";
            pathLine.textContent =
                "📁 " + pathHint.split("/").join(" / ");
            pathLine.title = pathHint;
            labelWrap.appendChild(pathLine);
        }

        const label = document.createElement("span");
        label.className = "fll-entry-label";
        if (
            civitaiName &&
            civitaiName.toLowerCase() !== file.toLowerCase()
        ) {
            label.textContent = civitaiName;
            const sub = document.createElement("span");
            sub.className = "fll-entry-label-sub";
            sub.textContent = file;
            labelWrap.appendChild(label);
            labelWrap.appendChild(sub);
        } else {
            label.textContent = file;
            labelWrap.appendChild(label);
        }

        const tipLines = [];
        if (pathHint) tipLines.push(pathHint);
        if (civitaiName) tipLines.push(civitaiName);
        tipLines.push(full);
        labelWrap.title = tipLines.join("\n");

        entry.appendChild(icon);
        entry.appendChild(previewBtn);
        entry.appendChild(baseModel);
        entry.appendChild(labelWrap);

        entry.onclick = () => {
            onSelect(full);
            close();
        };

        list.appendChild(entry);
    }

    function renderLevel(
        tree,
        { focusSearch = false } = {},
    ) {
        hidePreviewTip();

        // walk to current path
        let node = tree;
        for (const seg of path) {
            node = node[seg];
            if (!node) {
                // path became invalid (e.g. folder deleted) - reset to root
                path = [];
                node = tree;
                break;
            }
        }

        popup.innerHTML = "";

        const header = document.createElement("div");
        header.className = "fll-popup-header";

        // breadcrumbs
        const crumbs = document.createElement("div");
        crumbs.className = "fll-breadcrumbs";

        const rootCrumb = document.createElement("span");
        rootCrumb.className =
            "fll-crumb" +
            (path.length === 0 ? " current" : "");
        rootCrumb.textContent = "loras";
        if (path.length > 0) rootCrumb.tabIndex = 0;
        rootCrumb.onclick = () => {
            goToPath([], tree);
        };
        crumbs.appendChild(rootCrumb);

        path.forEach((seg, idx) => {
            const sep = document.createElement("span");
            sep.className = "fll-crumb-sep";
            sep.textContent = "/";
            crumbs.appendChild(sep);

            const crumb = document.createElement("span");
            const isCurrent = idx === path.length - 1;
            crumb.className =
                "fll-crumb" + (isCurrent ? " current" : "");
            crumb.textContent = seg;
            if (!isCurrent) crumb.tabIndex = 0;
            crumb.onclick = () => {
                goToPath(path.slice(0, idx + 1), tree);
            };
            crumbs.appendChild(crumb);
        });

        header.appendChild(crumbs);

        const q = searchQuery.trim().toLowerCase();
        const scopeLabel = path.length
            ? path.join("/")
            : "all folders";

        const search = document.createElement("input");
        search.type = "search";
        search.className = "fll-search";
        search.placeholder = q
            ? `Search in ${scopeLabel}…`
            : `Search in ${scopeLabel} (name · folder/sub/file)…`;
        search.value = searchQuery;
        search.autocomplete = "off";
        search.spellcheck = false;
        // Stop Comfy/LiteGraph from eating keystrokes while typing in the popup.
        search.addEventListener("keydown", (e) =>
            e.stopPropagation(),
        );
        search.addEventListener("keyup", (e) =>
            e.stopPropagation(),
        );
        search.addEventListener("keypress", (e) =>
            e.stopPropagation(),
        );
        search.oninput = () => {
            const pending = search.value;
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchQuery = pending;
                renderLevel(tree, { focusSearch: true });
            }, SEARCH_DEBOUNCE_MS);
        };
        header.appendChild(search);
        popup.appendChild(header);

        const list = document.createElement("div");
        list.className = "fll-popup-list";

        if (q) {
            // Keep folder nesting: prune subtree to matches, then render as a tree.
            const pruned = pruneTreeForSearch(node, [], q);
            if (!pruned) {
                const empty = document.createElement("div");
                empty.className = "fll-empty";
                empty.textContent = "No matches";
                list.appendChild(empty);
            } else {
                renderSearchTree(list, pruned, [], tree, 0);
            }

            popup.appendChild(list);
            if (focusSearch) focusSearchInput(search);
            return;
        }

        // Browse mode: only the current folder level.
        const subfolders = Object.keys(node)
            .filter(
                (k) =>
                    k !== "__files__" &&
                    k !== "__full_paths__",
            )
            .sort((a, b) => a.localeCompare(b));

        const files = (node.__files__ || [])
            .slice()
            .sort((a, b) => a.localeCompare(b));
        const fullPaths = node.__full_paths__ || {};

        if (subfolders.length === 0 && files.length === 0) {
            const empty = document.createElement("div");
            empty.className = "fll-empty";
            empty.textContent = "No LoRAs here";
            list.appendChild(empty);
            popup.appendChild(list);
            if (focusSearch) focusSearchInput(search);
            return;
        }

        for (const folder of subfolders) {
            const entry = document.createElement("div");
            entry.className = "fll-entry";
            entry.tabIndex = 0;

            const icon = document.createElement("span");
            icon.className = "fll-entry-icon";
            icon.textContent = "📁";

            const label = document.createElement("span");
            label.className = "fll-entry-label";
            label.textContent = folder;

            const arrow = document.createElement("span");
            arrow.className = "fll-entry-arrow";
            arrow.textContent = "▸";

            entry.appendChild(icon);
            entry.appendChild(label);
            entry.appendChild(arrow);

            entry.onclick = () => {
                goToPath([...path, folder], tree);
            };

            list.appendChild(entry);
        }

        for (const file of files) {
            appendFileEntry(list, {
                file,
                full: fullPaths[file] || file,
                pathHint: "",
            });
        }

        popup.appendChild(list);
        if (focusSearch) focusSearchInput(search);
    }
}
