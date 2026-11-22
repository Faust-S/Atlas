"""Atlas 0.10 calendar hypothesis: real Windows WebView2 / installed Setup Core.

Runs the accepted Atlas 0.9 user route on the same installed application first,
then opens the new working-week comparison through visible UIA controls.
This is an isolated prototype qualified against 0.9.0-dev.1 packaging;
it is NOT an Atlas 0.10 installer or signed multi-product acceptance.
"""
import importlib.util
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
spec=importlib.util.spec_from_file_location(
    "atlas09_installed_base",Path(__file__).with_name("installed-atlas09-qualification.py"))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def qualify():
    base.qualify()
    route=base.route
    d=route.d
    v=route.v

    # The original large project and saved revisions survived two cold opens.
    original_head=d.head()
    original_project=d.saved_project(original_head)
    d.wait_text("Портфель проектов",35)
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику","1080 работа 5")
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+route.FIRST_TITLE,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)
    d.click_button("График")
    d.wait_text("График работ",35)

    # No hidden IPC, DOM snapshots or model substitution: actual UIA.
    v.find_control("Сценарий: рабочая неделя",
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Календарный план:",35)
    d.wait_text("Первый рабочий день: 2026-11-10",35)
    d.wait_text("Исключить даты",35)
    assert d.head()==original_head,"Opening a hypothetical calendar wrote native Store"
    assert d.saved_project(original_head)==original_project
    v.capture("atlas10-working-week-preview-installed")

    # Explicitly exclude the known project start date (10 Nov 2026, Tuesday).
    # The hypothetical start must advance to Wednesday without editing Atlas.
    d.set_text("Дополнительные нерабочие дни через запятую","2026-11-10")
    # One atomic result line avoids relying on WebView2 combining adjacent
    # text nodes into a single accessibility name.
    try:
        d.wait_text("Первый рабочий день: 2026-11-11",35)
    except AssertionError:
        observed=[s for s in d.visible_texts()
                  if any(t in s for t in ("рабочий день","Рабочая неделя",
                      "Ошибка календаря","Календарный план","Разница:","Затронуто"))]
        print("ATLAS10_WORKING_CALENDAR_OBSERVED_UIA "+
              repr(observed[:25]),flush=True)
        v.capture("atlas10-calendar-observed-after-input")
        raise
    assert d.head()==original_head,"Changing a calendar hypothesis wrote native Store"
    assert d.saved_project(original_head)==original_project
    v.capture("atlas10-working-week-holiday-exception-installed")

    # Switch one displayed work from hypothetical staffed days to continuous
    # elapsed days. Pick an actual visible row via Windows UIA, not a test ID
    # or hidden browser DOM. Confirm both mode changes and no native writes.
    controls=[str(button.window_text() or "")
              for button in d.window().descendants(control_type="Button")]
    choices=[name for name in controls if name.startswith("Операция ") and
             ": по рабочим дням. Переключить длительность" in name]
    assert choices,"Native calendar scenario did not expose per-work duration modes"
    original_mode_label=choices[0]
    v.find_control(original_mode_label,types={"Button"},scroll=True).click_input()
    continuous_label=original_mode_label.replace(
        ": по рабочим дням. Переключить длительность",
        ": без выходных. Переключить длительность")
    d.wait_text("Непрерывных операций: 1",35)
    v.find_control(continuous_label,types={"Button"},scroll=True)
    assert d.head()==original_head and d.saved_project(original_head)==original_project,(
        "Selecting a continuous operation changed the native Atlas Store")
    v.capture("atlas10-mixed-calendar-continuous-work-installed")
    v.find_control(continuous_label,types={"Button"},scroll=True).click_input()
    d.wait_text("Непрерывных операций: 0",35)
    print("ATLAS10_NATIVE_CONTINUOUS_WORK_TOGGLE_PASS",flush=True)

    # Reproduce the compact laptop layout: the old top toggle could be
    # scrolled behind the sticky tabs after the user edited a holiday.
    import win32gui
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    close=v.find_control("Закрыть календарный сценарий",
                         types={"Button"},scroll=True)
    bounds=win32gui.GetWindowRect(d.handle)
    assert v.rectangle_in_workspace(close.rectangle(),bounds),(
        "Calendar scenario close must be physically reachable at 820x650")
    v.capture("atlas10-calendar-close-accessible-820")
    close.click_input()
    d.wait_text("Сценарий: рабочая неделя",20)
    assert not any("Закрыть календарный сценарий" == label for label in d.visible_texts()),(
        "Closing the calendar scenario did not remove its own controls")
    assert d.head()==original_head and d.saved_project(original_head)==original_project
    print("ATLAS10_INSTALLED_CALENDAR_CLOSE_820_PASS",flush=True)
    print("ATLAS10_INSTALLED_WORKING_WEEK_SCENARIO_NO_NATIVE_WRITE_PASS",flush=True)


if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS10_INSTALLED_CALENDAR_SCENARIO_HOLD "+repr(exc),flush=True)
        base.route.v.capture("atlas10-calendar-native-failure")
        raise
    finally:
        base.route.d.stop()
