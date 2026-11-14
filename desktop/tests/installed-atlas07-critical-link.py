"""Installed Atlas 0.7: focused Windows qualification of critical dependency editing.

Exercise the real Setup Core-installed Tauri/WebView2 app. Import through the
native file picker; inspect CPM, confirm one actual link removal, Save, reread,
cold-restart, and compare every persisted project field. No test-only IPC.
"""
import copy
import importlib.util
import sys
import time
from pathlib import Path

import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
spec=importlib.util.spec_from_file_location(
    "atlas07_visual_driver",Path(__file__).with_name("installed-atlas06-visual-scale.py"))
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d

def qualify():
    original=v.imported_snapshot()
    before=v.saved_head_or_none()
    assert before is None or len(before["projects"])==1, "Expected a single previous test project"
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.open_archive_for_import()
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert v.saved_head_or_none()==before, "Opening IWXA preview wrote native Store"
    d.click_button("Заменить портфель в черновике")
    assert v.saved_head_or_none()==before, "Approving IWXA import bypassed Save"
    d.click_button("Сохранить")
    imported=v.await_saved(before)
    assert d.saved_project(imported)==original, "Native IWXA import changed fixture"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==imported and d.saved_project(imported)==original
    v.select_project()
    d.wait_text("Состав проекта",30)
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    time.sleep(0.3)
    critical=v.find_control("Изменить связи критической работы: "+v.LONG_WORK,
                            types={"Button"},scroll=False)
    assert v.rectangle_in_workspace(critical.rectangle(),
                                    win32gui.GetWindowRect(d.handle)), (
        "Critical-work edit command is not physically reachable on initial 820x650 overview")
    assert d.head()==imported, "Read-only critical preview changed Store"
    v.capture("atlas07-critical-direct-overview-820")
    critical.click_input()
    d.wait_text("Зависимости работ",35)
    d.wait_text("Предшественников: 5",35)
    d.wait_text("Прогноз удаления связи с Работа 0 / 12",35)
    d.wait_text("продолжительность: 2 дн., станет 2 дн.",35)
    assert d.head()==imported and d.saved_project(imported)==original, (
        "Hypothetical critical link removal wrote Store")
    v.capture("atlas07-critical-link-forecast-820")
    button=v.find_control("Убрать связь с предшественником: Работа 0 / 12",
                          types={"Button"},scroll=True)
    assert v.rectangle_in_workspace(button.rectangle(),win32gui.GetWindowRect(d.handle))
    button.click_input()
    time.sleep(0.3)
    keyboard.send_keys("{ENTER}")
    d.wait_text("Связь удалена из черновика.",35)
    d.wait_text("Расчётные сроки существующих работ не сдвинулись.",35)
    assert d.head()==imported and d.saved_project(imported)==original, (
        "Applying critical dependency change silently saved native Store")
    v.capture("atlas07-critical-link-impact-draft")
    d.click_button("Сохранить")
    new_head=v.await_saved(imported)
    actual=d.saved_project(new_head)
    expected=copy.deepcopy(original)
    expected["dependencies"]=[
        edge for edge in expected["dependencies"]
        if not (edge["from"]=="visual-work-0-11" and edge["to"]=="visual-work-5-0")
    ]
    assert len(expected["dependencies"])==len(original["dependencies"])-1
    assert actual==expected, "Saving critical dependency edited unrelated project fields"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==new_head and d.saved_project(new_head)==actual, (
        "Cold restart did not reconstruct the edited dependency")
    print("ATLAS07_CRITICAL_LINK_FOCUSED_WINDOWS_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS07_CRITICAL_LINK_FOCUSED_WINDOWS_HOLD "+repr(exc),flush=True)
        v.capture("atlas07-critical-link-failure")
        raise
    finally:
        d.stop()
