"""Atlas 0.7 Windows: portfolio search by a work, stage and source in one saved project.
Uses ordinary UIA controls and compares the native Store before/after;
no browser automation, Store mutation or test-only application endpoints.
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
SEARCH="Найти проект по работе, этапу или источнику"

def qualify():
    before=d.head()
    expected=d.saved_project(before)
    assert len(expected["items"])==1213
    d.launch()
    d.wait_text("Портфель проектов",45)
    # Search is always in the command bar, independent of the selected tab.
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text(SEARCH,"Работа 5 / 1080")
    d.wait_text("Найдено проектов: 1",35)
    assert d.head()==before and d.saved_project(before)==expected
    d.set_text(SEARCH,"Этап работ 48")
    d.wait_text("Найдено проектов: 1",35)
    d.set_text(SEARCH,"project-5 directory-23")
    d.wait_text("Найдено проектов: 1",35)
    v.capture("atlas07-portfolio-search-source")
    d.set_text(SEARCH,"такого проекта нет")
    d.wait_text("Найдено проектов: 0",35)
    assert d.head()==before,"Portfolio search wrote to native Store"
    d.set_text(SEARCH,"")
    d.wait_text("В списке проектов: 1",35)
    v.select_project()
    d.window_title_contains("Контрольный большой проект",25)
    assert d.head()==before and d.saved_project(before)==expected
    print("ATLAS07_INSTALLED_PORTFOLIO_CONTENT_SEARCH_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_INSTALLED_PORTFOLIO_CONTENT_SEARCH_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-portfolio-content-search-failure")
        raise
    finally:
        d.stop()
