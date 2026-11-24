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


def click_scrollable_button(name):
    """Use the existing real viewport helper, searching both scroll directions."""
    control=v.find_control(name,types={'Button'},scroll=True)
    d.activate()
    control.click_input()
    time.sleep(.35)

def reveal_resource_text(name,button):
    # Bring an adjacent real button into the physical viewport first.
    # This permits UIA to expose the status text of an initially offscreen block.
    v.find_control(button,types={'Button'},scroll=True)
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
    reveal_resource_text('Контрольные сроки и ресурсные ограничения','Показать все варианты (3)')
    d.wait_text('Work: расчётный финиш 2026-11-26; контрольная дата 2026-11-24.',35)
    v.capture('atlas12-resource-control-dates-820')
    click_scrollable_button('Показать все варианты (3)')
    reveal_resource_text('Новый конфликт: Резервный кран','Рассмотреть ресурс Резервный кран')
    assert d.head()==saved,'Showing several comparisons wrote to Native Store'
    click_scrollable_button('Рассмотреть ресурс Резервный кран')
    reveal_resource_text('Изменение дней перегрузки: 0. Вне доступности: 0. Сроки Work по CPM не изменятся.',work_action)
    assert d.head()==saved,'Choosing a tradeoff wrote to Native Store'
    v.capture('atlas12-resource-multiple-tradeoff-820')
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
