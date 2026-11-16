# Atlas 0.9: оригинальный T3 D6, отказ владельца и установленный Result

Дата: 16 ноября 2026 года.
Рабочая ветка: `work/2026-11-16-atlas-0-9-t3`.
Нормативный D6: `Faust-S/knowledge@38ab0099104d6d17bb650b0d7b1aba9ede00fa65/packages/t3-core/src/t3/native-result-continuation.mjs`.
Стабильная `release/0.8` остаётся неизменной.

## Результат исправления D6

Atlas является **получателем** оригинального `createTrustedNativeContinuation`. Присутствуют только текущие проектные Project/WorkRef, один исходный U05 Store с CAS-командами `atlas_open` / `atlas_commit` и оригинальный Decision `T3_RESULT_LINK/1`. Новый Kernel, Reconciliation, Store, Task Engine, Host, подписант или формат `.iwxa` не создавались.

`src/atlas-t3-native-recipient.mjs` сообщает `{code, outcome:"DENIED"}` **только** при определённом отказе доверенного владельца до записи:

- штатная `verifyAtlasWrite` дала `allowed:false` **и** вернула точные `operationId`, `recipientId`, `projectId`, `workId`, `revision` текущего запроса;
- оригинальная Exchange вернула связанный с Task/Result/Archive/Recipient явный `status:"DENIED"`;
- исходный получатель отверг неправильного адресата, ссылку Object/Result, операцию или уже проверенную старую редакцию/отсутствующую работу до `atlas_commit`;
- существующий порт авторизации чтения проекта вернул именно `false`.

Код отказа остаётся прежним (например, `ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED`), добавляется только `outcome:"DENIED"`. Отрицательное решение исходного владельца, уже выданное через исключение, **не оборачивается** и не теряется при закрытии installed Host. Если отказ относится не к этой операции/работе/адресату, это НЕ подтверждённый отказ текущего запроса.

Отсутствующие/повреждённые права и квитанции, ошибки транспорта, исключения `atlas_commit`, его CAS-конфликт и потерянный ACK **не** получают признак `DENIED` автоматически. Оригинальный D6 переводит неуточнённую ошибку после возможного native `receive` в `OUTCOME_UNKNOWN`, не отправляет повторный `receive` и требует `recover`. Действительная запись в оригинальном Atlas Decision + независимые native receipt/readback даёт `OWNER_READBACK_CONFIRMED`.

Важно: отказ `readback` после уже возможной записи подтверждает отсутствие текущего доступа, **не отсутствие** сохранённого Decision. Интерфейс не заявляет, что дисковая запись исключена, и не предлагает повторное применение.

## Что предоставляет уже подготовленный Atlas 0.9

- `createInstalledAtlasT3NativeRecipient({originalAgent,originalExchange,atlasAuthority,hostLifecycle})`: открывает оригинальный Tauri Atlas, передаёт разрешённые `atlas_open/atlas_commit` в существующий CAS Store и создаёт оригинального native-получателя `iwxa.atlas`. Требует действующие owner-порты и работающий Atlas AppHandle.
- Оригинальный T3 создаёт `nativeContinuation` через тот же `createWorkspaceHostRuntime` / `createTrustedNativeContinuation`, передавая Atlas recipient как `nativeContinuationOwner` вместе с исходными signed D1, Kernel, Workspace и Human consent. Никакого нового Host.
- Фактические поля original `createWorkspaceHostRuntime(input)` на `knowledge@38ab0099`: `nativeContinuationOwner`, `signedKernelAccess`, `confirmNativeContinuation`. При передаче собственного `nativeContinuationOwner` запрещено одновременно передавать ещё и `nativeContinuationPort`. Вернувшееся `handle.nativeContinuation` должно быть единственным источником `preview/continueSelected/recover` для Atlas.
- Подтверждение `DENIED` проверено на **прямом original D6 Host-порту**, без промежуточной браузерной Control-прокладки. Существующий generic Control HTTP путь `/api/t3/native-d6` может преобразовывать ошибку после `continueSelected` в `OUTCOME_UNKNOWN`, включая исходные определённые отказы. Пока этот внешний путь не квалифицирован отдельно, его нельзя подставлять вместо прямого `handle.nativeContinuation` и заявлять полную сохранность `DENIED` через HTTP.
- `createInstalledAtlasT3Host({originalT3,originalAgent,originalExchange,atlasAuthority,hostLifecycle})`: предоставляет существующему Atlas UI точные команды `issueSelectedWork`, `continueSelectedResult`, `recoverSelectedResult`. Все ответы сверяются с исходным сохранённым Project/WorkRef и оригинальными receipt/readback.
- Один `dist`: установленный T3 owner импортирует `createInstalledAtlasT3NativeRecipient` (регистрация, этап 1), затем `mountInstalledAtlasT3Surface` (интерфейс, этап 2). Обычный standalone не активирует неподключённый T3.
- После подтверждённого Result Atlas перечитывает нативный `atlas_open`, сверяет `operationId`, `resultRef`, `decisionId`, отображает ссылку у исходной работы и не меняет исполнение/зависимости. Ни одно действие не может заменить несохранённый локальный черновик.

## Точная ещё не полученная зависимость от установленного Personal Agent 0.6

Проверенная общая Agent-ветка: `Faust-S/iwxa-personal-agent@work/2026-11-15-agent-0-6-development` (`cd861584c622002af4c3edd55767a5ddde1cc6f5` на момент сверки).

`desktop/src/task-t3-handoff.tsx` вызывает `task_t3_result_projection` и формирует **текст для ручного переноса**, явно не подписанный `.iwxa`.
`runtime/iwxa_exchange.py` содержит экспорт локального носителя, однако возвращает `signed_organizational_transfer:false`, `organizational_signature_verified:false`. Это не является заверенным Exchange для D6. Нельзя заменять эти источники фикстурой в установленном Atlas.

Для настоящего установленного маршрута оригинальный Agent должен предоставить в доверенный Host следующие методы с подтверждёнными данными (не простые JS-объекты, полученные из пользовательского файла):

| Порт оригинального Agent | Вход | Подтверждённый ответ |
| --- | --- | --- |
| `currentContext()` | без параметров | Действующий авторизованный личный контекст владельца |
| `findTask({workRef,context})` | сохранённые `projectId,workId,revision` и контекст | `PERSISTED` с исходным `taskId/projectId/workId/sourceRevision` либо достоверный `NOT_FOUND_CONFIRMED` |
| `issueTask({workRef,context})` | тот же сохранённый WorkRef | Подтверждённый оригинальным Agent `taskId,projectId,workId,sourceRevision`; дедупликация Task принадлежит Agent |
| `readTask(taskId,context)` | оригинальный ID и контекст | `status:"PERSISTED",taskId,projectId,workId,sourceRevision` |
| **`selectAcceptedForWork({projectId,workId,revision?,context,purpose})`** | сохранённый WorkRef и `purpose:"atlas.result.continue"` либо `"atlas.result.recover"` | `acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,workRef,sourceObjectRef:{workspace_id,object_id,schema_id,revision}`; только оригинальная принятая запись |
| **`readAccepted(sourceObjectRef)`** | исходный Object/Result T3 | `acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,workRef,sourceObjectRef,taskId,resultId,acceptedDigest,archiveSha256`; две контрольные суммы SHA-256 |
| **`originalExchange.readReceipt({sourceObjectRef,taskId,resultId,archiveSha256,recipientId:"iwxa.atlas"})`** | точный исходный Result и адресат | Подписанная проверка с `status:"VERIFIED",recipientId,taskId,resultId,archiveSha256` или подлинный авторитетный отказ. Нет квитанции => нет получения Result |

Atlas не имеет права выдавать `selectAcceptedForWork`, `readAccepted`, подписанный `readReceipt` за реализованные на основании текстовой проекции Agent. Это конкретная незакрытая зависимость исходного владельца, не задача создания нового Exchange внутри Atlas.

## Windows-приёмка и границы достоверности

Для `INSTALLED_AGENT_T3_ATLAS_PASS` нужен настоящий Windows Agent 0.6 с подписанным исходным Result и original T3 D6 в том же доверенном контексте Atlas, а не только установленный автономный Atlas.

Пользовательский маршрут:
1. В установленном Atlas 0.9 выбрать исходную работу и сохранить; не менять WorkRef скрыто.
2. В оригинальном установленном Agent создать Task и получить Human Review Accepted Result.
3. Через оригинальный подписанный T3 + Exchange подтвердить `recipientId:"iwxa.atlas"`; отдельно выполнить D6 `preview`, подтверждённое `continueSelected` и original native `atlas_commit`.
4. Прочитать сохранённый Atlas Decision через `atlas_open`, показать исходную WorkRef и квитанцию.
5. Завершить процессы и **дважды независимо** холодно запустить установленный Atlas/T3; после каждого чтения сравнить `operationId, resultRef, taskId, resultId`, поколение/ревизию и отсутствие второй записи.
6. Отрицательные испытания: явный `DENIED` до записи, отсутствие квитанции, потеря ACK до/после `atlas_commit`, конкурентный CAS, чужой WorkRef, отозванная D1-подпись, закрытие Host во время операции. Никакого retry native `receive` до оригинального recover.

Windows CI автономного Atlas проверяет действительный Tauri и Setup Core, большой проект, сохранение и холодное открытие. Успешный такой CI **не** подтверждает пункт 2–5 с Agent. Тесты Node с simulated Agent/Kernel/Exchange остаются исходной квалификацией и не объявляются установленным end-to-end.

**Статус до появления реального signed Agent port:** `ATLAS_09_SOURCE_D6=QUALIFYING`, `ATLAS_NATIVE_WINDOWS=QUALIFYING`, `INSTALLED_AGENT_T3_ATLAS=HOLD`. Стабильная `release/0.8` не изменяется.
