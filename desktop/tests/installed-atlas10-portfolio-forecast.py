"""Installed Atlas 0.10 verifies the same interproject calendar forecast
in Work table and Gantt using its real native file picker and Store.

The archived two-project model comes from the original Atlas IWXA builder, not
a direct Store injection or a test-only implementation. Runs after the native
typed Work acceptance on a clean, isolated Windows CI account.
"""
import hashlib
import importlib.util
import json
import os
import sys
import time
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
module=Path(__file__).with_name("installed-atlas06-visual-scale.py")
spec=importlib.util.spec_from_file_location("atlas10_portfolio_view_driver",module)
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d

ARCHIVE=Path(os.environ["ATLAS10_PORTFOLIO_FORECAST_IWXA"])
WORK_TITLE="Монтаж после поставки"
PROJECT_TITLE="Монтаж конвейера"

def saved_projects(head):
    result=[]
    for descriptor in head["projects"]:
        data=(d.STORE/"blocks"/(descriptor["sha256"]+".json")).read_bytes()
        assert hashlib.sha256(data).hexdigest()==descriptor["sha256"]
        project=json.loads(data.decode("utf-8"))
        assert project["id"]==descriptor["id"]
        result.append(project)
    return result

def fixture():
    with zipfile.ZipFile(ARCHIVE) as z:
        assert json.loads(z.read("manifest.json"))["format"]=="iwxa.package"
        data=json.loads(z.read("content/objects.ndjson"))["data"]["snapshot"]
    assert len(data["projects"])==2 and len(data["portfolioLinks"])==1
    downstream=next(p for p in data["projects"] if p["name"]==PROJECT_TITLE)
    work=next(w for w in downstream["items"] if w["title"]==WORK_TITLE)
    assert downstream["startDate"]=="2026-11-18"
    assert work["estimateDays"]==2 and work["durationUnit"]=="working_days"
    assert work["calendarBasis"]
    return data

def open_target_work():
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику",WORK_TITLE)
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+WORK_TITLE,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)

def check_table_and_gantt():
    open_target_work()
    d.wait_text("Прогноз по связям портфеля: начало 2026-11-20",45)
    d.wait_text("исходное начало проекта 2026-11-18",35)
    d.wait_text("Прогноз по портфелю",35)
    d.wait_text("2026-11-24",35)
    v.capture("atlas10-portfolio-forecast-work-table")
    print("ATLAS10_INSTALLED_PORTFOLIO_WORK_DATES_MATCH_PASS",flush=True)
    d.click_button("График")
    d.wait_text("График работ",35)
    d.wait_text("Прогноз по портфелю: начало 2026-11-20",35)
    d.set_text("Поиск",WORK_TITLE)
    d.wait_text("Расчёт выбранной работы: 2026-11-20 → 2026-11-24",35)
    v.capture("atlas10-portfolio-forecast-gantt")
    print("ATLAS10_INSTALLED_PORTFOLIO_GANTT_MATCH_PASS",flush=True)

def qualify():
    model=fixture()
    before=d.head()
    assert before and len(before["projects"])==1,"Previous 0.10 native Work route did not complete"
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.ARCHIVE=ARCHIVE
    v.open_file_menu()
    d.click_button("Открыть архив .iwxa")
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert d.head()==before,"Portfolio IWXA preview unexpectedly wrote Native Store"
    v.capture("atlas10-portfolio-forecast-import-preview")
    d.click_button("Заменить портфель в черновике")
    assert d.head()==before,"Approving the archive bypassed explicit Save"
    d.click_button("Сохранить")
    saved=v.await_saved(before)
    assert len(saved["projects"])==2,"Imported native portfolio lost a project"
    assert saved["root"]["calendarLibrary"]==model["calendarLibrary"]
    assert saved["root"]["portfolioLinks"]==model["portfolioLinks"]
    actual=saved_projects(saved)
    assert {p["id"]:p for p in actual}=={p["id"]:p for p in model["projects"]}
    print("ATLAS10_INSTALLED_PORTFOLIO_NATIVE_IMPORT_PASS",flush=True)

    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved and saved_projects(saved)==actual
    check_table_and_gantt()
    assert d.head()==saved,"Inspecting the portfolio forecast changed Native Store"
    print("ATLAS10_INSTALLED_PORTFOLIO_FORECAST_READONLY_PASS",flush=True)

    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved and saved_projects(saved)==actual
    check_table_and_gantt()
    assert d.head()==saved
    print("ATLAS10_INSTALLED_PORTFOLIO_FORECAST_COLD_RESTART_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS10_INSTALLED_PORTFOLIO_FORECAST_HOLD "+repr(exc),flush=True)
        v.capture("atlas10-portfolio-forecast-failure")
        raise
    finally:
        d.stop()
