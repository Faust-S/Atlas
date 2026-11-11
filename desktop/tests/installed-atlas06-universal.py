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
    assert len(project["stages"])==3
    assert len(project["dependencies"])==2
    return project

def open_editor_by_visible_control(label):
    # Physical click is first, and the native window title is the oracle.
    # If Windows/WebView2 changed focus during scrolling, use ordinary
    # keyboard activation of the same real visible control. Never invoke
    # an internal API, mutate a Store, or claim PASS from UIA alone.
    control=v.find_control(label,types={"Button"})
    rect=control.rectangle()
    print("ATLAS06_UNIVERSAL_EDITOR_CLICK "+label+" "+repr((rect.left,rect.top,rect.right,rect.bottom)),flush=True)
    d.activate()
    control.click_input()
    until=time.monotonic()+6
    while time.monotonic()<until:
        if "Форма:" in win32gui.GetWindowText(d.handle):
            return
        time.sleep(0.2)
    v.capture("universal-editor-first-click-no-form")
    control=v.find_control(label,types={"Button"})
    d.activate()
    control.set_focus()
    keyboard.send_keys("{ENTER}")
    d.window_title_contains("Форма:",18)
    print("ATLAS06_UNIVERSAL_EDITOR_KEYBOARD_RETRY_USED "+label,flush=True)

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
    d.wait_text("Этапы без работ",35)
    d.wait_text("Подвести итоги",35)
    print("ATLAS06_UNIVERSAL_UNUSED_STAGE_VISIBLE_PASS",flush=True)
    d.wait_text("Другое",35)
    print("ATLAS06_UNIVERSAL_HUMAN_PROJECT_TYPE_PASS",flush=True)
    d.wait_text("Работы и этапы",35)
    d.wait_text("Открыть площадку",35)
    assert d.head()==saved
    v.capture("universal-project-1024")
    print("ATLAS06_UNIVERSAL_NO_GITHUB_MAP_PASS",flush=True)

    # Search also works in an ordinary project with no GitHub source.
    v.find_control("Найти",types={"Button"},scroll=False).click_input()
    d.set_text("Найти работу или этап","Подвести итоги")
    d.wait_text("Найдено: 1",25)
    v.capture("universal-search-unused-stage")
    result=v.find_control("Открыть этап Подвести итоги",types={"Button"},scroll=False)
    result.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Opening a searched unused stage changed native Store"
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    assert d.head()==saved
    print("ATLAS06_UNIVERSAL_SEARCH_STAGE_PASS",flush=True)
    v.find_control("Найти",types={"Button"}).click_input()
    d.set_text("Найти работу или этап","Открыть площадку")
    d.wait_text("Найдено: 1",25)
    v.find_control("Связи работы Открыть площадку",types={"Button"},scroll=False).click_input()
    d.wait_text("Предшествующих работ: 2",25)
    d.wait_text("Подготовить помещение",25)
    v.capture("universal-search-recorded-links")
    assert d.head()==saved,"Inspecting ordinary work links changed native Store"
    keyboard.send_keys("{ESC}")
    print("ATLAS06_UNIVERSAL_SEARCH_DEPENDENCY_CONTEXT_PASS",flush=True)

    # An ordinary project without GitHub must navigate from its work table to
    # the exact dependency graph, then return to the same filtered work.
    d.click_button("Таблица")
    d.wait_text("Работы проекта",25)
    d.set_text("Найти работу","Открыть площадку")
    # WebView2 UIA may expose JSX text fragments separately even when the
    # complete sentence is clearly visible in the installed Windows window.
    d.wait_text("Не отмечены выполненными:",25)
    d.wait_text("Подготовить помещение",25)
    d.wait_text("Согласовать программу",25)
    v.capture("universal-table-work-conditions")
    assert d.head()==saved,"Reading predecessor hints in table changed native Store"
    print("ATLAS06_UNIVERSAL_TABLE_DEPENDENCY_HINT_PASS",flush=True)
    work_link=v.find_control("Связи работы Открыть площадку",types={"Button"})
    work_link.click_input()
    d.wait_text("Зависимости работ",25)
    back=v.find_control("К работе в таблице",types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(back.rectangle(),win32gui.GetWindowRect(d.handle))
    v.capture("universal-work-dependency-graph")
    assert d.head()==saved,"Opening graph from ordinary work changed native Store"
    back.click_input()
    d.wait_text("Работы проекта",25)
    selected=v.find_control("Связи работы Открыть площадку",types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(selected.rectangle(),win32gui.GetWindowRect(d.handle)), (
        "The original work was not restored inside the Windows viewport")
    v.capture("universal-work-dependency-return")
    assert d.head()==saved,"Returning from ordinary work graph changed native Store"
    print("ATLAS06_UNIVERSAL_TABLE_GRAPH_ROUNDTRIP_PASS",flush=True)

    # The same work must be reachable from the board without a source.
    # Only actual Windows-visible controls are clicked.
    v.find_control("Другие разделы").click_input()
    v.find_control("Доска",types={"Button"}).click_input()
    # WebView2 UIA may expose JSX text fragments separately even when the
    # complete sentence is clearly visible in the installed Windows window.
    d.wait_text("Не отмечены выполненными:",25)
    d.wait_text("Подготовить помещение",25)
    d.wait_text("Согласовать программу",25)
    v.capture("universal-board-work-conditions")
    assert d.head()==saved,"Reading predecessor hints on board changed native Store"
    print("ATLAS06_UNIVERSAL_BOARD_DEPENDENCY_HINT_PASS",flush=True)
    board_work=v.find_control("Связи работы Открыть площадку",types={"Button"})
    board_work.click_input()
    d.wait_text("Зависимости работ",25)
    board_back=v.find_control("К работе на доске",types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(board_back.rectangle(),win32gui.GetWindowRect(d.handle))
    v.capture("universal-board-work-graph")
    assert d.head()==saved,"Opening board work graph modified native Store"
    board_back.click_input()
    restored=v.find_control("Связи работы Открыть площадку",types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(restored.rectangle(),win32gui.GetWindowRect(d.handle)), (
        "The selected board card was not restored in the Windows viewport")
    v.capture("universal-board-work-return")
    assert d.head()==saved,"Returning to board card modified native Store"
    print("ATLAS06_UNIVERSAL_BOARD_GRAPH_ROUNDTRIP_PASS",flush=True)

    # The tab strip can be above the Windows viewport after returning to a
    # filtered table row. Scroll it into the physical window before clicking.
    v.find_control("Обзор",types={"Button"}).click_input()
    d.wait_text("Схема проекта: работы и этапы",25)

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
    open_editor_by_visible_control("Открыть площадку")
    assert d.head()==saved
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    open_editor_by_visible_control("Проведение")
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
    open_editor_by_visible_control("Подвести итоги")
    assert d.head()==saved,"Opening an unassigned stage modified native Store"
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    assert d.head()==saved
    print("ATLAS06_UNIVERSAL_UNUSED_STAGE_EDITOR_PASS",flush=True)
    # Search results must remain physically clickable in a narrow window.
    v.find_control("Найти",types={"Button"}).click_input()
    d.set_text("Найти работу или этап","Согласовать программу")
    d.wait_text("Найдено: 1",25)
    found=v.find_control("Открыть работу Согласовать программу",types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(found.rectangle(),win32gui.GetWindowRect(d.handle))
    v.capture("universal-search-narrow")
    found.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Narrow search changed native Store"
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    assert d.head()==saved
    print("ATLAS06_UNIVERSAL_SEARCH_NARROW_PASS",flush=True)
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
