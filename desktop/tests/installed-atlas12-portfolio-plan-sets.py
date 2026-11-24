"""Installed Atlas coordinated plans: original IWXA and real native UIA.
Both alternatives are calculated against the saved portfolio. One selected
proposal needs an ordinary human decision, then all three are applied to
one draft and saved through the original Native Store.
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
spec=importlib.util.spec_from_file_location('atlas_portfolio_plan_set_driver',source)
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
native,v,d,click,find=base.native,base.v,base.d,base.click,base.find
ARCHIVE=Path(os.environ['ATLAS12_PORTFOLIO_PLAN_SETS_IWXA'])
TITLES=['Ускорить монтаж А и использовать подъёмник','Ускорить монтаж Б','Перенести независимый заказ на площадку']
REASON='Three orders coordinated; separate mounting area confirmed.'

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
    assert len(original['projects'])==4
    members=[]
    for title in TITLES:
        p=next(p for p in original['projects'] if any(c['title']==title for c in p['changes']))
        c=next(c for c in p['changes'] if c['title']==title)
        members.append((p,c))
    untouched=next(p for p in original['projects'] if p['id'] not in {p['id'] for p,c in members})
    assert [c['status'] for p,c in members]==['approved','approved','proposed']
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
    for p in original['projects']:
        assert base.stored_project(saved,p['id'])==p
    d.stop()
    launch()
    assert d.head()==saved
    native.click_named('Портфель','Button')
    click('Сравнить планы портфеля')
    # The fixture preserves portfolio insertion order; each pick defaults
    # to the next unused project and its first ordinary proposal.
    for _ in range(2):
        click('Добавить заявку Вариант А')
    for _ in range(3):
        click('Добавить заявку Вариант Б')
    click('Рассчитать планы портфеля')
    find('Рассчитано вариантов портфеля: 2 из 2',contains=True)
    find('Единая база сравнения: 4 из 4',contains=True)
    find('Работ с конфликтами ресурсов: 2 → 2',contains=True)
    find('Работ с конфликтами ресурсов: 2 → 0',contains=True)
    find('Для совместного применения сначала отдельно утвердите все заявки.',contains=True)
    assert d.head()==saved
    v.capture('atlas-portfolio-plan-set-comparison-820')
    print('ATLAS12_NATIVE_PORTFOLIO_COMPARISON_READONLY_PASS',flush=True)
    click('Открыть Вариант Б: '+members[2][0]['name'])
    d.wait_text('Предложения и утверждённые изменения',35)
    click('Решение')
    d.window_title_contains('Форма: Решение:',25)
    v.set_editor_text('Почему принято это решение?','Separate mounting area confirmed by owner')
    v.find_control('Применить к черновику',types={'Button'},scroll=True).click_input()
    v.await_no_form()
    assert d.head()==saved
    native.click_named('Сохранить','Button')
    approved=v.await_saved(saved)
    third=base.stored_project(approved,members[2][0]['id'])
    assert third['changes'][0]['status']=='approved' and not third['changes'][0].get('planAppliedAt')
    assert third['items']==members[2][0]['items']
    for p,c in members[:2]:
        assert base.stored_project(approved,p['id'])==p
    click('К согласованному плану')
    find('Вариант А · 2 из 4 проектов',contains=True)
    find('Вариант Б · 3 из 4 проектов',contains=True)
    click('Рассчитать планы портфеля')
    find('Рассчитано вариантов портфеля: 2 из 2',contains=True)
    fill('Обоснование согласованного плана',REASON)
    click('Применить согласованный Вариант Б')
    keyboard.send_keys('{ENTER}')
    d.wait_text('Согласованный план применён в черновике.',35)
    assert d.head()==approved,'Coordinated plan bypassed explicit Save'
    native.click_named('Сохранить','Button')
    committed=v.await_saved(approved)
    records=[]
    for p,c in members:
        result=base.stored_project(committed,p['id'])
        expected=json.loads(json.dumps(p['items']))
        for action in c['planAmendments']:
            assert action['kind']=='work'
            next(w for w in expected if w['id']==action['itemId']).update(action['after'])
        assert result['items']==expected and result['planBaselines']==p['planBaselines']
        assert result['dueDate']==p['dueDate'] and result['dependencies']==p['dependencies']
        applied=next(x for x in result['changes'] if x['id']==c['id'])
        assert applied['status']=='approved' and applied['planAppliedAt']
        record=result['decisions'][-1]
        assert record['kind']=='plan_application' and record['changeId']==c['id']
        assert record['at']==applied['planAppliedAt'] and REASON in record['text']
        records.append(record)
    assert all(r['coordination']==records[0]['coordination'] for r in records)
    assert len({r['at'] for r in records})==1
    assert len(records[0]['coordination']['members'])==3
    assert {m['projectId'] for m in records[0]['coordination']['members']}=={p['id'] for p,c in members}
    assert base.stored_project(committed,untouched['id'])==untouched
    assert committed['root']['resources']==approved['root']['resources']
    print('ATLAS12_NATIVE_PORTFOLIO_COORDINATED_SAVE_PASS',flush=True)
    d.stop()
    launch()
    assert d.head()==committed
    for p,c in members:
        assert base.stored_project(committed,p['id'])['decisions'][-1]['coordination']==records[0]['coordination']
    native.click_named('Портфель','Button')
    click('Сравнить планы портфеля')
    find('История совместных применений (1)',contains=True).click_input()
    find('записей доступно: 3 из 3',contains=True)
    assert d.head()==committed
    v.capture('atlas-portfolio-coordination-history-820')
    print('ATLAS12_NATIVE_PORTFOLIO_COORDINATED_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_PORTFOLIO_PLAN_SET_HOLD '+repr(error),flush=True)
        try:v.capture('atlas-portfolio-plan-set-failure-820')
        except Exception:pass
        raise
    finally:d.stop()
