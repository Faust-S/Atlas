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
