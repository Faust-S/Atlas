"""Atlas 0.8: installed IWXA Setup Core -> real WebView2 GUI -> Store.
One large-project user route with two consecutive work corrections and an
explicit Save/cold restart. No test-only IPC, browser driver or direct writes.
"""
import copy
import importlib.util
import sys
import time
from pathlib import Path

import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding="utf-8",errors="replace")
spec=importlib.util.spec_from_file_location(
    "atlas08_visual_driver",Path(__file__).with_name("installed-atlas06-visual-scale.py"))
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
d=v.d
FIRST_ID="visual-work-5-1079"
FIRST_TITLE="Работа 5 / 1080"

def edit_duration(value):
    field=v.editor_field("Плановая длительность, дней",types=("Spinner","Edit"))
    field.click_input()
    keyboard.send_keys("^a")
    keyboard.send_keys(str(value))
    d.wait_text("Если применить эти значения",35)
    submit=v.find_control("Применить к черновику",types={"Button"},scroll=False)
    bounds=win32gui.GetWindowRect(d.handle)
    assert v.rectangle_in_workspace(submit.rectangle(),bounds),(
        "Apply must remain physically reachable in a compact Windows editor")
    return submit

def qualify():
    original=v.imported_snapshot()
    previous=v.saved_head_or_none()
    assert previous is None,"Expected a clean dedicated Windows profile"
    d.launch()
    d.wait_text("Портфель проектов",45)
    v.open_archive_for_import()
    v.choose_archive()
    d.wait_text("Заменить портфель в черновике",45)
    assert v.saved_head_or_none()==previous,"Import preview wrote native Store"
    d.click_button("Заменить портфель в черновике")
    assert v.saved_head_or_none()==previous,"Import approval bypassed Save"
    d.click_button("Сохранить")
    saved=v.await_saved(previous)
    assert d.saved_project(saved)==original,"Initial .iwxa import was changed"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==saved and d.saved_project(saved)==original
    print("ATLAS08_CLEAN_SETUP_IMPORT_COLD_RESTART_PASS",flush=True)

    # A reordered query is a public navigation feature. Open the real distant
    # work, not an object obtained through a hidden native test endpoint.
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику","1080 работа 5")
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+FIRST_TITLE,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)
    open_first=v.find_control("Открыть работу "+FIRST_TITLE,
                              types={"Button"},scroll=True)
    open_first.click_input()
    d.window_title_contains("Форма: Работа: "+FIRST_TITLE,25)
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    first=next(w for w in original["items"] if w["id"]==FIRST_ID)
    assert first["title"]==FIRST_TITLE
    first_days=first.get("estimateDays") or 1
    submit=edit_duration(first_days+3)
    d.wait_text("Затронуто работ:",30)
    assert d.head()==saved,"Draft forecast wrote Store before Apply"
    v.capture("atlas08-first-work-unsaved-forecast-820")
    submit.click_input()
    v.await_no_form()
    d.wait_text("Последствия изменения работы",35)
    assert d.head()==saved,"Applying first work edit wrote Store before Save"

    # Pick a second affected work through its visible UI action. Its identity
    # comes from actual rendered impact results, not from fabricated links.
    candidates=[]
    for button in d.window().descendants(control_type="Button"):
        label=str(button.window_text() or "")
        prefix="Изменить затронутую работу "
        if label.startswith(prefix) and label[len(prefix):]!=FIRST_TITLE:
            candidates.append(label)
    assert candidates,"No downstream affected work is exposed to the user"
    name=candidates[0]
    second_title=name[len("Изменить затронутую работу "):]
    second=next(w for w in original["items"] if w["title"]==second_title)
    v.find_control(name,types={"Button"},scroll=True).click_input()
    d.window_title_contains("Форма: Работа: "+second_title,25)
    d.wait_text("От плана до первой правки",35)
    second_days=second.get("estimateDays") or 1
    next_days=second_days-1 if second_days>1 else second_days+1
    submit=edit_duration(next_days)
    d.wait_text("От плана до первой правки",30)
    assert d.head()==saved,"Cumulative forecast wrote Store before Apply"
    v.capture("atlas08-cumulative-work-forecast-820")
    submit.click_input()
    v.await_no_form()
    # The correction receipt belongs above the fold, not only far below
    # the work table. This is an actual Windows accessibility observation.
    try:
        d.wait_text("Последовательные правки: 1",25)
    except AssertionError:
        shown=[name for name in d.visible_texts()
               if any(word in name.lower() for word in
                      ("правк","планом","затронуто","сохран"))]
        print("ATLAS08_CORRECTION_RECEIPT_DIAGNOSTIC "+
              repr(shown[:30]),flush=True)
        v.capture("atlas08-post-second-apply-no-receipt")
        raise
    assert d.head()==saved,"Second correction wrote Store before Save"
    v.capture("atlas08-two-work-corrections-not-saved-820")

    # Only the explicit Save may advance the on-disk generation. Read the
    # complete project, not just the amended duration labels.
    d.click_button("Сохранить")
    updated_head=v.await_saved(saved)
    actual=d.saved_project(updated_head)
    expected=copy.deepcopy(original)
    next(w for w in expected["items"] if w["id"]==FIRST_ID)["estimateDays"]=first_days+3
    next(w for w in expected["items"] if w["id"]==second["id"])["estimateDays"]=next_days
    assert actual==expected,"Native Save changed unrelated project fields"
    d.stop()
    d.launch()
    d.wait_text("Портфель проектов",45)
    assert d.head()==updated_head,"Cold restart changed saved generation"
    assert d.saved_project(updated_head)==expected,"Cold restart lost corrections"
    print("ATLAS08_INSTALLED_CUMULATIVE_CORRECTIONS_SAVE_RESTART_PASS",flush=True)

    # The unchanged large fixture has one unbroken 360-character work title.
    # Change an existing predecessor through the normal form so this title
    # appears in a real impact list. Verify Windows UIA horizontal geometry.
    long_title = "Проверить" + "ОченьДлинноеНазваниеРаботыБезПробелов"*10
    assert any(w["title"] == long_title for w in original["items"])
    # An unambiguous saved title. "Работа 0 / 4" matches other works by tokens.
    predecessor = "Работа 0 / 20"
    d.click_button("Открыть портфель проектов")
    d.wait_text("Проекты и последствия",35)
    d.set_text("Найти проект по работе, этапу или источнику",predecessor)
    d.wait_text("Найдено проектов: 1",35)
    v.find_control("Перейти к найденной работе "+predecessor,
                   types={"Button"},scroll=True).click_input()
    d.wait_text("Работы проекта",35)
    v.find_control("Открыть работу "+predecessor,
                   types={"Button"},scroll=True).click_input()
    d.window_title_contains("Форма: Работа: "+predecessor,25)
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    submit=edit_duration(5)
    assert d.head()==updated_head,"Preview of long work wrote Store"
    submit.click_input()
    v.await_no_form()
    d.wait_text("Последствия изменения работы",35)
    matched=[]
    for element in d.window().descendants():
        shown="".join(str(element.window_text() or "").split())
        if "".join(long_title[:60].split()) in shown:
            matched.append(element)
    assert matched,"No actual long-title effect was rendered"
    bounds=win32gui.GetWindowRect(d.handle)
    fitting=[e for e in matched if
             v.rectangle_in_workspace(e.rectangle(),bounds,require_vertical=False)]
    v.capture("atlas08-long-title-impact-820")
    assert fitting,("Long affected-work caption exceeds Windows viewport: "+
                    repr([(e.rectangle().left,e.rectangle().right) for e in matched]))
    assert d.head()==updated_head,"Long-title inspection wrote Store"
    print("ATLAS08_INSTALLED_LONG_TITLE_WRAP_PASS",flush=True)

if __name__=="__main__":
    try:
        qualify()
    except Exception as exc:
        print("ATLAS08_INSTALLED_CORRECTIONS_HOLD "+repr(exc),flush=True)
        v.capture("atlas08-corrections-failure")
        raise
    finally:
        d.stop()
