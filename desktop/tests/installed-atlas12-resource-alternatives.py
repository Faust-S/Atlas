"""Atlas 0.12 installed Windows comparison of existing planning resources.

Original .iwxa import, native Store, Tauri and WebView2 accessibility only.
No browser automation, alternate scheduler, Task Engine or test-only IPC.
"""
import importlib.util
import json
import os
import sys
import time
import zipfile
from pathlib import Path

import win32gui
from pywinauto import mouse

sys.stdout.reconfigure(encoding='utf-8',errors='replace')
source=Path(__file__).with_name('installed-atlas11-v6-design.py')
spec=importlib.util.spec_from_file_location('atlas12_ui_driver',source)
native=importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
v=native.v
d=native.d
ARCHIVE=Path(os.environ['ATLAS12_RESOURCE_ALTERNATIVES_IWXA'])


def check_archive():
    assert ARCHIVE.is_file() and ARCHIVE.suffix.lower()=='.iwxa'
    with zipfile.ZipFile(ARCHIVE) as archive:
        assert json.loads(archive.read('manifest.json'))['format']=='iwxa.package'
        snapshot=json.loads(archive.read('content/objects.ndjson'))['data']['snapshot']
    assert len(snapshot['projects'])==1 and len(snapshot['resources'])==4
    assert len(snapshot['projects'][0]['items'])==4
    assert snapshot['projects'][0]['items'][0]['resourceId']==snapshot['projects'][0]['items'][1]['resourceId']
    return snapshot


def find_resource_control(name,role=None,contains=False):
    """Locate a real accessible control in the actual compact client area.
    No fixed sidebar width: at 820px the collapsed rail is much narrower.
    Keep physical clicks and search both directions using the real viewport.
    """
    def match(e):
        shown=''.join(str(e.window_text() or '').split())
        wanted=''.join(name.split())
        return wanted in shown if contains else shown==wanted
    def bounds():
        left,top=win32gui.ClientToScreen(d.handle,(0,0))
        _,_,width,height=win32gui.GetClientRect(d.handle)
        return left,top,left+width,top+height
    def find():
        left,top,right,bottom=bounds()
        try:
            controls=d.window().descendants(control_type=role) if role else d.window().descendants()
            for e in controls:
                if not match(e) or not e.is_visible() or not e.is_enabled():continue
                r=e.rectangle()
                if (r.left>=left+4 and r.right<=right-4 and
                    r.top>=top+64 and r.bottom<=bottom-8 and r.width()>0 and r.height()>0):
                    return e
        except KeyError:
            pass
        return None
    d.activate()
    found=find()
    if found is not None:return found
    left,top,right,bottom=bounds()
    point=(left+int((right-left)*.66),top+int((bottom-top)*.80))
    # Start from the top, then scroll in small increments rather than skipping
    # a button between two viewport positions.
    mouse.scroll(coords=point,wheel_dist=40)
    time.sleep(.35)
    until=time.monotonic()+35
    while time.monotonic()<until:
        found=find()
        if found is not None:return found
        mouse.scroll(coords=point,wheel_dist=-1)
        time.sleep(.25)
    v.capture('atlas12-resource-control-not-visible')
    raise AssertionError('Resource control not physically reachable: '+name)

def click_scrollable_button(name):
    control=find_resource_control(name,'Button')
    control.click_input()
    time.sleep(.35)

def reveal_resource_text(name,button):
    # Use the physical viewport when possible; the status must exist in the
    # real UIA tree, not merely in a source file or a test-only label.
    find_resource_control(button,'Button')
    d.wait_text(name,35)


def qualify():
    original=check_archive()
    # Identify the exact Work from the imported .iwxa, never from a
    # hardcoded test-only name or the order of native UIA descendants.
    first_work=original['projects'][0]['items'][0]['title']
    assert first_work,'The first Work must have a title'
    previous=v.saved_head_or_none()
    assert previous and len(previous['projects'])==2
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
    assert d.head()==previous,'Resource import preview must not write to Native Store'
    native.click_named('Заменить портфель в черновике','Button')
    assert d.head()==previous,'Resource import approval must not bypass Save'
    native.click_named('Сохранить','Button')
    saved=v.await_saved(previous)
    assert len(saved['projects'])==1
    assert saved['root']['resources']==original['resources']
    print('ATLAS12_NATIVE_RESOURCE_IWXA_IMPORT_PASS',flush=True)
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
    assert d.head()==saved,'Resource plan lost after cold restart'
    native.click_named('Ресурсы','Button')
    d.wait_text('Плановые ресурсы',35)
    d.wait_text('Кран',35)
    # First assignment uses exactly the same editor, not a second resource store.
    click_scrollable_button('Рассмотреть назначение работ без ресурса')
    d.wait_text('Варианты ресурсного назначения: Без привязки к ресурсу',35)
    click_scrollable_button('Показать все варианты (4)')
    click_scrollable_button('Рассмотреть ресурс Подъёмник')
    loose_work=original['projects'][0]['items'][3]['title']
    click_scrollable_button('Открыть Work для изменения ресурса '+loose_work)
    d.wait_text('Предложение из сравнения: Без привязки к ресурсу → Подъёмник.',35)
    assert d.head()==saved,'First assignment preview wrote to Native Store'
    v.capture('atlas12-resource-first-assignment-820')
    print('ATLAS12_NATIVE_FIRST_RESOURCE_ASSIGNMENT_PASS',flush=True)
    # Close the uncommitted form by a cold restart; the original saved
    # resource assignments must remain unchanged.
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
    assert d.head()==saved
    native.click_named('Ресурсы','Button')
    d.wait_text('Плановые ресурсы',35)
    click_scrollable_button('Сравнить варианты ресурса Кран')
    d.wait_text('Варианты ресурсного назначения: Кран',35)
    # Bring the comparison's result and Work action above the lower edge.
    mouse.scroll(coords=(520,530),wheel_dist=-3)
    d.wait_text('Изменение дней перегрузки: -3. Вне доступности: 0. Сроки Work по CPM не изменятся.',35)
    work_action='Открыть Work для изменения ресурса '+first_work
    d.wait_text(work_action,35)
    assert d.head()==saved,'Comparison modified Native Store without explicit Save'
    v.capture('atlas12-resource-alternatives-820')
    print('ATLAS12_NATIVE_RESOURCE_OPTIONS_READ_ONLY_PASS',flush=True)
    find_resource_control('Work: расчётный финиш 2026-11-26; контрольная дата 2026-11-24. Превышение: 2 дн.',contains=True)
    find_resource_control('Проект: расчётный финиш 2026-11-26; контрольная дата 2026-11-25. Превышение: 1 дн.',contains=True)
    v.capture('atlas12-resource-control-dates-820')
    click_scrollable_button('Показать периоды конфликтов')
    find_resource_control('Перегрузка: 2026-11-23 по 2026-11-25. Нагрузка 130%, мощность 100%.',contains=True)
    d.wait_text('Разгрузка материала',35)
    d.wait_text('Подготовка монтажа',35)
    assert d.head()==saved,'Conflict explanation wrote to Native Store'
    v.capture('atlas12-resource-conflict-period-820')
    print('ATLAS12_NATIVE_RESOURCE_CONFLICT_PERIOD_PASS',flush=True)
    click_scrollable_button('Скрыть периоды конфликтов')
    click_scrollable_button('Показать все варианты (3)')
    find_resource_control('Новый конфликт: Резервный кран, перегрузка 3 дн.',contains=True)
    assert d.head()==saved,'Showing several comparisons wrote to Native Store'
    click_scrollable_button('Рассмотреть ресурс Резервный кран')
    reveal_resource_text('Изменение дней перегрузки: 0. Вне доступности: 0. Сроки Work по CPM не изменятся.',work_action)
    assert d.head()==saved,'Choosing a tradeoff wrote to Native Store'
    v.capture('atlas12-resource-multiple-tradeoff-820')
    click_scrollable_button('Показать периоды конфликтов')
    click_scrollable_button('После: Резервный кран')
    find_resource_control('Перегрузка: 2026-11-23 по 2026-11-25. Нагрузка 140%, мощность 100%.',contains=True)
    d.wait_text('Подача оборудования',35)
    assert d.head()==saved,'Projected conflict explanation wrote to Native Store'
    v.capture('atlas12-resource-transferred-period-820')
    print('ATLAS12_NATIVE_TRANSFERRED_CONFLICT_PERIOD_PASS',flush=True)
    click_scrollable_button('Скрыть периоды конфликтов')
    click_scrollable_button('Рассмотреть ресурс Подъёмник')
    reveal_resource_text('Изменение дней перегрузки: -3. Вне доступности: 0. Сроки Work по CPM не изменятся.',work_action)
    assert d.head()==saved,'Restoring the preferred option wrote to Native Store'
    print('ATLAS12_NATIVE_MULTIPLE_OPTIONS_TRADEOFF_PASS',flush=True)
    click_scrollable_button('Скрыть все варианты')
    # The user must reach the ordinary Work editor; the resource comparison
    # itself cannot execute an assignment or write to Native Store.
    click_scrollable_button(work_action)
    d.wait_text('Изменение данных',35)
    d.wait_text('Работа: '+first_work,35)
    d.wait_text('Плановый ресурс',35)
    d.wait_text('Предложение из сравнения: Кран → Подъёмник.',35)
    assert d.head()==saved,'Opening Work editor wrote to Native Store'
    v.capture('atlas12-resource-alternatives-work-editor-820')
    print('ATLAS12_NATIVE_RESOURCE_TO_WORK_EDITOR_PASS',flush=True)
    # Verify a full real sequence edit, from comparison to the same native
    # dependency form, explicit draft application, Save and cold restore.
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
    assert d.head()==saved
    native.click_named('Ресурсы','Button')
    d.wait_text('Плановые ресурсы',35)
    click_scrollable_button('Сравнить варианты ресурса Кран')
    click_scrollable_button('Показать периоды конфликтов')
    project_name=original['projects'][0]['name']
    second_work=original['projects'][0]['items'][1]['title']
    click_scrollable_button('Выбрать для порядка '+project_name+': '+first_work)
    click_scrollable_button('Выбрать для порядка '+project_name+': '+second_work)
    click_scrollable_button('Сравнить порядок двух работ')
    first_order=first_work+' → '+second_work
    second_order=second_work+' → '+first_work
    expected='. Перегрузка портфеля: 3 → 0 дн. Финиш проекта: 2026-11-26 → 2026-11-29.'
    find_resource_control('Порядок: '+first_order+expected,contains=True)
    find_resource_control('Порядок: '+second_order+expected,contains=True)
    assert d.head()==saved,'Sequence comparison wrote to Native Store'
    v.capture('atlas12-resource-sequence-options-820')
    print('ATLAS12_NATIVE_SEQUENCE_ALTERNATIVES_PASS',flush=True)
    click_scrollable_button('Открыть порядок '+first_order)
    d.wait_text('Предшествующая работа для: '+second_work,35)
    d.wait_text('Предложенный порядок: '+first_order+'.',35)
    assert d.head()==saved,'Opening dependency form wrote to Native Store'
    v.capture('atlas12-resource-sequence-form-820')
    v.find_control('Применить к черновику',types={'Button'},scroll=True).click_input()
    v.await_no_form()
    assert d.head()==saved,'Applying a dependency draft bypassed Save'
    native.click_named('Сохранить','Button')
    committed=v.await_saved(saved)
    persisted=d.saved_project(committed)
    first_id=original['projects'][0]['items'][0]['id']
    second_id=original['projects'][0]['items'][1]['id']
    assert persisted['dependencies']==[{'from':first_id,'to':second_id}]
    assert persisted['items']==original['projects'][0]['items'],'Sequence edit changed Work data'
    assert committed['root']['resources']==saved['root']['resources']
    d.stop()
    d.launch()
    win32gui.MoveWindow(d.handle,0,0,820,650,True)
    d.activate()
    d.wait_text('Настроить дашборд',45)
    assert d.head()==committed,'Selected dependency was lost after restart'
    assert d.saved_project(committed)['dependencies']==[{'from':first_id,'to':second_id}]
    print('ATLAS12_NATIVE_SEQUENCE_SAVE_COLD_RESTORE_PASS',flush=True)

if __name__=='__main__':
    try:
        qualify()
    except Exception as error:
        print('ATLAS12_NATIVE_RESOURCE_OPTIONS_HOLD '+repr(error),flush=True)
        try:v.capture('atlas12-resource-options-failure-820')
        except Exception:pass
        raise
    finally:
        d.stop()
