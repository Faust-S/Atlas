"""Native Windows Atlas 0.4 scale trial (120 projects / 1200 works).

Uses the existing JSON import dialog and separate human approval to load a
validated R5 fixture. All writes are exclusively through the installed Tauri
UI / Rust store. No CDP, Chromium automation, private data or test-only IPC.
"""
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from pywinauto import Application, Desktop, keyboard, mouse
from PIL import ImageGrab

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(os.environ["ATLAS_INSTALLED_EXE"])
FIXTURE = Path(os.environ["ATLAS_R5_PORTFOLIO_JSON"])
ROOT = Path(os.environ["LOCALAPPDATA"]) / "ru.iwxa.atlas" / "atlas-store-v1"
EVIDENCE = Path("desktop/tests/visual-evidence")
EVIDENCE.mkdir(exist_ok=True, parents=True)
process = None
window = None
phase = "init"

def stamp():
    return time.monotonic()

def measure(label, start):
    ms = int(round((stamp() - start) * 1000))
    print(f"ATLAS04_SCALE_METRIC {label}Ms={ms}", flush=True)
    return ms

def native():
    manifest = json.loads((ROOT / "head.json").read_text(encoding="utf-8"))
    projects = []
    for item in manifest["projects"]:
        block = ROOT / "blocks" / (item["sha256"] + ".json")
        contents = block.read_bytes()
        assert hashlib.sha256(contents).hexdigest() == item["sha256"], "Corrupt project block"
        p = json.loads(contents.decode("utf-8"))
        assert item["id"] == p["id"], "Manifest/project ID mismatch"
        projects.append(p)
    return manifest, projects

def shot(name):
    try:
        target = EVIDENCE / ("atlas04-scale-" + name + ".png")
        ImageGrab.grab().save(target)
        print("ATLAS04_SCALE_SCREENSHOT " + name, flush=True)
    except Exception as error:
        print("ATLAS04_SCALE_SCREENSHOT_HOLD " + str(error)[:200], flush=True)

def find_button(title, timeout=25, required=True):
    end = stamp() + timeout
    while stamp() < end:
        try:
            for item in window.descendants():
                if item.element_info.control_type == "Button" and (item.element_info.name or "").strip() == title:
                    if item.is_enabled() and item.is_visible():
                        return item
        except Exception:
            pass
        time.sleep(0.3)
    if required:
        shot("missing-" + title[:16].replace(" ", "-"))
        raise AssertionError("No actionable installed button: " + title)
    return None

def launch():
    global process, window
    started = stamp()
    process = subprocess.Popen([str(APP)], env={**os.environ, "ATLAS_CI_RENDERER_PROBE": "1"})
    app = Application(backend="uia")
    end = stamp() + 70
    while stamp() < end:
        if process.poll() is not None:
            raise AssertionError("Installed Atlas terminated during startup")
        try:
            app.connect(process=process.pid, timeout=2)
            candidate = app.top_window()
            if candidate.is_visible() and "Портфель" in candidate.window_text():
                window = candidate
                window.move_window(x=0, y=0, width=1024, height=710, repaint=True)
                print("ATLAS04_SCALE_NATIVE_OPEN_PASS", flush=True)
                return measure("startupToPortfolio", started)
        except Exception:
            pass
        time.sleep(0.35)
    raise AssertionError("No visible installed Atlas portfolio after startup")

def click_at(x, y):
    window.set_focus()
    rectangle = window.rectangle()
    try:
        scale = ctypes.windll.user32.GetDpiForWindow(int(window.handle)) / 96.0
    except Exception:
        scale = 1.0
    mouse.click(coords=(int(rectangle.left + x*scale), int(rectangle.top + y*scale)))
    time.sleep(0.4)

def close():
    global process, window
    if process is None:
        return
    if process.poll() is None:
        try:
            window.set_focus()
            keyboard.send_keys("%{F4}")
            process.wait(timeout=6)
        except Exception:
            ctypes.windll.user32.PostMessageW(int(window.handle), 0x0010, 0, 0)
            process.wait(timeout=9)
    print("ATLAS04_SCALE_NATIVE_CLOSE_PASS", flush=True)
    process = None
    window = None

def choose_json():
    end = stamp() + 35
    while stamp() < end:
        for item in Desktop(backend="win32").windows():
            try:
                if item.is_visible() and item.window_text().strip() == "Открыть архив Atlas JSON" and item.class_name() == "#32770":
                    item.set_focus()
                    # Windows SendKeys treats ~, %, ^, + and braces as commands.
                    safe = str(FIXTURE)
                    assert not any(c in safe for c in "~%^+{}()"), "Unsafe picker path"
                    keyboard.send_keys("%n")
                    keyboard.send_keys("^a")
                    keyboard.send_keys(safe, with_spaces=True)
                    keyboard.send_keys("{ENTER}")
                    print("ATLAS04_SCALE_NATIVE_PICKER_PASS", flush=True)
                    return
            except (RuntimeError, ValueError):
                pass
        time.sleep(0.3)
    shot("picker-missing")
    raise AssertionError("Installed Windows JSON picker did not open")

def wait_title(text, timeout=35):
    end = stamp() + timeout
    while stamp() < end:
        if process.poll() is not None:
            raise AssertionError("Atlas exited while navigating to " + text)
        if text in window.window_text():
            return
        time.sleep(0.2)
    shot("missing-title")
    raise AssertionError("Installed GUI never opened " + text + " (actual=" + window.window_text() + ")")

def import_fixture(expected_ids):
    baseline, original = native()
    assert len(original) == 1 and original[0]["name"] == "Atlas04InstalledUX"
    start = stamp()
    # Menu is collapsed in 0.4. Coordinates were qualified from real 1024 px
    # installed screenshots; do not click a hidden Open button.
    click_at(847, 65)
    shot("file-menu")
    control = find_button("Открыть JSON", timeout=6, required=False)
    if control:
        control.click_input()
    else:
        click_at(829, 117)
    choose_json()
    confirm = find_button("Заменить портфель в черновике", timeout=45)
    preview = measure("importToPreview", start)
    shot("import-preview")
    assert confirm.is_enabled(), "Import confirmation not available"
    confirm.click_input()
    end = stamp() + 35
    while stamp() < end:
        if find_button("Заменить портфель в черновике", timeout=1, required=False) is None:
            break
        time.sleep(0.2)
    else:
        shot("import-not-applied")
        raise AssertionError("Import preview did not close after explicit confirmation")
    still, unchanged = native()
    assert still["generation"] == baseline["generation"]
    assert len(unchanged) == 1, "Import modified native store before Save"
    print("ATLAS04_SCALE_IMPORT_PRE_SAVE_UNCHANGED_PASS", flush=True)
    click_at(746, 65)
    end = stamp() + 90
    while stamp() < end:
        try:
            saved, projects = native()
            if saved["generation"] != baseline["generation"] and sorted(p["id"] for p in projects) == expected_ids:
                assert len(projects) == 120
                assert sum(len(p["items"]) for p in projects) == 1200
                assert sum(len(p["dependencies"]) for p in projects) == 300
                assert len(saved["root"]["portfolioLinks"]) == 40
                print("ATLAS04_SCALE_GUI_IMPORT_PASS projects=120 works=1200 dependencies=300 portfolioLinks=40", flush=True)
                measure("importToNativeSave", start)
                shot("saved-120")
                return saved, projects
        except (OSError, KeyError, json.JSONDecodeError):
            pass
        time.sleep(0.3)
    shot("import-save-failed")
    raise AssertionError("120-project import not saved through real installed UI")

def lookup():
    start = stamp()
    # A search changes only React display state, not the saved snapshot.
    edit = None
    for item in window.descendants():
        if item.element_info.control_type == "Edit" and "Найти проект" in str(item.element_info.name):
            edit = item
            break
    if edit is not None:
        edit.set_focus()
    else:
        click_at(430, 65)
    keyboard.send_keys("^a")
    keyboard.send_keys("Project 119", with_spaces=True)
    match = find_button("Project 119", timeout=30)
    measure("searchUniqueProject", start)
    match.click_input()
    wait_title("Project 119 — Обзор")
    measure("searchAndOpenProject", start)
    shot("project-119")
    assert process.poll() is None
    print("ATLAS04_SCALE_GUI_SEARCH_PASS project=119", flush=True)

def timeline_and_graph():
    t = stamp()
    gantt = find_button("График", timeout=10, required=False)
    if gantt:
        gantt.click_input()
    else:
        click_at(439, 310)
    wait_title("График")
    measure("ganttNavigation", t)
    shot("gantt")
    click_at(624, 310)
    item = find_button("Зависимости", timeout=7, required=False)
    if item:
        item.click_input()
    else:
        click_at(624, 394)
    wait_title("Зависимости")
    measure("ganttToDagNavigation", t)
    shot("dag")
    print("ATLAS04_SCALE_GUI_GANTT_DAG_PASS", flush=True)

try:
    assert APP.is_file() and FIXTURE.is_file()
    expected = json.loads(FIXTURE.read_text(encoding="utf-8-sig"))
    expected_ids = sorted(p["id"] for p in expected["projects"])
    assert len(expected_ids) == 120
    assert sum(len(p["items"]) for p in expected["projects"]) == 1200
    phase = "launch-before-import"
    launch()
    phase = "gui-file-picker-and-confirm"
    saved, _ = import_fixture(expected_ids)
    close()
    phase = "restart-with-120-projects"
    launch()
    restored, projects = native()
    assert restored["generation"] == saved["generation"] and restored["revision"] == saved["revision"]
    assert sorted(p["id"] for p in projects) == expected_ids
    print("ATLAS04_SCALE_GUI_RESTART_READBACK_PASS", flush=True)
    shot("reopened-120")
    phase = "find-project-119"
    lookup()
    phase = "gantt-and-dag"
    timeline_and_graph()
    unchanged, _ = native()
    assert unchanged["generation"] == saved["generation"], "GUI navigation unexpectedly changed native data"
    close()
    print("ATLAS04_SCALE_GUI_ACCEPTED_PASS", flush=True)
except Exception as error:
    print("ATLAS04_SCALE_GUI_HOLD phase=" + phase + " error=" + repr(error), flush=True)
    shot("failure")
    raise
finally:
    if process is not None and process.poll() is None:
        process.kill()
        process.wait(timeout=10)
