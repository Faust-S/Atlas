"""Installed Atlas 0.7: find distant works by stage and source folder.
Uses real Windows UIA, no hidden API, direct Store mutation, or browser driver.
Runs after installed hidden-source qualification on the same saved portfolio.
"""
import importlib.util
import sys
from pathlib import Path
import win32gui

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
spec=importlib.util.spec_from_file_location(
    "atlas07_visual_driver",Path(__file__).with_name("installed-atlas06-visual-scale.py"))
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d

def qualify():
    before=d.head()
    expected=d.saved_project(before)
    assert len(expected["items"])==1213
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.select_project()
    v.find_control("Таблица",types={"Button"}).click_input()
    d.wait_text("Работы проекта",35)
    d.set_text("Найти работу","Этап работ 48")
    d.wait_text("Показано 22 из 22 работ по фильтру",35)
    assert d.head()==before,"Stage search changed native Store"
    # A preceding accepted scenario moved one work from directory-23
    # to directory-01. Count the actual saved source/path bindings
    # instead of relying on a stale count from the original fixture.
    matches=[w for w in expected["items"]
             if w.get("sourceId")=="visual-source-5"
             and w.get("sourcePath")=="directory-23"]
    assert len(matches)==44,"Prior native catalog transfer was not preserved"
    d.set_text("Найти работу","project-5 directory-23")
    d.wait_text(f"Показано {len(matches)} из {len(matches)} работ по фильтру",35)
    d.wait_text("Быстрые действия с фильтрами работ",20)
    v.capture("atlas07-work-table-source-folder-search")
    assert d.head()==before,"Folder search changed native Store"
    # The 44 rows are sorted by title and can retain a deep scroll position
    # from previous real GUI scenarios. Open a *physically visible* matching
    # work, rather than assuming a particular title is on screen.
    expected_titles={w["title"] for w in matches}
    bounds=win32gui.GetWindowRect(d.handle)
    visible=[]
    for control in d.window().descendants(control_type="Button"):
        name=str(control.window_text() or "")
        if not name.startswith("Открыть работу "):
            continue
        title=name[len("Открыть работу "):]
        if (title in expected_titles and control.is_visible() and
            control.is_enabled() and
            v.rectangle_in_workspace(control.rectangle(),bounds)):
            visible.append((control,title))
    assert visible,"No matching work can be opened from the filtered viewport"
    work,title=min(visible,key=lambda pair:pair[0].rectangle().top)
    print("ATLAS07_WORK_TABLE_VISIBLE_WORK "+title,flush=True)
    work.click_input()
    d.window_title_contains("Форма: Работа: "+title,25)
    assert d.head()==before,"Opening searched work changed native Store"
    v.capture("atlas07-work-table-search-open-work")
    from pywinauto import keyboard
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    assert d.head()==before
    assert d.saved_project(before)==expected
    # Work view returns to the selected row, so the shortcut must remain
    # visible while the earlier filter controls are far above the viewport.
    d.wait_text("Быстрые действия с фильтрами работ",20)
    # A long-lived work table can accumulate filters. One explicit click
    # restores all work rows, even when a deadline-only filter was active.
    reset=v.find_control("Сбросить фильтры работ",types={"Button"},scroll=False)
    reset.click_input()
    d.wait_text("Показано 200 из 1213 работ по фильтру",35)
    assert d.head()==before and d.saved_project(before)==expected
    print("ATLAS07_INSTALLED_WORK_TABLE_FILTER_RESET_PASS",flush=True)
    print("ATLAS07_INSTALLED_WORK_TABLE_CONTEXT_SEARCH_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_INSTALLED_WORK_TABLE_CONTEXT_SEARCH_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-work-table-context-search-failure")
        raise
    finally:
        d.stop()
