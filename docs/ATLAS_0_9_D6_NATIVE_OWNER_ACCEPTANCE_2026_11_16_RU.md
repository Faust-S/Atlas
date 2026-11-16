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

## Следующее уточнение: штатный U05 command owner и настоящий Agent D6 candidate

При пересборке Atlas 0.9 установленный порт
`desktop/src/atlas-t3-store-port.mjs` теперь различает:

- **`false`** от оригинального `atlasAuthority.authorizeCommand("atlas_commit",args)`
  до входа в Tauri: `{code:"ATLAS_T3_U05_WRITE_DENIED", outcome:"DENIED"}`.
- **`undefined`/`null`/неверный тип** исходного решения: отказ
  от команды без достоверного `outcome:"DENIED"`.
- **исключение после разрешения** из оригинального
  `atlasNativeInvoke("atlas_commit",args)`: код/ошибка Tauri не переписывается.
  Потеря ACK и конфликт CAS не доказывают отсутствие записи.
- Аналогично для `atlas_open`: только точное `false` даёт
  `ATLAS_T3_U05_READ_DENIED` c `outcome:"DENIED"`.

Оба производственных входа в
`desktop/src/atlas-t3-installed-host.mjs` сохраняют исходный
трёхзначный результат авторизации, не превращая отсутствие ответа в
`false`. Исходный D6 получает его из того же оригинального native
Store; дополнительных command gates/Store не создаётся.

Новое исходное испытание
`tests/atlas09-native-command-authority.test.mjs`
проверяет explicit denial, malformed decision, потерянное native ACK
и CAS без переотправки. Квалификация оригинального D6
`tests/atlas-t3-original-d6-qualification.mjs`
дополнена сценарием отказа непосредственно до `atlas_commit`.

### Параллельная исходная ветка Agent 0.6

Проверена существующая ветка
`Faust-S/iwxa-personal-agent@work/2026-11-16-agent06-original-t3-result-owner-d6`,
известный HEAD `a05145f48da70623c76a50d7d9e2090e5479305b`.

В ней **уже реализован** `runtime/t3_original_result_owner.py`:
`InstalledOriginalAgentResultOwner.currentContext/findTask/issueTask/readTask/selectAcceptedForWork/readAccepted/readOriginalExchangeReceipt`,
с проверкой оригинальных Task/Result/Human Review.
Не следует больше утверждать, что соответствующие методы Agent не существуют
вообще. Однако этот кандидат ещё **не** объединён с общей Agent 0.6,
а исходный подписанный T3 publisher/Kernel/Exchange owner не установлен:
`T3_AGENT_INSTALLED_ORIGINAL_KERNEL_EXCHANGE_OWNER_REQUIRED`.
Поэтому исходный код Agent не является доказательством передачи между
установленными Agent и Atlas.

Agent `readOriginalExchangeReceipt(request)` уже отвечает исходному
требуемому `originalExchange.readReceipt(request)` на уровне формы данных.
Доверенная композиция вправе подключить именно этот существующий
делегирующий оригинальному T3 порт, но не выдавать локальный архив
`iwxa.personal-agent.task-result` за подписанную квитанцию.

Точный оставшийся внешний контракт владельца T3:
`publishAccepted(...recipientId:"iwxa.atlas", originalOperationId)`,
`readPublished(operationId)`,
`read_published_for`, `read_published`, `read_receipt`,
`read_latest_for_work`, с original signed D1, оригинальными
Kernel Object/Event, Exchange и readback. Никакой новой реализации
этих механизмов в Atlas. С учётом отдельного разрешения
`package.export` для `iwxa.atlas` существующий T3 владелец
должен подключить их в установленный Host.

Отрицательное условие финальной приёмки остаётся обязательным:
**только** нативный установленный Atlas и исходный T3 D6
не подтверждают наличие настоящего подписанного Agent Result.

## Явное подключение существующего Agent Exchange к установленному Atlas

В `desktop/src/atlas-t3-original-agent-exchange.mjs` добавлен
`createOriginalAgentExchangeReceiptPort(originalAgent)`.

Это **не новый Exchange**. Он вызывает только уже существующий
`InstalledOriginalAgentResultOwner.readOriginalExchangeReceipt(request)`
из `work/2026-11-16-agent06-original-t3-result-owner-d6` и возвращает
исходный ответ без реконструкции подписи, архива или статуса.
`outcome:"DENIED"` и исходный код при исключении остаются неизменными.
Иные адресаты не допускаются. Если оригинальный Agent не подключён,
адаптер отказывает, никаких статических VERIFIED-квитанций нет.

Доверенная композиция уже существующего установленного T3 Host:

```js
const originalExchange=createOriginalAgentExchangeReceiptPort(originalAgent);
const nativeContinuationOwner=await createInstalledAtlasT3NativeRecipient({
  originalAgent,originalExchange,atlasAuthority,hostLifecycle
});
// ONLY the ORIGINAL T3 createWorkspaceHostRuntime accepts the owner:
// nativeContinuationOwner, signedKernelAccess, confirmNativeContinuation.
// The same installed trusted Host obtains handle.nativeContinuation
// and passes it to mountInstalledAtlasT3Surface.
```

`createOriginalAgentExchangeReceiptPort`,
`createInstalledAtlasT3NativeRecipient` и
`mountInstalledAtlasT3Surface` экспортируются одним скомпилированным
`installedT3Host` из существующего `dist`.
Без настоящего оригинального T3 Publisher владельца, оригинальной
Employee signature/Kernel Object и `iwxa.atlas` Exchange receipt
подпись не создаётся и действие Result остаётся недоступным.

Степень готовности: интерфейс типов и нативный адаптер Atlas готовы к
подключению параллельной Agent D6 ветки. Не считаются готовыми
установленный original Kernel/Exchange Publisher, зарегистрированный
signed `package.export` для Atlas и независимая Windows-передача
Agent Result → Atlas Decision → два холодных запуска.

## 17 ноября 2026: самостоятельное действие публикации Agent Result

У оригинального Agent 0.6 теперь существуют два отдельных метода,
реализованных в изолированной
`work/2026-11-16-agent06-original-t3-result-owner-d6`:

- `publishAcceptedForWork({workRef,context,recipientId:"iwxa.atlas",purpose:"atlas.result.publish"})`
  требует **явного** пользовательского действия, проверяет оригинальный
  Task/Result/Human Review и делегирует единственную публикацию штатному
  оригинальному T3 Publisher с отдельным разрешением и согласованием;
- `recoverPublicationForWork` с теми же полями только читает
  оригинальные `operationId`/Kernel/Exchange receipt, не подписывает,
  не запускает повторный `publish_accepted` и не создаёт Task.

Atlas 0.9 принял этот контракт без нового Core или Host.

`desktop/src/atlas-t3-original-publication.mjs` предоставляет оригинальным
портам `publishSelected` и `recoverSelected` на основе
**только сохранённого** Atlas WorkRef и текущего контекста Agent.
Сначала используется существующий `createAtlasSavedRef`, штатное
`authorizeAtlasProjectRead`, `readSaved` и повторная проверка поколения.
Публикация не получает исходный `.iwxa`, Task ID, digest или
ссылку Result из интерфейса. Все поля принадлежат оригинальному Agent.
Подтверждение `OWNER_READBACK_CONFIRMED` принимается только после
повторного `readAccepted` и исходного
`originalExchange.readReceipt` с полным совпадением
`workRef,taskId,resultId,sourceObjectRef,acceptedDigest,archiveSha256,
recipientId`. Исходные права и криптографические подписи проверяют
оригинальные владельцы, а не Atlas.

`createAtlasT3OriginalHostPorts` подключает оба метода к тому же
оригинальному `readSaved`/Atlas Authority.
`createInstalledAtlasT3Host` экспортирует в `t3` пару
`publishSelectedResult/recoverSelectedPublication` **только** если
подключённый установленный Agent действительно имеет
`publishAcceptedForWork/recoverPublicationForWork`. Старый Agent,
автономный Atlas и отсутствующий подписант не получают фиктивные
действия.

В таблице работ появляется компактное меню «Публикация»:
«Опубликовать Result» → «Проверить публикацию», а затем независимо
«Получить Result» (оригинальный D6) → «Проверить Result».
Это два разных момента с собственными правами и квитанциями.
`OUTCOME_UNKNOWN` от публикации никогда не приводит к повторной
отправке. Проверка публикации всегда вызывает оригинальный
`recoverPublicationForWork`, не `publishAcceptedForWork`.

**Регрессионные испытания:**
`tests/atlas09-original-publication.test.mjs` проверяет привязку
к текущей работе, отдельность публикации/D6, повторное чтение,
потерю ACK, `DENIED`, подмену workRef, пустые права и CAS-конкуренцию.
Исходный прогон
[Actions №43966749225](https://github.com/Faust-S/Atlas/actions/runs/43966749225)
**715/715 Node PASS**, original D6, TypeScript/Vite, compiled `dist`
**PASS**.

**Критически важно:** это интеграция портов существующего Agent, не
доказательство работающей подписи T3. Оригинальный установленный
`read_publication/publish_accepted` с действительным Kernel Object/Event,
подписанным Exchange на адресата `iwxa.atlas` и оригинальным журналом
ещё не подключён. До его подключения пользовательская публикация
завершится подлинным отказом исходного владельца; Atlas не
подменяет его фикстурой. `INSTALLED_AGENT_T3_ATLAS=HOLD`.

## Граница реального установленного подключения после разработки публикации

**Два независимых внешних условия пока не подтверждены**:

1. **Исполняемый оригинальный T3 Publisher.** Оригинальный trusted
   `original_t3_source_owner` Agent должен реально реализовать
   `read_publication/publish_accepted` и
   `read_published_for/read_published/read_receipt/read_latest_for_work`
   с корпоративным подписантом, JIT-правами, Kernel Object/Event,
   оригинальным `.iwxa` и отдельным адресатом `iwxa.atlas`.
   Наличие реализованных в Agent исходных методов не заменяет эти
   оригинальные криптографические/нативные действия.
2. **Подлинная установленная композиция.** В `Atlas` существует
   `createInstalledAtlasT3NativeRecipient` и
   `createInstalledAtlasT3Host`, в едином `dist` экспортированы
   оригинальные адаптеры, но не предъявлен установленный Host,
   одновременно предоставляющий **настоящие** подписанные
   `originalAgent`, `handle.nativeContinuation`,
   `atlasAuthority` и `hostLifecycle` в **том же Atlas
   Tauri AppHandle**. Это не URL, JSON-ответ, окно другого приложения
   или неавторизованный браузерный мост. Нужно использовать уже
   существующий первоначальный T3 Host и доступные механизмы
   доверенной связи приложений, не создавать новый сервер или Store.

Два условия должны быть проверены в **одном** реальном установленном
сценарии: Task/Result в Agent 0.6 → Human Review →
оригинальная подписанная публикация `iwxa.atlas` →
оригинальный D6 native receive → Atlas `atlas_commit` →
два независимых cold `atlas_open` с тем же
`operationId/resultRef/taskId/resultId`, без второго native Apply.
До этого `INSTALLED_AGENT_T3_ATLAS=HOLD`.

Последнее исходное испытание:
[Actions №43968095067](https://github.com/Faust-S/Atlas/actions/runs/43968095067),
**723/723 Node PASS** (включая shutdown во время вторичного
Agent/Exchange readback), compiled T3 Host, TypeScript/Vite,
original D6 PASS. Windows установленного Atlas квалифицируется
отдельно: [№43968095063](https://github.com/Faust-S/Atlas/actions/runs/43968095063).
