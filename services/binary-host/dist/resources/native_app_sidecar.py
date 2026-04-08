import json
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

VERSION = "0.1.0"
IMPORT_ERROR = None

try:
    from pywinauto import Desktop
    from pywinauto.application import Application
    from pywinauto.keyboard import send_keys
except Exception as exc:  # pragma: no cover - exercised through host status
    IMPORT_ERROR = str(exc)
    Desktop = None
    Application = None
    send_keys = None


SEMANTIC_CONTROL_TYPES = {
    "Button",
    "CheckBox",
    "ComboBox",
    "Custom",
    "DataItem",
    "Document",
    "Edit",
    "Hyperlink",
    "List",
    "ListItem",
    "Menu",
    "MenuBar",
    "MenuItem",
    "Pane",
    "RadioButton",
    "Tab",
    "TabItem",
    "Text",
    "ToolBar",
    "Tree",
    "TreeItem",
    "Window",
}


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").replace("_", " ").replace("-", " ").lower().split())


def to_handle(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(str(value), 0)
    except Exception:
        return None


def safe_call(fn, fallback=None):
    try:
        return fn()
    except Exception:
        return fallback


def wrapper_name(wrapper) -> str:
    return (
        safe_call(wrapper.window_text, "")
        or safe_call(lambda: wrapper.element_info.name, "")
        or ""
    ).strip()


def control_type(wrapper) -> str:
    return str(safe_call(lambda: wrapper.element_info.control_type, "") or "")


def class_name(wrapper) -> str:
    return str(safe_call(lambda: wrapper.element_info.class_name, "") or "")


def automation_id(wrapper) -> str:
    return str(safe_call(lambda: wrapper.element_info.automation_id, "") or "")


def element_handle(wrapper) -> str:
    handle = safe_call(lambda: wrapper.element_info.handle, None)
    return str(handle) if handle is not None else ""


def semantic_area(wrapper, adapter: Optional[Dict[str, Any]]) -> str:
    name = normalize_text(wrapper_name(wrapper))
    ctype = control_type(wrapper)
    if adapter:
        for area in adapter.get("semanticAreas", []):
            keywords = [normalize_text(item) for item in area.get("keywords", [])]
            if any(keyword and keyword in name for keyword in keywords):
                return str(area.get("id") or "generic")
            preferred = [str(item) for item in area.get("preferredControlTypes", [])]
            if ctype in preferred:
                return str(area.get("id") or "generic")
    if ctype in {"Edit", "Document"}:
        return "editor"
    if ctype in {"Button", "MenuItem"}:
        return "action"
    if ctype in {"List", "ListItem", "Tree", "TreeItem"}:
        return "navigation"
    return "generic"


def serialize_control(wrapper, index: int, adapter: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    name = wrapper_name(wrapper)
    ctype = control_type(wrapper)
    cls = class_name(wrapper)
    aid = automation_id(wrapper)
    return {
        "id": element_handle(wrapper) or f"control_{index}",
        "name": name,
        "controlType": ctype,
        "className": cls,
        "automationId": aid,
        "selector": {
            "automationId": aid or None,
            "name": name or None,
            "controlType": ctype or None,
            "className": cls or None,
            "index": index,
        },
        "semanticArea": semantic_area(wrapper, adapter),
        "textPreview": name[:160],
    }


def window_matches(wrapper, params: Dict[str, Any]) -> int:
    score = 0
    title = normalize_text(wrapper_name(wrapper))
    app = normalize_text(params.get("app"))
    window_title = normalize_text(params.get("title") or params.get("windowTitle"))
    query = normalize_text(params.get("query"))
    if window_title and title == window_title:
        score += 120
    elif window_title and window_title in title:
        score += 90
    if app and app in title:
        score += 70
    if query and query in title:
        score += 25
    return score


def score_control(
    wrapper,
    selector: Optional[Dict[str, Any]],
    query: str,
    adapter: Optional[Dict[str, Any]],
    index: int,
) -> Tuple[int, Dict[str, Any]]:
    name = normalize_text(wrapper_name(wrapper))
    ctype = control_type(wrapper)
    cls = normalize_text(class_name(wrapper))
    aid = normalize_text(automation_id(wrapper))
    score = 10

    if ctype in SEMANTIC_CONTROL_TYPES:
        score += 8
    if name:
        score += 6
    if aid:
        score += 4

    selector = selector or {}
    if normalize_text(selector.get("automationId")) and normalize_text(selector.get("automationId")) == aid:
        score += 120
    if normalize_text(selector.get("name")) and normalize_text(selector.get("name")) == name:
        score += 105
    elif normalize_text(selector.get("name")) and normalize_text(selector.get("name")) in name:
        score += 75
    if normalize_text(selector.get("text")) and normalize_text(selector.get("text")) in name:
        score += 65
    if str(selector.get("controlType") or "") and str(selector.get("controlType")) == ctype:
        score += 30
    if normalize_text(selector.get("className")) and normalize_text(selector.get("className")) == cls:
        score += 18
    if selector.get("index") is not None and int(selector.get("index")) == index:
        score += 12

    normalized_query = normalize_text(query)
    if normalized_query:
        tokens = [token for token in normalized_query.split(" ") if token]
        if normalized_query in name:
            score += 45
        for token in tokens:
            if token in name:
                score += 10
            if token == normalize_text(ctype):
                score += 8

    if adapter:
        preferred_types = [str(item) for item in adapter.get("preferredControlTypes", [])]
        if ctype in preferred_types:
            score += 16
        for area in adapter.get("semanticAreas", []):
            preferred = [str(item) for item in area.get("preferredControlTypes", [])]
            keywords = [normalize_text(item) for item in area.get("keywords", [])]
            if ctype in preferred:
                score += 8
            if normalized_query and any(keyword and keyword in normalized_query and keyword in name for keyword in keywords):
                score += 22

    return score, {
        "name": wrapper_name(wrapper),
        "controlType": ctype,
        "className": class_name(wrapper),
        "automationId": automation_id(wrapper),
    }


def get_top_windows():
    if IMPORT_ERROR:
        raise RuntimeError(IMPORT_ERROR)
    windows = []
    for wrapper in Desktop(backend="uia").windows():
        if not safe_call(lambda: wrapper.is_visible(), False):
            continue
        name = wrapper_name(wrapper)
        if not name:
            continue
        windows.append(
            {
                "id": element_handle(wrapper),
                "title": name,
                "app": safe_call(lambda: wrapper.element_info.class_name, "") or "",
            }
        )
    return windows


def resolve_window(params: Dict[str, Any]):
    if IMPORT_ERROR:
        raise RuntimeError(IMPORT_ERROR)
    handle = to_handle(params.get("windowId") or params.get("windowHandle"))
    desktop = Desktop(backend="uia")
    if handle is not None:
        return desktop.window(handle=handle)
    best = None
    best_score = 0
    for wrapper in desktop.windows():
        if not safe_call(lambda: wrapper.is_visible(), False):
            continue
        name = wrapper_name(wrapper)
        if not name:
            continue
        score = window_matches(wrapper, params)
        if score > best_score:
            best = wrapper
            best_score = score
    if best is not None:
        return best
    try:
        active = desktop.get_active()
        if active:
            return active
    except Exception:
        pass
    raise RuntimeError("No native app window matched the requested target.")


def ensure_window_foreground(window_wrapper) -> bool:
    focused = False
    if safe_call(lambda: hasattr(window_wrapper, "restore"), False):
        safe_call(window_wrapper.restore)
    if safe_call(window_wrapper.set_focus, False) is not False:
        focused = True
    if safe_call(lambda: hasattr(window_wrapper, "set_keyboard_focus"), False):
        if safe_call(window_wrapper.set_keyboard_focus, False) is not False:
            focused = True
    if focused:
        time.sleep(0.06)
    return focused


def enumerate_controls(window_wrapper, limit: int, adapter: Optional[Dict[str, Any]]) -> List[Any]:
    title_hint = normalize_text(wrapper_name(window_wrapper))
    app_hint = normalize_text(class_name(window_wrapper))
    is_calculator_window = "calculator" in title_hint or "calculator" in app_hint
    max_nodes = max(limit * (90 if is_calculator_window else 18), 420 if is_calculator_window else 180)
    max_semantic = max(limit * (14 if is_calculator_window else 4), 420 if is_calculator_window else limit)
    queue = list((safe_call(window_wrapper.children, []) or [])[:220 if is_calculator_window else 80])
    if not queue:
        queue = list((safe_call(window_wrapper.descendants, []) or [])[:max_nodes])
    descendants: List[Any] = []
    inspected = 0
    while queue and inspected < max_nodes and len(descendants) < max_semantic:
        wrapper = queue.pop(0)
        inspected += 1
        descendants.append(wrapper)
        children = safe_call(wrapper.children, []) or []
        if children:
            queue.extend(children[:48 if is_calculator_window else 18])
    semantic = []
    for wrapper in descendants:
        if not safe_call(lambda: wrapper.is_visible(), True):
            continue
        ctype = control_type(wrapper)
        if ctype not in SEMANTIC_CONTROL_TYPES:
            continue
        semantic.append(wrapper)
        if len(semantic) >= max_semantic:
            break
    return semantic


def find_control(window_wrapper, selector: Optional[Dict[str, Any]], query: str, adapter: Optional[Dict[str, Any]], limit: int):
    controls = enumerate_controls(window_wrapper, limit, adapter)
    ranked = []
    for index, wrapper in enumerate(controls):
        score, meta = score_control(wrapper, selector, query, adapter, index)
        if score <= 0:
            continue
        ranked.append((score, index, wrapper, meta))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    if not ranked:
        raise RuntimeError("No matching native app control was found.")
    best_score = max(ranked[0][0], 1)
    items = []
    for score, index, wrapper, _meta in ranked[:limit]:
        item = serialize_control(wrapper, index, adapter)
        item["confidence"] = round(min(1.0, score / best_score), 3)
        item["score"] = score
        items.append(item)
    return ranked[0][2], items


def read_control_value(wrapper) -> Dict[str, Any]:
    texts = safe_call(wrapper.texts, []) or []
    name = wrapper_name(wrapper)
    return {
        "text": name,
        "texts": texts[:10],
        "controlType": control_type(wrapper),
        "className": class_name(wrapper),
        "automationId": automation_id(wrapper),
    }


def clear_and_type(wrapper, text: str, append: bool, allow_background: bool):
    if not allow_background:
        safe_call(wrapper.set_focus)
    if allow_background:
        if append:
            existing = (
                safe_call(lambda: wrapper.iface_value.CurrentValue, None)
                or safe_call(wrapper.window_text, "")
                or ""
            )
            payload = f"{existing}{text}"
        else:
            payload = text
        iface_value = safe_call(lambda: wrapper.iface_value, None)
        if iface_value is not None:
            try:
                iface_value.SetValue(payload)
                return
            except Exception:
                pass
        if safe_call(lambda: hasattr(wrapper, "set_edit_text"), False):
            try:
                wrapper.set_edit_text(payload)
                return
            except Exception:
                pass
        if safe_call(lambda: hasattr(wrapper, "set_window_text"), False):
            try:
                wrapper.set_window_text(payload)
                return
            except Exception:
                pass
        typed = safe_call(lambda: wrapper.type_keys(text, with_spaces=True, set_foreground=False), None)
        if typed is not None:
            return
        raise RuntimeError("background typing is unsupported for the matched control.")
    if not append and send_keys:
        send_keys("^a{BACKSPACE}")
        time.sleep(0.05)
    if safe_call(lambda: hasattr(wrapper, "set_edit_text"), False) and not append:
        try:
            wrapper.set_edit_text(text)
            return
        except Exception:
            pass
    safe_call(lambda: wrapper.type_keys(text, with_spaces=True, set_foreground=False))


def background_type_notepad(window_wrapper, text: str, append: bool) -> bool:
    if IMPORT_ERROR or Application is None:
        return False
    hwnd = safe_call(lambda: window_wrapper.element_info.handle, None) or safe_call(lambda: window_wrapper.handle, None)
    if hwnd is None:
        return False
    try:
        app = Application(backend="win32").connect(handle=int(hwnd))
        window = app.window(handle=int(hwnd))
        editor = window.child_window(class_name="Edit")
        existing = ""
        if append:
            existing = safe_call(editor.window_text, "") or ""
        editor.set_edit_text(f"{existing}{text}")
        return True
    except Exception:
        return False


def handle_request(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    if method == "ping":
        return {
            "available": IMPORT_ERROR is None,
            "version": VERSION,
            "pythonVersion": sys.version.split(" ")[0],
            "importError": IMPORT_ERROR,
        }

    if IMPORT_ERROR:
        raise RuntimeError(f"Native app sidecar is unavailable: {IMPORT_ERROR}")

    if method == "list_windows":
        return {"windows": get_top_windows()}

    if method == "get_active_window":
        wrapper = Desktop(backend="uia").get_active()
        return {
            "activeWindow": {
                "id": element_handle(wrapper),
                "title": wrapper_name(wrapper),
                "app": class_name(wrapper),
            }
        }

    adapter = params.get("adapter") if isinstance(params.get("adapter"), dict) else None
    allow_background = bool(params.get("allowBackground"))
    limit = max(1, min(int(params.get("limit") or 24), 80))
    window_wrapper = resolve_window(params)
    focus_applied = False
    if method in {
        "invoke_control",
        "type_into_control",
        "select_option",
        "toggle_control",
        "send_shortcut",
    } and not allow_background:
        focus_applied = ensure_window_foreground(window_wrapper)
    window_info = {
        "windowId": element_handle(window_wrapper),
        "windowTitle": wrapper_name(window_wrapper),
        "appName": class_name(window_wrapper),
        "adapterId": adapter.get("id") if adapter else None,
    }

    if method == "query_controls":
        _best, controls = find_control(window_wrapper, params.get("selector"), str(params.get("query") or ""), adapter, limit)
        return {
            **window_info,
            "controls": controls,
            "controlCount": len(controls),
            "fallbackMode": "native_uia",
            "confidence": controls[0].get("confidence") if controls else 0.0,
            "focusStolen": focus_applied,
        }

    if method == "read_control":
        best, controls = find_control(window_wrapper, params.get("selector"), str(params.get("query") or ""), adapter, 12)
        return {
            **window_info,
            "selector": controls[0]["selector"],
            "matchedControl": controls[0],
            "value": read_control_value(best),
            "fallbackMode": "native_uia",
            "confidence": controls[0].get("confidence", 0.0),
            "focusStolen": focus_applied,
        }

    if method == "invoke_control":
        best, controls = find_control(window_wrapper, params.get("selector"), str(params.get("query") or ""), adapter, 12)
        if safe_call(lambda: hasattr(best, "invoke"), False):
            safe_call(best.invoke)
        else:
            if allow_background:
                safe_call(best.click)
            else:
                try:
                    best.click_input()
                except Exception:
                    safe_call(best.click)
        return {
            **window_info,
            "selector": controls[0]["selector"],
            "matchedControl": controls[0],
            "focusStolen": focus_applied,
            "fallbackMode": "native_uia",
            "confidence": controls[0].get("confidence", 0.0),
        }

    if method == "type_into_control":
        notepad_window = "notepad" in normalize_text(window_info.get("windowTitle")) or "notepad" in normalize_text(window_info.get("appName"))
        if allow_background and notepad_window:
            typed = background_type_notepad(window_wrapper, str(params.get("text") or ""), bool(params.get("append")))
            if typed:
                matched = {
                    "id": element_handle(window_wrapper) or "notepad_editor",
                    "name": "Notepad editor",
                    "controlType": "Edit",
                    "className": "Edit",
                    "automationId": "",
                    "selector": {
                        "automationId": None,
                        "name": "Notepad editor",
                        "controlType": "Edit",
                        "className": "Edit",
                        "index": 0,
                    },
                    "semanticArea": "editor",
                    "textPreview": "Notepad editor",
                    "confidence": 0.9,
                    "score": 90,
                }
                return {
                    **window_info,
                    "selector": matched["selector"],
                    "matchedControl": matched,
                    "focusStolen": focus_applied,
                    "fallbackMode": "native_notepad_win32",
                    "confidence": 0.9,
                }
        best, controls = find_control(window_wrapper, params.get("selector"), str(params.get("query") or ""), adapter, 12)
        clear_and_type(best, str(params.get("text") or ""), bool(params.get("append")), allow_background)
        return {
            **window_info,
            "selector": controls[0]["selector"],
            "matchedControl": controls[0],
            "focusStolen": focus_applied,
            "fallbackMode": "native_uia",
            "confidence": controls[0].get("confidence", 0.0),
        }

    if method == "select_option":
        best, controls = find_control(window_wrapper, params.get("selector"), str(params.get("query") or ""), adapter, 12)
        option = str(params.get("optionText") or params.get("option") or "")
        if not option:
            raise RuntimeError("select_option requires optionText.")
        if not safe_call(lambda: hasattr(best, "select"), False):
            raise RuntimeError("Matched control does not support option selection.")
        best.select(option)
        return {
            **window_info,
            "selector": controls[0]["selector"],
            "matchedControl": controls[0],
            "focusStolen": focus_applied,
            "fallbackMode": "native_uia",
            "confidence": controls[0].get("confidence", 0.0),
        }

    if method == "toggle_control":
        best, controls = find_control(window_wrapper, params.get("selector"), str(params.get("query") or ""), adapter, 12)
        desired = params.get("desiredState")
        current = safe_call(lambda: best.get_toggle_state(), None)
        if desired is not None and current is not None and bool(current) == bool(desired):
            changed = False
        else:
            try:
                best.toggle()
            except Exception:
                if allow_background:
                    safe_call(best.click)
                else:
                    best.click_input()
            changed = True
        return {
            **window_info,
            "selector": controls[0]["selector"],
            "matchedControl": controls[0],
            "changed": changed,
            "focusStolen": focus_applied,
            "fallbackMode": "native_uia",
            "confidence": controls[0].get("confidence", 0.0),
        }

    if method == "send_shortcut":
        if not allow_background:
            safe_call(window_wrapper.set_focus)
        keys = str(params.get("keys") or "")
        if not keys:
            raise RuntimeError("send_shortcut requires keys.")
        sent = False
        if safe_call(lambda: hasattr(window_wrapper, "type_keys"), False):
            sent = safe_call(
                lambda: window_wrapper.type_keys(
                    keys, with_spaces=True, set_foreground=False
                ),
                None,
            ) is not None
        if not sent:
            if allow_background:
                raise RuntimeError("send_shortcut could not be delivered in background mode.")
            if not send_keys:
                raise RuntimeError("send_shortcut keyboard backend is unavailable.")
            send_keys(keys)
        return {
            **window_info,
            "keys": keys,
            "focusStolen": focus_applied,
            "fallbackMode": "keyboard_window" if sent else "keyboard_global",
            "confidence": 0.72,
        }

    if method == "wait_for_control":
        timeout_ms = max(250, min(int(params.get("timeoutMs") or 5_000), 30_000))
        deadline = time.time() + (timeout_ms / 1000.0)
        selector = params.get("selector")
        query = str(params.get("query") or "")
        last_error = "No matching native app control was found."
        while time.time() < deadline:
            try:
                _best, controls = find_control(window_wrapper, selector, query, adapter, 6)
                return {
                    **window_info,
                    "matchedControl": controls[0],
                    "selector": controls[0]["selector"],
                    "fallbackMode": "native_uia",
                    "confidence": controls[0].get("confidence", 0.0),
                    "focusStolen": focus_applied,
                }
            except Exception as exc:
                last_error = str(exc)
                time.sleep(0.2)
        raise RuntimeError(last_error)

    raise RuntimeError(f"Unsupported sidecar method {method}.")


def send_response(message_id: Any, ok: bool, result: Optional[Dict[str, Any]] = None, error: Optional[str] = None):
    payload = {"id": message_id, "ok": ok}
    if ok:
        payload["result"] = result or {}
    else:
        payload["error"] = {"message": error or "Unknown native app sidecar error."}
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            message_id = payload.get("id")
            method = str(payload.get("method") or "")
            params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
            result = handle_request(method, params)
            send_response(message_id, True, result=result)
        except Exception as exc:
            send_response(payload.get("id") if "payload" in locals() else None, False, error=str(exc))


if __name__ == "__main__":
    main()
