"""Installed Atlas leveling qualification. Original IWXA, Windows UIA,
normal change approval, actual native Store, explicit Save and cold restart.
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
spec=importlib.util.spec_from_file_location('atlas_leveling_driver',source)
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
native,v,d,click,find=base.native,base.v,base.d,base.click,base.find
ARCHIVE=Path(os.environ['ATLAS12_RESOURCE_LEVELING_IWXA'])
REASON='The second order can start after the first without missing its deadline.'

def launch():
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)

def fill(name,value):
    control=find(name,role='Edit')
    control.click_input()
    keyboard.send_keys('^a')
    keyboard.send_keys(value,with_spaces=True)
    time.sleep(.35)

def qualify():
    assert ARCHIVE.is_file()
    with zipfile.ZipFile(ARCHIVE) as z:
        assert json.loads(z.read('manifest.json'))['format']=='iwxa.package'
        original=json.loads(z.read('content/objects.ndjson'))['data']['snapshot']
    first,second=original['projects']
    assert first['name']=='Заказ 1' and second['name']=='Заказ 2'
    assert first['startDate']==second['startDate']=='2026-11-23'
    assert first['dueDate']==second['dueDate']=='2026-11-29'
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
    assert base.stored_project(saved,first['id'])==first
    assert base.stored_project(saved,second['id'])==second
    d.stop()
    launch()
    assert d.head()==saved
    native.click_named('Портфель','Button')
    click('Подобрать план по ресурсу')
    click('Добавить проект для выравнивания')
    click('Добавить проект для выравнивания')
    click('Рассчитать выравнивание')
    find('Вариантов выравнивания: 1. Проверено комбинаций: 64 из 64.',contains=True)
    find('Перегрузка выбранного ресурса: 3 → 0 дн.',contains=True)
    find('Заказ 2 · +3 дн.',contains=True)
    assert d.head()==saved,'Leveling comparison wrote to Native Store'
    fill('Обоснование выравнивания ресурсов',REASON)
    v.capture('atlas-resource-leveling-comparison-820')
    click('Подготовить заявки: Не ухудшать известные сроки')
    d.wait_text('Заявки на выравнивание подготовлены в черновике.',35)
    assert d.head()==saved
    find('Вариант А · 1 из 4 проектов',contains=True)
    native.click_named('Сохранить','Button')
    drafted=v.await_saved(saved)
    p=base.stored_project(drafted,second['id'])
    assert base.stored_project(drafted,first['id'])==first
    assert p['items']==second['items'] and p['dependencies']==second['dependencies']
    assert p['planBaselines']==second['planBaselines'] and p['decisions']==second['decisions']
    assert p['startDate']==second['startDate'] and p['dueDate']==second['dueDate']
    c=p['changes'][-1]
    assert c['status']=='proposed' and not c.get('planAppliedAt')
    assert REASON in c['description']
    assert c['planAmendments']==[{'kind':'dates','before':{'startDate':'2026-11-23','dueDate':'2026-11-29'},'after':{'startDate':'2026-11-26','dueDate':'2026-11-29'}}]
    print('ATLAS12_NATIVE_LEVELING_DRAFT_SAVE_PASS',flush=True)
    click('Открыть заявку Вариант А 1')
    d.wait_text('Предложения и утверждённые изменения',35)
    click('Решение')
    d.window_title_contains('Форма: Решение:',25)
    v.set_editor_text('Почему принято это решение?','The owner confirms the planned second start date.')
    v.find_control('Применить к черновику',types={'Button'},scroll=True).click_input()
    v.await_no_form()
    assert d.head()==drafted
    click('Применить утверждённый план')
    keyboard.send_keys('{ENTER}')
    d.wait_text('План изменён в черновике.',35)
    assert d.head()==drafted
    native.click_named('Сохранить','Button')
    committed=v.await_saved(drafted)
    applied=base.stored_project(committed,second['id'])
    assert applied['startDate']=='2026-11-26' and applied['dueDate']=='2026-11-29'
    assert applied['items']==second['items'] and applied['planBaselines']==second['planBaselines']
    assert applied['dependencies']==second['dependencies']
    assert applied['changes'][-1]['status']=='approved' and applied['changes'][-1]['planAppliedAt']
    assert any(x.get('kind')=='plan_application' and x.get('changeId')==c['id'] for x in applied['decisions'])
    assert base.stored_project(committed,first['id'])==first
    assert committed['root']['resources']==saved['root']['resources']
    d.stop()
    launch()
    assert d.head()==committed and base.stored_project(committed,second['id'])==applied
    native.click_named('Портфель','Button')
    click('Подобрать план по ресурсу')
    find('По известным срокам перегрузки и выходы за доступность не обнаружены.',contains=True)
    v.capture('atlas-resource-leveling-cold-restore-820')
    print('ATLAS12_NATIVE_LEVELING_APPROVE_APPLY_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_LEVELING_HOLD '+repr(error),flush=True)
        try:v.capture('atlas-resource-leveling-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
