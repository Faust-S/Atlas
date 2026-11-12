"""Installed Atlas 0.7: find distant works by stage and source folder.
Uses real Windows UIA, no hidden API, direct Store mutation, or browser driver.
Runs after installed hidden-source qualification on the same saved portfolio.
"""
import importlib.util
import sys
from pathlib import Path

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
    d.set_text("Найти работу","project-5 directory-23")
    d.wait_text("Показано 45 из 45 работ по фильтру",35)
    v.capture("atlas07-work-table-source-folder-search")
    assert d.head()==before,"Folder search changed native Store"
    work=v.find_control("Открыть работу Работа 5 / 48",types={"Button"})
    work.click_input()
    d.window_title_contains("Форма: Работа: Работа 5 / 48",25)
    assert d.head()==before,"Opening searched work changed native Store"
    v.capture("atlas07-work-table-search-open-work")
    from pywinauto import keyboard
    keyboard.send_keys("{ESC}")
    v.await_no_form()
    assert d.head()==before
    assert d.saved_project(before)==expected
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
