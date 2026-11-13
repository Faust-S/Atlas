"""Installed Atlas 0.7: find distant works by stage and source folder.
Uses real Windows UIA, no hidden API, direct Store mutation, or browser driver.
Runs after installed hidden-source qualification on the same saved portfolio.
"""
import importlib.util
import re
import sys
import time
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
    # At 1024 wide the first matching card starts below the controls.
    # Jump to it using the real user-facing shortcut before looking for
    # a physically clickable row. Do not assume the UIA "visible" flag
    # means a work is already within the screen.
    jump=v.find_control("Перейти к первой найденной работе",
                        types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(jump.rectangle(),win32gui.GetWindowRect(d.handle))
    jump.click_input()
    v.capture("atlas07-work-table-first-filtered-row-visible")
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
    # Native keyboard navigation: the exact work is outside the first
    # viewport, but Enter on a unique search must reveal its real row.
    v.select_project()
    v.find_control("Таблица",types={"Button"}).click_input()
    d.set_text("Найти работу","Работа 5 / 1080")
    d.wait_text("Показано 1 из 1 работ по фильтру",25)
    from pywinauto import keyboard
    keyboard.send_keys("{ENTER}")
    exact=v.find_control("Открыть работу Работа 5 / 1080",
                         types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(exact.rectangle(),win32gui.GetWindowRect(d.handle)),(
        "Enter did not focus the single deep work row")
    v.capture("atlas07-single-work-enter-direct-820")
    assert d.head()==before and d.saved_project(before)==expected
    exact.click_input()
    d.window_title_contains("Форма: Работа: Работа 5 / 1080",25)
    assert d.head()==before,"Opening work through Enter changed native Store"
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    print("ATLAS07_WORK_TABLE_ENTER_JUMP_PASS",flush=True)
    # Independently exercise the canonical critical-path projection through
    # physical Windows buttons rather than a test-only backend or DOM driver.
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    v.select_project()
    v.find_control("Таблица",types={"Button"}).click_input()
    d.wait_text("Работы проекта",35)
    # The compact WebView2 table paints asynchronously after switching
    # tabs. Observe an actual enabled Windows Button rather than taking
    # one immediate, occasionally stale snapshot of all UIA text names.
    # Chromium may expose its visible caption or the richer aria-label.
    critical_options=[]
    until=time.monotonic()+35
    while time.monotonic()<until:
        critical_options=[]
        for control in d.window().descendants(control_type="Button"):
            label=str(control.window_text() or "").strip()
            match=re.fullmatch(
                r"(?:Показать работы на критическом пути|Критический путь):\s*(\d+)",
                label)
            if match and control.is_visible() and control.is_enabled():
                critical_options.append((control,int(match.group(1)),label))
        if critical_options:
            break
        time.sleep(0.25)
    observed_counts={count for _,count,_ in critical_options}
    if len(observed_counts)!=1:
        observed_names=[label for label in d.visible_texts()
                        if "критич" in label.lower() or "путь" in label.lower()]
        print("ATLAS07_CRITICAL_UIA_DIAGNOSTIC "+repr(observed_names[:20]),flush=True)
        v.capture("atlas07-critical-filter-accessibility-mismatch")
        raise AssertionError(("Critical-path action/count not available",
                              observed_counts))
    critical_count=observed_counts.pop()
    assert 0<critical_count<=len(expected["items"]),critical_count
    control_name=next(label for _,count,label in critical_options
                      if count==critical_count)
    show_critical=v.find_control(control_name,types={"Button"},scroll=True)
    assert v.rectangle_in_workspace(show_critical.rectangle(),win32gui.GetWindowRect(d.handle))
    print("ATLAS07_CRITICAL_FILTER_UIA_COUNT "+str(critical_count),flush=True)
    show_critical.click_input()
    d.wait_text(f"Показано {min(200,critical_count)} из {critical_count} работ по фильтру",30)
    critical_work=v.find_control("Открыть работу Работа 0 / 1",
                                 types={"Button"},scroll=True)
    assert v.rectangle_in_workspace(critical_work.rectangle(),win32gui.GetWindowRect(d.handle))
    v.capture("atlas07-critical-work-filter-820")
    critical_work.click_input()
    d.window_title_contains("Форма: Работа: Работа 0 / 1",25)
    assert d.head()==before,"Opening a critical-path work silently saved data"
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    reset_critical=v.find_control("Снять отбор критических работ",
                                  types={"Button"},scroll=True)
    reset_critical.click_input()
    d.wait_text("Показано 200 из 1213 работ по фильтру",25)
    assert d.head()==before and d.saved_project(before)==expected
    win32gui.MoveWindow(d.handle,0,0,1024,710,True)
    print("ATLAS07_WORK_TABLE_CRITICAL_PATH_FILTER_PASS",flush=True)
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
