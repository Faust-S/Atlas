"""Installed Windows witness: link a real existing work to an observed folder.
No hidden Store writes, direct source mutations, browser automation or mock API.
Uses the saved synthetic .iwxa project left by the existing 0.6 Windows gate.
"""
import copy
import importlib.util
import sys
from pathlib import Path
from pywinauto import keyboard

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
spec=importlib.util.spec_from_file_location(
    "atlas07_visual_driver",Path(__file__).with_name("installed-atlas06-visual-scale.py"))
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d
WORK_ID="visual-work-0-0"
FOLDER="directory-01"
ENTRY="Связать существующую работу с каталогом atlas-visual-fixture/project-0 / "+FOLDER

def qualify():
    before=d.head()
    assert len(before["projects"])==1,"Expected previously qualified synthetic visual project"
    previous=d.saved_project(before)
    work=next(w for w in previous["items"] if w["id"]==WORK_ID)
    assert work["sourceId"]=="visual-source-0"
    assert work["sourcePath"]==v.LONG_FOLDER
    assert work["sourceRevision"]=="a"*40
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.select_project()
    d.wait_text("Схема проекта: каталоги, работы и этапы",35)
    button=v.find_control(ENTRY,types={"Button"})
    v.capture("atlas07-verified-folder-link-entry")
    assert d.head()==before,"Opening the source map wrote to native Store"
    button.click_input()
    d.window_title_contains("Форма: Связать работу с каталогом: "+FOLDER,25)
    assert d.head()==before,"Opening the work-link form wrote to native Store"
    picker=d.window().child_window(title="Существующая работа",control_type="ComboBox")
    assert picker.exists(timeout=15) and picker.is_enabled()
    picker.click_input()
    keyboard.send_keys("{HOME}{DOWN}{ENTER}")
    assert d.head()==before,"Selecting an existing work wrote to native Store"
    v.capture("atlas07-work-link-selection")
    v.find_control("Применить к черновику",types={"Button"}).click_input()
    v.await_no_form()
    assert d.head()==before,"Applying the work link wrote to disk without Save"
    assert d.saved_project(before)==previous
    v.capture("atlas07-work-link-applied-draft")
    d.click_button("Сохранить")
    after=v.await_saved(before)
    updated=d.saved_project(after)
    expected=copy.deepcopy(previous)
    target=next(w for w in expected["items"] if w["id"]==WORK_ID)
    target["sourcePath"]=FOLDER
    assert updated==expected,"Work link changed fields other than the chosen catalog"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==after
    assert d.saved_project(after)==updated
    print("ATLAS07_INSTALLED_EXISTING_WORK_FOLDER_LINK_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_INSTALLED_FOLDER_WORK_LINK_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-folder-link-failure")
        raise
    finally:
        d.stop()
