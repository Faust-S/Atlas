# IWXA Atlas 0.2.1 — кандидат исправления фирменного оформления

Исходный публичный продукт: `Faust-S/Atlas@e5cc6ff593aa12eec3da8e8940ad5af5819b66fd` (выпущенный `v0.2.0`).

Этот patch-кандидат **не изменяет** `release/0.2`, аннотированный тег `v0.2.0`, исходный EXE, `main` или `release/0.1`. Никаких изменений архитектуры, импорта, сохранения, CPM, графов, GUI-сценариев и пользовательских данных.

## Состав исправления
- Общий знак Personal Agent: геометрия `I/X` та же, что в `desktop/public/favicon.svg` Agent; фирменная подложка Atlas — синяя `#3F96ED`, цвет монограммы `#05070D`.
- Единый знак в `desktop/public/atlas-mark.svg`, в интерфейсе React (включая fallback), в favicon и многомасштабном `desktop/src-tauri/icons/icon.ico`.
- Tauri/NSIS и Windows EXE используют один `icon.ico`; версия кандидата `0.2.1` отличает новую сборку от опубликованного `0.2.0`.
- Node-тест сверяет брендинг, ICO и версию, отдельный workflow проверяет frontend, Rust/Windows NSIS и установленный GUI.

## Критерии
- P01: Node/Vite PASS, тест синего брендирования PASS;
- P02: Rust lib + NSIS Windows build PASS;
- P03: установленный EXE запускается, значок EXE подтверждён, сохранение/перезапуск не регрессировали;
- P04: `v0.2.0` и SHA256 остаются неизменными.

До P01–P04 статус: **PATCH CANDIDATE / RELEASE HOLD**. Никакой выпуск без решения владельца.

## На 0.3, не в патче
Импорт/экспорт `.iwxa`, T2 Host/Workspace, adapters Personal Agent, Admin Center/T3, синхронизация и корпоративные источники относятся к отдельному плану Atlas 0.3.
