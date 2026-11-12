"""Installed Atlas 0.7: search all works in a large source-link editor.
Starts after the unlink gate. Uses physical WebView2 controls, the original
Save button, native readback and a full application restart.
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
WORK_ID="visual-work-5-1079"
FOLDER="directory-01"
ENTRY="Связать существующую работу с каталогом atlas-visual-fixture/project-0 / "+FOLDER

def qualify():
    before=d.head()
    previous=d.saved_project(before)
    assert len(previous["items"])==1213,"Expected previously qualified large project"
    work=next(w for w in previous["items"] if w["id"]==WORK_ID)
    assert work["sourceId"]=="visual-source-5"
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.select_project()
    d.wait_text("Схема проекта: каталоги, работы и этапы",35)
    v.find_control(ENTRY,types={"Button"}).click_input()
    d.window_title_contains("Форма: Связать работу с каталогом: "+FOLDER,25)
    assert d.head()==before,"Opening editor changed native Store"
    search=v.editor_field("Найти существующую работу",types=("Edit",))
    search.click_input()
    keyboard.send_keys("5 / 1080",with_spaces=True)
    d.wait_text("Найдено: 1",20)
    assert d.head()==before,"Searching changed native Store"
    picker=v.editor_field("Существующая работа",types=("ComboBox",))
    picker.click_input()
    keyboard.send_keys("{HOME}{DOWN}{ENTER}")
    v.capture("atlas07-search-work-selected")
    assert d.head()==before,"Selecting a distant work changed native Store"
    v.find_control("Применить к черновику",types={"Button"}).click_input()
    v.await_no_form()
    assert d.head()==before,"Applying searched work wrote before Save"
    assert d.saved_project(before)==previous
    d.click_button("Сохранить")
    after=v.await_saved(before)
    updated=d.saved_project(after)
    expected=copy.deepcopy(previous)
    target=next(w for w in expected["items"] if w["id"]==WORK_ID)
    target["sourceId"]="visual-source-0"
    target["sourcePath"]=FOLDER
    target["sourceRevision"]="a"*40
    assert updated==expected,"Searched work selection changed wrong work or unrelated fields"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==after
    assert d.saved_project(after)==updated
    print("ATLAS07_INSTALLED_SEARCHED_WORK_LINK_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_INSTALLED_SEARCHED_WORK_LINK_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-search-work-failure")
        raise
    finally:
        d.stop()
