"""Real installed Windows qualification of a project without GitHub.

Imports a synthetic .iwxa through the ordinary file dialog, confirms the
preview, saves the actual owner Store, restarts, and navigates existing
work/stage/dependency links. No synthetic store writes, CDP or test IPC.
"""
import importlib.util
import json
import os
import sys
import time
import zipfile
from pathlib import Path
import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
SPEC=importlib.util.spec_from_file_location(
    "atlas06_visual_helpers",Path(__file__).with_name("installed-atlas06-visual-scale.py"))
v=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v)
d=v.d
ARCHIVE=Path(os.environ["ATLAS06_UNIVERSAL_IWXA"])
NAME="Городская встреча без исходников"
v.ARCHIVE=ARCHIVE
v.PROJECT=NAME

def snapshot_from_archive():
    with zipfile.ZipFile(ARCHIVE) as z:
        manifest=json.loads(z.read("manifest.json"))
        assert manifest["format"]=="iwxa.package"
        obj=json.loads(z.read("content/objects.ndjson"))
    snapshot=obj["data"]["snapshot"]
    assert snapshot["schema"]=="atlas.project/1"
    assert len(snapshot["projects"])==1
    project=snapshot["projects"][0]
    assert project["name"]==NAME and project["type"]=="other"
    assert len(project["sources"])==0
    assert len(project["items"])==3
    assert len(project["stages"])==2
    assert len(project["dependencies"])==2
    return project

def qualify():
    expected=snapshot_from_archive()
    baseline=d.head()
    assert len(baseline["projects"])==1,"Expected qualified large project before universal test"
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.open_file_menu()
    d.click_button("Открыть архив .iwxa")
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert d.head()==baseline,"Preview altered native Store"
    v.capture("universal-preview")
    d.click_button("Заменить портфель в черновике")
    assert d.head()==baseline,"Preview confirmation bypassed native Save"
    d.click_button("Сохранить")
    saved=v.await_saved(baseline)
    assert d.saved_project(saved)==expected,"Universal project changed after native Save"
    print("ATLAS06_UNIVERSAL_IWXA_NATIVE_SAVE_PASS",flush=True)
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved,"Universal project changed after cold restart"
    assert d.saved_project(d.head())==expected
    v.select_project()
    d.wait_text("Схема проекта: работы и этапы",35)
    d.wait_text("Работы и этапы",35)
    d.wait_text("Открыть площадку",35)
    assert d.head()==saved
    v.capture("universal-project-1024")
    print("ATLAS06_UNIVERSAL_NO_GITHUB_MAP_PASS",flush=True)

    # Two predecessors in the already saved plan, never inferred by the map.
    detail=v.find_control("Предшествующих работ: 2")
    detail.click_input()
    nodes=[element for element in d.window().descendants()
           if element.window_text()=="Подготовить помещение" and element.is_visible()]
    if len(nodes)<2:
        v.capture("universal-dependency-missing")
        raise AssertionError("The saved predecessor is not disclosed within the plan map")
    assert d.head()==saved
    v.capture("universal-dependencies")
    print("ATLAS06_UNIVERSAL_DEPENDENCY_DETAILS_PASS",flush=True)

    # Open the actual work and stage editors; no form is submitted.
    work=v.find_control("Открыть площадку",types={"Button"})
    work.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    stage=v.find_control("Проведение",types={"Button"})
    stage.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    assert d.head()==saved
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    time.sleep(0.3)
    visible=v.find_control("Открыть площадку",types={"Button"})
    assert v.rectangle_in_workspace(visible.rectangle(),win32gui.GetWindowRect(d.handle))
    v.capture("universal-project-820")
    assert d.head()==saved
    print("ATLAS06_UNIVERSAL_WORK_STAGE_NAVIGATION_PASS",flush=True)
    print("ATLAS06_UNIVERSAL_NATIVE_NO_UNREQUESTED_WRITE_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS06_UNIVERSAL_WINDOWS_HOLD "+repr(exc),flush=True)
        v.capture("universal-failure")
        raise
    finally:
        d.stop()
