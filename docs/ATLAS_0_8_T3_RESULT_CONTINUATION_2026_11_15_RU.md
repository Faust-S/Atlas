# IWXA Atlas 0.8 / единый T3: предметный маршрут Project/WorkRef -> Task -> Result

Дата: 15 ноября 2026 года.
Статус: **SOURCE-INTEGRATION PASS, INSTALLED MULTI-PRODUCT HOLD**.
База: `Faust-S/Atlas@release/0.8` HEAD
`6ef7b8fa1ad58f159508aaa6413d5e0d9cf35dbb`.
Стабильный тег `v0.8.0` и его установщик не менялись.
Разработка: `work/2026-11-15-atlas08-t3-project-work-result`.
Исполняемый оригинальный T3: `Faust-S/knowledge@work/2026-11-10-t3-t2-activity-projection`,
исходная точка `ae7f229d859f88092edce0825c773ecb43902bd3`
(`packages/t3-core/src/t3/native-result-continuation.mjs`).
Нормативный T2 и Runtime Contract 1.3.0 сохраняются.

## Владельцы исходных данных

| Данные или действие | Единственный владелец |
| --- | --- |
| Project, Work, зависимости, ревизия, сохранение и восстановление Atlas | Оригинальная модель Atlas `atlas.project/1` и нативный `atlas_open/atlas_commit` |
| Task/Result/Human Review | Оригинальный установленный IWXA Personal Agent |
| Подписанный доступ к Object, выбранная Workspace, оригинальный Exchange .iwxa и D6 | Единый T3 Host/Kernel из `Faust-S/knowledge` |
| Доступ к проекту Atlas при каждой операции | Оригинальное организационное/личное право, проверяемое установленным Host; не Publisher |
| Лицензия на функцию | Оригинальный проверенный Publisher PERSON / D7; НЕ право читать или менять проект |

В интеграции не появилось второго Project Store, графа зависимостей,
Kernel, IAM, Task Engine, отдельного .iwxa-формата или хранилища квитанций.
T3 Project/Process common owner здесь не используется как источник
истинного Agent Result или полномочий Atlas.

## Реализованная последовательность

1. Взять из **сохранённого**, повторно прочитанного через нативный
   `atlas_open` портфеля точный исходный `{projectId,workId,revision}`;
   запретить грязный черновик, восстановление повреждённой Store и устаревший head.
2. Выполнить отдельную проверку права чтения исходной работы; вызвать
   **только установленного Agent Task owner** и прочитать его сохранённый
   Task с тем же WorkRef. Atlas не создаёт Task.
3. Только через original T3 D6 и **оригинальный подписанный**
   `t1.getObject` выбранного Result прочитать указанную редакцию.
   Установленный Agent подтверждает `HUMAN_ACCEPTED_DRAFT`,
   Task ID, Result ID, WorkRef, digest. Оригинальный Exchange
   независимо проверяет подписанный .iwxa, адресата и SHA-256.
4. Независимая свежая проверка права **изменять именно исходную работу**
   в Atlas. Publisher PERSON entitlement никогда не подменяет grant.
5. Принятый Result создаёт **ссылку в существующем Atlas Decision**,
   сохраняя ID Work и источника. Полученный DRAFT не превращает
   работу в `done` или приёмку выполнения. Изменение идёт через
   `createDecision`, первоначальный `atlas_commit` и native generation CAS.
6. Отдельные native `receipt/readback` читают тот же сохранённый
   Atlas head и вновь сверяют оригинальные Agent Result, Exchange
   и проектное право. После потери ACK повторный `atlas_commit`
   не выполняется; оригинальный T3 D6 допускает только recovery.
   После холодного открытия повторно используется квитанция
   из существующего `project.decisions`, не вторая Store.

Реализованные файлы:
- `src/atlas-t3-native-recipient.mjs`: проверка оригинальных refs,
  полномочий, idempotency, запись действующим `createDecision`.
- `desktop/src/atlas-t3-store-port.mjs`: **штатные**
  `atlas_open/atlas_commit`; ни нового Tauri command, ни журнала.
- `desktop/src/atlas-t3-original-host-ports.mjs`: одна композиция
  существующего native Atlas Store и обязательных оригинальных
  Agent/T3 доверенных owner ports.
- `tests/atlas-t3-native-recipient.test.mjs`,
  `tests/atlas-t3-host-ports.test.mjs`: проверки исходной модели,
  CAS, запрета повтора, подделанной квитанции и отзывов доступа.
- `tests/atlas-t3-original-d6-qualification.mjs`: **импортирует
  без копирования оригинальный D6** из точного `Faust-S/knowledge`
  и исполняет маршрут с оригинальными функциями Atlas. External
  Kernel/Agent/Exchange и native Tauri IPC в этом source CI
  представлены явными тестовыми owner doubles.

Границы: доступ к T3 Object / Result всегда подписанный в настоящем
Host. В Node-проверке имитируются ответы независимых owner ports; это
не эквивалент настоящего установленного Agent или подписанного
`.iwxa` из Agent. Допустимость локального адресата, статус
Publisher PERSON и право доступа к чужому Workspace нельзя
выводить из наличия модуля или лицензии.

## Обязательные отказы

- Несовпадение идентификаторов Project, Work, Task или Result,
  ревизии Atlas либо оригинального T3 Object: отказ без записи.
- Изменённая native generation: `atlas_commit` отклоняет
  конкурентную запись; в неизвестном исходе читается квитанция.
- Не принятый человекoм Agent Result, неподписанный/неверный
  Exchange, чужой получатель и отсутствие Atlas JIT-grant: отказ.
- Повторная доставка и потеря ACK: один сохранённый Decision,
  затем только оригинальная квитанция и два холодных readback.
- Повреждённый или поддельный Decision с префиксом
  `T3_RESULT_LINK/1`: блокировка повторной доставки и проверка
  исходного Result/Exchange вместо доверия текстовой записи.
- Лицензия Publisher PERSON даёт функцию, но не меняет ответ
  `ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED`.

## Отдельный незакрытый продуктовый маршрут

**INSTALLED MULTI-PRODUCT HOLD**. Сейчас `Agent@work/2026-11-15-agent-0-6-development`
показывает выборочный текстовый Result handoff, но он сам явно
обозначен **не подписанным .iwxa**. Текущая проверка original D6
исполняется с owner doubles, а не с реально установленным
Agent, оригинальной issuer-подписью и Exchange получателя.
Нельзя присваивать `T3_READY` или `Atlas_T3_INSTALLED_ACCEPTED`.

Следующее практическое действие строго на соответствующем owner:
включить оригинальный подписанный Task (с исходным WorkRef)
и подтверждённый Result в **установленном Agent**, выполнить
original Exchange `.iwxa` и signed D1/T3 D6 с получателем
`iwxa.atlas`, связать T3 Host с уже существующим
`atlas_open/atlas_commit` native портом. Затем пройти
два установленных Windows-приложения, Human Review, отдельное
применение, конкурентную редакцию, потерянный ACK и двойное
холодное чтение реального Atlas Store.

Пока указанного оригинального Agent/Exchange owner порта нет,
Atlas не показывает пользователю кнопку, ложно выдающую
незавершённую интеграцию за рабочую. Стабильная 0.8.0
продолжает работать самостоятельно.

## Контроль исходников

Оригинальный T3 D6 закреплён в GitHub workflow
`.github/workflows/manual-check.yml` в отдельном публичном
checkout, без приватных T3/Agent Actions или скопированного Kernel.
Квалификация настоящего Kernel/Agent/Exchange требует отдельной
установленной продуктовой приёмки. Обновлять версию T3 можно
только после свежего HEAD/TREE и проверки его оригинального
контракта, не путать обновление T3 с созданием второго ядра.


## Проверка точного исходного кода (15 ноября)

[GitHub Actions №43752714150](https://github.com/Faust-S/Atlas/actions/runs/43752714150)
завершился **SUCCESS** на точном кодовом HEAD
`4c516e3b8cb71e2418c56fe8001d3bd0166a0f6f`:

- 666 из 666 штатных Node-тестов Atlas PASS;
- **отдельная квалификация оригинального T3 D6 — 1/1 PASS**;
- исходный `.iwxa` carrier с Python PASS;
- совместимость оригинальных Atlas Project/WorkRef с Center PASS;
- TypeScript/Vite сборка PASS.

Ранее проверка исходного маршрута на
`b2e4dbe1e5167b5c88db444fea3c762e6b4d5986` также завершилась
SUCCESS: 662/662 Node и original D6 1/1. После этого добавлены
настоящий Tauri `atlas_open/atlas_commit` Host port,
независимая проверка сохранённой квитанции по исходному Agent/Exchange
и запрет ложной квитанции из произвольной `project.decisions` записи.

Свежая ветка `knowledge` при последней сверке:
`6aadb39e65aa45b131cc32a06e0eb5265abf6ad3`.
Blob оригинального T3 D6 **не изменился**:
`4663de464b36c2c30621d1bd616c83bd61a2b0c3`
как на закреплённом `ae7f229d`. Поэтому проверенный контракт
совместим с текущим исходным модулем D6 на этой ревизии.
Обновление всего T3 без полной регрессии не выполнялось.

Важно: CI квалифицирует связку **кода оригинального T3** с
**действующими Atlas-функциями** и явно подставленными ответами
установленных владельцев Agent/Kernel/Exchange. Это не доказательство
реальной подписи пакета, установленной модели Agent,
лицензирования или T3 readiness. `INSTALLED MULTI-PRODUCT=HOLD`.


## Ссылка Result в пользовательском интерфейсе Atlas

Связь с принятым Agent Result теперь видна непосредственно у
соответствующей работы в действующей таблице Atlas (не более двух
последних ссылок; остальные доступны в истории). Имя работы,
зависимости и статус выполнения не переписываются. В «Последних
решениях» и «Истории решений и фактов» отображается короткое понятное
описание вместо встроенного машинного JSON; исходная запись доступна
в раскрываемых технических сведениях. При просмотре интерфейс
**не выдаёт существование записи за действующий signed grant**:
подлинность Result/Exchange и право Atlas повторно проверяются только
в оригинальном Host перед использованием.

Однократный индекс `atlasT3RecordedWorkLinks(project)` строится на
реально сохранённых Decisions по точному `workId`; на большом
проекте список не ищет каждую ссылку повторно для каждой строки.

Итоговая проверка последнего кодового коммита:
[GitHub Actions №43753051638](https://github.com/Faust-S/Atlas/actions/runs/43753051638),
SHA `3c0f4bfecf8930e7a8d62d1f6afe4f1e53f0e25e`.
**668/668 Node PASS**, **original T3 D6 1/1 PASS**,
независимое чтение .iwxa PASS, настоящий Center-контракт PASS,
TypeScript/Vite PASS. Никакая установленная межпрограммная
подпись Agent, импорт original signed Result .iwxa или
подключение на двух компьютерах этой проверкой НЕ подтверждаются.


## Интерактивное продолжение Atlas 0.8, 15.11.2026

**Версионное уточнение:** развиваем ту же серию Atlas **0.8**.
Фиксированный установочный выпуск 0.8.0 не подменяем непроверенной
разработкой, но это не заморозка функциональности. Следующая
полностью квалифицированная сборка серии 0.8 должна включить T3.

**Рабочий код:** HEAD `ff3fac042c3049512135d92f99548a4c6d4bff99`.

1. Выдача original Agent Task теперь требует `findOriginalAgentTask`
   из установленного владельца до попытки создания. Статус
   `PERSISTED` читается повторно и возвращает существующий Task;
   `NOT_FOUND_CONFIRMED` разрешает единственный исходный вызов;
   неизвестный исход, потерянный ACK или отсутствие Task readback
   запрещают слепой повтор. Original Agent отдельно обязан
   обеспечить атомарную дедупликацию по сохранённому WorkRef.
2. `createAtlasT3OriginalHostPorts` поддерживает
   `currentAgentContext` из оригинального доверенного Host,
   а типизированный `t3.issueSelectedWork` подключается к
   штатной поверхности U04. UI не выбирает личность, грант
   или чужую Workspace. Без подключённого Host действие
   «Поручить Agent» не предлагается.
3. Добавлено `readExternalAtlasUpdate`: через прежний
   `atlas_open` читается настоящее поколение native Atlas,
   проверяется ревизия, а грязный локальный черновик или
   незакрытая форма блокируют замену. Команд записи при
   перечитывании нет.
4. В таблице работ появилась команда «Перечитать сохранённое»
   и, только с подключённым original owner, «Поручить Agent».
   Task остаётся у Agent. Сохранённый Result отображается
   рядом с исходной работой; статус выполнения не меняется
   без отдельного решения Atlas.
5. Точные исходные проверки:
   [Actions №43755128848](https://github.com/Faust-S/Atlas/actions/runs/43755128848)
   на `ff3fac042c3049512135d92f99548a4c6d4bff99`,
   **673/673 Atlas Node PASS**, оригинальный T3 D6 **1/1 PASS**,
   совместимость Center PASS, TypeScript/Vite PASS.

**Оставшийся блокер:** оригинальные установленные Agent Task/Result,
подписанный .iwxa Exchange, настоящие signed D1/D6, нативный
атомарный Agent Task lookup/deduplication, два реальных холодных
межпрограммных чтения и реальная квалификация PERSON лицензии.
Тестовые owner ports в CI не означают их установленной готовности.
`Atlas_T3_INSTALLED=HOLD`, `T3_READY=false`.

Новые Project Store, Task Engine, Kernel, граф, IAM, Publisher issuer
или формат .iwxa не создавались. `release/0.8` не изменялась.

## Продолжение 15 ноября: «Получить Result» из исходной работы Atlas

В Atlas 0.8 добавлена дополнительная, строго Host-подключаемая команда
**«Получить Result»** в существующей таблице работ. В автономном
standalone Atlas без original T3 D6 она отсутствует.

Путь для установленного Host:
1. Пользователь выбирает сохранённую работу; Atlas проверяет native
   head/generation и точный Project/WorkRef, не заменяя грязный черновик.
2. Оригинальный Host проверяет право чтения выбранного Project/WorkRef
   и передаёт его original D6. Исходный Agent владеет Task/Result
   и выбирает принятый Result; оригинальный T3 D6 владеет signed
   Kernel read, Human Review и recovery. UI не выбирает ни
   подписанта, ни Workspace, ни необработанный Result.
3. После подтверждения D6 адаптер повторно открывает **оригинальный**
   Atlas Store, сверяет receipt/readback одной Decision, исходный
   Agent Result/Exchange и текущий grant. Поддельная квитанция,
   чужой WorkRef или отсутствие права приводят к отказу.
4. UI предлагает «Перечитать сохранённое», чтобы увидеть Decision
   у исходной работы. Принятый DRAFT не меняет статус Work,
   сроки, зависимости и не означает приёмку выполнения.
5. Отмена, неопределённый исход или операция в процессе не
   инициируют повторную запись. При сомнении нужен штатный
   recovery original D6 и чтение сохранённого Atlas, не retry.

Изменённые файлы:
- `desktop/src/atlas-t3-original-host-ports.mjs`
- `desktop/src/embedded-host.ts`
- `desktop/src/main.tsx`
- `tests/atlas-t3-host-ports.test.mjs`
- `tests/atlas-t3-original-d6-qualification.mjs`
- `tests/atlas-t3-native-recipient.test.mjs`

На текущем этапе доступный original T3 D6 подключён в исходной
квалификации с owner doubles для Agent/Kernel/Exchange/native IPC.
Это **не** установленный signed Result от реального Agent.
Полную версию `0.8.0` не переписывать, а изменения серии 0.8
передавать в очередную сборку только после продуктовой приёмки.

**Релизный статус:** `SOURCE_TEST_PENDING`,
`ATLAS_T3_INSTALLED=HOLD`, `T3_READY=false`.

### Подтверждённая исходная квалификация нового маршрута

[GitHub Actions №43757811052](https://github.com/Faust-S/Atlas/actions/runs/43757811052)
завершился `SUCCESS` на точном кодовом HEAD
`9a36775b6f2b3f6f7ef4904ca4bfe01317c67e9c`.
Штатные Node-тесты **674/674 PASS**; оригинальный
`T3 D6` импортирован из публичного owning checkout и успешно
исполнен **1/1 PASS**; проверка носителя `.iwxa`, исходного
контракта Center, TypeScript и Vite завершились успешно.

**SOURCE-INTEGRATION PASS. INSTALLED MULTI-PRODUCT HOLD.**
В тесте присутствуют явные doubles подписанного Agent/Kernel/Exchange
и native Tauri IPC. Реальная установленная связка и две холодные
Windows-проверки ещё не подтвердили готовность; никакие
`T3_READY` / `ATLAS_T3_INSTALLED_ACCEPTED` не присвоены.
