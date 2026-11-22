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

    # Explicitly save a named calendar scenario through the ordinary native
    # Save and verify its physical cold readback. No test-only persistence.
    import time
    d.click_button("Сценарий: рабочая неделя")
    d.wait_text("Календарный план:",35)
    buttons=[str(item.window_text() or "")
             for item in d.window().descendants(control_type="Button")]
    choices=[name for name in buttons if name.startswith("Операция ") and
             ": по рабочим дням. Переключить длительность" in name]
    assert choices,"Cannot select a real work for the named calendar variant"
    mode_control=v.find_control(choices[0],types={"Button"},scroll=True)
    import win32gui
    rectangle=mode_control.rectangle()
    bounds=win32gui.GetWindowRect(d.handle)
    print("ATLAS10_NAMED_MODE_TARGET_UIA_RECT "+
          repr((rectangle.left,rectangle.top,rectangle.right,rectangle.bottom))+
          " WINDOW "+repr(bounds),flush=True)
    assert v.rectangle_in_workspace(rectangle,bounds),(
        "Mode control is not physically reachable inside the compact workspace")
    assert rectangle.right-rectangle.left>=100,(
        "Mode control clipped by the calendar grid at 820px")
    v.capture("atlas10-named-calendar-mode-before-toggle-820")
    mode_control.click_input()
    d.wait_text("Непрерывных операций: 1",35)
    v.find_control("Сохранённые календарные варианты (0)",scroll=True).click_input()
    # The name field is inside an expanded details element. On a compact
    # laptop the user must scroll to it; unlike set_text() this driver
    # requires a physically reachable edit control before typing.
    name_input=v.find_control("Название календарного варианта",
                              types={"Edit"},scroll=True)
    rect=name_input.rectangle()
    assert v.rectangle_in_workspace(rect,win32gui.GetWindowRect(d.handle)),(
        "Named calendar input is physically unreachable in compact Windows")
    name_input.click_input()
    d.keyboard.send_keys("^a")
    d.keyboard.send_keys("Atlas Calendar 2026",with_spaces=True)
    v.capture("atlas10-named-calendar-edit-field-820")
    v.find_control("Сохранить вариант в проект",types={"Button"},scroll=True).click_input()
    d.wait_text("Вариант добавлен в черновик проекта",30)
    assert d.head()==original_head and d.saved_project(original_head)==original_project,(
        "Editing named calendar draft bypassed native Save")
    v.capture("atlas10-named-calendar-draft-before-native-save")
    d.activate()
    d.keyboard.send_keys("^s")
    expires=time.monotonic()+50
    new_head=original_head
    while time.monotonic()<expires:
        current=d.head()
        if current!=original_head:
            new_head=current
            break
        time.sleep(0.3)
    assert new_head!=original_head,"Named calendar variant did not reach native Save"
    stored=d.saved_project(new_head)
    drafts=stored.get("calendarDrafts",[])
    assert len(drafts)==1,"Native Store did not preserve named calendar variant"
    variant=drafts[0]
    assert variant["name"]=="Atlas Calendar 2026" and variant["version"]==1
    assert variant["weekdays"]==[1,2,3,4,5]
    assert variant["excludedDates"]==["2026-11-10"]
    assert list(variant["modeByWork"].values())==["elapsed_days"]
    assert stored["items"]==original_project["items"],(
        "Saving a planning scenario modified work objects")
    assert stored["dependencies"]==original_project["dependencies"]
    assert stored["stages"]==original_project["stages"]
    v.capture("atlas10-named-calendar-native-saved")
    print("ATLAS10_NATIVE_NAMED_CALENDAR_SAVE_READBACK_PASS",flush=True)

    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==new_head,"Cold open changed the stored calendar revision"
    assert d.saved_project(new_head)==stored,"Cold open lost the named calendar"
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику","1080 работа 5")
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+route.FIRST_TITLE,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)
    d.click_button("График")
    d.wait_text("График работ",35)
    v.find_control("Сценарий: рабочая неделя",types={"Button"},scroll=True).click_input()
    d.wait_text("Календарный план:",35)
    v.find_control("Сохранённые календарные варианты (1)",scroll=True).click_input()
    picker=v.find_control("Сохранённый календарный вариант",
                          types={"ComboBox"},scroll=True)
    picker.click_input()
    d.keyboard.send_keys("{DOWN}{ENTER}")
    v.find_control("Загрузить вариант",types={"Button"},scroll=True).click_input()
    d.wait_text("Загружен вариант, версия 1",35)
    d.wait_text("Непрерывных операций: 1",35)
    assert d.head()==new_head and d.saved_project(new_head)==stored,(
        "Reloading the named variant wrote to native Store")
    v.capture("atlas10-named-calendar-cold-reload-installed")
    print("ATLAS10_NATIVE_NAMED_CALENDAR_COLD_LOAD_PASS",flush=True)

    # Shared portfolio calendar is separate from the project scenario, but is
    # written through the same original native Atlas Store and head CAS.
    catalog_before=d.head()
    existing_project=d.saved_project(catalog_before)
    v.find_control("Календари портфеля (0)",scroll=True).click_input()
    library_input=v.find_control("Название календаря портфеля",
                                  types={"Edit"},scroll=True)
    import win32gui
    assert v.rectangle_in_workspace(library_input.rectangle(),
         win32gui.GetWindowRect(d.handle)),(
        "Portfolio calendar editor must be reachable at native 820x650")
    library_input.click_input()
    d.keyboard.send_keys("^a")
    d.keyboard.send_keys("Atlas Org Test Calendar",with_spaces=True)
    v.find_control("Добавить календарь в портфель",
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Редакция 1 добавлена в черновик портфеля",35)
    assert d.head()==catalog_before and d.saved_project(catalog_before)==existing_project,(
        "Draft calendar library write bypassed the original native Save")
    v.capture("atlas10-portfolio-calendar-draft-before-save")

    d.activate()
    d.keyboard.send_keys("^s")
    expires=time.monotonic()+50
    saved_head=catalog_before
    while time.monotonic()<expires:
        updated=d.head()
        if updated!=catalog_before:
            saved_head=updated
            break
        time.sleep(0.3)
    assert saved_head!=catalog_before,"Local portfolio calendar never reached native Store"
    assert d.saved_project(saved_head)==existing_project,(
        "Saving a shared calendar changed the native project block")
    library=saved_head["root"].get("calendarLibrary",[])
    assert len(library)==1,"The original Rust native root lost shared calendar records"
    definition=library[0]
    assert definition["name"]=="Atlas Org Test Calendar"
    assert definition["version"]==1
    assert definition["source"]=={"kind":"entered_by_user","reference":None}
    assert definition["weekdays"]==[1,2,3,4,5]
    assert definition["excludedDates"]==["2026-11-10"]
    print("ATLAS10_NATIVE_PORTFOLIO_CALENDAR_SAVE_READBACK_PASS",flush=True)
    v.capture("atlas10-portfolio-calendar-native-saved")

    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved_head,"Cold restart lost saved portfolio calendar library"
    assert d.saved_project(saved_head)==existing_project
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику","1080 работа 5")
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+route.FIRST_TITLE,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)
    d.click_button("График")
    d.wait_text("График работ",35)
    v.find_control("Сценарий: рабочая неделя",types={"Button"},scroll=True).click_input()
    d.wait_text("Календарный план:",35)
    v.find_control("Календари портфеля (1)",scroll=True).click_input()
    calendar_picker=v.find_control("Редакция календаря портфеля",
                                  types={"ComboBox"},scroll=True)
    calendar_picker.click_input()
    d.keyboard.send_keys("{DOWN}{ENTER}")
    v.find_control("Применить редакцию в сценарии",
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Применена редакция 1 к сценарию",35)
    assert d.head()==saved_head and d.saved_project(saved_head)==existing_project,(
        "Loading source calendar silently modified the native Store")
    v.capture("atlas10-portfolio-calendar-cold-reload-installed")
    print("ATLAS10_NATIVE_PORTFOLIO_CALENDAR_COLD_LOAD_PASS",flush=True)



if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS10_INSTALLED_CALENDAR_SCENARIO_HOLD "+repr(exc),flush=True)
        base.route.v.capture("atlas10-calendar-native-failure")
        raise
    finally:
        base.route.d.stop()
