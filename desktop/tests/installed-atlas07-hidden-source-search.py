"""Find a GitHub catalog hidden by the compact project map in installed Atlas.
Starts after installed search-work qualification. Uses only native UIA,
manual selection, explicit Save and independent native storage readback.
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
ENTRY="Связать существующую работу с найденным каталогом atlas-visual-fixture/project-0 / "+FOLDER

def qualify():
    before=d.head()
    original=d.saved_project(before)
    item=next(w for w in original["items"] if w["id"]==WORK_ID)
    assert item["sourceId"] is None
    assert len(original["items"])==1213
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.select_project()
    d.wait_text("Схема проекта: каталоги, работы и этапы",35)
    # This source is absent from the compact source list after the unlink,
    # but its observed catalog must still be found in the complete project.
    v.find_control("Найти",types={"Button"},scroll=False).click_input()
    d.set_text("Найти работу или этап","project-0 directory-01")
    d.wait_text("Найдено: 1",20)
    d.wait_text("Найденные каталоги исходников",20)
    assert d.head()==before,"Search unexpectedly wrote to native Store"
    v.capture("atlas07-hidden-source-search")
    v.find_control(ENTRY,types={"Button"},scroll=False).click_input()
    d.window_title_contains("Форма: Связать работу с каталогом: "+FOLDER,25)
    picker=v.editor_field("Существующая работа",types=("ComboBox",))
    picker.click_input()
    keyboard.send_keys("{HOME}{DOWN}{ENTER}")
    assert d.head()==before,"Choosing a work wrote to native Store"
    v.find_control("Применить к черновику",types={"Button"}).click_input()
    v.await_no_form()
    assert d.head()==before,"Applying in draft wrote before Save"
    assert d.saved_project(before)==original
    d.click_button("Сохранить")
    after=v.await_saved(before)
    updated=d.saved_project(after)
    expected=copy.deepcopy(original)
    work=next(w for w in expected["items"] if w["id"]==WORK_ID)
    work["sourceId"]="visual-source-0"
    work["sourcePath"]=FOLDER
    work["sourceRevision"]="a"*40
    assert updated==expected,"Hidden-source action changed unrelated project data"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==after
    assert d.saved_project(after)==updated
    print("ATLAS07_INSTALLED_HIDDEN_SOURCE_SEARCH_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_INSTALLED_HIDDEN_SOURCE_SEARCH_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-hidden-source-search-failure")
        raise
    finally:
        d.stop()
