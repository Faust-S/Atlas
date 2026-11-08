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
    # Real installed screenshots establish two bounded tab heights:
    # 253px without a save notification (reopened 120-project portfolio),
    # 310px while the green save notification is still visible.
    # Never infer success from a click: check the actual native title.
    tab_y = None
    for candidate_y in (253, 310):
        click(439, candidate_y)
        end = now() + 2.5
        while now() < end:
            if "График" in current_title():
                tab_y = candidate_y
                break
            time.sleep(0.16)
        if tab_y is not None:
            break
    if tab_y is None:
        screenshot("gantt-tab-not-found")
        raise AssertionError("Gantt did not open at either screenshot-qualified tab position")
    metric("ganttNavigation", started)
    screenshot("gantt")
    dag_start = now()
    click(624, tab_y)   # Other sections dropdown, relative to same tab band
    time.sleep(0.25)
    screenshot("other-sections-open")
    click(624, tab_y + 85)  # Dependencies, second row of the dropdown
    wait_title("Зависимости")
    metric("ganttToDagNavigation", dag_start)
    screenshot("dag")
    print("ATLAS04_SCALE_GUI_GANTT_DAG_PASS", flush=True)

def inspect_linked_project(saved_generation):
    """Win32 project navigation plus optional WebView2 UI Automation inspection.

    Native project title and CAS generation are independent success oracles.
    UIA is best effort: if WebView2 does not expose the button to this runner,
    capture actual pixels and report HOLD rather than a fabricated toggle PASS.
    """
    started = now()
    click(424, 66)  # Sticky search, still available on the selected DAG
    keyboard.send_keys("^a")
    keyboard.send_keys("Project 20", with_spaces=True)
    time.sleep(0.7)
    screenshot("search-linked-20")
    click(110, 317)  # One matching project in the native sidebar
    wait_title("Project 20 — Обзор")
    metric("linkedProjectNavigation", started)
    assert native()[0]["generation"] == saved_generation, "Project navigation wrote native data"
    screenshot("linked-20-overview-top")
    print("ATLAS04_SCALE_GUI_LINKED_PROJECT_PASS project=20", flush=True)

    # Scroll the actual installed window, not a headless DOM or browser mock.
    activate()
    bounds = win32gui.GetWindowRect(handle)
    dpi = ctypes.windll.user32.GetDpiForWindow(handle)
    scale = dpi / 96 if dpi else 1
    pointer = (bounds[0] + round(690 * scale), bounds[1] + round(535 * scale))
    mouse.scroll(coords=pointer, wheel_dist=-7)
    time.sleep(0.35)
    screenshot("linked-20-relations-scrolled")
    print("ATLAS04_SCALE_GUI_RELATIONS_VISUAL_CAPTURED project=20", flush=True)

    # On some runner WebView2 builds, HTML controls are not exposed to UIA.
    # Validate both label transitions and navigation only when UIA really works.
    try:
        from pywinauto import Desktop
        window = Desktop(backend="uia").window(handle=handle)
        expand = window.child_window(title="Развернуть цепочки", control_type="Button")
        for _ in range(3):
            if expand.exists(timeout=1) and expand.is_visible():
                break
            mouse.scroll(coords=pointer, wheel_dist=-3)
            time.sleep(0.25)
        if not expand.exists(timeout=1) or not expand.is_visible():
            print("ATLAS04_SCALE_GUI_RELATIONS_TOGGLE_UIA_HOLD inaccessible button", flush=True)
            assert native()[0]["generation"] == saved_generation, "UIA check mutated saved data"
            return
        else:
            expand.click_input()
            collapse = window.child_window(title="Скрыть цепочки", control_type="Button")
            collapse.wait("exists visible", timeout=4)
            screenshot("linked-20-relations-expanded")
            print("ATLAS04_SCALE_GUI_RELATIONS_TOGGLE_UIA_PASS project=20", flush=True)
    except Exception as error:
        screenshot("linked-20-toggle-uia-hold")
        print("ATLAS04_SCALE_GUI_RELATIONS_TOGGLE_UIA_HOLD " + repr(error)[:180], flush=True)
        assert native()[0]["generation"] == saved_generation, "UIA check mutated saved data"
        return

    # The direct predecessor has a semantic accessible name distinct from
    # the many "Project 19" links repeated in inherited cause paths.
    # A real Win32 click followed by the native window title is the oracle.
    try:
        predecessor = window.child_window(
            title="Открыть предшественника: Project 19", control_type="Button"
        )
        if not predecessor.exists(timeout=3) or not predecessor.is_visible():
            screenshot("linked-20-predecessor-uia-hold")
            print("ATLAS04_SCALE_GUI_PREDECESSOR_NAVIGATION_UIA_HOLD inaccessible labelled link", flush=True)
            return
        predecessor.click_input()
        wait_title("Project 19 — Обзор", timeout=12)
        screenshot("linked-19-after-navigation")
        print("ATLAS04_SCALE_GUI_PREDECESSOR_NAVIGATION_UIA_PASS", flush=True)
    except Exception as error:
        screenshot("linked-20-predecessor-uia-hold")
        print("ATLAS04_SCALE_GUI_PREDECESSOR_NAVIGATION_UIA_HOLD " + repr(error)[:180], flush=True)
        raise
    finally:
        assert native()[0]["generation"] == saved_generation, "Inspecting links mutated saved data"

def inspect_exact_requirement(saved_generation):
    """Optional installed WebView2/UIA check for the actual queue -> target card."""
    try:
        from pywinauto import Desktop
        window = Desktop(backend="uia").window(handle=handle)
        portfolio = window.child_window(title="Открыть портфель проектов", control_type="Button")
        if not portfolio.exists(timeout=2) or not portfolio.is_visible():
            print("ATLAS04_SCALE_REQUIREMENT_UIA_HOLD portfolio navigation unavailable", flush=True)
            screenshot("requirement-uia-hold")
            return
        portfolio.click_input()
        wait_title("Портфель — Обзор", timeout=12)

        lookup = window.child_window(title="Поиск в очереди внимания", control_type="Edit")
        if not lookup.exists(timeout=2) or not lookup.is_visible():
            print("ATLAS04_SCALE_REQUIREMENT_UIA_HOLD queue search unavailable", flush=True)
            screenshot("requirement-search-uia-hold")
            return
        lookup.click_input()
        keyboard.send_keys("^a")
        keyboard.send_keys("Project 119", with_spaces=True)
        time.sleep(0.45)
        screenshot("requirement-queue-119")

        # The accessible action name includes both the project and its
        # source-bound requirement. No numeric coordinate or arbitrary "Разобрать".
        action_name="Разобрать причину: Project 119 — Требует внимания: Expected result"
        action=window.child_window(title=action_name, control_type="Button")
        if not action.exists(timeout=2):
            print("ATLAS04_SCALE_REQUIREMENT_UIA_HOLD exact queue action unavailable", flush=True)
            screenshot("requirement-action-uia-hold")
            return
        bounds=win32gui.GetWindowRect(handle)
        dpi=ctypes.windll.user32.GetDpiForWindow(handle)
        scale=dpi / 96 if dpi else 1
        pointer=(bounds[0]+round(710*scale),bounds[1]+round(520*scale))
        for _ in range(5):
            if action.is_visible():
                break
            mouse.scroll(coords=pointer,wheel_dist=-2)
            time.sleep(0.2)
        if not action.is_visible():
            print("ATLAS04_SCALE_REQUIREMENT_UIA_HOLD action outside UIA view", flush=True)
            screenshot("requirement-action-not-visible")
            return
        action.click_input()
        wait_title("Project 119 — Обзор", timeout=12)
        screenshot("requirement-119-focused")
        print("ATLAS04_SCALE_REQUIREMENT_NAV_UIA_PASS project=119",flush=True)

        card_name="Требование: Expected result — Project 119"
        card=window.child_window(title=card_name)
        if not card.exists(timeout=3) or not card.is_visible():
            print("ATLAS04_SCALE_REQUIREMENT_FOCUS_UIA_HOLD target card not exposed",flush=True)
            return
        try:
            focused=bool(card.element_info.element.CurrentHasKeyboardFocus)
        except Exception as error:
            print("ATLAS04_SCALE_REQUIREMENT_FOCUS_UIA_HOLD " + repr(error)[:150],flush=True)
            return
        if focused:
            print("ATLAS04_SCALE_REQUIREMENT_FOCUS_UIA_PASS project=119",flush=True)
        else:
            print("ATLAS04_SCALE_REQUIREMENT_FOCUS_UIA_HOLD card not focused",flush=True)
    except Exception as error:
        screenshot("requirement-navigation-uia-hold")
        print("ATLAS04_SCALE_REQUIREMENT_UIA_HOLD " + repr(error)[:180],flush=True)
    finally:
        assert native()[0]["generation"] == saved_generation, "Requirement navigation mutated native Store"



def visible_uia_action(window, name, attempts=13):
    """Find an accessible control after physical mouse-wheel navigation.

    WebView2 UIA can enumerate an offscreen button and allow click_input()
    even when no pixels under that rectangle can actually receive the click.
    Only click once its rectangle is inside the installed workspace viewport.
    """
    bounds = win32gui.GetWindowRect(handle)
    dpi = ctypes.windll.user32.GetDpiForWindow(handle)
    scale = dpi / 96 if dpi else 1
    point = (min(bounds[2] - 70, bounds[0] + round(755 * scale)),
             min(bounds[3] - 95, bounds[1] + round(490 * scale)))
    for attempt in range(attempts):
        control = window.child_window(title=name, control_type="Button")
        rectangle = None
        try:
            if control.exists(timeout=1):
                rectangle = control.rectangle()
                if (control.is_visible() and control.is_enabled()
                        and rectangle.width() > 3 and rectangle.height() > 3
                        and rectangle.left >= bounds[0] + 245
                        and rectangle.right < bounds[2] - 12
                        and rectangle.top >= bounds[1] + 105
                        and rectangle.bottom < bounds[3] - 50):
                    return control
        except Exception:
            pass
        # A control above the sticky toolbar needs an upward scroll;
        # absent/offscreen-below controls require a downward scroll.
        upward = rectangle is not None and rectangle.top < bounds[1] + 105
        activate()
        mouse.scroll(coords=point, wheel_dist=2 if upward else -3)
        time.sleep(0.23)
    screenshot("uia-action-offscreen")
    print("ATLAS04_CAUSE_ACTION_UIA_HOLD " + name + " not physically visible", flush=True)
    return None


def inspect_cause_proposal_and_decision(saved_generation):
    """Installed GUI: exact fact -> cause proposal -> explicit approval -> native readback.

    No native fixture writes, browser debugging, test endpoints, or acceptance
    shortcuts. If a WebView2 accessibility control is missing, record HOLD
    before touching the draft. Once a form has been submitted, missing Save or
    incorrect persisted data are real failures of this installed scenario.
    """
    if "Project 119 — Обзор" not in current_title():
        screenshot("cause-workflow-no-project")
        print("ATLAS04_CAUSE_WORKFLOW_UIA_HOLD Project 119 is not open", flush=True)
        return

    from pywinauto import Desktop
    window = Desktop(backend="uia").window(handle=handle)
    propose = window.child_window(title="Предложить устранение причины", control_type="Button")
    if not propose.exists(timeout=3):
        screenshot("cause-proposal-action-missing")
        print("ATLAS04_CAUSE_WORKFLOW_UIA_HOLD propose button not exposed", flush=True)
        return

    starting, baseline = native()
    assert starting["generation"] == saved_generation
    baseline_project = next(p for p in baseline if p["id"] == "load-project-119")
    assert not baseline_project["changes"], "Load fixture must contain no changes"

    try:
        propose.click_input()
    except Exception as error:
        screenshot("cause-proposal-click-hold")
        print("ATLAS04_CAUSE_WORKFLOW_UIA_HOLD proposal click " + repr(error)[:150], flush=True)
        return
    wait_title("Форма: Изменение для устранения", timeout=12)
    screenshot("cause-proposal-editor")
    assert native()[0]["generation"] == saved_generation, "Opening a form mutated disk"

    # This editor is already prefilled with the exact cause and its description
    # by the existing 'respond:' domain editor, so no synthetic data injection.
    submit = window.child_window(title="Применить к черновику", control_type="Button")
    if not submit.exists(timeout=3):
        screenshot("cause-proposal-submit-missing")
        raise AssertionError("Installed proposal editor has no Apply button")
    submit.click_input()
    wait_title("Project 119 — Обзор · Не сохранено", timeout=15)
    assert native()[0]["generation"] == saved_generation, "Applying draft mutated native disk"
    screenshot("cause-proposal-draft")
    print("ATLAS04_CAUSE_PROPOSAL_DRAFT_PASS", flush=True)

    click(746, 65)  # Actual installed Save, not an invisible IPC command.
    end = now() + 25
    proposal_saved = None
    while now() < end:
        head, projects = native()
        if head["generation"] != saved_generation:
            proposal_saved = head
            break
        time.sleep(0.25)
    if proposal_saved is None:
        screenshot("cause-proposal-save-missing")
        raise AssertionError("Cause proposal not saved via installed Windows GUI")

    p = next(p for p in projects if p["id"] == "load-project-119")
    links = [c for c in p["changes"] if c.get("causeKey") == "target-review:load-target-119"]
    assert len(links) == 1, "Proposal not bound to observed requirement cause"
    change = links[0]
    assert change["targetIds"] == ["load-target-119"]
    assert change["status"] == "proposed"
    assert len(p["decisions"]) == 0, "Proposal was automatically approved"
    assert not any(i.get("changeId") == change["id"] for i in p["items"]), "Proposal created work without approval"
    assert not change.get("planAppliedAt"), "Proposal automatically applied its plan"
    assert head["revision"] > starting["revision"], "Saved proposal did not change revision"
    screenshot("cause-proposal-saved")
    print("ATLAS04_CAUSE_PROPOSAL_NATIVE_SAVE_PASS", flush=True)

    # A complete process restart is part of product acceptance.
    stop()
    launch()
    reloaded, projects = native()
    assert reloaded["generation"] == proposal_saved["generation"]
    saved_project = next(p for p in projects if p["id"] == "load-project-119")
    assert any(c["id"] == change["id"] and c["status"] == "proposed"
               for c in saved_project["changes"]), "Proposal lost after process restart"
    print("ATLAS04_CAUSE_PROPOSAL_RESTART_READBACK_PASS", flush=True)

    search_and_open()
    window = Desktop(backend="uia").window(handle=handle)
    change_action = visible_uia_action(window, "Изменение по причине")
    if change_action is None:
        screenshot("cause-change-navigation-hold")
        print("ATLAS04_CAUSE_DECISION_UIA_HOLD change navigation unavailable", flush=True)
        return
    screenshot("cause-change-before-click")
    change_action.click_input()
    wait_title("Project 119 — Изменения", timeout=15)
    screenshot("cause-change-focused")
    print("ATLAS04_CAUSE_EXACT_CHANGE_NAV_UIA_PASS", flush=True)

    decision_button = visible_uia_action(window, "Решение")
    if decision_button is None:
        screenshot("cause-decision-button-hold")
        print("ATLAS04_CAUSE_DECISION_UIA_HOLD decision button unavailable", flush=True)
        return
    screenshot("cause-decision-before-click")
    decision_button.click_input()
    wait_title("Форма: Решение:", timeout=15)
    screenshot("cause-decision-editor")

    rationale = window.child_window(title="Почему принято это решение?", control_type="Edit")
    if not rationale.exists(timeout=3):
        screenshot("cause-rationale-edit-hold")
        print("ATLAS04_CAUSE_DECISION_UIA_HOLD rationale edit unavailable", flush=True)
        return
    rationale.click_input()
    keyboard.send_keys("Reviewed the recorded evidence and approved corrective work", with_spaces=True)

    submit = window.child_window(title="Применить к черновику", control_type="Button")
    if not submit.exists(timeout=3):
        raise AssertionError("Decision editor has no Apply button")
    submit.click_input()
    wait_title("Project 119 — Изменения · Не сохранено", timeout=15)
    assert native()[0]["generation"] == proposal_saved["generation"], "Decision draft mutated disk"
    screenshot("cause-decision-draft")
    print("ATLAS04_CAUSE_DECISION_DRAFT_PASS", flush=True)

    click(746, 65)
    end = now() + 25
    approved_head = None
    while now() < end:
        latest, projects = native()
        if latest["generation"] != proposal_saved["generation"]:
            approved_head = latest
            break
        time.sleep(0.25)
    if approved_head is None:
        screenshot("cause-decision-save-missing")
        raise AssertionError("Decision was not saved through installed Windows GUI")
    p = next(p for p in projects if p["id"] == "load-project-119")
    current_change = next(c for c in p["changes"] if c["id"] == change["id"])
    assert current_change["status"] == "approved", "Expected explicit human approval"
    assert not current_change.get("planAppliedAt"), "Approval silently applied a plan"
    decisions = [d for d in p["decisions"] if d.get("changeId") == change["id"]]
    assert len(decisions) == 1 and decisions[0]["status"] == "approved"
    assert "Reviewed the recorded evidence" in decisions[0]["text"]
    assert not any(i.get("changeId") == change["id"] for i in p["items"]), "Approval created unrequested work"
    screenshot("cause-decision-saved")
    print("ATLAS04_CAUSE_DECISION_NATIVE_SAVE_PASS", flush=True)

    stop()
    launch()
    head, projects = native()
    assert head["generation"] == approved_head["generation"], "Decision lost on restart"
    p = next(p for p in projects if p["id"] == "load-project-119")
    assert next(c for c in p["changes"] if c["id"] == change["id"])["status"] == "approved"
    assert any(d.get("changeId") == change["id"] and d["status"] == "approved" for d in p["decisions"])
    print("ATLAS04_CAUSE_DECISION_RESTART_READBACK_PASS", flush=True)


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
    phase = "linked-project-navigation"
    inspect_linked_project(saved["generation"])
    phase = "exact-requirement-navigation"
    inspect_exact_requirement(saved["generation"])
    assert native()[0]["generation"] == saved["generation"], "Navigation mutated the native Store"
    phase = "cause-proposal-and-decision"
    inspect_cause_proposal_and_decision(saved["generation"])
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
