"""Installed Atlas 0.6 visual stress qualification, 100% synthetic input.

A real user-path .iwxa file picker, preview and Save imports the fixture.
Checks the native readback, real WebView2 UIA coordinates, scroll, resizing,
expansion, work/stage/dependency navigation and preservation after restart.
Finally creates and saves a new work in a 1212-work plan through real controls.
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

def saved_head_or_none():
    # Offline visual qualification can begin before live GitHub first-use.
    # Absent native index means nothing has been saved yet.
    return d.head() if (d.STORE/"head.json").exists() else None

def await_saved(baseline):
    end=time.monotonic()+45
    while time.monotonic()<end:
        now=d.head()
        if baseline is None or now["generation"]!=baseline["generation"]:
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
    before=saved_head_or_none()
    assert before is None or len(before["projects"])==1, ("Expected an empty profile or one preceding project")
    d.launch()
    d.wait_text("Портфель проектов",45)
    open_file_menu()
    d.click_button("Открыть архив .iwxa")
    choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert saved_head_or_none()==before,"Opening IWXA preview modified native data"
    capture("import-preview")
    d.click_button("Заменить портфель в черновике")
    assert saved_head_or_none()==before,"Approving IWXA preview bypassed native Save"
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
    find_control("Связи работы Работа 5 / 1080",types={"Button"},scroll=False).click_input()
    d.wait_text("Показать каталог в Atlas",25)
    d.wait_text("Открыть каталог GitHub",25)
    d.wait_text("directory-23",25)
    capture("search-linked-source-1024")
    assert d.head()==saved,"Inspecting source links changed native Store"
    print("ATLAS06_VISUAL_SEARCH_SOURCE_CONTEXT_PASS",flush=True)
    find_control("Показать каталог в Atlas",types={"Button"},scroll=False).click_input()
    d.wait_text("Источники проекта",25)
    d.wait_text("Связь работы с каталогом",25)
    d.wait_text("Каталог указан в сохранённой структуре исходников.",25)
    d.wait_text("directory-23",25)
    close=find_control("Закрыть связь",types={"Button"},scroll=False)
    assert rectangle_in_workspace(close.rectangle(),win32gui.GetWindowRect(d.handle))
    capture("focused-source-folder-1024")
    assert d.head()==saved,"Jump to exact source folder changed native Store"
    print("ATLAS06_VISUAL_EXACT_SOURCE_FOLDER_JUMP_PASS",flush=True)
    work_back=find_control("Открыть связанную работу",types={"Button"},scroll=False)
    assert rectangle_in_workspace(work_back.rectangle(),win32gui.GetWindowRect(d.handle))
    work_back.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Opening linked work from source changed native Store"
    keyboard.send_keys("{ESC}")
    await_no_form()
    d.wait_text("Связь работы с каталогом",25)
    assert d.head()==saved
    print("ATLAS06_VISUAL_SOURCE_TO_WORK_BACKLINK_PASS",flush=True)
    find_control("К схеме",types={"Button"},scroll=False).click_input()
    d.wait_text("Схема проекта: каталоги, работы и этапы",25)
    assert d.head()==saved,"Returning to diagram from source changed native Store"
    d.wait_text("Найдено: 1",25)
    # The button's accessible name is the full work title, even when its
    # displayed text changes to "Скрыть связи". Check the revealed source
    # control to prove that the work's saved context is actually expanded.
    find_control("Связи работы Работа 5 / 1080",types={"Button"},scroll=False)
    find_control("Показать каталог в Atlas",types={"Button"},scroll=False)
    restored=find_control("Открыть работу Работа 5 / 1080",types={"Button"},scroll=False)
    assert rectangle_in_workspace(restored.rectangle(),win32gui.GetWindowRect(d.handle))
    assert d.head()==saved,"Restoring source search changed native Store"
    capture("restored-source-work-search-1024")
    print("ATLAS06_VISUAL_SOURCE_SEARCH_RESTORED_PASS",flush=True)
    print("ATLAS06_VISUAL_SOURCE_TO_DIAGRAM_BACKLINK_PASS",flush=True)
    capture("search-hidden-work-1024")
    assert d.head()==saved,"Returning from source folder changed native Store"
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
    find_control("Найти",types={"Button"}).click_input()
    d.set_text("Найти работу или этап","Проверить")
    d.wait_text("Найдено: 1",25)
    find_control("Связи работы "+LONG_WORK,types={"Button"},scroll=False).click_input()
    d.wait_text("Предшествующих работ: 5",25)
    d.wait_text("Работа 0 / 4",25)
    d.wait_text("Все зависимости на схеме",25)
    capture("search-recorded-dependencies-1024")
    assert d.head()==saved,"Inspecting dependencies changed native Store"
    # From a work with more relations than the short preview, open its exact
    # neighborhood in the existing graph and return to the same search.
    find_control("Все зависимости на схеме",types={"Button"},scroll=False).click_input()
    d.wait_text("Зависимости работ",25)
    d.wait_text("К найденной работе",25)
    d.wait_text("Это окружение выбранной работы",25)
    assert d.head()==saved,"Focused graph navigation changed native Store"
    capture("focused-work-dependency-graph")
    find_control("К найденной работе",types={"Button"}).click_input()
    d.wait_text("Найдено: 1",25)
    d.wait_text("Предшествующих работ: 5",25)
    assert d.head()==saved,"Return from focused graph changed native Store"
    print("ATLAS06_VISUAL_GRAPH_WORK_FOCUS_ROUNDTRIP_PASS",flush=True)
    predecessor=find_control("Открыть предшествующую работу Работа 0 / 4",
                            types={"Button"},scroll=False)
    bounds=win32gui.GetWindowRect(d.handle)
    assert rectangle_in_workspace(predecessor.rectangle(),bounds), "Predecessor is outside Windows viewport"
    predecessor.click_input()
    d.window_title_contains("Форма:",25)
    assert d.head()==saved,"Opening a searched predecessor changed native Store"
    keyboard.send_keys("{ESC}")
    await_no_form()
    assert d.head()==saved
    print("ATLAS06_VISUAL_SEARCH_PREDECESSOR_CLICK_PASS",flush=True)
    print("ATLAS06_VISUAL_SEARCH_DEPENDENCY_CONTEXT_PASS",flush=True)
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

    # New user work is alphabetically beyond the initial 200 rows.
    # The existing ID-based return must expand the real list and focus its row.
    new_title="Якорная работа большого проекта, созданная вручную"
    d.click_button("Таблица")
    d.window_title_contains(PROJECT+" — Таблица",35)
    d.click_button("＋ Работа")
    d.window_title_contains("Форма: Новая работа",25)
    d.set_text("Что нужно сделать?",new_title)
    d.wait_text("Начать после работы",25)
    # Ordinary select: first entry is "Без зависимости", second is the first
    # recorded work. Only this deliberate choice creates a dependency.
    predecessor=d.window().child_window(
        title="Начать после работы",control_type="ComboBox")
    assert predecessor.exists(timeout=10) and predecessor.is_enabled()
    predecessor.click_input()
    keyboard.send_keys("{HOME}{DOWN}{ENTER}")
    assert d.head()==saved,"Choosing a predecessor wrote native storage"
    print("ATLAS06_VISUAL_PREDECESSOR_SELECTED_NATIVE_PASS",flush=True)
    assert d.head()==saved,"Opening the new-work form wrote to native storage"
    # After interacting with the native select, click the actual sticky
    # confirmation button. A keyboard shortcut can be consumed by WebView2
    # select/date controls; this must remain operable through visible UI.
    submit=d.window().child_window(
        title="Применить к черновику",control_type="Button")
    assert submit.exists(timeout=10) and submit.is_enabled()
    rect=submit.rectangle()
    bounds=win32gui.GetWindowRect(d.handle)
    assert rectangle_in_workspace(rect,bounds),(
        "The form confirmation is not physically accessible on Windows")
    submit.click_input()
    await_no_form()
    d.window_title_contains(PROJECT+" — Таблица",25)
    d.wait_text("Работа внесена в черновик.",35)
    d.wait_text("Предшествующих работ: 1",35)
    d.wait_text("Продолжительность плана: было",35)
    print("ATLAS06_VISUAL_PREDECESSOR_EFFECT_VISIBLE_PASS",flush=True)
    deadline=time.monotonic()+45
    visible=False
    while time.monotonic()<deadline:
        try:
            target=d.window().child_window(
                title="Открыть работу "+new_title,control_type="Button")
            if target.exists(timeout=1) and target.is_visible() and (
                    rectangle_in_workspace(target.rectangle(),
                                           win32gui.GetWindowRect(d.handle))):
                visible=True
                break
        except Exception:
            pass
        time.sleep(0.3)
    if not visible:
        capture("new-work-large-focus-missing")
        raise AssertionError("Created work was not physically focused among 1212 items")
    assert d.head()==saved,"Applying the new-work form silently saved native data"
    capture("created-work-large-focused")
    print("ATLAS06_VISUAL_CREATED_WORK_LARGE_FOCUS_PASS",flush=True)

    d.click_button("Сохранить")
    changed=await_saved(saved)
    after=d.saved_project(changed)
    assert len(after["items"])==1213
    added=[item for item in after["items"] if item["title"]==new_title]
    assert len(added)==1,"Created work must be uniquely stored"
    assert added[0]["id"] not in {item["id"] for item in expected["items"]}
    assert len(after["dependencies"])==len(expected["dependencies"])+1
    appended=[edge for edge in after["dependencies"]
              if edge not in expected["dependencies"]]
    assert len(appended)==1
    assert appended[0]=={"from":"visual-work-0-0","to":added[0]["id"]},appended
    for field in ("id","name","type","goal","stages","sources",
                  "targets","findings","changes","decisions","risks"):
        assert after.get(field)==expected.get(field),"New work changed "+field
    print("ATLAS06_VISUAL_PREDECESSOR_SAVED_PASS",flush=True)
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==changed,"Saved work changed after cold restart"
    assert d.saved_project(changed)==after,"Native work readback changed after restart"
    print("ATLAS06_VISUAL_CREATED_WORK_LARGE_SAVE_RESTART_PASS",flush=True)

    # A previously created work can receive another predecessor directly from
    # its own row. The dependent work is fixed by that row, never reselected.
    select_project()
    d.click_button("Таблица")
    d.window_title_contains(PROJECT+" — Таблица",35)
    d.set_text("Найти работу",new_title)
    action=find_control("Добавить предшественника для работы "+new_title,
                        types={"Button"})
    action.click_input()
    d.window_title_contains("Форма: Предшествующая работа для:",25)
    assert d.head()==changed,"Opening dependency editor changed native storage"
    choice=d.window().child_window(
        title="Что должно быть выполнено раньше?",control_type="ComboBox")
    assert choice.exists(timeout=10) and choice.is_enabled()
    # First available work is visual-work-0-1. visual-work-0-0 was
    # already connected during the initial creation and must be excluded.
    submit=find_control("Применить к черновику",types={"Button"})
    submit.click_input()
    await_no_form()
    assert d.head()==changed,"Choosing a predecessor silently saved native storage"
    d.wait_text("Связь внесена в черновик.",35)
    d.wait_text("Расчётные сроки существующих работ не сдвинулись.",35)
    d.wait_text("Продолжительность плана: было",35)
    print("ATLAS06_VISUAL_EXISTING_WORK_DEPENDENCY_EFFECT_PASS",flush=True)
    print("ATLAS06_VISUAL_EXISTING_WORK_PREDECESSOR_FORM_PASS",flush=True)
    d.click_button("Сохранить")
    linked_head=await_saved(changed)
    linked=d.saved_project(linked_head)
    assert len(linked["items"])==1213
    added_links=[edge for edge in linked["dependencies"]
                 if edge not in after["dependencies"]]
    assert added_links==[{"from":"visual-work-0-1","to":added[0]["id"]}],added_links
    assert linked["stages"]==after["stages"] and linked["sources"]==after["sources"]
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==linked_head
    assert d.saved_project(linked_head)==linked
    print("ATLAS06_VISUAL_EXISTING_WORK_PREDECESSOR_RESTART_PASS",flush=True)

    # Changing a real existing dependency must explain the resulting delay
    # and let a user open an affected work directly in its original editor.
    select_project()
    d.click_button("Таблица")
    d.window_title_contains(PROJECT+" — Таблица",35)
    d.set_text("Найти работу","Работа 0 / 2")
    direct=find_control("Добавить предшественника для работы Работа 0 / 2",
                        types={"Button"})
    direct.click_input()
    d.window_title_contains("Форма: Предшествующая работа для:",25)
    confirm=find_control("Применить к черновику",types={"Button"})
    confirm.click_input()
    await_no_form()
    assert d.head()==linked_head,"Dependency was saved without user approval"
    d.wait_text("Изменились расчётные сроки. Затронуто работ: 2.",35)
    d.wait_text("Расчётное окончание: было",35)
    print("ATLAS06_VISUAL_EXISTING_WORK_SHIFT_EXPLAINED_PASS",flush=True)
    edit=find_control("Изменить затронутую работу Работа 0 / 2",
                      types={"Button"},scroll=False)
    assert rectangle_in_workspace(edit.rectangle(),win32gui.GetWindowRect(d.handle)),(
        "The affected-work action should be visible without scrolling")
    capture("schedule-impact-direct-action-visible")
    print("ATLAS06_VISUAL_AFFECTED_WORK_ACTION_VISIBLE_PASS",flush=True)
    edit.click_input()
    d.window_title_contains("Форма: Работа: Работа 0 / 2",25)
    assert d.head()==linked_head,"Opening affected work editor modified storage"
    d.click_button("Закрыть редактор")
    print("ATLAS06_VISUAL_AFFECTED_WORK_DIRECT_EDITOR_PASS",flush=True)
    d.click_button("Сохранить")
    final_head=await_saved(linked_head)
    final=d.saved_project(final_head)
    new_edges=[edge for edge in final["dependencies"]
               if edge not in linked["dependencies"]]
    assert new_edges==[{"from":"visual-work-0-0","to":"visual-work-0-1"}],new_edges
    assert final["items"]==linked["items"] and final["stages"]==linked["stages"]
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==final_head
    assert d.saved_project(final_head)==final
    print("ATLAS06_VISUAL_AFFECTED_WORK_LINK_RESTART_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify_visual()
    except Exception as exc:
        print("ATLAS06_VISUAL_WINDOWS_HOLD "+repr(exc),flush=True)
        capture("failure")
        raise
    finally:
        d.stop()
