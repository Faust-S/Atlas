"""Atlas 0.10 installed WebView2 acceptance for a persisted working-day Work.

Uses the same real Windows GUI, original Setup Core Store, Save As, and file
picker as an ordinary user. No direct Store writes, synthetic IPC, CDP,
browser automation, fake snapshots, or 0.8 installation/migration.
The calendar library and large work portfolio are created by the preceding
installed-atlas10-calendar-scenario.py on this clean Windows runner.
"""
import copy
import importlib.util
import json
import os
import sys
import time
import zipfile
from pathlib import Path

import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
module=Path(__file__).with_name("installed-atlas06-visual-scale.py")
spec=importlib.util.spec_from_file_location("atlas10_native_visual_driver",module)
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d
TITLE="Работа 5 / 1080"
WORK_ID="visual-work-5-1079"


def open_work():
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику","1080 работа 5")
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+TITLE,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)


def choose_second_option(label):
    # Browser native select, operated by physical Windows UIA and keystrokes.
    # Both fields have a blank/elapsed first option and their real choice second.
    control=v.editor_field(label,types=("ComboBox",))
    bounds=win32gui.GetWindowRect(d.handle)
    assert v.rectangle_in_workspace(control.rectangle(),bounds),(
        "Calendar Work select is not physically reachable: "+label)
    control.click_input()
    keyboard.send_keys("{HOME}{DOWN}{ENTER}")
    time.sleep(0.35)


def save_archive(path):
    v.open_file_menu()
    d.click_button("Сохранить архив .iwxa")
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        handle=win32gui.FindWindow("#32770","Сохранить архив проектов IWXA")
        if handle and win32gui.IsWindowVisible(handle):
            win32gui.SetForegroundWindow(handle)
            keyboard.send_keys("%n")
            keyboard.send_keys("^a")
            keyboard.send_keys(str(path),with_spaces=True)
            keyboard.send_keys("{ENTER}")
            break
        time.sleep(0.25)
    else:
        raise AssertionError("Installed Atlas 0.10 did not expose original IWXA Save As dialog")
    deadline=time.monotonic()+45
    while time.monotonic()<deadline and not path.is_file():
        time.sleep(0.25)
    assert path.is_file() and path.stat().st_size>100,(
        "Installed Atlas 0.10 did not export the selected native IWXA file")
    with zipfile.ZipFile(path) as z:
        manifest=json.loads(z.read("manifest.json"))
        obj=json.loads(z.read("content/objects.ndjson"))
    assert manifest["format"]=="iwxa.package"
    assert obj["data"]["snapshot"]["schema"]=="atlas.project/1"
    print("ATLAS10_INSTALLED_NEW_WORK_IWXA_EXPORT_PASS",flush=True)
    return obj["data"]["snapshot"]


def import_archive(path,old_head):
    v.ARCHIVE=path
    v.open_file_menu()
    d.click_button("Открыть архив .iwxa")
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert d.head()==old_head,("Import preview wrote to native Store")
    v.capture("atlas10-work-iwxa-preview-before-approval")
    d.click_button("Заменить портфель в черновике")
    assert d.head()==old_head,("Import approval silently bypassed native Save")
    d.click_button("Сохранить")
    return v.await_saved(old_head)


def qualify():
    baseline=d.head()
    assert baseline and baseline.get("projects"),"Prior Windows Atlas calendar scenario was not saved"
    library=baseline["root"].get("calendarLibrary",[])
    assert len(library)==1 and library[0]["version"]==1,(
        "Prior original native Store has no unique shared calendar")
    basis={"id":library[0]["id"],"version":1}
    original=d.saved_project(baseline)
    before_work=next(w for w in original["items"] if w["id"]==WORK_ID)
    assert before_work.get("durationUnit","elapsed_days")=="elapsed_days"
    d.launch()
    d.wait_text("Портфель проектов",45)
    open_work()
    v.find_control("Открыть работу "+TITLE,types={"Button"},scroll=True).click_input()
    d.window_title_contains("Форма: Работа: "+TITLE,25)
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    choose_second_option("Как считать длительность")
    choose_second_option("Календарь для рабочих дней")
    d.wait_text("Если применить эти значения",35)
    assert d.head()==baseline and d.saved_project(baseline)==original,(
        "Native Work draft preview wrote Store before Apply")
    v.capture("atlas10-typed-work-editor-820")
    submit=v.find_control("Применить к черновику",types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(submit.rectangle(),win32gui.GetWindowRect(d.handle)),(
        "Typed Work confirmation is not reachable at 820x650")
    submit.click_input()
    v.await_no_form()
    assert d.head()==baseline and d.saved_project(baseline)==original,(
        "Applying Work calendar bypassed explicit Save")
    d.wait_text("Работы проекта",35)
    d.wait_text("раб. дн.",35)
    v.capture("atlas10-typed-work-table-before-native-save")
    d.click_button("Сохранить")
    saved=v.await_saved(baseline)
    stored=d.saved_project(saved)
    actual=next(w for w in stored["items"] if w["id"]==WORK_ID)
    expected=copy.deepcopy(original)
    selected=next(w for w in expected["items"] if w["id"]==WORK_ID)
    selected["durationUnit"]="working_days"
    selected["calendarBasis"]=basis
    assert stored==expected,"Native typed Work Save changed unrelated project content"
    assert actual["estimateDays"]==before_work["estimateDays"]
    assert actual["durationUnit"]=="working_days" and actual["calendarBasis"]==basis
    assert saved["root"]["calendarLibrary"]==library
    print("ATLAS10_INSTALLED_TYPED_WORK_SAVE_READBACK_PASS",flush=True)
    v.capture("atlas10-typed-work-native-saved")

    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved and d.saved_project(saved)==stored,(
        "Cold restart did not recover the exact pinned calendar Work")
    open_work()
    d.wait_text("раб. дн.",35)
    d.wait_text("CPM:",35)
    v.capture("atlas10-typed-work-native-cold-table")
    d.click_button("График")
    d.wait_text("График работ",35)
    d.wait_text("раб. дн.",35)
    v.capture("atlas10-typed-work-gantt-matching-units")
    print("ATLAS10_INSTALLED_TYPED_WORK_GANTT_TABLE_COLD_PASS",flush=True)

    # Export from this installed 0.10; never feed the importer a synthesized
    # test carrier. The ZIP is read only as independent evidence after Save As.
    archive=Path(os.environ["RUNNER_TEMP"])/"atlas10-native-work-calendar.iwxa"
    snapshot=save_archive(archive)
    assert snapshot["calendarLibrary"]==library
    assert snapshot["projects"][0]==stored

    # In a NEW application process, independently choose the exported 0.10
    # archive through native Windows picker, explicitly approve, save, reopen.
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    imported=import_archive(archive,saved)
    assert imported["generation"]!=saved["generation"],(
        "Independent .iwxa import never reached a new native generation")
    assert d.saved_project(imported)==stored,(
        "Native independent 0.10 import changed typed Work or other project data")
    assert imported["root"]["calendarLibrary"]==library,(
        "Native independent 0.10 import dropped calendar revisions")
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==imported and d.saved_project(imported)==stored,(
        "Cold 0.10 import lost durationUnit/calendarBasis")
    v.capture("atlas10-typed-work-independent-iwxa-cold")
    print("ATLAS10_INSTALLED_TYPED_WORK_IWXA_INDEPENDENT_IMPORT_PASS",flush=True)


if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS10_INSTALLED_TYPED_WORK_HOLD "+repr(exc),flush=True)
        v.capture("atlas10-typed-work-native-failure")
        raise
    finally:
        d.stop()
