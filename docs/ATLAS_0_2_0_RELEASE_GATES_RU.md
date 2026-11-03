# IWXA Atlas Desktop 0.2.0 — неизменяемая матрица выпуска

Версия: `0.2.0`. Допустим только полный PASS G01–G12 на одном commit/TREE. Последний подтверждённый базовый Windows маршрут: [№41718532650](https://github.com/Faust-S/Atlas/actions/runs/41718532650), HEAD `e2ce13216c587ce8c170539b7ce5c9a448ad9f28`. Этот результат **не распространяется автоматически** на последующие SHA.

| Gate | Критерий | Проверка | До финальной квалификации |
|---|---|---|---|
| G01 | Node, TypeScript/Vite, Rust | frontend + native-windows, Node/Rust logs | PASS на №41718532650 |
| G02 | NSIS EXE собирается и устанавливается | Windows install step | PASS на №41718532650 |
| G03 | Настоящий Atlas работает без сервера и Agent | installed Tauri/WebView2 native open | PASS на №41718532650 |
| G04 | Проект, работы, зависимости и редактирование | installed GUI keyboard | PASS базового маршрута, полная UX-приёмка HOLD |
| G05 | Сохранение → native readback → exit → restart | installed GUI | PASS на №41718532650 |
| G06 | Настоящий архив 0.1 через GUI | frozen source export + installed GUI/readback | PASS на №41718532650 |
| G07 | Внешняя резервная JSON-копия через GUI | native file picker, JSON readback, IDs and work/dependencies, unchanged head | PASS на №41718532650 |
| G08 | История редакций и восстановление через GUI, restart | installed history/restore | PASS на №41718532650 |
| G09 | CPM, Gantt/DAG, взаимодействия и графы | Node CPM + installed GUI evidence | Отображение PASS, полное взаимодействие HOLD |
| G10 | 120 проектов, 1 200 работ, 300+40 зависимостей | native R5 + GUI import/restart | PASS на №41718532650 |
| G11 | Сквозной маршрут источник/SHA → review → решение → proposal → approve → apply → CPM → restart | Node integrated + установленный GUI | Node PASS, GUI HOLD |
| G12 | Финальная версия, exact SHA/TREE, NSIS, SHA-256, тег, ветка, релиз | Git refs + SHA256SUMS + GitHub Release | HOLD до финального прогона |

Финальные критерии: все обязательные gates PASS на идентичном commit, журнал PASS не заменяется текстом из исходников. Отрицательный тест или непройденный GUI = HOLD. Скриншоты для Gantt/DAG прилагаются к Windows Actions и подлежат визуальной проверке. Исторические отчёты сохраняются. Функции 0.3 не являются release gates 0.2.

## Что готово для Windows пользователя

Установленный Atlas хранит проекты только в `%LOCALAPPDATA%\\ru.iwxa.atlas\\atlas-store-v1`; не требует обязательного сервера или Agent. Ручное сохранение, импорт существующего `atlas.project/1` JSON 0.1, резервная копия, выбор исторической редакции и восстановление работают в ранее квалифицированном Windows GUI. GitHub API для публичных источников требует подключения к сети и сам по себе не подтверждает выполненную работу.

## Фиксация выпуска

После полного PASS на неизменном HEAD release workflow должен создать `release/0.2`, аннотированный `v0.2.0`, SHA256SUMS, GitHub Release и загрузить **именно тот NSIS EXE**, который прошёл Windows gate. Ни tag, ни release нельзя перезаписывать на другой SHA. Точная ревизия, размер, контрольная сумма и ссылки фиксируются опубликованным релизом, не заранее.
