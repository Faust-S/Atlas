# IWXA Atlas 0.9: единый T3 и продолжение проектной разработки

Дата начала: 16 ноября 2026 года.
Рабочая ветка: `work/2026-11-16-atlas-0-9-t3`.
База кода: `Faust-S/Atlas@cd9e4500edea93e18a2fa496fae81c0c23bbd232`, развитие выпущенной `release/0.8@6ef7b8fa`.
Выпущенная 0.8.0 остаётся поддерживаемой контрольной сборкой. Исторический каталог `docs/ATLAS_0_8_*` фиксирует исходные решения, но **не** определяет имя текущей версии.

## Назначение 0.9

Довести пользовательский маршрут Atlas: выбрать работу, поручить действительному Personal Agent, получить Human-accepted Result по оригинальному WorkRef через оригинальный T3 D6, увидеть сохранённый Decision, безопасно восстановить квитанцию после прерывания, продолжить проект.

У Atlas остаются собственные Project/Work, зависимости, сроки, сохранение и визуализация. Новые Kernel/Store/Task Engine/Exchange/IAM/подписант/формат `.iwxa` не создаются. Используются существующие U05/U03/U04 и штатные владельцы T3, Agent и Center.

## Исполняемая версия

0.9.0-dev.1 согласована в Tauri, Rust, npm/Cargo lock, Setup Core и Windows CI.
Продукт `iwxa.atlas`, приложение `ru.iwxa.atlas` и `atlas-store-v1` сохраняются: обновление не создаёт новый несвязанный профиль данных.
Строка заголовка сообщает `0.9.0 (разработка)`. Установщик кандидата `IWXA-Atlas-0.9.0-dev.1-Setup.exe` может выпускаться **только как CI-артефакт**, не как стабильный GitHub Release.
Исходный релиз 0.8.0, его установщик, подписи и дата приёмки не меняются.

## Связь с оригинальным T3 и установленным Agent

- `createInstalledAtlasT3NativeRecipient` подключается к действительному нативному Tauri `atlas_open/atlas_commit` и оригинальному Agent/Exchange/Atlas Authority; читает/записывает через существующий Atlas Store CAS.
- Один оригинальный T3 `createWorkspaceHostRuntime` получает этого native recipient как `nativeContinuationOwner` вместе с настоящим D1 signed grant, оригинальным Kernel и Human consent. Сам Atlas не выполняет подпись.
- `createAtlasT3OriginalSourceSelection` выбирает у настоящего Agent только принятую запись по точному WorkRef. Перед `continueSelected` подписанный D6 должен подтвердить получателя `iwxa.atlas`.
- `createInstalledAtlasT3Host` передаёт UI уже авторизованные порты. Установленный Host и оригинальный U05 Store не должны дважды запрашивать одну и ту же одноразовую авторизацию: `invokeAtlasHost` и `createAtlasT3DesktopStorePort` являются авторизующими входами, низкоуровневый нативный invoke только вызывает Tauri после них. Предварительное чтение текущего native head проходит отдельную явную проверку.
- `mountInstalledAtlasT3Surface` монтирует прежний `AtlasWorkspace`. В standalone 0.9 без оригинальных Agent/T3 владельцев кнопки поручения/получения отсутствуют.

## Контроль испытаний

1. Source: Node, TypeScript, Vite, оригинальный T3 D6 в public knowledge, исходный Center, независимая проверка `.iwxa`.
2. Windows: оригинальные Tauri и Setup Core; установка, сохранение портфеля, повторная правка, холодный запуск; скриншоты реального UI. Новая отдельная `.github/workflows/atlas-0-9-windows.yml` запускается только для ветки 0.9.
3. Product: настоящий Agent Task → Result → Human Review → подписанный оригинальный T3 Exchange `.iwxa` → `iwxa.atlas` → исходный native Decision → два независимых холодных чтения.
4. Отказы: чужой WorkRef, смена получателя/Workspace, отозванный D1 grant, потеря ACK, неясный исход, конкурентная запись, отсутствие установленного Agent, пустой Result. Никакого повторного Apply после непроверенного ACK.

## Граница приёмки

`SOURCE_PASS` не равно `INSTALLED_AGENT_T3_ATLAS_PASS`.
Даже успешная Windows-установка самого Atlas 0.9 **не** доказывает межпрограммную передачу Agent/Exchange; её требуется подтвердить отдельно на настоящих установленных владельцах.

По состоянию начала версии отсутствует проверенный installed signed `selectAcceptedForWork/readAccepted` Agent 0.6 и исходная квитанция его Exchange, привязанная к получателю `iwxa.atlas`. Не объявлять эти порты готовыми на основании тестовых ответов в Atlas. Главный следующий шаг — подключить их именно у оригинальных владельцев без переноса приватных подписантов в публичный Atlas.

**Статус**: Atlas 0.9 = DEVELOPMENT; 0.8.0 = STABLE; T3 D6 installed multi-product acceptance = HOLD до предметной приёмки.
