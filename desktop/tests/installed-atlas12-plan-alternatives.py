"""Installed Atlas 0.12 compound amendments: independent IWXA, real UIA,
explicit plan application and native readback. No browser/DOM/test-only IPC."""
import importlib.util
import hashlib
import json
import os
import sys
import time
import zipfile
from pathlib import Path

import win32gui
from pywinauto import keyboard

sys.stdout.reconfigure(encoding='utf-8',errors='replace')
path=Path(__file__).with_name('installed-atlas12-resource-alternatives.py')
spec=importlib.util.spec_from_file_location('atlas12_resource_driver',path)
driver=importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
native=driver.native
v=driver.v
d=driver.d
click=driver.click_scrollable_button
find=driver.find_resource_control
ARCHIVE=Path(os.environ['ATLAS12_PLAN_ALTERNATIVES_IWXA'])
A='Вариант A: разделить ресурсы'
B='Вариант B: уменьшить доли'

def stored_project(manifest,project_id):
    entry=next(x for x in manifest['projects'] if x['id']==project_id)
    data=(d.STORE/'blocks'/(entry['sha256']+'.json')).read_bytes()
    assert hashlib.sha256(data).hexdigest()==entry['sha256']
    return json.loads(data.decode('utf-8'))

def qualify():
    assert ARCHIVE.is_file()
    with zipfile.ZipFile(ARCHIVE) as z:
        assert json.loads(z.read('manifest.json'))['format']=='iwxa.package'
        original=json.loads(z.read('content/objects.ndjson'))['data']['snapshot']
    project=next(p for p in original['projects'] if any(c['title']==A for c in p.get('changes',[])))
    child=next(p for p in original['projects'] if p['id']!=project['id'])
    proposals={c['title']:c for c in project['changes']}
    assert proposals[A]['status']=='approved' and proposals[B]['status']=='proposed'
    assert len(proposals[A]['planAmendments'])==3
    assert len(proposals[B]['planAmendments'])==2
    edge=next(a for a in proposals[A]['planAmendments'] if a['kind']=='dependency')
    assert edge['before'] is False and edge['after'] is True
    assert project['dependencies']==[]
    previous=d.head()
    v.ARCHIVE=ARCHIVE
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
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
    persisted=stored_project(saved,project['id'])
    assert persisted['items']==project['items']
    assert persisted['planBaselines']==project['planBaselines']
    assert stored_project(saved,child['id'])==child
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
    assert d.head()==saved
    native.click_named('Портфель','Button')
    native.click_named('Показать или скрыть левую панель','Button')
    d.set_text('Найти проект по работе, этапу или источнику',project['name'])
    d.wait_text('Найдено проектов: 1',35)
    native.click_named('Открыть найденный проект '+project['name'],'Button')
    d.wait_text('Готовность работ по плану',35)
    native.click_named('Показать или скрыть левую панель','Button')
    native.click_named('Изменения и решения','Button')
    d.wait_text('Предложения и утверждённые изменения',35)
    click('Сравнить редакции плана')
    click('Рассчитать редакции')
    find('Исходный финиш: 2026-11-26',contains=True)
    find('Текущий финиш: 2026-11-26',contains=True)
    find('Предлагаемый финиш: 2026-11-29',contains=True)
    assert d.head()==saved,'Comparing chronological plan revisions wrote to Native Store'
    v.capture('atlas12-plan-revisions-820')
    print('ATLAS12_NATIVE_PLAN_REVISIONS_READONLY_PASS',flush=True)
    click('Скрыть сравнение редакций')
    click('Сравнить варианты плана')
    click('Рассчитать два сценария')
    find('Финиш проекта: 2026-11-26 → 2026-11-29.',contains=True)
    find('Финиш проекта: 2026-11-26 → 2026-11-28.',contains=True)
    assert d.head()==saved,'Comparing two proposals wrote to Native Store'
    v.capture('atlas12-multi-work-alternatives-820')
    print('ATLAS12_NATIVE_PLAN_ALTERNATIVES_PASS',flush=True)
    click('Открыть заявку '+A)
    d.wait_text('Последствия относительно текущего плана',35)
    find('Применить утверждённый план','Button')
    assert d.head()==saved,'Opening selected proposal changed the saved plan'
    v.capture('atlas12-selected-approved-plan-820')
    click('Применить утверждённый план')
    keyboard.send_keys('{ENTER}')
    time.sleep(.6)
    d.wait_text('План изменён в черновике.',35)
    assert d.head()==saved,'Plan application bypassed explicit Save'
    native.click_named('Сохранить','Button')
    committed=v.await_saved(saved)
    result=stored_project(committed,project['id'])
    expected=json.loads(json.dumps(project['items']))
    for action in proposals[A]['planAmendments']:
        if action['kind']=='work':
            work=next(w for w in expected if w['id']==action['itemId'])
            work.update(action['after'])
    assert result['items']==expected
    assert result['planBaselines']==project['planBaselines']
    assert result['dependencies']==[{'from':edge['from'],'to':edge['to']}]
    assert next(c for c in result['changes'] if c['id']==proposals[A]['id'])['planAppliedAt']
    assert next(c for c in result['changes'] if c['id']==proposals[B]['id'])==proposals[B]
    assert any(x.get('kind')=='plan_application' and x.get('changeId')==proposals[A]['id'] for x in result['decisions'])
    assert committed['root']['resources']==saved['root']['resources']
    assert stored_project(committed,child['id'])==child
    v.capture('atlas12-compound-plan-applied-820')
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
    assert d.head()==committed
    assert stored_project(committed,project['id'])==result
    assert stored_project(committed,project['id'])['dependencies']==[{'from':edge['from'],'to':edge['to']}]
    print('ATLAS12_NATIVE_COMPOUND_PLAN_DEPENDENCY_SAVE_COLD_RESTORE_PASS',flush=True)
    print('ATLAS12_NATIVE_COMPOUND_PLAN_SAVE_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:
        qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_COMPOUND_PLAN_HOLD '+repr(error),flush=True)
        try:v.capture('atlas12-compound-plan-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
