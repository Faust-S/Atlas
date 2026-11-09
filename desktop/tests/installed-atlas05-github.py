"""Installed Atlas 0.5: real GitHub Actions observation and native restart.

Only user-facing native input, a public GitHub API read, and independent
readback from the existing Atlas native store. No CDP, browser debugger,
test-only app commands, fake fetch responses, or synthetic store writes.
"""
import ctypes
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import win32con
import win32gui
import win32process
from PIL import ImageGrab
from pywinauto import Desktop, keyboard, mouse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(os.environ["ATLAS_INSTALLED_EXE"])
STORE = Path(os.environ["LOCALAPPDATA"]) / "ru.iwxa.atlas" / "atlas-store-v1"
OUT = Path("desktop/tests/visual-evidence")
OUT.mkdir(parents=True, exist_ok=True)
REPO = "Faust-S/Atlas"
BRANCH = "work/2026-11-09-atlas-0-5"
PROJECT = "load-project-0"
process = None
handle = None


def screenshot(label):
    try:
        ImageGrab.grab().save(OUT / ("atlas05-github-" + label + ".png"))
        print("ATLAS05_GITHUB_SCREENSHOT " + label, flush=True)
    except Exception as exc:
        print("ATLAS05_GITHUB_SCREENSHOT_ERROR " + repr(exc)[:180], flush=True)


def head():
    return json.loads((STORE / "head.json").read_text(encoding="utf-8"))


def project(manifest, project_id=PROJECT):
    entry = next(x for x in manifest["projects"] if x["id"] == project_id)
    data = (STORE / "blocks" / (entry["sha256"] + ".json")).read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry["sha256"], "Native block checksum mismatch"
    result = json.loads(data.decode("utf-8"))
    assert result["id"] == project_id
    return result


def activate():
    assert handle and win32gui.IsWindow(handle), "Installed Atlas HWND missing"
    win32gui.ShowWindow(handle, win32con.SW_RESTORE)
    try:
        win32gui.SetForegroundWindow(handle)
    except Exception:
        pass
    time.sleep(0.18)


def window():
    return Desktop(backend="uia").window(handle=handle)


def click(x, y):
    activate()
    rect = win32gui.GetWindowRect(handle)
    dpi = ctypes.windll.user32.GetDpiForWindow(handle)
    scale = dpi / 96 if dpi else 1
    mouse.click(coords=(rect[0] + round(x * scale), rect[1] + round(y * scale)))
    time.sleep(0.25)


def launch():
    global process, handle
    process = subprocess.Popen([str(APP)], env={**os.environ, "ATLAS_CI_RENDERER_PROBE": "1"})
    until = time.monotonic() + 55
    while time.monotonic() < until:
        if process.poll() is not None:
            raise AssertionError("Installed Atlas exited during startup")
        windows = []
        def visit(hwnd, unused):
            if not win32gui.IsWindowVisible(hwnd):
                return
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            if pid == process.pid and "Atlas" in win32gui.GetWindowText(hwnd):
                windows.append(hwnd)
        win32gui.EnumWindows(visit, None)
        if windows:
            handle = windows[0]
            win32gui.MoveWindow(handle, 0, 0, 1024, 710, True)
            activate()
            print("ATLAS05_GITHUB_NATIVE_OPEN_PASS", flush=True)
            return
        time.sleep(0.25)
    raise AssertionError("Installed Atlas never opened a native window")


def stop():
    global process, handle
    if process is None:
        return
    if process.poll() is None:
        activate()
        keyboard.send_keys("%{F4}")
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            win32gui.PostMessage(handle, win32con.WM_CLOSE, 0, 0)
            process.wait(timeout=8)
    process = None
    handle = None


def wait_title(text, timeout=25):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if process.poll() is not None:
            raise AssertionError("Atlas closed while waiting for " + text)
        if text in win32gui.GetWindowText(handle):
            return
        time.sleep(0.2)
    screenshot("title-not-found")
    raise AssertionError("Expected title " + text + ", got " + win32gui.GetWindowText(handle))


def wait_button(title, timeout=25):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        matches = [item for item in window().descendants(control_type="Button")
                   if item.window_text() == title and item.is_visible() and item.is_enabled()]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1 and title == "Project 0":
            # The project also appears as an overview action. The sidebar's
            # project button is the leftmost, within the installed 1024px sidebar.
            screen_left = win32gui.GetWindowRect(handle)[0]
            sidebar = [item for item in matches
                       if item.rectangle().left - screen_left < 260]
            if len(sidebar) == 1:
                return sidebar[0]
            raise AssertionError("Project sidebar button ambiguous: " +
                                 repr([str(item.rectangle()) for item in matches]))
        if len(matches) > 1:
            raise AssertionError("GUI button name ambiguous: " + title)
        time.sleep(0.25)
    screenshot("button-not-found")
    raise AssertionError("Required native GUI button not accessible: " + title)


def click_button(title, timeout=25):
    wait_button(title, timeout).click_input()
    time.sleep(0.3)


def set_text(title, value):
    control = window().child_window(title=title, control_type="Edit")
    if not control.exists(timeout=8) or not control.is_visible():
        screenshot("field-not-found")
        raise AssertionError("Required native GUI editor not accessible: " + title)
    control.click_input()
    keyboard.send_keys("^a")
    keyboard.send_keys(value, with_spaces=True)
    time.sleep(0.25)


def visible_texts():
    try:
        return [str(x.window_text()) for x in window().descendants()
                if x.window_text()]
    except Exception as exc:
        raise AssertionError("Native GUI accessibility unavailable: " + repr(exc)) from exc


def open_source_view():
    click_button("Project 0")
    wait_title("Project 0 — Обзор")
    # WebView2 may expose <summary> as a group rather than a button.
    summary = window().child_window(title="Дополнительные представления проекта")
    if summary.exists(timeout=2) and summary.is_visible():
        summary.click_input()
    else:
        click(624, 253)  # Accepted 1024px installed Atlas tab strip.
    click_button("Источники")
    wait_title("Project 0 — Источники")
    print("ATLAS05_GITHUB_SOURCES_GUI_PASS", flush=True)


def connect_source():
    click_button("＋ Источник")
    wait_title("Форма: Добавить источник проекта")
    set_text("Адрес репозитория или источника", REPO)
    set_text("Ветка GitHub для проверок (необязательно)", BRANCH)
    screenshot("source-editor")
    click_button("Применить к черновику")
    wait_title("Project 0 — Источники · Не сохранено")
    assert not project(head())["sources"], "Adding a source unexpectedly wrote to disk"
    print("ATLAS05_GITHUB_CONNECT_DRAFT_PASS", flush=True)


def refresh_source():
    click_button("Проверить код и сборку")
    # Native WebView2 confirmation is deliberately human-driven.
    time.sleep(0.6)
    keyboard.send_keys("{ENTER}")
    until = time.monotonic() + 95
    while time.monotonic() < until:
        names = visible_texts()
        if any("Последняя сверка завершилась ошибкой" in name for name in names):
            screenshot("refresh-error")
            raise AssertionError("Installed GitHub refresh failed; inspect source screen")
        if any("Получены сведения GitHub" in name for name in names):
            if any("Проверки GitHub Actions" in name for name in names):
                screenshot("actions-observed")
                assert not project(head())["sources"], "Network refresh unexpectedly saved without consent"
                print("ATLAS05_GITHUB_LIVE_UI_PASS", flush=True)
                return
        time.sleep(0.5)
    screenshot("live-timeout")
    raise AssertionError("Installed Atlas did not show a live GitHub Actions observation")


def read_public_run(ci):
    request = urllib.request.Request(
        "https://api.github.com/repos/" + REPO + "/actions/runs/" + str(ci["runId"]),
        headers={"Accept": "application/vnd.github+json", "User-Agent": "IWXA-Atlas-installed-qualification"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200, "Public GitHub Actions receipt not available"
        run = json.load(response)
    assert run["id"] == ci["runId"], "The run ID was not independently retrievable"
    assert run["head_branch"] == BRANCH, "Observed Actions run belongs to another branch"
    assert run["head_sha"].lower() == ci["headSha"], "Observed Actions SHA does not match GitHub"
    assert run["status"] in ("queued", "in_progress", "completed", "waiting", "pending", "requested")
    assert ci["url"] == "https://github.com/" + REPO + "/actions/runs/" + str(run["id"])
    print("ATLAS05_GITHUB_PUBLIC_API_RECEIPT_PASS id=" + str(run["id"]) +
          " status=" + run["status"], flush=True)


def inspect_snapshot(saved, initial):
    source_project = project(saved)
    original_project = project(initial)
    assert len(source_project["sources"]) == 1, "Connected GitHub source not persisted"
    source = source_project["sources"][0]
    assert source["kind"] == "github" and source["locator"] == REPO
    assert source["branch"] == BRANCH, "Selected GitHub branch lost"
    assert source["status"] == "ok", "Public GitHub observation not persisted"
    observation = source["summary"]
    assert observation["scope"] == "repository" and observation["repository"].lower() == REPO.lower()
    assert observation["readiness"] == "not_assessed", "CI state was promoted into project acceptance"
    assert observation["defaultBranch"] == "main", "Repository default branch changed"
    assert observation["branchHeads"].get(BRANCH), "Observed branch has no revision"
    ci = observation["ci"]
    assert ci["state"] == "observed", "No selected-branch Actions run was observed"
    assert ci["branch"] == BRANCH, "Actions checked the wrong branch"
    assert isinstance(ci["runId"], int) and ci["runId"] > 0
    assert bool(re.fullmatch(r"[0-9a-f]{40}", ci["headSha"]))
    assert ci["headCurrent"] in ("current", "previous"), "Missing selected branch revision comparison"
    for key in ("items", "dependencies", "findings", "targets", "changes", "decisions"):
        assert source_project.get(key) == original_project.get(key), "Source refresh changed " + key
    assert len(saved["projects"]) == len(initial["projects"]) == 120
    read_public_run(ci)
    return source["id"], ci["runId"]


def save_source(initial):
    click_button("Сохранить")
    until = time.monotonic() + 55
    while time.monotonic() < until:
        saved = head()
        if saved["generation"] != initial["generation"]:
            assert saved["revision"] > initial["revision"]
            snapshot = project(saved)
            if snapshot["sources"] and snapshot["sources"][0]["status"] == "ok":
                identity = inspect_snapshot(saved, initial)
                screenshot("source-saved")
                print("ATLAS05_GITHUB_NATIVE_SAVE_PASS", flush=True)
                return saved, identity
        time.sleep(0.35)
    screenshot("save-not-found")
    raise AssertionError("Live GitHub source was not saved to the native Atlas store")


def reopened_check(saved, identity):
    stop()
    launch()
    assert head() == saved, "Installed Atlas reopened a different native revision"
    assert project(head())["sources"][0]["id"] == identity[0]
    assert project(head())["sources"][0]["summary"]["ci"]["runId"] == identity[1]
    open_source_view()
    names = visible_texts()
    if not any("Проверки GitHub Actions" in name for name in names):
        screenshot("actions-reopened-missing")
        raise AssertionError("Saved Actions observation was not shown after restart")
    screenshot("actions-reopened")
    print("ATLAS05_GITHUB_RESTART_READBACK_PASS", flush=True)


initial = head()
assert len(initial["projects"]) == 120, "First qualify installed 120-project portfolio"
assert not project(initial)["sources"], "Expected an unconnected project in fresh Windows qualification"
try:
    launch()
    open_source_view()
    connect_source()
    refresh_source()
    saved, identity = save_source(initial)
    reopened_check(saved, identity)
    print("ATLAS05_GITHUB_INSTALLED_EXCHANGE_PASS", flush=True)
except Exception as error:
    print("ATLAS05_GITHUB_INSTALLED_HOLD " + repr(error), flush=True)
    screenshot("failure")
    raise
finally:
    stop()
