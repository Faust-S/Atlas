"""Installed Atlas 0.5 .iwxa Save As and preview/cancel via real Windows GUI.

Uses the accepted native Atlas store as independent readback, ordinary Win32
input and Python zipfile. No browser debugger, synthetic stores or test IPC.
"""
import ctypes
import hashlib
import json
import os
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import win32gui
import win32con
import win32process
from pywinauto import Desktop, keyboard, mouse
from PIL import ImageGrab

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
APP=Path(os.environ["ATLAS_INSTALLED_EXE"])
STORE=Path(os.environ["LOCALAPPDATA"])/"ru.iwxa.atlas"/"atlas-store-v1"
OUT=Path("desktop/tests/visual-evidence")
OUT.mkdir(parents=True,exist_ok=True)
ARCHIVE=Path(os.environ["RUNNER_TEMP"])/"atlas05-human-portfolio.iwxa"
process=None
handle=None

def screenshot(name):
    try:
        ImageGrab.grab().save(OUT/("atlas05-iwxa-"+name+".png"))
        print("ATLAS05_IWXA_SCREENSHOT "+name,flush=True)
    except Exception as error:
        print("ATLAS05_IWXA_SCREENSHOT_ERROR "+str(error)[:100],flush=True)

def head():
    return json.loads((STORE/"head.json").read_text(encoding="utf-8"))

def activation():
    win32gui.ShowWindow(handle,win32con.SW_RESTORE)
    try:win32gui.SetForegroundWindow(handle)
    except Exception:pass
    time.sleep(0.3)

def click(x,y):
    activation()
    bounds=win32gui.GetWindowRect(handle)
    dpi=ctypes.windll.user32.GetDpiForWindow(handle)
    scale=dpi/96 if dpi else 1
    mouse.click(coords=(bounds[0]+round(x*scale),bounds[1]+round(y*scale)))
    time.sleep(0.35)

def launch():
    global process,handle
    process=subprocess.Popen([str(APP)],env={**os.environ,"ATLAS_CI_RENDERER_PROBE":"1"})
    end=time.monotonic()+50
    while time.monotonic()<end:
        if process.poll() is not None:raise AssertionError("Atlas exited before exchange")
        windows=[]
        def visit(hwnd,unused):
            if win32gui.IsWindowVisible(hwnd):
                _,pid=win32process.GetWindowThreadProcessId(hwnd)
                if pid==process.pid and "Atlas" in win32gui.GetWindowText(hwnd):windows.append(hwnd)
        win32gui.EnumWindows(visit,None)
        if windows:
            handle=windows[0]
            win32gui.MoveWindow(handle,0,0,1024,710,True)
            activation()
            print("ATLAS05_IWXA_NATIVE_OPEN_PASS",flush=True)
            return
        time.sleep(0.25)
    raise AssertionError("Atlas window not opened")

def stop():
    if process is not None and process.poll() is None:
        activation()
        keyboard.send_keys("%{F4}")
        try:process.wait(timeout=7)
        except subprocess.TimeoutExpired:
            win32gui.PostMessage(handle,win32con.WM_CLOSE,0,0)
            process.wait(timeout=9)

def menu_action(text,alternative_y):
    click(871,66)
    window=Desktop(backend="uia").window(handle=handle)
    try:
        btn=window.child_window(title=text,control_type="Button")
        if btn.exists(timeout=3) and btn.is_visible():
            btn.click_input()
            return
    except Exception:pass
    click(816,alternative_y)

def dialog_picker(title,target):
    until=time.monotonic()+40
    while time.monotonic()<until:
        hwnd=win32gui.FindWindow("#32770",title)
        if hwnd and win32gui.IsWindowVisible(hwnd):
            win32gui.SetForegroundWindow(hwnd)
            value=str(target)
            assert not any(ch in value for ch in "~%^+{}()"),"Unsafe SendKeys path"
            keyboard.send_keys("%n")
            keyboard.send_keys("^a")
            keyboard.send_keys(value,with_spaces=True)
            keyboard.send_keys("{ENTER}")
            print("ATLAS05_IWXA_NATIVE_PICKER_PASS title="+title,flush=True)
            return
        time.sleep(0.3)
    screenshot("picker-missing")
    raise AssertionError("Native IWXA file dialog not found: "+title)

def wait_file():
    end=time.monotonic()+35
    while time.monotonic()<end:
        if ARCHIVE.is_file() and ARCHIVE.stat().st_size>100:return
        time.sleep(0.2)
    screenshot("no-export")
    raise AssertionError("IWXA archive not saved by native dialog")

def verify_zip():
    with zipfile.ZipFile(ARCHIVE) as z:
        m=json.loads(z.read("manifest.json"))
        assert m["format"]=="iwxa.package" and m["format_version"]=="1.0"
        assert len(z.namelist())==4
        assert all(info.compress_type==zipfile.ZIP_STORED for info in z.infolist())
        for item in m["files"]:
            data=z.read(item["path"])
            assert len(data)==item["size"]
            assert hashlib.sha256(data).hexdigest()==item["sha256"]
        obj=json.loads(z.read("content/objects.ndjson"))
        snapshot=obj["data"]["snapshot"]
        assert len(snapshot["projects"])==120
        assert sum(len(p["items"]) for p in snapshot["projects"])>=1200
        assert snapshot["revision"]==head()["revision"]
    print("ATLAS05_IWXA_INSTALLED_ARCHIVE_PYTHON_PASS",flush=True)

def verify_preview():
    window=Desktop(backend="uia").window(handle=handle)
    until=time.monotonic()+40
    while time.monotonic()<until:
        btn=window.child_window(title="Отменить импорт",control_type="Button")
        if btn.exists(timeout=1) and btn.is_visible():
            screenshot("import-preview")
            btn.click_input()
            print("ATLAS05_IWXA_INSTALLED_PREVIEW_CANCEL_PASS",flush=True)
            return
        time.sleep(0.35)
    screenshot("preview-missing")
    raise AssertionError("IWXA preview cancellation not accessible")

original=head()
assert len(original["projects"])==120,"Expected qualified portfolio after R5 installed GUI"
assert not ARCHIVE.exists(),"Prior archive in clean qualification runner"
try:
    launch()
    menu_action("Сохранить архив .iwxa",134)
    dialog_picker("Сохранить архив проектов IWXA",ARCHIVE)
    wait_file()
    verify_zip()
    assert head()["generation"]==original["generation"],"Export changed the native Store"
    print("ATLAS05_IWXA_INSTALLED_SAVE_PASS",flush=True)
    activation()
    menu_action("Открыть архив .iwxa",184)
    dialog_picker("Открыть архив проектов IWXA",ARCHIVE)
    verify_preview()
    assert head()["generation"]==original["generation"],"Preview/cancel changed native Store"
    print("ATLAS05_IWXA_INSTALLED_EXCHANGE_PASS",flush=True)
except Exception as error:
    print("ATLAS05_IWXA_INSTALLED_HOLD "+repr(error),flush=True)
    screenshot("failure")
    raise
finally:
    stop()
