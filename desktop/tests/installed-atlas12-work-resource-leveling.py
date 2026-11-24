"""Installed Atlas Work reserve leveling on an independently imported IWXA.
Physical Windows UIA, ordinary proposal, human approval, explicit Native
Store Save, and cold readback. No DOM, test-only IPC or injected Store data.
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
spec=importlib.util.spec_from_file_location('atlas_work_leveling_driver',source)
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
native,v,d,click,find=base.native,base.v,base.d,base.click,base.find
ARCHIVE=Path(os.environ['ATLAS12_WORK_LEVELING_IWXA'])
REASON='Move the second mounting job inside its existing reserve.'

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
    project=original['projects'][0]
    assert project['name']=='Сборка заказов' and len(project['items'])==4
    a,b=project['items'][:2]
    assert a['title']=='Монтаж А' and b['title']=='Монтаж Б'
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
    native.click_named('Портфель','Button')
    click('Подобрать план по ресурсу')
    click('Перенос отдельных работ')
    click('Добавить работу для выравнивания')
    click('Добавить работу для выравнивания')
    click('Рассчитать переносы работ')
    find('Вариантов выравнивания: 2. Проверено комбинаций: 16 из 16.',contains=True)
    find('Перегрузка выбранного ресурса: 2 → 0 дн.',contains=True)
    find('Монтаж Б · +2 дн.',contains=True)
    find('Начало не ранее: 2026-11-25; резерв: 3 → 1 дн.',contains=True)
    find('Перегрузка выбранного ресурса: 2 → 1 дн.',contains=True)
    assert d.head()==saved,'Work leveling comparison wrote to Native Store'
    fill('Обоснование выравнивания ресурсов',REASON)
    v.capture('atlas-work-leveling-comparison-820')
    click('Подготовить заявки: Сократить ограничения в пределах резервов')
    d.wait_text('Заявки на выравнивание подготовлены в черновике.',35)
    assert d.head()==saved
    find('Вариант А · 1 из 4 проектов',contains=True)
    native.click_named('Сохранить','Button')
    drafted=v.await_saved(saved)
    p=base.stored_project(drafted,project['id'])
    assert p['items']==project['items'] and p['dependencies']==project['dependencies']
    assert p['planBaselines']==project['planBaselines'] and p['decisions']==project['decisions']
    assert p['startDate']==project['startDate'] and p['dueDate']==project['dueDate']
    c=p['changes'][-1]
    assert c['status']=='proposed' and not c.get('planAppliedAt')
    assert REASON in c['description'] and len(c['planAmendments'])==1
    action=c['planAmendments'][0]
    assert action['kind']=='work' and action['itemId']==b['id']
    assert action['before']['notBeforeDate'] is None and action['after']['notBeforeDate']=='2026-11-25'
    assert action['levelingGuard']=={'resourceId':original['resources'][0]['id'],'sourceStart':'2026-11-23','maxDelay':3,'preserveDeadlines':True}
    for k in ('estimateDays','assignee','dueDate','resourceId','allocationPct'):
        assert action['before'][k]==action['after'][k]
    print('ATLAS12_NATIVE_WORK_LEVELING_DRAFT_SAVE_PASS',flush=True)
    click('Открыть заявку Вариант А 1')
    d.wait_text('Предложения и утверждённые изменения',35)
    click('Решение')
    d.window_title_contains('Форма: Решение:',25)
    v.set_editor_text('Почему принято это решение?','The owner confirms the reserve of the second mounting job.')
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
    expected[1]['notBeforeDate']='2026-11-25'
    assert applied['items']==expected
    assert applied['startDate']==project['startDate'] and applied['dueDate']==project['dueDate']
    assert applied['planBaselines']==project['planBaselines'] and applied['dependencies']==project['dependencies']
    assert applied['changes'][-1]['status']=='approved' and applied['changes'][-1]['planAppliedAt']
    assert any(x.get('kind')=='plan_application' and x.get('changeId')==c['id'] for x in applied['decisions'])
    assert committed['root']['resources']==saved['root']['resources']
    d.stop()
    launch()
    assert d.head()==committed and base.stored_project(committed,project['id'])==applied
    native.click_named('Портфель','Button')
    click('Подобрать план по ресурсу')
    find('По известным срокам перегрузки и выходы за доступность не обнаружены.',contains=True)
    v.capture('atlas-work-leveling-cold-restore-820')
    print('ATLAS12_NATIVE_WORK_LEVELING_APPROVE_APPLY_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_WORK_LEVELING_HOLD '+repr(error),flush=True)
        try:v.capture('atlas-work-leveling-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
