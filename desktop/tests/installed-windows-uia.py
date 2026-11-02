"""Real Windows UI Automation acceptance on the installed Atlas program.
No WebView2 CDP/debug port and no test-only product hooks are required.
Fail closed if the actual project/work/save UI is not accessible.
"""
import os
import sys
sys.stdout.reconfigure(encoding="utf-8",errors="replace")
import time
import json
import subprocess
import traceback
import tempfile
from pathlib import Path
from pywinauto import Application

APP=Path(os.environ["ATLAS_INSTALLED_EXE"])
OUT=Path("desktop/test-artifacts")
OUT.mkdir(parents=True,exist_ok=True)
PROJECT="Atlas installed UIA "+str(os.getpid())
ITEM="Persistent native task "+str(os.getpid())
window=None
process=None
phase="bootstrap"

def diagnose(reason):
    marker=Path(tempfile.gettempdir())/("iwxa-atlas-renderer-"+str(process.pid)+".probe") if process else None
    receipt=marker.read_text(encoding="utf-8") if marker and marker.exists() else "ABSENT"
    print("ATLAS_UIA_DIAGNOSTIC",json.dumps({"phase":phase,"reason":str(reason),"pid":process.pid if process else None,"rendererReceipt":receipt},ensure_ascii=True),flush=True)
    if window:
        try:
            fields=[]
            for child in window.descendants()[:170]:
                ei=child.element_info
                fields.append({"name":str(ei.name)[:110],"kind":ei.control_type,"id":str(ei.automation_id)[:80]})
            print("ATLAS_UIA_TREE",json.dumps(fields,ensure_ascii=False),flush=True)
        except Exception as e: print("UIA discovery failed",repr(e),flush=True)
        try: window.capture_as_image().save(OUT/("atlas-uia-"+phase+".png"))
        except Exception as e: print("Screenshot unavailable",repr(e),flush=True)

def boot():
    global window,process
    process=subprocess.Popen([str(APP)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
        env={**os.environ,"ATLAS_CI_RENDERER_PROBE":"1"})
    app=Application(backend="uia")
    deadline=time.monotonic()+35
    last=None
    while time.monotonic()<deadline:
        if process.poll() is not None: raise RuntimeError("Installed Atlas exited: "+str(process.returncode))
        try:
            app.connect(process=process.pid,timeout=2)
            candidate=app.top_window()
            if candidate.exists(timeout=1):
                window=candidate
                if candidate.is_visible():
                    print("ATLAS_UIA_WINDOW_PASS",json.dumps({"title":candidate.window_text(),"pid":process.pid},ensure_ascii=False),flush=True)
                    return
        except Exception as e: last=e
        time.sleep(.7)
    raise RuntimeError("Installed Atlas window inaccessible: "+repr(last))

def controls(title,kind=None):
    if not window: return []
    matches=[]
    for control in window.descendants():
        try:
            if (control.element_info.name==title or str(control.element_info.name).strip().endswith(title)) and (kind is None or control.element_info.control_type==kind):
                matches.append(control)
        except Exception: pass
    return matches

def require(title,kind=None,timeout=12):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        matches=controls(title,kind)
        if matches: return matches[0]
        time.sleep(.35)
    raise AssertionError("UIA element missing: "+title+" ["+str(kind)+"]")

def click(title):
    btn=require(title,"Button")
    try: btn.invoke()
    except Exception: btn.click_input()
    time.sleep(.45)

def set_text(title,value):
    control=require(title,"Edit")
    try: control.set_edit_text(value)
    except Exception:
        control.click_input()
        control.type_keys("^a",set_foreground=True)
        control.type_keys(value,with_spaces=True,set_foreground=True)

def save():
    click("Сохранить")
    require("Сохранено и перечитано с диска.",timeout=15)
    print("ATLAS_UIA_SAVE_READBACK_PASS",flush=True)

def stop():
    global process,window
    if process:
        subprocess.run(["taskkill","/PID",str(process.pid),"/T","/F"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=8)
        try: process.wait(timeout=5)
        except Exception: pass
    window=None
    process=None
    time.sleep(1)

try:
    phase="initial-window"
    boot()
    # The native window can become visible before the embedded renderer is ready.
    phase="native-react-bridge"
    if os.environ.get("ATLAS_CI_EXPECT_BRIDGE","1")=="1":
        marker=Path(tempfile.gettempdir())/("iwxa-atlas-renderer-"+str(process.pid)+".probe")
        for _ in range(28):
            if marker.exists(): break
            time.sleep(.35)
        if not marker.exists():
            raise AssertionError("Native Atlas opened a window, but React did not call atlas_open over Tauri IPC")
        receipt=marker.read_text(encoding="utf-8")
        print("ATLAS_CI_NATIVE_RENDERER_RECEIPT",receipt,flush=True)
        if receipt!="ATLAS_TAURI_JS_NATIVE_OPEN_PASS":
            raise AssertionError("Renderer reached Rust but native store could not open")
    else:
        require("Портфель проектов",timeout=25)
    phase="create-project"
    click("Создать проект")
    set_text("Название проекта",PROJECT)
    set_text("Цель и ожидаемый результат","Native Windows UIA save and restart")
    click("Применить к черновику")
    require(PROJECT)
    save()
    stop()

    phase="restart-project"
    boot()
    click(PROJECT)
    require(PROJECT)
    click("Таблица")
    click("＋ Работа")
    set_text("Что нужно сделать?",ITEM)
    set_text("Оценка длительности, календарных дней","3")
    click("Применить к черновику")
    save()
    stop()

    phase="restart-task"
    boot()
    click(PROJECT)
    click("Таблица")
    require(ITEM)
    window.capture_as_image().save(OUT/"atlas-installed-uia-readback.png")
    print("ATLAS_INSTALLED_WINDOWS_UIA_CREATE_SAVE_STOP_RESTART_READBACK_PASS",flush=True)
except Exception as e:
    diagnose(e)
    traceback.print_exc()
    sys.exit(1)
finally:
    stop()
