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

## Инженерное продолжение 16 ноября: отображение Result и единый dist

**Кодовая редакция:** `80649d15fc718138b454bb136588806b52dee2bd`.

### Подтверждённый Result непосредственно в исходной работе

- `src/atlas-t3-confirmed-projection.mjs` проверяет, что подтверждённые оригинальным D6 `operationId` и `resultRef` действительно описывают конкретный сохранённый `Decision` выбранного Project/WorkRef. Это UI-проекция, не самостоятельная проверка подписи, прав или Exchange.
- После `Получить Result` и `Проверить Result` вызывается только исходное `atlas_open`. Успешный ответ T3 сверяется с `atlasT3RecordedWorkLinks` в сохранённой новой редакции. Если совпадение есть, экран обновляется сразу, без второго применения или обязательного ручного «Перечитать».
- Черновик не подменяется. Неизменность текущего React snapshot, отсутствие несохранённых изменений и закрытые формы проверяются перед и после native readback. При утрате квитанции или несогласованной редакции сообщение требует проверки оригинального D6, а не повторной отправки.
- Тест реального исходного модуля `createTrustedNativeContinuation` дополнительно связывает результат с оригинальным Atlas Decision через новую проекцию после двух холодных `recover`. Дополнительных native Commit нет.

### Модуль установленного Host в одном дистрибутиве

Обнаруженный блокер: ранее `mountInstalledAtlasT3Surface` присутствовал в исходниках, но не являлся гарантированным экспортом финального `dist`. Простого наличия исходного файла недостаточно для установки.

В `desktop/vite.config.ts` добавлены два входа одной сборки: `index.html` автономного Atlas и `src/atlas-react-surface.tsx` как отдельно импортируемый оригинальным T3 owner модуль. Для второго входа сохранены публичные ES-экспорты через `preserveEntrySignatures: "strict"`, выходная карта `.vite/manifest.json` и единый `frontendDist = ../dist`.

Результат проверки финальных файлов, а не исходного текста:

`ATLAS09_ONE_DIST_SIGNED_HOST_PASS`, compiled `installedT3Host` около 78 КБ с доступным `mountInstalledAtlasT3Surface`. Автономный `index.html` не запускает signed Host самостоятельно. Врезка в оригинальный Host выполняется только с реальными установленными Agent, Exchange, Atlas Authority и T3. Ещё один T3 Core, подписант или служба не созданы.

Исправлен резервный загрузочный экран: он показывает `IWXA Atlas 0.9.0 (разработка)`, а не устаревший `0.5.0-dev.1`.

### Фактическая квалификация

[Source + original D6 + single-dist CI №43775526359](https://github.com/Faust-S/Atlas/actions/runs/43775526359):
**691/691 Node PASS**, оригинальный T3 D6 **1/1 PASS**, независимая `.iwxa`, Center, TypeScript/Vite и реальный compiled `dist` **PASS**. Совпадение исходного blob оригинального D6 (`6846f1431fd2a00b1c67c481528f88527021825f`) проверено на `knowledge@7d6747b4`, qualified G4 candidate `99f3c533` и свежей ветке T3. Переписывать D6 для согласования байтов не требуется.

[Предшествующая нативная Windows-приёмка №43774441069](https://github.com/Faust-S/Atlas/actions/runs/43774441069)
**SUCCESS** на `a1d3c749`: оригинальный Tauri/Setup Core, native Rust readback, установленный WebView2, сохранение большого проекта и холодный перезапуск. Для нового общего `dist` выполняется самостоятельный [Windows CI №43775526302](https://github.com/Faust-S/Atlas/actions/runs/43775526302); пока он не завершён, его результат не засчитывать.

**Ограничение installed T3:** оригинальный принятый Result по-прежнему должен быть доступен через реальный Agent 0.6 `selectAcceptedForWork/readAccepted` с подписанной исходной квитанцией Exchange для `iwxa.atlas`. Передача между двумя установленными продуктами не принимается по результатам только source CI или самостоятельной установки Atlas. Приватные Actions не запускать. Стабильный `release/0.8` не менять.

## Актуализация оригинального D6 38ab0099 и границы установленной приёмки

16 ноября 2026 года. Исходный получатель Atlas обновлён для нормативного
`knowledge@38ab0099104d6d17bb650b0d7b1aba9ede00fa65`.
См. адресной контракт: [ATLAS_0_9_D6_NATIVE_OWNER_ACCEPTANCE_2026_11_16_RU.md](./ATLAS_0_9_D6_NATIVE_OWNER_ACCEPTANCE_2026_11_16_RU.md).

- Реальный trusted `verifyAtlasWrite` с `allowed:false` и точным
  binding `operationId/recipientId/Project/WorkRef/revision` возвращает
  исходный `ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED` с
  `outcome:"DENIED"`. Чужое/неполное разрешение и обычные IPC ошибки
  никогда не маркируются `DENIED`.
- Original Exchange с явным связанным отказом также возвращает
  определённый отказ; отсутствие подписи/квитанции остаётся
  неподтверждённым. Отказ D1 или Atlas Authority не может исчезнуть
  при закрытии установленного Host.
- Неизвестный результат `atlas_commit`, потеря ACK и нативный CAS
  не предполагают гарантированный отказ и не разрешают повторный
  `receive`. Используется original D6 `recover` и исходное
  native readback.
- Двухэтапное подключение оригинального T3 получило **два**
  публичных экспорта из одного `dist`:
  `createInstalledAtlasT3NativeRecipient` и
  `mountInstalledAtlasT3Surface`.
  Standalone 0.9 без исходного владельца Agent/T3 работает
  самостоятельно, не подделывая принятие Result.

Подтверждённая исходная квалификация:
[GitHub Actions #43927362179](https://github.com/Faust-S/Atlas/actions/runs/43927362179),
`697/697 Node PASS`, оригинальный T3 D6 `1/1 PASS`, оригинальный
Center, `.iwxa`, TypeScript, Vite и единый compiled `dist`.
Нативная Windows квалификация того же кодового HEAD:
[Actions #43927362150](https://github.com/Faust-S/Atlas/actions/runs/43927362150).
Результат Windows не присваивать до завершения реальной проверки.

**Оставшийся внешний блокер:** на проверенной общей Agent 0.6 линии
есть локальный экспорт и ручная текстовая T3 проекция, но отсутствует
подтверждённый установленный подписанный `selectAcceptedForWork`,
`readAccepted` и original Exchange `readReceipt` для
`recipientId:"iwxa.atlas"`. Их точные входы и ожидаемые ответы
зафиксированы в документе выше. Atlas не подменяет эти порты
тестовыми ответами в пользовательском маршруте.
`ATLAS_T3_INSTALLED_AGENT_EXCHANGE=HOLD` до настоящего signed Result
и двух холодных чтений установленного получателя.

## Продолжение Atlas 0.9: настоящий U05 command owner, Agent D6 и cold native Decision

Текущая инженерная линия уточнила **реальные**, а не только типовые
границы подлинной интеграции:

- `desktop/src/atlas-t3-store-port.mjs` отличает явное `false`
  исходного `authorizeCommand("atlas_open"/"atlas_commit")`
  от отсутствующего разрешения и транспортной ошибки.
  Только исходный утвердительный отказ получает `outcome:"DENIED"`;
  CAS-конфликт, потерянный ACK и неопределённый IPC результат
  никогда не помечаются как определённый отказ.
- `desktop/src/atlas-t3-installed-host.mjs` перестал превращать
  исходное `undefined` в `false`. Право проверяется **ровно
  один раз**, уже в штатном нативном порту.
- `desktop/src/atlas-t3-original-agent-exchange.mjs`
  экспортирует `createOriginalAgentExchangeReceiptPort`: это
  адаптер существующего
  `InstalledOriginalAgentResultOwner.readOriginalExchangeReceipt`,
  **не новый Exchange** и не синтетическая квитанция. Явная
  исходная проверка адаптера через `createAtlasT3NativeRecipient`
  охватывает `inspect/receive/receipt/readback` и два независимых
  холодных чтения на исходной модели Atlas.
- Оригинальный `desktop/src-tauri/src/lib.rs` получил
  `d6_result_decision_is_durable_across_two_cold_native_opens_with_cas`.
  Это нативная Windows квалификация файла Decision в настоящем
  U05 Store, а не заявление, что тестовая запись является
  подписанным результатом Agent.
- Нормативный D6 `knowledge@38ab0099` остаётся единственным
  маршрутом `preview`, отдельного `continueSelected` и
  `recover`. Никаких вторых Kernel, signer, Task Engine,
  Reconciliation, Store, Host, HTTP service и формата `.iwxa`
  не появилось.

**Исходная приёмка на `5ca07416`:**
[Actions №43937211776](https://github.com/Faust-S/Atlas/actions/runs/43937211776)
— 709/709 Node PASS, оригинальный D6 PASS, TypeScript, Vite,
совместимость Center и собранный единый `dist` PASS.
**Windows:** [№43937211767](https://github.com/Faust-S/Atlas/actions/runs/43937211767)
— квалифицируется отдельно, не считать PASS без финального
результата установленной Windows-проверки.

В параллельной Agent ветке
`work/2026-11-16-agent06-original-t3-result-owner-d6` уже есть
`currentContext/findTask/issueTask/readTask/selectAcceptedForWork/
readAccepted/readOriginalExchangeReceipt`. Их реализация зависит от
всё ещё отсутствующего **установленного оригинального T3
Kernel/Exchange Publisher** с `publishAccepted`/оригинальным
signed `iwxa.atlas` receipt. Наличие Agent source-кода
не равно готовности подписанного установленного обмена. Atlas
оставляет `INSTALLED_AGENT_T3_ATLAS=HOLD` до настоящего E2E.
