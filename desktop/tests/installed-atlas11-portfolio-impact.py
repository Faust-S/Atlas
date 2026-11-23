"""Atlas 0.11: installed Windows cross-project Work correction route.

Uses the original .iwxa two-project calendar fixture, original Setup Core,
real WebView2 accessibility controls and the same native Store. No browser
automation, test-only IPC or replacement planning engine.
"""
import importlib.util
import json
import os
import sys
import zipfile
from pathlib import Path

import win32gui

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
driver=Path(__file__).with_name("installed-atlas11-v6-design.py")
spec=importlib.util.spec_from_file_location("atlas11_native_installed_driver",driver)
native=importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
v=native.v
d=native.d
ARCHIVE=Path(os.environ["ATLAS11_PORTFOLIO_IMPACT_IWXA"])
UPSTREAM="Комплектующие конвейера"
DOWNSTREAM="Монтаж конвейера"
SOURCE_WORK="Двухдневная поставка"
TARGET_WORK="Монтаж после поставки"

def read_fixture():
    assert ARCHIVE.is_file() and ARCHIVE.suffix.lower()==".iwxa"
    with zipfile.ZipFile(ARCHIVE) as z:
        assert json.loads(z.read("manifest.json"))["format"]=="iwxa.package"
        snapshot=json.loads(z.read("content/objects.ndjson"))["data"]["snapshot"]
    assert len(snapshot["projects"])==2 and len(snapshot["portfolioLinks"])==1
    source=next(p for p in snapshot["projects"] if p["name"]==UPSTREAM)
    target=next(p for p in snapshot["projects"] if p["name"]==DOWNSTREAM)
    assert source["items"][0]["title"]==SOURCE_WORK
    work=next(w for w in target["items"] if w["title"]==TARGET_WORK)
    assert work["durationUnit"]=="working_days"
    return snapshot

def qualify():
    fixture=read_fixture()
    previous=v.saved_head_or_none()
    assert previous and len(previous["projects"])==1
    v.ARCHIVE=ARCHIVE
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text("Настроить дашборд",45)

    # Ordinary native file-picker import, explicit approval, then Save.
    native.click_named("Портфель","Button")
    native.click_named("Файл","Button")
    d.wait_text("Открыть архив .iwxa",25)
    native.click_named("Открыть архив .iwxa","Button")
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",35)
    assert d.head()==previous,"Preview saved the two-project archive before approval"
    native.click_named("Заменить портфель в черновике","Button")
    assert d.head()==previous,"Import approval bypassed explicit Save"
    native.click_named("Сохранить","Button")
    saved=v.await_saved(previous)
    assert len(saved["projects"])==2
    assert saved["root"]["portfolioLinks"]==fixture["portfolioLinks"]
    assert saved["root"]["calendarLibrary"]==fixture["calendarLibrary"]
    print("ATLAS11_NATIVE_PORTFOLIO_IMPACT_IWXA_IMPORT_PASS",flush=True)

    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text("Настроить дашборд",45)
    assert d.head()==saved,"Two-project state lost on cold restart"
    native.click_named("Портфель","Button")
    native.click_named("Показать или скрыть левую панель","Button")
    d.set_text("Найти проект по работе, этапу или источнику",SOURCE_WORK)
    d.wait_text("Найдено проектов: 1",35)
    native.click_named("Открыть найденный проект "+UPSTREAM,"Button")
    d.wait_text("Схема проекта: работы и этапы",35)
    native.click_named("Показать или скрыть левую панель","Button")
    native.click_named("График работ","Button")
    d.wait_text("График работ",35)
    native.click_named("Открыть работу "+SOURCE_WORK,"Button")
    d.wait_text("Изменить работу",25)

    # A real owner changes the upstream Work. The original calendar model
    # recomputes the downstream Friday-to-Saturday start and Tuesday-to-
    # Wednesday finish. No project dates are edited directly.
    native.click_named("Изменить работу","Button")
    d.wait_text("Изменение данных",25)
    v.set_editor_text("Плановая длительность, дней","3")
    d.wait_text("Связанные проекты до применения правки",35)
    d.wait_text("Зависимых проектов: 1. Изменится прогноз у 1",35)
    d.wait_text("2026-11-24",35)
    d.wait_text("2026-11-25",35)
    assert d.head()==saved,"Pre-apply portfolio preview unexpectedly wrote Native Store"
    v.capture("atlas11-portfolio-impact-before-apply-820")
    print("ATLAS11_NATIVE_PREAPPLY_PORTFOLIO_PREVIEW_PASS",flush=True)
    v.find_control("Применить к черновику",types={"Button"}).click_input()
    d.wait_text("Последствия корректировки",35)
    d.wait_text("Влияние на связанные проекты",35)
    d.wait_text("Зависимых проектов: 1",35)
    d.wait_text("Изменился прогноз у 1",35)
    d.wait_text("2026-11-24",35)
    d.wait_text("2026-11-25",35)
    assert d.head()==saved,"Cross-project Work correction wrote to Store without Save"
    v.capture("atlas11-portfolio-impact-inspector-820")
    print("ATLAS11_NATIVE_PORTFOLIO_IMPACT_INSPECTOR_PASS",flush=True)

    # Open the specific downstream project through the inspector. The
    # calculated dates are available in its ORIGINAL Gantt and Work table.
    native.click_named("Открыть зависимый проект "+DOWNSTREAM,"Button")
    d.wait_text("График работ",35)
    d.wait_text("Монтаж после поставки",35)
    assert d.head()==saved,"Cross-project navigation wrote to Native Store"
    v.capture("atlas11-portfolio-impact-linked-project-820")
    print("ATLAS11_NATIVE_PORTFOLIO_IMPACT_PROJECT_JUMP_PASS",flush=True)

    # The source Work remains one action away, including its original
    # calendar comparison and dock selection. Do not rely on browser Back.
    native.click_named("\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a \u0438\u0441\u0445\u043e\u0434\u043d\u043e\u0439 \u0440\u0430\u0431\u043e\u0442\u0435 "+SOURCE_WORK,"Button")
    d.wait_text("\u041f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u044f \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u0438\u0440\u043e\u0432\u043a\u0438",35)
    d.wait_text("\u0412\u043b\u0438\u044f\u043d\u0438\u0435 \u043d\u0430 \u0441\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u044b",35)
    assert d.head()==saved,"Returning to the source Work wrote Native Store"
    v.capture("atlas11-portfolio-impact-return-to-source-820")
    print("ATLAS11_NATIVE_PORTFOLIO_SOURCE_WORK_RETURN_PASS",flush=True)

    # Extend the same user journey with one actual edit in the downstream
    # project, then return to the source and verify cumulative forecast.
    native.click_named("\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442 "+DOWNSTREAM,"Button")
    # In the 820px window, bring the first Gantt row above the lower edge.
    # Choose its full-size text control rather than the narrow calendar bar.
    v.mouse.scroll(coords=(260,520),wheel_dist=-4)
    native.click_named("\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0440\u0430\u0431\u043e\u0442\u0443 "+TARGET_WORK,"Button")
    d.wait_text("\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0430\u0431\u043e\u0442\u0443",25)
    native.click_named("\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0430\u0431\u043e\u0442\u0443","Button")
    d.wait_text("Изменение данных",25)
    v.set_editor_text("\u041f\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c, \u0434\u043d\u0435\u0439","3")
    v.find_control("\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u043a \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0443",types={"Button"}).click_input()
    d.wait_text("\u041f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u044f \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u0438\u0440\u043e\u0432\u043a\u0438",35)
    assert d.head()==saved,"Downstream Work edit wrote Native Store without Save"
    native.click_named("\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a \u0438\u0441\u0445\u043e\u0434\u043d\u043e\u0439 \u0440\u0430\u0431\u043e\u0442\u0435 "+SOURCE_WORK,"Button")
    d.wait_text("\u041f\u0440\u0430\u0432\u043e\u043a \u0432 \u0441\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0445 \u043f\u0440\u043e\u0435\u043a\u0442\u0430\u0445: 1",35)
    assert d.head()==saved,"Cumulative return wrote Native Store"
    v.capture("atlas11-portfolio-impact-cumulative-return-820")
    print("ATLAS11_NATIVE_PORTFOLIO_CUMULATIVE_RETURN_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as error:
        print("ATLAS11_PORTFOLIO_IMPACT_NATIVE_HOLD "+repr(error),flush=True)
        try:v.capture("atlas11-portfolio-impact-failure")
        except Exception:pass
        raise
    finally:
        d.stop()
