"""Atlas 0.6 first-use onboarding witnessed in a real installed Windows app.

No Tauri test-only IPC, synthetic native writes, browser debugger, or fake
GitHub fetch. GUI creates a draft; independent Rust store readback proves Save
and restart. On API infrastructure failure this scenario is HOLD, not PASS.
"""
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
from PIL import ImageGrab
from pywinauto import Desktop, keyboard

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
APP=Path(os.environ["ATLAS_INSTALLED_EXE"])
STORE=Path(os.environ["LOCALAPPDATA"])/"ru.iwxa.atlas"/"atlas-store-v1"
OUT=Path("desktop/tests/visual-evidence")
OUT.mkdir(parents=True,exist_ok=True)
REPO="Faust-S/Atlas"
BRANCH="work/2026-11-10-atlas-0-6"
process=None
handle=None

def screenshot(name):
    try:
        ImageGrab.grab().save(OUT/("atlas06-connect-"+name+".png"))
        print("ATLAS06_CONNECT_SCREENSHOT "+name,flush=True)
    except Exception as exc:
        print("ATLAS06_CONNECT_SCREENSHOT_UNAVAILABLE "+repr(exc)[:180],flush=True)

def launch():
    global process,handle
    process=subprocess.Popen([str(APP)],env={**os.environ,"ATLAS_CI_RENDERER_PROBE":"1"})
    until=time.monotonic()+60
    while time.monotonic()<until:
        if process.poll() is not None:
            raise AssertionError("Installed Atlas 0.6 exited before first window")
        found=[]
        def visit(hwnd,unused):
            if not win32gui.IsWindowVisible(hwnd):return
            _,pid=win32process.GetWindowThreadProcessId(hwnd)
            if pid==process.pid and "Atlas" in win32gui.GetWindowText(hwnd):
                found.append(hwnd)
        win32gui.EnumWindows(visit,None)
        if found:
            handle=found[0]
            win32gui.MoveWindow(handle,0,0,1120,760,True)
            activate()
            return
        time.sleep(0.3)
    raise AssertionError("Installed Atlas did not open its native window")

def activate():
    if not handle or not win32gui.IsWindow(handle):
        raise AssertionError("Installed Atlas window is missing")
    win32gui.ShowWindow(handle,win32con.SW_RESTORE)
    try:win32gui.SetForegroundWindow(handle)
    except Exception:pass
    time.sleep(0.2)

def window():
    return Desktop(backend="uia").window(handle=handle)

def visible_texts():
    return [str(element.window_text()) for element in window().descendants()
            if element.window_text()]

def wait_button(name,timeout=35):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if process.poll() is not None:raise AssertionError("Atlas closed while seeking "+name)
        found=[element for element in window().descendants(control_type="Button")
               if element.window_text()==name and element.is_visible() and element.is_enabled()]
        if len(found)==1:return found[0]
        if len(found)>1:
            raise AssertionError("Ambiguous native button "+name)
        time.sleep(0.3)
    screenshot("button-not-found")
    raise AssertionError("Missing installed button: "+name)

def click_button(name,timeout=35):
    activate()
    wait_button(name,timeout).click_input()
    time.sleep(0.3)

def set_text(name,value):
    control=window().child_window(title=name,control_type="Edit")
    if not control.exists(timeout=10) or not control.is_visible():
        screenshot("input-not-found")
        raise AssertionError("Native editor missing: "+name)
    control.click_input()
    keyboard.send_keys("^a")
    keyboard.send_keys(value,with_spaces=True)
    time.sleep(0.25)

def wait_text(value,timeout=90):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if process.poll() is not None:raise AssertionError("Atlas exited before "+value)
        matches=visible_texts()
        if any(value in text for text in matches):return
        errors=[text for text in matches if "rate-limit" in text.lower() or
                "GitHub public API 403" in text or "GitHub public API 429" in text]
        if errors:
            screenshot("github-rate-limited")
            raise AssertionError("Public GitHub API temporarily unavailable: "+repr(errors[:2]))
        time.sleep(0.4)
    screenshot("view-timeout")
    raise AssertionError("Installed UI never rendered: "+value)

def stop():
    global process,handle
    if process is None:return
    if process.poll() is None:
        activate()
        keyboard.send_keys("%{F4}")
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            win32gui.PostMessage(handle,win32con.WM_CLOSE,0,0)
            process.wait(timeout=10)
    process=None
    handle=None

def head():
    index=STORE/"head.json"
    end=time.monotonic()+6
    while True:
        try:return json.loads(index.read_text(encoding="utf-8"))
        except PermissionError:
            if time.monotonic()>end:raise
            time.sleep(0.1)

def saved_project(manifest):
    assert len(manifest["projects"])==1,"First use unexpectedly created extra projects"
    descriptor=manifest["projects"][0]
    data=(STORE/"blocks"/(descriptor["sha256"]+".json")).read_bytes()
    assert hashlib.sha256(data).hexdigest()==descriptor["sha256"]
    project=json.loads(data.decode("utf-8"))
    assert project["id"]==descriptor["id"]
    return project

def qualify():
    if (STORE/"head.json").exists():
        raise AssertionError("Wizard acceptance requires a new empty Atlas profile")
    launch()
    # The first-run screen shows three distinct actions with no setup burden.
    click_button("Подключить проект")
    wait_text("1. Источник")
    set_text("Адрес подключаемого проекта GitHub","https://github.com/"+REPO)
    click_button("Посмотреть структуру")
    wait_text("Обнаружен репозиторий",90)
    # Atlas's public 'main' may be empty; the user explicitly picks the real
    # development branch and receives the tree of that exact commit.
    set_text("Ветка исходников для подключения",BRANCH)
    click_button("Изучить выбранную ветку")
    wait_text("Корневая структура",90)
    screenshot("selected-branch-preview")
    assert not (STORE/"head.json").exists(),"Read-only inspection wrote native storage"
    click_button("Добавить в Atlas")
    wait_button("Сохранить")
    assert not (STORE/"head.json").exists(),"Creating a project draft unexpectedly saved"
    click_button("Сохранить")
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        if (STORE/"head.json").exists():break
        time.sleep(0.25)
    else:
        screenshot("save-timeout")
        raise AssertionError("Native Atlas did not save the project")
    first=head()
    project=saved_project(first)
    assert project["name"]=="Atlas"
    assert project["type"]=="engineering"
    assert project["items"]==[] and project["stages"]==[],"Source folders invented work or plan"
    assert len(project["sources"])==1
    source=project["sources"][0]
    assert source["kind"]=="github" and source["locator"].lower()==REPO.lower()
    assert source["branch"]==BRANCH
    assert source["status"]=="ok"
    observation=source["summary"]
    assert observation["readiness"]=="not_assessed"
    assert observation["repository"].lower()==REPO.lower()
    assert observation["structure"]["status"]=="observed"
    assert observation["structure"]["branch"]==BRANCH
    assert len(observation["structure"]["folders"])>0
    assert observation["structure"]["commitSha"]==observation["branchHeads"][BRANCH]
    print("ATLAS06_CONNECT_NATIVE_SAVE_PASS",flush=True)
    stop()
    launch()
    second=head()
    assert second==first,"Saved structure or source changed after native restart"
    assert saved_project(second)==project,"Project block changed after restart"
    screenshot("reopened-project")
    print("ATLAS06_CONNECT_BRANCH_TREE_RESTART_PASS",flush=True)

try:
    qualify()
except Exception as exc:
    print("ATLAS06_CONNECT_WINDOWS_HOLD "+repr(exc),flush=True)
    screenshot("failure")
    raise
finally:
    stop()
