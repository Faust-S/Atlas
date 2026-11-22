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
    # Preferences must not cause a Native Store generation.
    assert v.saved_head_or_none() is None
    click_named("Готово","Button")
    v.capture("atlas11-v6-dashboard-installed-820")
    print("ATLAS11_NATIVE_DASHBOARD_COMPACT_PASS",flush=True)

    # New native sidebar works without old breadcrumbs.
    click_named("Портфель","Button")
    d.wait_text("Портфель проектов",35)
    click_named("Показать или скрыть левую панель","Button")
    d.wait_text("Создать проект",20)
    click_named("Настройки Atlas","Button")
    d.wait_text("Настройки",20)
    click_named("О приложении","Button")
    d.wait_text("Установленная версия",20)
    d.wait_text("0.10.0",20) # Packaged development base, not falsely advertised 0.11 release.
    click_named("Вернуться","Button")
    print("ATLAS11_NATIVE_MENU_PROFILE_VERSION_PASS",flush=True)

    # Import through existing original native file path, not a demo array.
    click_named("Портфель","Button")
    click_named("Файл")
    click_named("Открыть архив .iwxa","Button")
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",35)
    assert v.saved_head_or_none() is None,"Import preview changed disk before approval"
    click_named("Заменить портфель в черновике","Button")
    assert v.saved_head_or_none() is None,"Import approval bypassed native Save"
    click_named("Сохранить","Button")
    saved=v.await_saved(None)
    assert d.saved_project(saved)==original,"Native import changed 1212-Work fixture"
    print("ATLAS11_NATIVE_IWXA_IMPORT_SAVE_PASS",flush=True)
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text("Настроить дашборд",45)
    assert d.head()==saved
    assert d.saved_project(saved)==original
    print("ATLAS11_NATIVE_COLD_RESTORE_PASS",flush=True)

    # Reach a concrete project and the original canonical Gantt.
    click_named("Портфель","Button")
    click_named("Показать или скрыть левую панель","Button")
    d.set_text("Найти проект по работе, этапу или источнику",v.PROJECT)
    d.wait_text("Найдено проектов: 1",35)
    click_named("Открыть найденный проект "+v.PROJECT,"Button")
    d.wait_text("Схема проекта: каталоги, работы и этапы",35)
    # Collapse the optional secondary navigation before opening the split dock.
    click_named("Показать или скрыть левую панель","Button")
    # One rail navigation action must show the actual existing project Gantt.
    click_named("График работ","Button")
    d.wait_text("Сценарий: рабочая неделя",35)
    assert d.head()==saved,"Read-only Gantt caused a native write"
    print("ATLAS11_NATIVE_GANTT_ROUTE_PASS",flush=True)

    # Display a dock alongside the central Gantt at 820x650, not covering it.
    click_named("Показать инспектор","Button")
    d.wait_text("Инспектор",20)
    d.window().set_focus()
    bounds=win32gui.GetWindowRect(d.handle)
    raw=d.window().wrapper_object().element_info
    named=[i for i in raw.descendants() if i.name=="Изменить ширину инспектора"]
    assert named,"Resizable native inspector separator not exposed"
    grip=named[0].rectangle
    assert bounds[0]+350<grip.left<bounds[2]-280,(
        "Inspector must split the available workspace instead of overlaying it: "+str(grip))
    assert d.head()==saved,"Opening split inspector changed Native Store"
    v.capture("atlas11-v6-split-inspector-installed-820")
    print("ATLAS11_NATIVE_SPLIT_INSPECTOR_820_PASS",flush=True)

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
