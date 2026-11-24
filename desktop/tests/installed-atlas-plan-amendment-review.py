"""Actual installed Atlas: three-way review, ordinary form, explicit Save.
No test IPC or direct Store writes. The independent IWXA carries a stale
proposal; the chosen current/proposed values are read back from Native Store.
"""
import importlib.util
import json
import os
import sys
import time
import zipfile
from pathlib import Path
import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding='utf-8',errors='replace')
source=Path(__file__).with_name('installed-atlas12-plan-alternatives.py')
spec=importlib.util.spec_from_file_location('atlas_plan_review_driver',source)
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
native,v,d,click,find=base.native,base.v,base.d,base.click,base.find
ARCHIVE=Path(os.environ['ATLAS_PLAN_REVIEW_IWXA'])
PROJECT='Подготовка монтажной площадки'
WORK='Установка оборудования'
PROPOSAL='Уточнение длительности монтажа'


def select_last(name):
    control=v.editor_field(name,types=('ComboBox',))
    control.click_input()
    keyboard.send_keys('{END}{ENTER}')
    time.sleep(.3)


def launch():
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)


def open_project():
    native.click_named('Портфель','Button')
    native.click_named('Показать или скрыть левую панель','Button')
    d.set_text('Найти проект по работе, этапу или источнику',PROJECT)
    d.wait_text('Найдено проектов: 1',35)
    native.click_named('Открыть найденный проект '+PROJECT,'Button')
    d.wait_text('Готовность работ по плану',35)
    native.click_named('Показать или скрыть левую панель','Button')
    native.click_named('Изменения и решения','Button')
    d.wait_text('Предложения и утверждённые изменения',35)


def qualify():
    assert ARCHIVE.is_file()
    with zipfile.ZipFile(ARCHIVE) as z:
        assert json.loads(z.read('manifest.json'))['format']=='iwxa.package'
        snapshot=json.loads(z.read('content/objects.ndjson'))['data']['snapshot']
    project=next(p for p in snapshot['projects'] if p['name']==PROJECT)
    child=next(p for p in snapshot['projects'] if p['id']!=project['id'])
    work=project['items'][0]
    original=project['changes'][0]
    assert work['estimateDays']==7 and original['planAmendments'][0]['before']['estimateDays']==3
    assert original['planAmendments'][0]['after']['estimateDays']==5
    previous=d.head()
    v.ARCHIVE=ARCHIVE
    launch()
    native.click_named('Портфель','Button')
    native.click_named('Файл','Button')
    d.wait_text('Открыть архив .iwxa',25)
    native.click_named('Открыть архив .iwxa','Button')
    v.choose_archive()
    d.wait_text('Заменить портфель в черновике',35)
    assert d.head()==previous
    native.click_named('Заменить портфель в черновике','Button')
    assert d.head()==previous
    native.click_named('Сохранить','Button')
    saved=v.await_saved(previous)
    assert base.stored_project(saved,project['id'])==project
    d.stop()
    launch()
    assert d.head()==saved
    open_project()
    click('Сценарий до / после')
    d.wait_text('Исходные данные заявки изменились',35)
    d.wait_text('Длительность: Требуется выбор',35)
    d.wait_text('Сейчас: 7 кал. дн.',35)
    d.wait_text('Предлагалось: 5 кал. дн.',35)
    assert d.head()==saved
    v.capture('atlas-plan-review-stale-values-820')
    click('Пересмотреть корректировку '+WORK)
    d.window_title_contains('Форма: Пересмотр корректировки:',25)
    select_last('Длительность')
    select_last('Подтвердить пересмотр')
    assert d.head()==saved
    v.capture('atlas-plan-review-field-choice-820')
    v.find_control('Применить к черновику',types={'Button'},scroll=True).click_input()
    v.await_no_form()
    d.wait_text('Корректировка пересмотрена.',35)
    d.wait_text('Финиш проекта: 2026-11-30 → 2026-11-28.',35)
    assert d.head()==saved,'Review wrote to Store before Save'
    native.click_named('Сохранить','Button')
    reviewed=v.await_saved(saved)
    p=base.stored_project(reviewed,project['id'])
    assert p['items']==project['items'] and p['planBaselines']==project['planBaselines']
    assert p['decisions']==project['decisions'] and p['dependencies']==project['dependencies']
    a=p['changes'][0]['planAmendments'][0]
    assert p['changes'][0]['status']=='proposed' and not p['changes'][0].get('planAppliedAt')
    assert a['before']['estimateDays']==7 and a['after']['estimateDays']==5
    for name in ('assignee','resourceId','allocationPct','dueDate'):
        assert a['before'][name]==a['after'][name]==work[name],name
    assert base.stored_project(reviewed,child['id'])==child
    v.capture('atlas-plan-review-saved-proposal-820')
    print('ATLAS_NATIVE_PLAN_REVIEW_SAVE_PASS',flush=True)
    d.stop()
    launch()
    assert d.head()==reviewed and base.stored_project(reviewed,project['id'])==p
    open_project()
    click('Сценарий до / после')
    d.wait_text('Последствия относительно текущего плана',35)
    click('Решение')
    d.window_title_contains('Форма: Решение:',25)
    # The ordinary proposed -> approved form defaults to approved. Confirm
    # it using a real rationale; this is not part of the review operation.
    v.set_editor_text('Почему принято это решение?','Уточнённые параметры сверены с текущим планом.')
    v.find_control('Применить к черновику',types={'Button'},scroll=True).click_input()
    v.await_no_form()
    assert d.head()==reviewed
    click('Применить утверждённый план')
    keyboard.send_keys('{ENTER}')
    d.wait_text('План изменён в черновике.',35)
    assert d.head()==reviewed
    native.click_named('Сохранить','Button')
    committed=v.await_saved(reviewed)
    applied=base.stored_project(committed,project['id'])
    expected=dict(work);expected['estimateDays']=5
    assert applied['items']==[expected]
    assert applied['planBaselines']==project['planBaselines']
    assert applied['changes'][0]['planAppliedAt']
    assert len([x for x in applied['decisions'] if x.get('kind')=='plan_application'])==1
    assert base.stored_project(committed,child['id'])==child
    d.stop()
    launch()
    assert d.head()==committed and base.stored_project(committed,project['id'])==applied
    print('ATLAS_NATIVE_PLAN_REVIEW_APPROVE_APPLY_COLD_RESTORE_PASS',flush=True)


if __name__=='__main__':
    try:qualify()
    except Exception as error:
        print('ATLAS_NATIVE_PLAN_REVIEW_HOLD '+repr(error),flush=True)
        try:v.capture('atlas-plan-review-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
