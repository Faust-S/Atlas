# IWXA Atlas — самостоятельная программа и версии

**0.1 (зафиксированная браузерная основа):** `release/0.1` → `addee450b8d80f8fad1fcb9af8e8d13dc1824151`, проверено 127/127 Node и на трёх ОС через Chromium/IndexedDB. Это не установщик Windows.

**0.2 (рабочая ветка):** `work/2026-11-02-atlas-desktop-0.2`. Настольная реализация Tauri 2 + React 19/TypeScript + Vite в каталоге [desktop/](desktop/README.md), с исходным предметным ядром `src/*.mjs` без копирования его алгоритмов. Нативное хранение, ручное сохранение и readback, формы проекта, фактов, решений и ресурсов — в разработке. **Windows EXE и NSIS-сборка подтверждены; 5/5 тестов нативного хранилища и запуск отдельного Windows-окна PASS ([Actions #41446391609](https://github.com/Faust-S/Atlas/actions/runs/41446391609)). Полный сценарий ввода, сохранения и повторного запуска в реальном WebView2 пока отдельно проверяется. Production release 0.2 — HOLD.**

[Фиксация версии и границы переноса](docs/ATLAS_VERSION_0_1_AND_DESKTOP_0_2_RU.md). Ветка `main` не изменена. Корпоративная интеграция Admin Center/T3 отложена.

---

# Atlas — universal project workspace (public foundation)

## Human plan-review decisions after source rechecks — 2026-11-02

A SHA-pinned human recheck now produces a **read-only portfolio consequence queue**, including the originating project and all transitively dependent projects. Each row shows the newly reported result, previous/current source SHA, outstanding work and existing approved/in-progress changes that may need human consideration. A connected Git revision change does not, by itself, rewrite project status, dates, work, approved changes or source claims.

The user can **keep the existing plan**, **propose a plan change** or **defer** independently for each affected project. Decisions require an explicit reason and are appended to the existing Atlas `project.decisions` history, pinned to the rechecked finding's ID and SHA. A proposal is a normal `project.changes` entry linked to that decision and begins in `proposed` state; approval and work creation continue through the existing human-authorized change workflow. Duplicate active proposals for the same decision are rejected. A changed/new unobserved Git SHA blocks additional decisions until the latest source has been observed and rechecked; earlier decisions remain in history.

All data stays in the existing `atlas.project/1` snapshot, IndexedDB and JSON export/import. The new optional fields are compatible with old snapshots. No second project model, change engine, executor, authority service or corporate connector is introduced. Standalone is still public-source-only; Admin Center/T3 integration stays deferred.



## Human revision recheck workflow — 2026-11-02

The source-revision panel now offers **«Повторно проверить»** for a *latest* source-linked finding when a complete, current GitHub repository observation has a changed branch SHA. The in-page editor shows the original and observed SHA and requires the reviewer to state what was checked. Submitting appends a new manual claim pinned to the exact observed SHA, linked back to its previous finding via optional `reviewOfFindingId`. Neither the old finding nor the original source revision is rewritten. The submission is rejected if another review superseded that finding or the branch SHA moved while the editor was open.

The same latest-finding selector now drives the trace matrix and revision-review queue: resolved old-revision entries remain visible in the project's history, but do not reopen the active issue after a newer review. Ties at identical millisecond timestamps are broken by append order, not random UUID sorting. The current project-impact projection then classifies the newly reported result and offers the existing work/change-planning actions when a gap remains.

Only source-linked GitHub findings with complete and recent branch observations qualify for direct review. Incomplete or unavailable sources require a new observation first. Findings are human assertions, **not independently verified acceptance**. Optional schema fields preserve compatibility with older `atlas.project/1` JSON and IndexedDB snapshots; no new store, grants model, synchroniser or executor.

## Source-revision review and downstream impact — 2026-11-02

The public Atlas portfolio has an **«Изменения Git и пересмотр фактов»** view. It compares each *source-linked, ref- and SHA-pinned claim* to the latest observed repository branch head and shows the claim's original SHA beside the observed SHA. It distinguishes a changed SHA, an absent branch on a complete enumeration, an incomplete enumeration, an unavailable source and an out-of-date observation. A transitive dependency walk shows the number of downstream projects *potentially affected* by each project requiring evidence review, without claiming those projects have actually failed.

Each row opens the precise target in the existing requirements/evidence view. Original evidence entries remain immutable; neither branch movement nor source errors automatically approve a result, delete prior claims or create tasks. Complete source-to-source comparisons now optionally retain `revisions: [{ref, previousSha, currentSha}]` within the existing observation summary. Older JSON snapshots without `revisions` remain readable. No new persistence, external authority, permissions or private IWXA integration.

This view is a review queue, not a trusted validation of upstream tests, releases or acceptance. Full Node CI and a real Chromium qualification are separate gates for the new code.

## Fair public-source queue and single-revision refresh — 2026-11-02

The standalone overview exposes an explicit read-only **public-source queue** showing never-observed, stale, errored, partially observed and recently changed GitHub bindings. It deduplicates references to the same public source across projects while retaining each project's own observation record. The work selector prioritises never-observed and oldest bindings, so repeated manual refreshes reach later repositories instead of selecting the same first four forever. Limits apply to the **whole batch** (at most 30 attached bindings, four unique API sources manually, three automatically). The number of untouched bindings is surfaced, never silently labelled as checked.

A batch is committed to the **existing IndexedDB snapshot once**, with one global revision and one integrity-protected backup; no additional persistence engine. On API failure the old source summary is retained, while an error and attempt timestamp are recorded. Rate-limit responses stop subsequent calls; source incompleteness never proves deletions or delivery acceptance. Previous JSON exports remain compatible.

The tested 120-project Chromium/IndexedDB scale result predates this source-queue change. The new source batch is covered by targeted Node tests and requires its own real-browser qualification before an updated release candidate.

## Public portfolio source reconciliation — 2026-11-02

The portfolio home view now offers **«Сверить публичные источники»**, a bounded batch refresh of public GitHub repository and owner bindings. It groups equivalent case-insensitive references across projects and retrieves each unique source once per batch, applies the same source freshness/diff logic to each attached project, and writes the resulting snapshot through the existing IndexedDB store. Per-source refresh shares the same path. Automatic refresh checks due sources on focus/timer and is capped at **3 unique public API bindings per pass**; the explicit user action allows at most **4 unique bindings / 30 attached references per pass**. Remaining references are shown as deferred instead of silently implying completeness.

Partial observations do not infer deleted branches, 403/429 rate limiting stops the current batch, unavailable sources retain previous evidence and show an error, and no GitHub metadata grants a qualified result. No tokens, private host connections, new storage, independent executor or separate synchroniser. A repeat action handles the deferred queue, using the latest persisted revision. The standalone application still requires public REST access; protected corporate integrations remain deliberately deferred.

The 12/60/120-project Chromium scale acceptance passed on Linux [Actions #41353651130](https://github.com/Faust-S/Atlas/actions/runs/41353651130). At 120 projects (1,440 work items, 480 requirements, 119 cross-project links) import-and-render took 242 ms, detailed view 221 ms and worst reload 134 ms, including six full reloads with IndexedDB readback. Measurements on hosted CI are not end-user latency guarantees. Live metadata for all 12 real public GitHub repositories matched the captured IDs and default-branch SHAs. These figures precede the batch source-refresh change; only the existing Node CI is automatically run on routine source commits.

## Unified portfolio attention workspace — 2026-11-02

The standalone overview now opens with **one prioritized attention queue**, not several stacked technical reports. It reuses the existing dependency cascade, source/claim impact, human decision ledger and CPM scheduling as read-only projections. Rows expose the most actionable signal first, a compact calculation of deadline risk, and drill-down actions to a project, an individual requirement, a cause in the human-decision queue, or source/schedule/dependency details. Filters cover blockers, dates, evidence, decisions and source freshness, plus a local text search. The original graphs, tables and detailed portfolio reports remain available under "Показать подробные графы и отчёты".

No independent readiness score, storage, new source authority, agent access or automatic execution is introduced. A negative or missing observation remains an uncertainty and never becomes qualified release acceptance. Search and filtering do not persist personal query strings and do not trigger GitHub API calls.

Targeted verification includes source-blob V8 scenarios for the queue, filter behavior, transitive blocking, critical dates, escaping and deep-link actions. The independent Chromium scenario now also opens the queue and follows an evidence link. Full Node/Chromium qualification is not claimed until the real runs complete.

## Cross-project schedule consequence forecast — 2026-11-01

The portfolio now has a **read-only calendar-day scheduling projection**, reusing `scheduleProject()` and the existing cross-project dependency DAG. It separates declared start/due dates, local CPM finish, dependency-constrained projected start/finish, and possible deadline slippage. The per-project view identifies constraining predecessor projects, explicitly approved change work included in the CPM estimate, and approved changes still lacking work. Both start and due dates can be edited together in a form, but forecasts never mutate the approved plan.

Missing start dates or work estimates produce unknown dates rather than fabricated results. If a successor has no declared start but all predecessor estimates exist, the view labels its dependency-derived start as an estimate only. Calendar forecasts do not model labor availability, business days, actual completion or independent acceptance. No new authority, storage engine, external data, or task executor is introduced.

Targeted checks on staged JS modules: 15/15 V8 PASS, including approved change → added work → shifted upstream CPM → downstream due-date risk, retained dates, JSON roundtrip and invalid-date rejection. Full Node suite and interactive Chromium remain HOLD until executed.

## Response and decision route — 2026-11-01

Atlas now turns observed causes (blocked work, stale or missing evidence, source errors, project pauses and undefined expected outcomes) into **linked proposals**, not automatic instructions. From a signal, a user can record a proposed change, make an explicit status decision with mandatory rationale, and create work only after approval. The existing project `changes`, `decisions` and `items` remain the sole authoritative records. New optional `causeKey`, `changeId` and decision-history fields are validated against the actual project objects and persist through the same IndexedDB/JSON snapshot; older snapshots remain readable.

The response panel shows unplanned causes, proposals awaiting a decision, approved changes without work, and the exact linked decisions and work. Repeated active proposals for the same cause are refused. When a cause is no longer observed, the historical change stays in the audit trail. None of these statuses independently certify delivery, and no agent/tool is executed. The branch change preserves existing `atlas.project/1` schema and requires no new dependencies or data store.

Verification: Node targeted response checks pass locally, plus an integrated V8 roundtrip using the exact staged GitHub blobs for core/trace/editor/response. Full `npm test`, GitHub CI and actual Chromium remain separate acceptance gates.

## Portfolio dependency impact — 2026-11-01

The public Atlas portfolio now includes a **read-only cascading-impact view** powered by `src/portfolio-cascade.mjs`, reusing the existing project impact model instead of adding a second readiness engine. Explicit paused/cancelled projects and blocked work are distinguished from uncertain evidence, incomplete source observations, pending upstream deliveries, and manually claimed completions. Impacts propagate through all declared project dependencies, with shortest causal paths and deduplicated downstream counts even for diamond-shaped graphs. The overview includes an attention filter; each project shows the projects and mandatory criteria downstream of it.

These are **potential areas of impact**, not independently verified outages, hard blockers or qualified release statuses. Missing goals are recorded as an assessment gap, never as successful readiness. No new store, executor, agent permission, private data, or extra GitHub action is introduced.

Local validation: targeted Node 22 tests for portfolio and cascade passed 8/8. Full test suite and browser qualification remain to be confirmed on the integrated branch.

## Project portfolio dependency graph — 2026-11-01

A single Atlas portfolio can now define *declared project-level blocking dependencies* within the existing `atlas.project/1` snapshot. The new overview contains a directed graph, a named-project dependency editor, a dependency table with removal actions, and per-project incoming/outgoing navigation. Links reject cycles, self-references, duplicate IDs and missing projects; the same JSON export and IndexedDB snapshot persist the relationships without another data store.

Earlier snapshots with no `portfolioLinks` remain valid. A manually completed predecessor is **not** treated as accepted delivery: it prompts an explicit review instead. This planning graph is not an execution engine and does not access private IWXA repositories.

## CI failure remediation — 2026-11-02

The first six automatic public-branch qualification runs failed, so previous V8-only checks must **not** be treated as a passing integrated test suite. The latest inspected run is [#41350903605](https://github.com/Faust-S/Atlas/actions/runs/41350903605): 90/92 Node tests passed, with two failures in the asynchronous application smoke route and the blocked-graph expectation.

The event handlers now return their asynchronous completion promises so the Node smoke driver can await actual IndexedDB write/commit and UI rendering. This does not change browser event dispatch semantics. The smoke driver explicitly checks application errors after each submitted operation instead of relying on a one-tick delay. In the graph, an empty blocked-only filter shows an informative empty state. The graph regression now covers both a dependency that is no longer blocked after completion and an explicitly blocked work item.

A fresh passing `npm test` and a separate real Chromium run must be observed before declaring the product qualified. No new test infrastructure or extra store has been introduced.

## Verification on the public working branch

A branch-scoped workflow (`.github/workflows/public-qualification.yml`) performs **real `npm test`** and syntax checks on code/test changes in `work/2026-11-01-atlas-foundation`. The heavier Playwright/Chromium browser test is **manual-only** (`workflow_dispatch`), to conserve GitHub resources. Browser QA covers native IndexedDB migration/recovery and project → requirement → linked work → dependency graph → finding → reload. The browser driver is not shipped with Atlas.

The workflow has a 15-minute limit, cancels superseded runs and retains a failure screenshot for three days only when a manually requested browser test fails. Never equate a passing CI run with independent product/release acceptance. The `main` branch and private IWXA-Atlas are not modified by this workflow.

## Impact-to-action traceability — 2026-11-01

The project view now joins **accepted/candidate targets → observed claims at exact source refs → source revision/freshness → related change requests → linked work items**. When a source branch changes, previous test/implementation/acceptance claims bound to that SHA become stale; Atlas presents the affected requirement, the reason, an explicit new-finding/review action, and existing follow-up work. Missing or partial outcomes offer a direct action to create work already linked to the target. The portfolio overview aggregates action attention without manufacturing a readiness percentage.

Existing `atlas.project/1` snapshots remain readable. Work items may optionally contain `targetIds`; links are validated on import and editing, and old work items without them are still valid. The model, planner, external task execution boundaries and IndexedDB authority are unchanged. Neither a changed commit nor user-declared acceptance qualifies a release.

## Public GitHub owner and branch observation — 2026-11-01

The standalone app supports `github_owner` bindings (a public GitHub user or organization). Once explicitly attached, Atlas discovers public repositories with bounded REST pagination; the user can choose which discovered repositories receive a `github` binding for branch/SHA observation. Refresh uses one lightweight standalone poller, at most three due bindings per pass and a 15-minute minimum retry interval; manual refresh is available on each source. The Agent-hosted edition must use its host-owned synchronization authority instead.

The source contract records object IDs, branches, SHAs, observation time, public API provenance and enumeration completeness. When two **complete** snapshots exist, it displays new, removed, renamed (stable repository ID) and updated entries. Partial enumerations and failures do not prove deletions. Existing claims remain claims even when the linked branch SHA matches; an outdated or missing ref becomes stale in trace views. No private repository data, credentials, task execution or external writes are part of the public implementation.

Automatic changes require a linked source; Atlas does not scan arbitrary organizations and does not automatically enroll every discovered repository. A local-only branch on another machine cannot be observed by GitHub. The public unauthenticated GitHub API enforces its own rate limits.

## Standalone persistence — 2026-11-01

The standalone UI now uses **native IndexedDB** (no extra runtime dependency) through `src/storage.mjs`. A transactional current/previous snapshot pair carries the existing `atlas.project/1` model unchanged, with SHA-256 integrity checking, explicit rollback from the last good snapshot, quarantine of a damaged head, and optimistic stale-tab write rejection. Existing `iwxa-atlas-public/1` localStorage JSON is migrated only after validation and is **not deleted**.

An unreadable snapshot is **not** silently replaced by an empty portfolio; write failures do not update the in-memory project. The UI exposes a visible recovery action. JSON export/import remains supported; a confirmed import atomically replaces the active portfolio. Storage is **not encrypted**, does not provide cloud backups or multi-device sync, and cannot guarantee persistence against browser profile deletion or physical disk loss. Keep an external JSON backup.

For isolated real-browser checks, open `tests/storage-browser.html` under a local HTTP server. Node tests use `tests/fake-idb.mjs` only as a deterministic transaction test double; it is not a substitute for native-browser acceptance. Dexie remains an optional candidate for future complex querying/migrations; do not install a second competing store.

## Current handoff and user-facing portfolio UI — 2026-11-01

[**Russian development handoff / prompt for next chat**](docs/HANDOFF_2026-11-01_RU.md). Read it before changing repository architecture.

The current working branch includes a visual portfolio summary (cross-project gaps/stale evidence/proposed changes), issue filters inside each project's expected-vs-observed matrix, and target/source selection without exposing raw UUIDs. The source-linked claim stays clearly distinct from verified acceptance. This iteration was tested using published JavaScript modules in V8 and a mock UI flow; **real Chromium E2E and Node CI are not yet confirmed**.

---


## Reality vs target — verified branch implementation (2026-11-01)

Atlas now includes a **cross-source traceability view** with three explicitly separate areas: what should exist (committed/candidate goals), what has been reported about actual implementation/test/acceptance, and what is proposed or approved to change. Source references, branch SHA observations, freshness, contradiction and failed discovery are preserved as **claims**, never silently promoted to accepted release status.

- `src/trace.mjs`: capability targets, evidence records, revisions, stale/conflicting evidence, approved vs proposed changes.
- `src/github-public.mjs`: reads public branch names **and Git SHAs**, marks pagination completeness; does not access private repos or certify releases.
- `src/app.mjs`: requirements/facts/changes table for a project and per-project gap/staleness counts in portfolio overview.
- `tests/trace.test.mjs`: 14 cases PASS on the exact GitHub-published modules in the embedded V8 test runner. Node CI / interactive browser qualification has not been performed for this iteration.
- `docs/TECH_SELECTION_AND_REALITY_MODEL_2026-11-01.md`: candidate comparison covering Backstage, Apache DevLake, OSLC, Dexie, React Flow, Cytoscape, Graphlib, collaborative CRDTs and resource-scheduling engines.

**Scope warning:** all entries are user-declared or source-linked claims until an authoritative verifier and accepted evidence model are integrated. No claims of medical, business or engineering regulatory readiness; no private IWXA repository data are included.

---


## Planning core update — 2026-11-01

**Implemented on this working branch:** reusable, permissively licensed Marcel Klehr `toposort` (MIT; attribution in `src/vendor/LICENSE-toposort.txt`), a calendar-day critical-path calculation in `src/planning.mjs`, editable work duration estimates, project start date, and a read-only schedule table with float/critical-work indicators.

**Evidence:** 13 standalone planning scenarios passed locally; 10 additional direct checks against the exact GitHub-published modules passed (core, backward compatibility, scheduler, JavaScript UI syntax). Unit and browser end-to-end checks in the actual published deployment remain pending. GitHub Actions were **not** invoked.

**Important limitations:** planning uses elapsed calendar days; there is no resource leveling, working-day calendar, leads/lags, budget forecasting or automatic release acceptance. A calculation is not a task execution. Existing snapshots lacking `estimateDays` default to one day, and data remains local in the initial standalone UI.

[Core selection and license review](docs/OPEN_SOURCE_CORES_2026-11-01.md) · [Planning engine](src/planning.mjs) · [Planning integration tests](tests/planning-integration.test.mjs)

---


A lightweight **local-first project and multi-source overview** for personal and business work. The architecture deliberately does **not** implement an AI agent, a task execution engine, a secrets manager, or a second tool/program registry. The same project presentation can later be hosted inside IWXA Personal Agent.

**Status: public foundation v0.1 — a working local UI and project model; NOT a production/medical release.** All public example data is synthetic. The public repository contains no private IWXA bindings, credentials, nonpublic architecture, or data from other repositories.

## Run (no install step for application dependencies)

1. Open a terminal inside this repository and run `python3 -m http.server 4173` (on Windows `py -m http.server 4173` is also an option).
2. Open <http://localhost:4173> in a browser.
3. Create a project, add stages and work, manage priorities/statuses, set risks and dependencies, link source references, export and import a JSON snapshot.
4. `npm test` runs the domain/adaptor checks with Node.js 20+; the UI itself has no npm runtime dependencies.

### Current, actually implemented

- Local project portfolio with types `personal/team/business/engineering/research/care/other`, goals, owner, status, dates, and optional budget.
- Project stages and work items, assignees, priorities, due dates, blocking states, acyclic dependencies, risks, immutable-style recorded decisions, and reference-only external executor assignments.
- Overview dashboard, project summary, work board, timeline by stage, dependency graph, and linked source panel.
- JSON export/import, revisioned snapshot schema, and transactional IndexedDB local persistence with one-time legacy `localStorage` migration. No hidden network sync.
- **Explicitly read-only public GitHub repository observation**: fetch current branch list, main branch, pushed date and source freshness by pressing **Сверить**. This intentionally does not access private repositories or accept tokens. Source observation does not claim release readiness.
- Domain model tests using Node built-in test runner (no downloaded package dependencies).

### Not implemented yet — do not infer from the UI

- Actual private GitHub/GitLab/Forgejo/Jira/Anytype/Obsidian data access, provider authentication, automatic discovery, webhooks, and real-time refresh.
- **Standalone** multi-user collaboration, organisation RBAC, enterprise audit controls, encrypted storage, cloud backup and sync are not implemented. In **hosted IWXA mode**, these capabilities must reuse Admin Center (organisational memberships/rights), shared T3 reconciliation and Personal Agent/Programs Center; Atlas must not duplicate these services. The Atlas host integration is not yet implemented or qualified.
- Agent execution or side effects: Hermes, Goose, Task Engine, and other workers are *references* only here; actual delegation is exclusively a host responsibility.
- Verified evidence/resolver for accepted product releases. Manual item completion is *not* product qualification.
- Drag/drop Gantt and advanced graph interaction: timeline and graph are functional read-only visualizations for the local project model.

**Sensitive data:** current browser IndexedDB storage is not encrypted and is unsuitable for patient records, secrets, sensitive corporate data or regulated information. `care` is just a *project category*, not a medical records feature. Production requires the respective IWXA protected data/rights boundary.

## Two environments, one codebase

- **Standalone:** local application model and presentation, source adapters with scoped read-only access.
- **Inside Personal Agent:** use host-owned Workspace/Project storage, Programs Center connections, permissions, ToolRuntime and *selected* human/agent executors. No competing agent process, second Project registry or Task Engine.

Project-owned records belong to one authoritative store at a time. Every external source retains its own origin, identity, freshness and permissions. See [architecture](docs/ARCHITECTURE.md).

## Public development vs private deployment

The generic code is designed for the public `Faust-S/Atlas` repository. Actual IWXA project mappings, nonpublic source metadata, credentials and private deployment configuration belong only to the private `private IWXA integration repository` deployment or other authorized private repositories. They must never be added to public Git history, PRs, CI artifacts, screenshots or fixtures.

## Research and provenance

See [open-source comparison and reuse decisions](docs/RESEARCH_2026-11-01.md). No source files from third-party GPL/AGPL/MIT projects have been copied into this foundation. Future inclusion of MIT libraries such as React Flow and Frappe Gantt requires retaining their copyright/license notices and performing dependency review.

## License

MIT, see LICENSE. Any future third-party code remains subject to its own license.