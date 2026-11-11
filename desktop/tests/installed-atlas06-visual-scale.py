"""Installed Atlas 0.6 visual stress qualification, 100% synthetic input.

A real user-path .iwxa file picker, preview and Save imports the fixture.
Checks the native readback, real WebView2 UIA coordinates, scroll, resizing,
expansion, work/stage/dependency navigation and preservation after restart.
No test IPC, direct native store injection, DOM debugger, or network mocks.
"""
import importlib.util
import json
import os
import sys
import time
import zipfile
from pathlib import Path
import win32gui
from pywinauto import keyboard, mouse

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
PATH=Path(__file__).with_name("installed-atlas06-connect.py")
SPEC=importlib.util.spec_from_file_location("atlas06_connect_driver",PATH)
d=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(d)
ARCHIVE=Path(os.environ["ATLAS06_VISUAL_IWXA"])
PROJECT="Контрольный большой проект"
LONG_FOLDER="integrations-"+"verylongunbrokendirectory"*6
LONG_WORK="Проверить"+"ОченьДлинноеНазваниеРаботыБезПробелов"*10
LONG_STAGE="Проверка этапа: "+"длинное название сложного этапа "*7

def capture(name):
    d.screenshot("visual-"+name)

def rectangle_in_workspace(rect,window_bounds,require_vertical=True):
    horizontal=rect.left>=window_bounds[0]+170 and rect.right<=window_bounds[2]-8
    if not require_vertical:
        return horizontal
    return horizontal and (rect.top>=window_bounds[1]+105
       and rect.bottom<=window_bounds[3]-35)

def find_control(name,types=None,scroll=True):
    # WebView2 UIA may collapse whitespace or shorten names of very long
    # buttons. A long unique prefix is sufficient for locating that test
    # fixture's single control; a physical click still must open its editor.
    wanted="".join(name.split())
    def named(text):
        shown="".join(str(text).split())
        return shown==wanted or (len(wanted)>100 and
            shown.startswith(wanted[:64]))
    def scroll_at(bounds,distance):
        mouse.scroll(coords=(bounds[0]+min(505,bounds[2]-bounds[0]-110),
                             bounds[1]+min(505,bounds[3]-bounds[1]-85)),
                     wheel_dist=distance)
    # A control already on screen must be used in place. Scrolling the page
    # to the beginning before every click can invalidate WebView2 UIA layout
    # coordinates between focus and physical input.
    if scroll:
        current=win32gui.GetWindowRect(d.handle)
        for e in d.window().descendants():
            shown=str(e.window_text() or "")
            if (named(shown) and e.is_visible() and e.is_enabled()
                and (types is None or e.element_info.control_type in types)
                and rectangle_in_workspace(e.rectangle(),current)):
                return e
        d.activate()
        scroll_at(current,30)
        time.sleep(0.2)
    end=time.monotonic()+35
    attempts=0
    candidates=[]
    while time.monotonic()<end:
        bounds=win32gui.GetWindowRect(d.handle)
        relevant=[]
        for e in d.window().descendants():
            text=str(e.window_text() or "")
            if (named(text) and e.is_visible() and e.is_enabled()
                and (types is None or e.element_info.control_type in types)):
                relevant.append(e)
        for element in relevant:
            rect=element.rectangle()
            candidates.append((element.element_info.control_type,
                               rect.left,rect.top,rect.right,rect.bottom))
            if rectangle_in_workspace(rect,bounds):
                return element
        if not scroll:
            break
        attempts+=1
        d.activate()
        scroll_at(bounds,-2)
        time.sleep(0.2)
    print("ATLAS06_VISUAL_UIA_CANDIDATES "+name[:45]+" "+repr(candidates[:8]),flush=True)
    capture("control-not-visible")
    raise AssertionError("Synthetic visual control not physically reachable: "+name[:90])

def open_file_menu():
    end=time.monotonic()+20
    while time.monotonic()<end:
        matches=[e for e in d.window().descendants()
                 if e.window_text()=="Сохранение и копии" and e.is_visible()]
        if len(matches)==1:
            d.activate()
            matches[0].click_input()
            return
        time.sleep(0.2)
    capture("file-menu-missing")
    raise AssertionError("Installed file-menu summary not accessible")

def choose_archive():
    assert ARCHIVE.is_file() and ARCHIVE.suffix.lower()==".iwxa"
    end=time.monotonic()+35
    while time.monotonic()<end:
        h=win32gui.FindWindow("#32770","Открыть архив проектов IWXA")
        if h and win32gui.IsWindowVisible(h):
            win32gui.SetForegroundWindow(h)
            path=str(ARCHIVE)
            assert not any(ch in path for ch in "~%^+{}()"),"Unsafe SendKeys path"
            keyboard.send_keys("%n")
            keyboard.send_keys("^a")
            keyboard.send_keys(path,with_spaces=True)
            keyboard.send_keys("{ENTER}")
            print("ATLAS06_VISUAL_NATIVE_IWXA_PICKER_PASS",flush=True)
            return
        time.sleep(0.25)
    capture("iwxa-file-picker-missing")
    raise AssertionError("Installed .iwxa chooser did not open")

def imported_snapshot():
    with zipfile.ZipFile(ARCHIVE) as z:
        m=json.loads(z.read("manifest.json"))
        assert m["format"]=="iwxa.package" and m["encryption"]=="none"
        obj=json.loads(z.read("content/objects.ndjson"))
        project=obj["data"]["snapshot"]["projects"][0]
        assert len(project["items"])==1212
        assert len(project["stages"])==48
        assert len(project["sources"])==6
        assert len(project["dependencies"])==299
        return project

def select_project():
    end=time.monotonic()+40
    while time.monotonic()<end:
        bounds=win32gui.GetWindowRect(d.handle)
        options=[e for e in d.window().descendants(control_type="Button")
                 if e.window_text()==PROJECT and e.is_visible() and e.is_enabled()]
        left=[e for e in options if e.rectangle().left<bounds[0]+225]
        if len(left)==1:
            left[0].click_input()
            d.window_title_contains(PROJECT+" — Обзор",25)
            return
        time.sleep(0.25)
    capture("synthetic-project-navigation-missing")
    raise AssertionError("Synthetic project not accessible from native sidebar")

def await_saved(baseline):
    end=time.monotonic()+45
    while time.monotonic()<end:
        now=d.head()
        if now["generation"]!=baseline["generation"]:
            return now
        time.sleep(0.25)
    capture("visual-native-save-timeout")
    raise AssertionError("Synthetic .iwxa import was not saved")

def await_no_form():
    end=time.monotonic()+15
    while time.monotonic()<end:
        if "Форма:" not in win32gui.GetWindowText(d.handle):
            return
        time.sleep(0.2)
    capture("editor-stayed-open")
    raise AssertionError("Read-only inspection could not close editor")

def qualify_visual():
    expected=imported_snapshot()
    before=d.head()
    assert len(before["projects"])==1,"Expected preceding real GitHub wizard qualification"
    d.launch()
    d.wait_text("Портфель проектов",45)
    open_file_menu()
    d.click_button("Открыть архив .iwxa")
    choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert d.head()==before,"Opening IWXA preview modified native data"
    capture("import-preview")
    d.click_button("Заменить портфель в черновике")
    assert d.head()==before,"Approving IWXA preview bypassed native Save"
    print("ATLAS06_VISUAL_IWXA_PREVIEW_READONLY_PASS",flush=True)
    d.click_button("Сохранить")
    saved=await_saved(before)
    project=d.saved_project(saved)
    assert project==expected,"Installed .iwxa import changed synthetic project contents"
    assert len(project["items"])==1212 and len(project["dependencies"])==299
    print("ATLAS06_VISUAL_IWXA_NATIVE_SAVE_PASS",flush=True)
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved,"Imported visual project changed after cold restart"
    assert d.saved_project(d.head())==expected
    select_project()
    d.wait_text("Схема проекта: каталоги, работы и этапы",25)
    d.wait_text("atlas-visual-fixture/project-5",25)
    assert d.head()==saved,"Viewing large synthetic plan modified native data"
    capture("large-project-1024")
    print("ATLAS06_VISUAL_LINKED_SOURCE_FIRST_PASS",flush=True)

    # Find entries in the real saved plan that do not exist in the bounded map.
    find_control("Найти",types={"Button"},scroll=False).click_input()
    d.set_text("Найти работу или этап","Работа 5 / 1080")
    d.wait_text("Найдено: 1",25)
    capture("search-hidden-work-1024")
    assert d.head()==saved,"Searching a hidden work changed native Store"
    found=find_control("Открыть работу Работа 5 / 1080",types={"Button"},scroll=False)
    found.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Opening a searched work changed native Store"
    keyboard.send_keys("{ESC}")
    await_no_form()
    print("ATLAS06_VISUAL_SEARCH_HIDDEN_WORK_PASS",flush=True)

    find_control("Найти",types={"Button"}).click_input()
    d.set_text("Найти работу или этап","Этап работ 48")
    d.wait_text("Найдено: 1",25)
    capture("search-stage-1024")
    found=find_control("Открыть этап Этап работ 48",types={"Button"},scroll=False)
    found.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Opening a searched stage changed native Store"
    keyboard.send_keys("{ESC}")
    await_no_form()
    assert d.head()==saved
    print("ATLAS06_VISUAL_SEARCH_STAGE_PASS",flush=True)
    print("ATLAS06_VISUAL_SEARCH_READONLY_PASS",flush=True)

    # The expansion button must be near the diagram heading, not after 200 rows.
    find_control("Показать больше связей",types={"Button"},scroll=False).click_input()
    d.wait_text("Свернуть схему",35)
    capture("expanded-1024")
    assert d.head()==saved
    find_control("Свернуть схему",types={"Button"},scroll=False).click_input()
    d.wait_text("Показать больше связей",25)
    assert d.head()==saved
    print("ATLAS06_VISUAL_EXPAND_COLLAPSE_PASS",flush=True)

    # Narrow Windows window: clickable long titles must stay in the workspace.
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    time.sleep(0.6)
    d.wait_text("atlas-visual-fixture/project-5",25)
    capture("large-project-820-before-scroll")
    long_work=find_control(LONG_WORK,types={"Button","Hyperlink","Text"})
    bounds=win32gui.GetWindowRect(d.handle)
    assert rectangle_in_workspace(long_work.rectangle(),bounds),"Long work clipped in narrow window"
    capture("long-work-820")
    print("ATLAS06_VISUAL_LONG_TITLES_NARROW_PASS",flush=True)

    # Opening a real work editor does not apply or save the form.
    long_work.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Opening long work editor modified native Store"
    keyboard.send_keys("{ESC}")
    await_no_form()
    assert d.head()==saved
    print("ATLAS06_VISUAL_LONG_WORK_NAVIGATION_PASS",flush=True)

    # Existing stage is navigable from the map, not synthesized by the view.
    stage=find_control(LONG_STAGE,types={"Button","Hyperlink","Text"})
    stage.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved
    keyboard.send_keys("{ESC}")
    await_no_form()
    print("ATLAS06_VISUAL_LONG_STAGE_NAVIGATION_PASS",flush=True)

    # Dependency disclosure must reveal the first three recorded predecessors
    # and the existing graph for further ones. No inferred edges.
    expand=find_control("Предшествующих работ: 5")
    expand.click_input()
    prior=find_control("Работа 0 / 4",types={"Button"})
    prior.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved
    keyboard.send_keys("{ESC}")
    await_no_form()
    assert d.head()==saved
    capture("dependency-navigation-820")
    print("ATLAS06_VISUAL_RECORDED_DEPENDENCY_NAVIGATION_PASS",flush=True)

    win32gui.MoveWindow(d.handle,0,0,1024,710,True)
    time.sleep(0.2)
    assert d.head()==saved
    print("ATLAS06_VISUAL_INSTALLED_NO_UNREQUESTED_WRITE_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify_visual()
    except Exception as exc:
        print("ATLAS06_VISUAL_WINDOWS_HOLD "+repr(exc),flush=True)
        capture("failure")
        raise
    finally:
        d.stop()
