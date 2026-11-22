"""HTTP routes for the LoRA presets library."""

from aiohttp import web
from server import PromptServer

from . import db
from .nodes import CONFIG

PRESETS_ROUTE = f"{CONFIG['api_prefix']}/presets"
CATEGORIES_ROUTE = f"{CONFIG['api_prefix']}/categories"
PREFS_ROUTE = f"{CONFIG['api_prefix']}/prefs"

db.init_db()


async def _read_json(request):
    try:
        payload = await request.json()
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


async def save_preset(request):
    payload = await _read_json(request)
    if payload is None:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.save_preset(
            payload.get("category") or "",
            payload.get("title") or "",
            payload.get("description") or "",
            entries=payload.get("entries"),
            overwrite=bool(payload.get("overwrite")),
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def list_presets(request):
    try:
        result = db.list_presets(
            request.query.get("category") or "",
            recursive=(request.query.get("recursive") or "") in ("1", "true"),
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def update_preset(request):
    payload = await _read_json(request)
    if payload is None or not payload.get("id"):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        kwargs = {
            "overwrite": bool(payload.get("overwrite")),
        }
        if "title" in payload:
            kwargs["title"] = payload["title"]
        if "description" in payload:
            kwargs["description"] = payload["description"]
        if "category" in payload:
            kwargs["category"] = payload["category"]
        if "entries" in payload:
            kwargs["entries"] = payload["entries"]
        result = db.update_preset(int(payload["id"]), **kwargs)
    except (TypeError, ValueError):
        return web.json_response({"ok": False, "error": "Invalid id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    if result.get("error") == "Not found":
        status = 404
    return web.json_response(result, status=status)


async def delete_preset(request):
    preset_id = request.rel_url.query.get("id")
    if not preset_id:
        return web.json_response({"ok": False, "error": "Missing id"}, status=400)
    try:
        result = db.delete_preset(int(preset_id))
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 404 if result.get("error") == "Not found" else 400
    return web.json_response(result, status=status)


async def list_categories(request):
    try:
        result = db.list_categories()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def update_category(request):
    payload = await _read_json(request)
    if payload is None:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.rename_category(payload.get("name") or "", payload.get("new_name") or "")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    if result.get("error") == "Not found":
        status = 404
    return web.json_response(result, status=status)


async def delete_category(request):
    name = request.rel_url.query.get("name")
    if not name:
        return web.json_response({"ok": False, "error": "Missing name"}, status=400)
    try:
        result = db.delete_category(name)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 404 if result.get("error") == "Not found" else 400
    return web.json_response(result, status=status)


async def get_prefs(request):
    try:
        result = db.get_prefs()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def patch_prefs(request):
    payload = await _read_json(request)
    if payload is None:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.update_prefs(payload.get("prefs") if "prefs" in payload else payload)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 400
    return web.json_response(result, status=status)


# Guard by path once (same pattern as size-presets / prompt-craft): a single
# path hosts GET+POST+PATCH+DELETE. Checking per-call would skip every method
# after the first and leave list/load as HTTP 404.
_existing = {getattr(route, "path", None) for route in PromptServer.instance.routes}

if PRESETS_ROUTE not in _existing:
    PromptServer.instance.routes.post(PRESETS_ROUTE)(save_preset)
    PromptServer.instance.routes.get(PRESETS_ROUTE)(list_presets)
    PromptServer.instance.routes.patch(PRESETS_ROUTE)(update_preset)
    PromptServer.instance.routes.delete(PRESETS_ROUTE)(delete_preset)
else:
    print(
        f"{CONFIG['log_prefix']} Route {PRESETS_ROUTE} already registered "
        "(duplicate custom_nodes install with the same api_prefix?). Skipping."
    )

if CATEGORIES_ROUTE not in _existing:
    PromptServer.instance.routes.get(CATEGORIES_ROUTE)(list_categories)
    PromptServer.instance.routes.patch(CATEGORIES_ROUTE)(update_category)
    PromptServer.instance.routes.delete(CATEGORIES_ROUTE)(delete_category)
else:
    print(
        f"{CONFIG['log_prefix']} Route {CATEGORIES_ROUTE} already registered "
        "(duplicate custom_nodes install with the same api_prefix?). Skipping."
    )

if PREFS_ROUTE not in _existing:
    PromptServer.instance.routes.get(PREFS_ROUTE)(get_prefs)
    PromptServer.instance.routes.patch(PREFS_ROUTE)(patch_prefs)
else:
    print(
        f"{CONFIG['log_prefix']} Route {PREFS_ROUTE} already registered "
        "(duplicate custom_nodes install with the same api_prefix?). Skipping."
    )
