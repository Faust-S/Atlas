"""Installed Atlas 0.7: remove an incorrect catalog link through the real work editor.
Starts from the already qualified saved project after the link acceptance.
No test-only API, direct Store mutation, browser automation or fabricated save.
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
WORK_TITLE="Работа 0 / 1"

def qualify():
    before=d.head()
    previous=d.saved_project(before)
    assert len(previous["items"])==1213,"Expected previously qualified large project"
    item=next(w for w in previous["items"] if w["id"]==WORK_ID)
    assert item["sourceId"]=="visual-source-0"
    assert item["sourcePath"]=="directory-01"
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.select_project()
    d.wait_text("Схема проекта: каталоги, работы и этапы",35)
    v.find_control(WORK_TITLE,types={"Button"}).click_input()
    d.window_title_contains("Форма: Работа: "+WORK_TITLE,25)
    assert d.head()==before,"Opening the work editor wrote to Store"
    picker=d.window().child_window(title="Связь с источником",control_type="ComboBox")
    assert picker.exists(timeout=15) and picker.is_enabled()
    picker.click_input()
    keyboard.send_keys("{HOME}{DOWN}{ENTER}")
    assert d.head()==before,"Choosing removal wrote to Store"
    v.capture("atlas07-remove-work-source-selected")
    v.find_control("Применить к черновику",types={"Button"}).click_input()
    v.await_no_form()
    assert d.head()==before,"Removing a link in draft wrote to Store before Save"
    assert d.saved_project(before)==previous
    v.capture("atlas07-remove-work-source-draft")
    d.click_button("Сохранить")
    after=v.await_saved(before)
    updated=d.saved_project(after)
    expected=copy.deepcopy(previous)
    work=next(w for w in expected["items"] if w["id"]==WORK_ID)
    work["sourceId"]=None
    work.pop("sourcePath")
    work.pop("sourceRevision")
    assert updated==expected,"Removing source link changed unrelated project data"
    assert len(updated["items"])==len(previous["items"])
    assert updated["dependencies"]==previous["dependencies"]
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==after
    assert d.saved_project(after)==updated
    print("ATLAS07_INSTALLED_WORK_SOURCE_UNLINK_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_INSTALLED_WORK_SOURCE_UNLINK_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-unlink-work-failure")
        raise
    finally:
        d.stop()
