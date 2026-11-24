"""Installed Atlas deadline recovery: real IWXA import and real UIA.
The joint reduction of three parallel critical Works is calculated on the
same current plan. A normal proposal is drafted, saved, approved, applied
and restored. No test IPC, browser automation or Store injection.
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
spec=importlib.util.spec_from_file_location('atlas_recovery_driver',source)
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
native,v,d,click,find=base.native,base.v,base.d,base.click,base.find
ARCHIVE=Path(os.environ['ATLAS12_PLAN_ALTERNATIVES_IWXA'])
PROJECT='Плановая загрузка оборудования'
TITLE='Пересмотр срока: Совместный вариант'

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

def fill(name,value):
    control=find(name)
    control.click_input()
    keyboard.send_keys('^a')
    keyboard.send_keys(value,with_spaces=True)
    time.sleep(.35)

def qualify():
    assert ARCHIVE.is_file()
    with zipfile.ZipFile(ARCHIVE) as z:
        assert json.loads(z.read('manifest.json'))['format']=='iwxa.package'
        snapshot=json.loads(z.read('content/objects.ndjson'))['data']['snapshot']
    project=next(p for p in snapshot['projects'] if p['name']==PROJECT)
    child=next(p for p in snapshot['projects'] if p['id']!=project['id'])
    critical={w['id'] for w in project['items'] if w['estimateDays']==3}
    assert len(critical)==3 and project['dueDate']=='2026-11-25'
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
    click('Проверить восстановление срока')
    find('Контрольный срок: 2026-11-25',contains=True)
    find('Критических работ: 3',contains=True)
    # Critical Work sorts ahead of noncritical Work. Selecting each current
    # first available entry uses real controls, not fixture IDs or DOM hooks.
    for i in range(1,4):
        click('Добавить работу для расчёта')
        fill('Длительность варианта '+str(i),'2')
    click('Рассчитать восстановление срока')
    find('Рассчитано вариантов: 4 из 4',contains=True)
    find('Контрольный срок достигнут по расчёту',contains=True)
    find('Финиш варианта: 2026-11-25; оставшееся отставание: 0 дн.',contains=True)
    assert d.head()==saved,'Deadline comparison wrote to Native Store'
    # Explicitly add a sequence alternative on the current plan. A new
    # dependency must be treated as an assumption, not silently applied.
    click('Уточнить порядок работ')
    click('Включить добавление связи')
    click('Рассчитать восстановление срока')
    find('Рассчитано вариантов: 5 из 5',contains=True)
    find('Финиш позже',contains=True)
    assert d.head()==saved
    click('Убрать связь из расчёта 1')
    click('Скрыть выбор связей')
    click('Рассчитать восстановление срока')
    find('Рассчитано вариантов: 4 из 4',contains=True)
    find('Контрольный срок достигнут по расчёту',contains=True)
    fill('Обоснование восстановления срока','Three planned estimates reviewed by owner')
    v.capture('atlas-recovery-compare-820')
    click('Подготовить заявку: Совместный вариант')
    d.wait_text('Заявка на пересмотр срока подготовлена в черновике.',35)
    assert d.head()==saved,'Proposal creation bypassed explicit Save'
    native.click_named('Сохранить','Button')
    drafted=v.await_saved(saved)
    p=base.stored_project(drafted,project['id'])
    assert p['items']==project['items'] and p['dependencies']==project['dependencies']
    assert p['planBaselines']==project['planBaselines'] and p['decisions']==project['decisions']
    assert p['changes'][:-1]==project['changes']
    proposal=p['changes'][-1]
    assert proposal['title']==TITLE and proposal['status']=='proposed' and not proposal.get('planAppliedAt')
    actions=proposal['planAmendments']
    assert len(actions)==3 and {a['itemId'] for a in actions}==critical
    assert all(a['kind']=='work' and a['before']['estimateDays']==3 and a['after']['estimateDays']==2 for a in actions)
    assert base.stored_project(drafted,child['id'])==child
    print('ATLAS12_NATIVE_RECOVERY_PROPOSAL_SAVE_PASS',flush=True)
    d.stop()
    launch()
    assert d.head()==drafted and base.stored_project(drafted,project['id'])==p
    open_project()
    click('Сценарий до / после')
    d.wait_text('Финиш проекта: 2026-11-26 → 2026-11-25.',35)
    click('Решение')
    d.window_title_contains('Форма: Решение:',25)
    v.set_editor_text('Почему принято это решение?','Owner confirmed the three planned estimates')
    v.find_control('Применить к черновику',types={'Button'},scroll=True).click_input()
    v.await_no_form()
    assert d.head()==drafted
    click('Применить утверждённый план')
    keyboard.send_keys('{ENTER}')
    d.wait_text('План изменён в черновике.',35)
    assert d.head()==drafted
    native.click_named('Сохранить','Button')
    committed=v.await_saved(drafted)
    applied=base.stored_project(committed,project['id'])
    expected=json.loads(json.dumps(project['items']))
    for w in expected:
        if w['id'] in critical:w['estimateDays']=2
    assert applied['items']==expected
    assert applied['dueDate']==project['dueDate'] and applied['planBaselines']==project['planBaselines']
    assert applied['changes'][-1]['planAppliedAt'] and applied['changes'][:-1]==project['changes']
    assert any(x.get('kind')=='plan_application' and x.get('changeId')==proposal['id'] for x in applied['decisions'])
    assert base.stored_project(committed,child['id'])==child
    v.capture('atlas-recovery-applied-820')
    d.stop()
    launch()
    assert d.head()==committed and base.stored_project(committed,project['id'])==applied
    print('ATLAS12_NATIVE_RECOVERY_APPROVE_APPLY_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_RECOVERY_HOLD '+repr(error),flush=True)
        try:v.capture('atlas-recovery-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
