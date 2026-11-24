"""Atlas 0.11 installed IWXA v6 interface qualification (real Windows UIA).

Uses original Setup Core, installed Tauri + WebView2 and Native Store. No
Playwright, DOM automation, test-only IPC, alternate Store or browser mock.
The 1212-Work .iwxa fixture is imported through the ordinary file picker.
"""
import importlib.util
import sys
import time
from pathlib import Path

import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
path=Path(__file__).with_name("installed-atlas06-visual-scale.py")
spec=importlib.util.spec_from_file_location("atlas11_installed_visual",path)
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d

def visible_named(name,role=None):
    until=time.monotonic()+25
    while time.monotonic()<until:
        try:
            controls=d.window().descendants(control_type=role) if role else d.window().descendants()
            found=[e for e in controls if str(e.window_text() or "")==name and e.is_visible()]
            if found:return found
        except KeyError:
            pass
        time.sleep(.25)
    raise AssertionError("No native UIA control: "+name)

def click_named(name,role=None):
    bounds=win32gui.GetWindowRect(d.handle)
    controls=visible_named(name,role)
    physical=[e for e in controls if e.is_enabled() and
              e.rectangle().left>=bounds[0]+4 and
              e.rectangle().right<=bounds[2]-4 and
              e.rectangle().top>=bounds[1]+4 and
              e.rectangle().bottom<=bounds[3]-4]
    if len(physical)!=1:
        v.capture("atlas11-ui-control-"+name[:24].replace(" ","-"))
        raise AssertionError("Native control ambiguous or outside window: "+name+
                             " / "+repr([(e.element_info.control_type,str(e.rectangle())) for e in controls[:8]]))
    d.activate()
    physical[0].click_input()
    time.sleep(.35)

def qualify():
    original=v.imported_snapshot()
    assert v.saved_head_or_none() is None,"Expected a clean Windows qualification profile"
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text("Настроить дашборд",45)
    d.wait_text("Главная",45)
    click_named("Настроить дашборд","Button")
    d.wait_text("Блоки главной",25)
    d.wait_text("Рабочие календари",25)
    # Move the first actual dashboard widget through its accessibility control.
    # The order is user preference, not a project/Work revision.
    click_named("Переместить блок вниз: Состояние портфеля","Button")
    # Preferences must not cause a Native Store generation.
    assert v.saved_head_or_none() is None
    click_named("Готово","Button")
    v.capture("atlas11-v6-dashboard-installed-820")
    print("ATLAS11_NATIVE_DASHBOARD_COMPACT_PASS",flush=True)

    # Atlas v6 retains the direct original navigation to Store and exchange.
    click_named("Хранилище и обмен","Button")
    d.wait_text("Данные и восстановление",25)
    d.wait_text("Native Store",25)
    assert v.saved_head_or_none() is None
    v.capture("atlas11-v6-store-route-installed-820")
    print("ATLAS11_NATIVE_STORE_RAIL_PASS",flush=True)

    # New native sidebar works without old breadcrumbs.
    click_named("Портфель","Button")
    d.wait_text("Портфель проектов",35)
    click_named("Показать или скрыть левую панель","Button")
    d.wait_text("Создать проект",20)
    click_named("Настройки Atlas","Button")
    d.wait_text("Настройки",20)
    click_named("О приложении","Button")
    d.wait_text("Установленная версия",20)
    d.wait_text("0.12.0-dev.1",20) # Settings show the exact packaged development version.
    click_named("Вернуться","Button")
    print("ATLAS11_NATIVE_MENU_PROFILE_VERSION_PASS",flush=True)

    # Import through existing original native file path, not a demo array.
    click_named("Портфель","Button")
    click_named("Файл","Button")
    d.wait_text("Открыть архив .iwxa",20)
    # The new File menu and the existing first-start page both advertise
    # "Открыть архив .iwxa". Close the menu and select the visible first-use
    # action unambiguously instead of treating duplicate accessibility names
    # as an application failure.
    click_named("Файл","Button")
    click_named("Открыть архив .iwxa","Button")
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",35)
    assert v.saved_head_or_none() is None,"Import preview changed disk before approval"
    click_named("Заменить портфель в черновике","Button")
    assert v.saved_head_or_none() is None,"Import approval bypassed native Save"
    save_buttons=visible_named("Сохранить","Button")
    screen=win32gui.GetWindowRect(d.handle)
    assert len(save_buttons)==1 and save_buttons[0].rectangle().top<=screen[1]+85,(
        "Standalone Save must be in the titlebar, not on a duplicate command row")
    click_named("Сохранить","Button")
    saved=v.await_saved(None)
    assert d.saved_project(saved)==original,"Native import changed 1212-Work fixture"
    print("ATLAS11_NATIVE_IWXA_IMPORT_SAVE_PASS",flush=True)
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text("Настроить дашборд",45)
    # The second widget must still lead after a genuine process restart.
    schedule_titles=visible_named("Ближайшие сроки","Text")
    metric_titles=visible_named("Состояние портфеля","Text")
    assert schedule_titles and metric_titles and (
        schedule_titles[0].rectangle().top<metric_titles[0].rectangle().top),(
        "Native dashboard widget order was lost across a cold restart")
    assert d.head()==saved
    assert d.saved_project(saved)==original
    print("ATLAS11_NATIVE_DASHBOARD_LAYOUT_COLD_RESTORE_PASS",flush=True)
    print("ATLAS11_NATIVE_COLD_RESTORE_PASS",flush=True)

    # From the populated home, the global Resources rail must reach its
    # real, initially offscreen portfolio section, not merely portfolio top.
    click_named("Ресурсы","Button")
    d.wait_text("Плановые ресурсы",35)
    screen=win32gui.GetWindowRect(d.handle)
    headings=visible_named("Плановые ресурсы","Text")
    assert any(screen[1]+55<item.rectangle().top<screen[3]-65 for item in headings),(
        "Resources rail did not bring the portfolio's resource manager into the viewport")
    assert d.head()==saved,"Resources navigation changed the native Store"
    v.capture("atlas11-v6-portfolio-resources-direct-820")
    print("ATLAS11_NATIVE_DASHBOARD_RESOURCE_DIRECT_ROUTE_PASS",flush=True)
    click_named("Главная","Button")
    d.wait_text("Настроить дашборд",25)

    # Reach a concrete project and the original canonical Gantt.
    click_named("Портфель","Button")
    click_named("Показать или скрыть левую панель","Button")
    d.set_text("Найти проект по работе, этапу или источнику",v.PROJECT)
    d.wait_text("Найдено проектов: 1",35)
    click_named("Открыть найденный проект "+v.PROJECT,"Button")
    d.wait_text("Схема проекта: каталоги, работы и этапы",35)
    # Atlas 0.12 uses only current planning data. Reading the compact
    # readiness view must not issue a Task or write to the native Store.
    d.wait_text("Готовность работ по плану",35)
    assert d.head()==saved,"Read-only plan readiness wrote to Native Store"
    v.capture("atlas12-plan-readiness-overview-820")
    print("ATLAS12_NATIVE_PLAN_READINESS_OVERVIEW_PASS",flush=True)
    # Collapse the optional secondary navigation before opening the split dock.
    click_named("Показать или скрыть левую панель","Button")
    # Every original project section stays reachable from the compact rail.
    click_named("Изменения и решения","Button")
    d.wait_text("Предложения и утверждённые изменения",35)
    print("ATLAS11_NATIVE_CHANGES_RAIL_PASS",flush=True)

    # One rail navigation action must show the actual existing project Gantt.
    click_named("График работ","Button")
    d.wait_text("Сценарий: рабочая неделя",35)
    assert d.head()==saved,"Read-only Gantt caused a native write"
    def gantt_bars_within_window():
        bounds=win32gui.GetWindowRect(d.handle)
        bars=[item for item in d.window().descendants(control_type="Button")
              if str(item.window_text() or "").startswith("Открыть работу ")
              and item.is_visible()]
        return [item for item in bars if
                item.rectangle().left>=bounds[0]+56 and
                item.rectangle().right<=bounds[2]-5 and
                item.rectangle().top>=bounds[1]+95 and
                item.rectangle().bottom<=bounds[3]-32]
    assert gantt_bars_within_window(),(
        "The Gantt has no physically reachable Work bar at 820x650 without page scrolling")
    v.capture("atlas11-v6-gantt-820-no-scroll")
    win32gui.MoveWindow(d.handle,0,0,1024,710,True)
    d.activate()
    assert gantt_bars_within_window(),(
        "The Gantt has no physically reachable Work bar at 1024x710")
    v.capture("atlas11-v6-gantt-1024-no-scroll")
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    print("ATLAS11_NATIVE_GANTT_ROUTE_AND_COMPACT_BAR_PASS",flush=True)

    # The Gantt opens a real Work in the split inspector, not a separate
    # synthetic form. Editing and closing an untouched form must restore the
    # same Work context without a Native Store write.
    selected_bar=gantt_bars_within_window()[0]
    selected_label=str(selected_bar.window_text() or "")
    assert selected_label.startswith("Открыть работу ")
    d.activate()
    selected_bar.click_input()
    d.wait_text("Изменить работу",25)
    d.wait_text("Календарь работы",25)
    click_named("Инспектор: план")
    d.wait_text("Исходный план и текущий прогноз",25)
    d.wait_text("Контрольный план проекта ещё не зафиксирован",25)
    click_named("Инспектор: связи")
    d.wait_text("Зависимости",25)
    click_named("Инспектор: история")
    d.wait_text("Решения и наблюдения",25)
    click_named("Инспектор: сроки")
    d.wait_text("Календарь работы",25)
    v.capture("atlas11-v6-work-inspector-from-gantt-820")
    click_named("Изменить работу","Button")
    d.wait_text("Изменение данных",25)
    click_named("Закрыть редактор","Button")
    d.wait_text("Изменить работу",25)
    d.wait_text("Календарь работы",25)
    assert d.head()==saved,"Read-only Work selection or cancelled editor wrote to Native Store"
    print("ATLAS11_NATIVE_WORK_INSPECTOR_EDITOR_RETURN_PASS",flush=True)

    # The dock is in the same plane as Gantt at 820x650, not an overlay.
    d.wait_text("Инспектор",20)
    d.window().set_focus()
    bounds=win32gui.GetWindowRect(d.handle)
    raw=d.window().wrapper_object().element_info
    named=[i for i in raw.descendants() if i.name=="Изменить ширину инспектора"]
    assert named,"Resizable native inspector separator not exposed"
    grip=named[0].rectangle
    assert bounds[2]-335<=grip.left<=bounds[2]-265,(
        "Compact inspector should use about 300px instead of crowding the Gantt: "+str(grip))
    assert grip.left-(bounds[0]+64)>=410,(
        "The central Gantt lost too much width after showing the inspector: "+str(grip))
    assert d.head()==saved,"Opening split inspector changed Native Store"
    print("ATLAS11_NATIVE_COMPACT_GANTT_WIDTH_820_PASS",flush=True)
    v.capture("atlas11-v6-split-inspector-installed-820")
    print("ATLAS11_NATIVE_SPLIT_INSPECTOR_820_PASS",flush=True)

    # Apply a real Work duration edit through the installed Tauri form,
    # then inspect the original CPM consequences without saving to disk.
    click_named("Изменить работу","Button")
    d.wait_text("Изменение данных",25)
    v.set_editor_text("Плановая длительность, дней","37")
    v.find_control("Применить к черновику",types={"Button"}).click_input()
    d.wait_text("Работа изменена в черновике.",35)
    d.wait_text("Последствия корректировки",35)
    click_named("Инспектор: итог")
    d.wait_text("Продолжительность проекта по CPM",35)
    d.wait_text("Затронутые работы",35)
    assert d.head()==saved,"Work correction wrote to Native Store without Save"
    v.capture("atlas11-v6-inspector-work-impact-820")
    click_named("Инспектор: сроки")
    d.wait_text("Календарь работы",25)
    click_named("Инспектор: итог")
    d.wait_text("Последствия корректировки",25)
    assert d.head()==saved
    print("ATLAS11_NATIVE_WORK_CORRECTION_IMPACT_INSPECTOR_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as error:
        print("ATLAS11_INSTALLED_V6_QUALIFICATION_HOLD "+repr(error),flush=True)
        try:v.capture("atlas11-installed-v6-failure")
        except Exception:pass
        raise
    finally:
        d.stop()
