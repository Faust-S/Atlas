# IWXA Atlas 0.2.0 — финальный релиз и передача в новый чат

**Дата:** 04.11.2026. **Назначение:** контроль за уже выпущенной 0.2.0; новая функциональность разрешена только в отдельной версии 0.3.

## 1. Закрытая версия — нельзя переписывать

- GitHub: `Faust-S/Atlas` (публичный).
- Релизная ветка: `release/0.2` → `e5cc6ff593aa12eec3da8e8940ad5af5819b66fd`.
- Аннотированный тег: `v0.2.0` (Git tag object `7977814197e05a1ec41e1dc1d71db3eb4933c432`, commit → `e5cc6ff593aa12eec3da8e8940ad5af5819b66fd`).
- Git TREE: `3a0abd7972bc2d3ac974f9b06b05a9705b49d477`.
- Рабочая ветка завершённой 0.2: `work/2026-11-02-atlas-desktop-0.2` → тот же release commit.
- GitHub Release: https://github.com/Faust-S/Atlas/releases/tag/v0.2.0
- Не изменены: `release/0.1` → `addee450b8d80f8fad1fcb9af8e8d13dc1824151`; `main` → `35c43e6ae5622185a72224cdf08a2a206cc04896`; приватный `Faust-S/IWXA-Atlas`.
- Репозиторий этой передачи: `work/2026-11-04-atlas-0-2-postrelease`, документация и техническое исправление *метаданных релиза*, не продуктового дерева. Коммиты этой ветки **не входят в 0.2.0**.

## 2. Публикация Windows

- Установщик NSIS x64: https://github.com/Faust-S/Atlas/releases/download/v0.2.0/IWXA.Atlas_0.2.0_x64-setup.exe
- Реальное имя GitHub asset: `IWXA.Atlas_0.2.0_x64-setup.exe`, размер: **2 110 822 байта**.
- SHA-256: `e8a95178866ba9c6f8b0753f2c3e29e6ea59a73eda6baf467cefb0c5d9eb2ce5` (проверен также непосредственно по NSIS из final Windows Actions ZIP).
- Граница: Windows Tauri 2/Rust/WebView2 + React/TypeScript, локальная работа без сервера и Personal Agent.
- Single source of truth для Desktop: `%LOCALAPPDATA%\ru.iwxa.atlas\atlas-store-v1`. Данные сохраняются командой пользователя; `.json` `atlas.project/1` поддерживает 0.1 импорт и резервные копии.
- Версии согласованы: desktop/package.json, Tauri, Cargo = 0.2.0.

## 3. Единая финальная квалификация

- GitHub Actions: https://github.com/Faust-S/Atlas/actions/runs/41731528096 — **SUCCESS**, запуск непосредственно на релизном HEAD.
- G01: Node 200/200; TypeScript/Vite production DOM PASS; Rust 11/11 PASS.
- G02–G05: NSIS build/install, запуск установленного Windows WebView2, ввод проекта/работ/зависимостей; native readback, корректный выход Alt+F4, restart PASS.
- G06: подлинный JSON 0.1 из замороженного `release/0.1` через установленный GUI, импорт, сохранение/restart PASS.
- G07: внешний backup через системный Save As, JSON прочитан, проектные IDs, работы/зависимости, native store unchanged PASS.
- G08: GUI история реальных поколений, выбор и восстановление, проверка сохранности предыдущей редакции, полный restart PASS.
- G09: существующие CPM/Gantt/DAG, окна и визуальные снимки, разворачивание/сворачивание Escape, отсутствие изменения native store от навигации PASS. Отдельная исчерпывающая ручная проверка всех комбинаций поиска/редактирования на Windows не выполнялась; не расширять утверждение о доказанном.
- G10: native R5 120 проектов/1 200 работ/300 внутрипроектных и 40 межпроектных связей; 200 фактов, 100 решений, 20 правок; установленный GUI import/restart PASS.
- G11: на установленном EXE полный маршрут Git SHA change → recheck → решение человека → proposal → amended work draft → approve → отдельно apply → native save/readback → полный restart PASS (`ATLAS_INSTALLED_G11_GUI_RESTART_PASS`).
- G12: автоматический job `publish-0-2-0` **SUCCESS** создал release/0.2, annotated v0.2.0, выпустил именно проверенный EXE и SHA256SUMS.
- Windows визуальные доказательства (11 PNG): Actions artifact `iwxa-atlas-installed-gantt-dag`, ID `13278177700` на том же run.
- Честные времена для R5 GUI: preview `24 203 мс` включая Windows picker, full import `28 984 мс` включая GUI/dialog, startup after restart `2 360 мс` на hosted runner. Это не чистое React- или Rust-время.

## 4. Исправления, подтверждённые до релиза

- Короткий Windows-путь `RUNNER~1` передавался pywinauto как специальный Enter; test driver стал использовать `RUNNER_TEMP`. Экспорт самого Rust был корректен.
- File dialog выбирался по классу `#32770` без проверки заголовка и мог схватить `System Properties`; исправлен поиск точного `Открыть архив Atlas JSON` или `Сохранить резервную копию Atlas JSON`.
- HTML input type=number в WebView2 UIA показывается как Spinner, а не Edit; тестовый драйвер распознаёт Spinner/SpinButton.
- Устаревшее число вызовов подтверждения импорта в Node-тесте обновлено с 3 до 4; headless smoke timeout 35→65 секунд для runner.
- Реальная пользовательская логика сохранения/истории/approval/CPM не дублировалась и не переписывалась ради тестов.

## 5. Малая послерелизная правка дистрибуции

- При загрузке NSIS через `gh release create` GitHub нормализовал пробел в имени asset в точку; `SHA256SUMS.txt` при этом содержал первоначальное имя с пробелом. **Хэш и байты EXE верные**, но `sha256sum -c` на скачанном имени неудобен.
- В этой отдельной ветке подготовлен одноразовый job `repair-release-asset-name` в **существующем** workflow. Его задача — поправить только текст SHA256SUMS и имя EXE в описании Release; проверить commit/tag и SHA-256, не изменять скачиваемый EXE и `release/0.2`.
- При миграции ОБЯЗАТЕЛЬНО проверить конкретный job и опубликованный `SHA256SUMS.txt` (текущий файл на момент подготовки требует исправления). При PASS зафиксировать URL Actions и статус без новых продуктовых изменений.

## 6. Запрещённое и следующий цикл

- **0.2.0 закрыт.** Не двигать `release/0.2`, тег `v0.2.0` и не изменять установщик в выпущенном GitHub Release. `main` и `release/0.1` не трогать.
- Не добавлять в 0.2 новую архитектуру, защитные механизмы, второй Task Engine/Agent, хранилища, синхронизацию, Admin Center/T3, новый графовый/CPM движок.
- На 0.3 вынесены: синхронизация устройств/многопользовательский режим через будущие общие механизмы, защищённые источники/корпоративный адаптер Admin Center/T3, опциональные расширения UX и производительности только после исследований.
- Отдельная независимая пользовательская проверка на реальном Windows-ПК допустима как финальная инспекция без вмешательства в frozen code; для неё Codex лишь при недоступности собственных средств.
- Следующий новый чат начинать с **подтверждения релиза 0.2.0**, затем только по отдельной воле владельца проектировать 0.3 в новой ветке. Не перезапускать развитие 0.2.

## 7. Ссылки на основные материалы

- [Release G01–G12](https://github.com/Faust-S/Atlas/blob/release/0.2/docs/ATLAS_0_2_0_RELEASE_GATES_RU.md)
- [Windows инструктаж](https://github.com/Faust-S/Atlas/blob/release/0.2/desktop/README.md)
- [Release notes](https://github.com/Faust-S/Atlas/blob/release/0.2/docs/ATLAS_0_2_0_RELEASE_NOTES_RU.md)
- [Историческая инженерная передача](https://github.com/Faust-S/Atlas/blob/release/0.2/docs/HANDOFF_ATLAS_0_2_DESKTOP_2026-11-03_RU.md)

**Итог выпуска:** `ATLAS_0_2_RELEASE = PASS` на HEAD `e5cc6ff593aa12eec3da8e8940ad5af5819b66fd`. Послерелизная правка текста контрольной суммы не меняет статус установленного продукта.
