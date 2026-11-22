"""SQLite library for LoRA stack presets with path-shelf categories."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from typing import Dict, List, Optional, Tuple

_lock = threading.Lock()

UNCATEGORISED_NAME = "Uncategorised"
SHELF_SEP = "/"


def _db_path() -> str:
    directory = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, "lora_presets.sqlite")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    _migrate(conn)
    conn.commit()
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(name)
        );

        CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            title TEXT NOT NULL COLLATE NOCASE,
            description TEXT NOT NULL DEFAULT '',
            entries TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(category_id, title)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_lora_presets_category_id ON presets(category_id)"
    )


def init_db() -> None:
    with _lock:
        conn = _connect()
        conn.close()


def _normalize_shelf_path(name: str) -> str:
    parts = [part.strip() for part in (name or "").split(SHELF_SEP)]
    return SHELF_SEP.join(part for part in parts if part)


def _split_path_name(folder: str, name: str) -> Tuple[str, str]:
    """`Scene` + `Walk/Night` → (`Scene/Walk`, `Night`)."""
    shelf = _normalize_shelf_path(folder)
    raw = (name or "").strip()
    if SHELF_SEP not in raw:
        return shelf, raw
    parts = [part.strip() for part in raw.split(SHELF_SEP) if part.strip()]
    if not parts:
        return shelf, ""
    if len(parts) == 1:
        return shelf, parts[0]
    prefix = SHELF_SEP.join(parts[:-1])
    leaf = parts[-1]
    combined = _normalize_shelf_path(f"{shelf}{SHELF_SEP}{prefix}" if shelf else prefix)
    return combined, leaf


def _in_shelf_tree(name: str, root: str) -> bool:
    key = (name or "").casefold()
    base = (root or "").casefold()
    return key == base or key.startswith(base + SHELF_SEP)


def _is_uncategorised(name: str) -> bool:
    return not name or name.casefold() == UNCATEGORISED_NAME.casefold()


def _get_or_create_category(conn: sqlite3.Connection, name: str) -> Tuple[int, bool]:
    shelf = _normalize_shelf_path(name)
    if _is_uncategorised(shelf):
        shelf = UNCATEGORISED_NAME
    row = conn.execute(
        "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
        (shelf,),
    ).fetchone()
    if row:
        return int(row["id"]), False
    cur = conn.execute("INSERT INTO categories (name) VALUES (?)", (shelf,))
    return int(cur.lastrowid), True


def _parse_entries(raw) -> List[dict]:
    if isinstance(raw, list):
        data = raw
    else:
        try:
            data = json.loads(raw or "[]")
        except Exception:
            return []
    if not isinstance(data, list):
        return []
    out: List[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        lora = str(item.get("lora") or "").strip()
        if not lora:
            continue
        entry = {
            "lora": lora,
            "enabled": bool(item.get("enabled", True)),
            "strengthModel": float(
                item.get("strengthModel", item.get("strength", 1.0)) or 0
            ),
            "strengthClip": float(
                item.get("strengthClip", item.get("strength", 1.0)) or 0
            ),
        }
        for key in ("civitaiName", "coverPath", "baseModel"):
            val = str(item.get(key) or "").strip()
            if val:
                entry[key] = val
        out.append(entry)
    return out


def _entries_json(entries: List[dict]) -> str:
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":"))


def _preset_row(row: sqlite3.Row) -> Dict:
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "description": row["description"] or "",
        "category": row["category"] or "",
        "entries": _parse_entries(row["entries"]),
        "updated_at": row["updated_at"] if "updated_at" in row.keys() else "",
    }


def save_preset(
    category: str,
    title: str,
    description: str = "",
    entries=None,
    overwrite: bool = False,
) -> Dict:
    shelf, name = _split_path_name(category, title)
    if not name:
        return {"ok": False, "error": "Name is required"}
    if not shelf:
        shelf = UNCATEGORISED_NAME

    parsed = _parse_entries(entries)
    if not parsed:
        return {"ok": False, "error": "Add at least one LoRA first"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            category_id, _created = _get_or_create_category(conn, shelf)
            existing = conn.execute(
                """
                SELECT id FROM presets
                WHERE category_id = ? AND title = ? COLLATE NOCASE
                """,
                (category_id, name),
            ).fetchone()
            if existing and not overwrite:
                conn.rollback()
                return {"ok": False, "conflicts": [{"name": name, "category": shelf}]}

            note = (description or "").strip()
            payload = _entries_json(parsed)
            if existing:
                conn.execute(
                    """
                    UPDATE presets
                    SET description = ?, entries = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (note, payload, int(existing["id"])),
                )
                preset_id = int(existing["id"])
            else:
                cur = conn.execute(
                    """
                    INSERT INTO presets (category_id, title, description, entries)
                    VALUES (?, ?, ?, ?)
                    """,
                    (category_id, name, note, payload),
                )
                preset_id = int(cur.lastrowid)
            conn.commit()
            return {
                "ok": True,
                "id": preset_id,
                "title": name,
                "category": shelf,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def list_presets(category: str = "", recursive: bool = False) -> Dict:
    shelf = _normalize_shelf_path(category)
    with _lock:
        conn = _connect()
        try:
            base_sql = """
                SELECT
                    presets.id,
                    presets.title,
                    presets.description,
                    presets.entries,
                    presets.updated_at,
                    categories.name AS category
                FROM presets
                JOIN categories ON categories.id = presets.category_id
            """
            if shelf and recursive:
                rows = conn.execute(
                    base_sql
                    + " ORDER BY categories.name COLLATE NOCASE, presets.title COLLATE NOCASE"
                ).fetchall()
                rows = [row for row in rows if _in_shelf_tree(row["category"], shelf)]
            elif shelf:
                rows = conn.execute(
                    base_sql
                    + """
                    WHERE categories.name = ? COLLATE NOCASE
                    ORDER BY presets.title COLLATE NOCASE
                    """,
                    (shelf,),
                ).fetchall()
            else:
                rows = conn.execute(
                    base_sql
                    + " ORDER BY categories.name COLLATE NOCASE, presets.title COLLATE NOCASE"
                ).fetchall()
            return {"ok": True, "presets": [_preset_row(row) for row in rows]}
        finally:
            conn.close()


def list_categories() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    categories.name AS name,
                    COUNT(presets.id) AS count
                FROM categories
                LEFT JOIN presets ON presets.category_id = categories.id
                GROUP BY categories.id
                ORDER BY categories.name COLLATE NOCASE
                """
            ).fetchall()
            return {
                "ok": True,
                "categories": [
                    {"name": row["name"], "count": int(row["count"] or 0)}
                    for row in rows
                ],
                "uncategorised": UNCATEGORISED_NAME,
            }
        finally:
            conn.close()


def update_preset(
    preset_id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    entries=None,
    overwrite: bool = False,
) -> Dict:
    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                """
                SELECT presets.*, categories.name AS category
                FROM presets
                JOIN categories ON categories.id = presets.category_id
                WHERE presets.id = ?
                """,
                (int(preset_id),),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}

            next_desc = (
                row["description"]
                if description is None
                else (description or "").strip()
            )
            next_entries = (
                _parse_entries(row["entries"])
                if entries is None
                else _parse_entries(entries)
            )
            if not next_entries:
                conn.rollback()
                return {"ok": False, "error": "Add at least one LoRA first"}

            category_id = int(row["category_id"])
            shelf = row["category"]
            base_shelf = shelf if category is None else category
            base_title = row["title"] if title is None else (title or "").strip()
            if title is not None or category is not None:
                shelf, next_title = _split_path_name(base_shelf, base_title)
            else:
                next_title = row["title"]

            if not next_title:
                conn.rollback()
                return {"ok": False, "error": "Name is required"}
            if not shelf:
                shelf = UNCATEGORISED_NAME

            if title is not None or category is not None:
                category_id, _created = _get_or_create_category(conn, shelf)

            if (
                next_title.casefold() != (row["title"] or "").casefold()
            ) or (category_id != int(row["category_id"])):
                existing = conn.execute(
                    """
                    SELECT id FROM presets
                    WHERE category_id = ? AND title = ? COLLATE NOCASE AND id != ?
                    """,
                    (category_id, next_title, int(preset_id)),
                ).fetchone()
                if existing and not overwrite:
                    conn.rollback()
                    return {
                        "ok": False,
                        "conflicts": [{"name": next_title, "category": shelf}],
                    }
                if existing and overwrite:
                    conn.execute(
                        "DELETE FROM presets WHERE id = ?", (int(existing["id"]),)
                    )

            conn.execute(
                """
                UPDATE presets
                SET category_id = ?, title = ?, description = ?, entries = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    category_id,
                    next_title,
                    next_desc,
                    _entries_json(next_entries),
                    int(preset_id),
                ),
            )
            conn.commit()
            return {
                "ok": True,
                "id": int(preset_id),
                "title": next_title,
                "category": shelf,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_preset(preset_id: int) -> Dict:
    with _lock:
        conn = _connect()
        try:
            cur = conn.execute("DELETE FROM presets WHERE id = ?", (int(preset_id),))
            conn.commit()
            if cur.rowcount == 0:
                return {"ok": False, "error": "Not found"}
            return {"ok": True}
        finally:
            conn.close()


def rename_category(name: str, new_name: str) -> Dict:
    old = _normalize_shelf_path(name)
    new = _normalize_shelf_path(new_name)
    if not old:
        return {"ok": False, "error": "Not found"}
    if not new:
        return {"ok": False, "error": "Invalid name"}
    if old == new:
        return {"ok": True, "name": new}
    if old.casefold() != new.casefold() and _in_shelf_tree(new, old):
        return {"ok": False, "error": "Cannot move a collection into itself"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            rows = conn.execute("SELECT id, name FROM categories").fetchall()
            moving = [row for row in rows if _in_shelf_tree(row["name"], old)]
            if not moving:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            moving_ids = {int(row["id"]) for row in moving}
            others = {
                (row["name"] or "").casefold()
                for row in rows
                if int(row["id"]) not in moving_ids
            }
            renames = [
                (int(row["id"]), new + (row["name"] or "")[len(old) :])
                for row in moving
            ]
            conflicts = [
                {"name": target}
                for _id, target in renames
                if target.casefold() in others
            ]
            if conflicts:
                conn.rollback()
                return {"ok": False, "conflicts": conflicts}
            for category_id, target in renames:
                conn.execute(
                    "UPDATE categories SET name = ? WHERE id = ?",
                    (target, category_id),
                )
            conn.commit()
            return {"ok": True, "name": new}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_category(name: str) -> Dict:
    shelf = _normalize_shelf_path(name)
    if not shelf:
        return {"ok": False, "error": "Not found"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            rows = conn.execute("SELECT id, name FROM categories").fetchall()
            ids = [int(row["id"]) for row in rows if _in_shelf_tree(row["name"], shelf)]
            if not ids:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            count = 0
            for category_id in ids:
                count += conn.execute(
                    "SELECT COUNT(*) AS c FROM presets WHERE category_id = ?",
                    (category_id,),
                ).fetchone()["c"]
                conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
            conn.commit()
            return {"ok": True, "deleted": int(count)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


# Prefs persisted in settings (shared across all nodes of this install).
UI_PREF_DEFAULTS = {
    "skipDisabledOnSave": False,
    # When False, Load / Save / Manage (+ loaded chip) are hidden (gear → Settings).
    "showPresetBar": False,
}


def get_prefs() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
            stored = {row["key"]: row["value"] for row in rows}
            prefs = {}
            for key, default in UI_PREF_DEFAULTS.items():
                raw = stored.get(key)
                if raw is None:
                    prefs[key] = default
                elif isinstance(default, bool):
                    prefs[key] = raw in ("1", "true", "True", "yes", "on")
                else:
                    prefs[key] = raw
            return {"ok": True, "prefs": prefs}
        finally:
            conn.close()


def update_prefs(updates: Optional[Dict] = None) -> Dict:
    if not isinstance(updates, dict):
        return {"ok": False, "error": "Invalid JSON"}
    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            for key, default in UI_PREF_DEFAULTS.items():
                if key not in updates:
                    continue
                val = updates[key]
                if isinstance(default, bool):
                    stored = "1" if bool(val) else "0"
                else:
                    stored = str(val)
                conn.execute(
                    """
                    INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (key, stored),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    return get_prefs()
