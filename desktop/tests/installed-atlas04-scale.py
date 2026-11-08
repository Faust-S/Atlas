"""Installed Atlas 0.4 R5 GUI: genuine file dialog, human confirmation and CAS readback.

Uses physical Win32 input and window titles rather than WebView2 accessibility
nodes. No synthetic native Store writes, CDP, Chromium or test-only app API.
"""
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import win32con
import win32gui
import win32process
from pywinauto import keyboard, mouse
from PIL import ImageGrab

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(os.environ["ATLAS_INSTALLED_EXE"])
FIXTURE = Path(os.environ["ATLAS_R5_PORTFOLIO_JSON"])
ROOT = Path(os.environ["LOCALAPPDATA"]) / "ru.iwxa.atlas" / "atlas-store-v1"
OUT = Path("desktop/tests/visual-evidence")
OUT.mkdir(parents=True, exist_ok=True)
process = None
handle = 0
phase = "init"

def now():
    return time.monotonic()

def metric(label, start):
    elapsed = round((now() - start) * 1000)
    print(f"ATLAS04_SCALE_METRIC {label}Ms={elapsed}", flush=True)
    return elapsed

def screenshot(name):
    try:
        ImageGrab.grab().save(OUT / ("atlas04-scale-" + name + ".png"))
        print("ATLAS04_SCALE_SCREENSHOT " + name, flush=True)
    except Exception as error:
        print("ATLAS04_SCALE_SCREENSHOT_HOLD " + str(error)[:140], flush=True)

def current_title():
    return win32gui.GetWindowText(handle) if handle else ""

def locate_window():
    found = []
    def visit(hwnd, unused):
        if not win32gui.IsWindowVisible(hwnd):
            return
        _, owner = win32process.GetWindowThreadProcessId(hwnd)
        if owner == process.pid:
            title = win32gui.GetWindowText(hwnd)
            if "Atlas" in title:
                found.append((hwnd, title))
    win32gui.EnumWindows(visit, None)
    for hwnd, title in found:
        if "Портфель" in title:
            return hwnd
    return 0

def activate():
    if not handle or not win32gui.IsWindow(handle):
        raise AssertionError("Installed Atlas HWND unavailable")
    win32gui.ShowWindow(handle, win32con.SW_RESTORE)
    try:
        win32gui.SetForegroundWindow(handle)
    except Exception:
        pass
    time.sleep(0.18)

def launch():
    global process, handle
    start = now()
    process = subprocess.Popen([str(APP)], env={**os.environ, "ATLAS_CI_RENDERER_PROBE": "1"})
    end = now() + 65
    while now() < end:
        if process.poll() is not None:
            raise AssertionError("Installed Atlas exited before main portfolio")
        handle = locate_window()
        if handle:
            win32gui.MoveWindow(handle, 0, 0, 1024, 710, True)
            activate()
            print("ATLAS04_SCALE_NATIVE_OPEN_PASS", flush=True)
            return metric("startupToPortfolio", start)
        time.sleep(0.25)
    screenshot("win32-window-missing")
    raise AssertionError("Installed main Atlas HWND not found by process ID")

def click(x, y):
    activate()
    bounds = win32gui.GetWindowRect(handle)
    try:
        dpi = ctypes.windll.user32.GetDpiForWindow(handle)
        scale = dpi/96 if dpi else 1
    except Exception:
        scale = 1
    mouse.click(coords=(bounds[0] + round(x*scale), bounds[1] + round(y*scale)))
    time.sleep(0.3)

def wait_title(value, timeout=25):
    until = now() + timeout
    while now() < until:
        if process.poll() is not None:
            raise AssertionError("Installed Atlas exited while opening " + value)
        if value in current_title():
            return
        time.sleep(0.16)
    screenshot("title-missing")
    raise AssertionError("View '" + value + "' missing, found " + current_title())

def stop():
    global process, handle
    if not process:
        return
    if process.poll() is None:
        activate()
        keyboard.send_keys("%{F4}")
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            win32gui.PostMessage(handle, win32con.WM_CLOSE, 0, 0)
            process.wait(timeout=9)
    print("ATLAS04_SCALE_NATIVE_CLOSE_PASS", flush=True)
    process = None
    handle = 0

def native():
    manifest = json.loads((ROOT / "head.json").read_text(encoding="utf-8"))
    projects = []
    for item in manifest["projects"]:
        block = (ROOT / "blocks" / (item["sha256"] + ".json")).read_bytes()
        assert hashlib.sha256(block).hexdigest() == item["sha256"], "Native SHA mismatch"
        project = json.loads(block.decode("utf-8"))
        assert project["id"] == item["id"], "Native project ID mismatch"
        projects.append(project)
    return manifest, projects

def choose_json():
    deadline = now() + 35
    while now() < deadline:
        hwnd = win32gui.FindWindow("#32770", "Открыть архив Atlas JSON")
        if hwnd and win32gui.IsWindowVisible(hwnd):
            win32gui.SetForegroundWindow(hwnd)
            safe = str(FIXTURE)
            assert not any(char in safe for char in "~%^+{}()"), "Unsafe Windows SendKeys path"
            keyboard.send_keys("%n")
            keyboard.send_keys("^a")
            keyboard.send_keys(safe, with_spaces=True)
            keyboard.send_keys("{ENTER}")
            print("ATLAS04_SCALE_NATIVE_PICKER_PASS", flush=True)
            return
        time.sleep(0.25)
    screenshot("picker-missing")
    raise AssertionError("No native Windows JSON file picker")

def wait_imported(saved_generation, expected_ids, timeout=80):
    end = now() + timeout
    while now() < end:
        try:
            saved, projects = native()
            if saved["generation"] != saved_generation and sorted(p["id"] for p in projects) == expected_ids:
                assert len(projects) == 120
                assert sum(len(p["items"]) for p in projects) == 1200
                assert sum(len(p["dependencies"]) for p in projects) == 300
                assert len(saved["root"]["portfolioLinks"]) == 40
                return saved
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            pass
        time.sleep(0.3)
    screenshot("native-save-missing")
    raise AssertionError("GUI never committed the 120-project snapshot")

def import_fixture(ids):
    original, before = native()
    assert len(before) == 1 and before[0]["name"] == "Atlas04InstalledUX"
    start = now()
    # The physical coordinates are grounded in 0.4 installed 1024px PNGs.
    click(847, 65)   # File & versions dropdown
    screenshot("files-menu-open")
    click(829, 116)  # Open JSON, first dropdown action
    choose_json()
    time.sleep(1.1)
    screenshot("import-preview")
    metric("importToPreview", start)
    assert native()[0]["generation"] == original["generation"], "File choice mutated native state"
    # React auto-focuses Cancel import; one Tab selects explicit Approve,
    # Enter applies to the local draft ONLY. Save is a separate user action.
    activate()
    keyboard.send_keys("{TAB}")
    time.sleep(0.2)
    keyboard.send_keys("{ENTER}")
    # A 120-project snapshot can take longer to derive than a small portfolio.
    # The native window title is an independent oracle that the preview was
    # approved into the React draft; it is not a substitute for disk readback.
    wait_title("Портфель — Обзор · Не сохранено", timeout=45)
    screenshot("after-human-confirm")
    assert native()[0]["generation"] == original["generation"], "Import bypassed native Save"
    print("ATLAS04_SCALE_IMPORT_PRE_SAVE_UNCHANGED_PASS", flush=True)
    click(746, 65)  # Real 0.4 Save button, confirmed by installed UX screenshots
    result = wait_imported(original["generation"], ids)
    metric("importToNativeSave", start)
    print("ATLAS04_SCALE_GUI_IMPORT_PASS projects=120 works=1200 dependencies=300 portfolioLinks=40", flush=True)
    screenshot("saved-120")
    return result

def search_and_open():
    start = now()
    click(424, 66)  # Actual search input
    keyboard.send_keys("^a")
    keyboard.send_keys("Project 119", with_spaces=True)
    time.sleep(0.9)
    screenshot("search-119")
    # Filtering reduces the sidebar list to exactly one project. A physical
    # user click selects the visible row; the native window title is the oracle.
    click(110, 317)
    wait_title("Project 119 — Обзор", 25)
    metric("searchToProject", start)
    print("ATLAS04_SCALE_GUI_SEARCH_PASS project=119", flush=True)
    screenshot("project-119")

def timeline_and_dag():
    started = now()
    click(439, 310) # Primary Gantt tab
    wait_title("График")
    metric("ganttNavigation", started)
    screenshot("gantt")
    click(624, 310) # Other sections dropdown
    time.sleep(0.25)
    screenshot("other-sections-open")
    click(624, 394) # Dependency DAG
    wait_title("Зависимости")
    metric("ganttToDagNavigation", started)
    screenshot("dag")
    print("ATLAS04_SCALE_GUI_GANTT_DAG_PASS", flush=True)

try:
    assert APP.is_file() and FIXTURE.is_file()
    expected = json.loads(FIXTURE.read_text(encoding="utf-8-sig"))
    ids = sorted(p["id"] for p in expected["projects"])
    assert len(ids) == 120
    assert sum(len(p["items"]) for p in expected["projects"]) == 1200
    phase = "launch-before-import"
    launch()
    phase = "native-picker-approval-save"
    saved = import_fixture(ids)
    stop()
    phase = "restart-with-120-projects"
    launch()
    current, projects = native()
    assert current["generation"] == saved["generation"] and current["revision"] == saved["revision"]
    assert sorted(p["id"] for p in projects) == ids
    print("ATLAS04_SCALE_GUI_RESTART_READBACK_PASS", flush=True)
    screenshot("reopened-120")
    phase = "portfolio-search"
    search_and_open()
    phase = "gantt-and-dag"
    timeline_and_dag()
    assert native()[0]["generation"] == saved["generation"], "Navigation mutated the native Store"
    stop()
    print("ATLAS04_SCALE_GUI_ACCEPTED_PASS", flush=True)
except Exception as error:
    print("ATLAS04_SCALE_GUI_HOLD phase=" + phase + " error=" + repr(error), flush=True)
    screenshot("failure")
    raise
finally:
    if process and process.poll() is None:
        process.kill()
        process.wait(timeout=10)
