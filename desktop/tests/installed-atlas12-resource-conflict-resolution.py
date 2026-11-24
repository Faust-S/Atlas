"""One installed Atlas decision route from a known resource conflict.
Original IWXA, physical Windows UIA, ordinary proposal and native readback.
No browser automation, Store injection or test-only IPC.
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
spec=importlib.util.spec_from_file_location('atlas_conflict_driver',source)
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
native,v,d,click,find=base.native,base.v,base.d,base.click,base.find
ARCHIVE=Path(os.environ['ATLAS12_CONFLICT_RESOLUTION_IWXA'])
REASON='The owner confirms the available mounting crew can take the first job.'

def launch():
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)

def select_last(name):
    control=find(name,role='ComboBox')
    control.click_input()
    keyboard.send_keys('{END}{ENTER}')
    time.sleep(.35)

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
    project=next(p for p in original['projects'] if p['name']=='Сборка заказов')
    other=next(p for p in original['projects'] if p['id']!=project['id'])
    a,b=project['items'][:2]
    free=next(r for r in original['resources'] if r['label']=='Свободная бригада')
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
    assert base.stored_project(saved,other['id'])==other
    d.stop()
    launch()
    assert d.head()==saved
    native.click_named('Ресурсы','Button')
    click('Устранить конфликт ресурса Монтажный участок')
    d.wait_text('Устранение конфликта: Монтажный участок',35)
    select_last('Вторая конфликтующая работа')
    select_last('Ресурс для устранения конфликта')
    order=find('Сравнить технологический порядок работ',role='CheckBox')
    order.click_input()
    click('Сравнить решения конфликта')
    d.wait_text('Рассчитано решений конфликта: 5; доступны для заявки: 5.',35)
    d.wait_text('Назначение: Назначить Свободная бригада',35)
    d.wait_text('Резерв работ: Сократить ограничения в пределах резервов',35)
    d.wait_text('Порядок: Монтаж А → Монтаж Б',35)
    assert d.head()==saved
    click('Рассмотреть решение: Резерв работ: Сократить ограничения в пределах резервов')
    d.wait_text('Перегрузка выбранного ресурса: 2 → 0 дн.; вне доступности: 0 → 0 дн.',35)
    assert d.head()==saved
    click('Рассмотреть решение: Назначение: Назначить Свободная бригада')
    d.wait_text('Назначение: Монтажный участок → Свободная бригада; конфликт: 2 / 0 → 0 / 0 дн.',35)
    fill('Обоснование решения конфликта',REASON)
    assert d.head()==saved
    v.capture('atlas-conflict-resolution-selection-820')
    click('Подготовить заявки по решению')
    d.wait_text('Заявки по ресурсному конфликту подготовлены в черновике.',35)
    assert d.head()==saved
    native.click_named('Сохранить','Button')
    drafted=v.await_saved(saved)
    p=base.stored_project(drafted,project['id'])
    assert p['items']==project['items'] and p['dependencies']==project['dependencies']
    assert p['planBaselines']==project['planBaselines'] and p['decisions']==project['decisions']
    assert base.stored_project(drafted,other['id'])==other
    proposal=p['changes'][-1]
    assert proposal['status']=='proposed' and not proposal.get('planAppliedAt')
    assert REASON in proposal['description'] and len(proposal['planAmendments'])==1
    action=proposal['planAmendments'][0]
    assert action['kind']=='work' and action['itemId']==a['id']
    assert action['before']['resourceId']==a['resourceId'] and action['after']['resourceId']==free['id']
    for k in ('estimateDays','assignee','dueDate','allocationPct'):
        assert action['before'][k]==action['after'][k]
    print('ATLAS12_NATIVE_CONFLICT_RESOLUTION_DRAFT_SAVE_PASS',flush=True)
    click('Открыть заявку Вариант А 1')
    d.wait_text('Предложения и утверждённые изменения',35)
    click('Решение')
    d.window_title_contains('Форма: Решение:',25)
    v.set_editor_text('Почему принято это решение?','The owner confirms the selected assignment.')
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
    expected[0]['resourceId']=free['id']
    assert applied['items']==expected
    assert applied['startDate']==project['startDate'] and applied['dueDate']==project['dueDate']
    assert applied['planBaselines']==project['planBaselines'] and applied['dependencies']==project['dependencies']
    assert applied['changes'][-1]['status']=='approved' and applied['changes'][-1]['planAppliedAt']
    assert base.stored_project(committed,other['id'])==other
    assert committed['root']['resources']==saved['root']['resources']
    d.stop()
    launch()
    assert d.head()==committed and base.stored_project(committed,project['id'])==applied
    native.click_named('Ресурсы','Button')
    d.wait_text('Плановые ресурсы',35)
    d.wait_text('Монтажный участок',35)
    d.wait_text('Свободная бригада',35)
    assert not any('Устранить конфликт ресурса Монтажный участок'==x.window_text()
        for x in d.window().descendants(control_type='Button'))
    v.capture('atlas-conflict-resolution-cold-restore-820')
    print('ATLAS12_NATIVE_CONFLICT_RESOLUTION_APPROVE_APPLY_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_CONFLICT_RESOLUTION_HOLD '+repr(error),flush=True)
        try:v.capture('atlas-conflict-resolution-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
