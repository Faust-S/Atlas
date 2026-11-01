# Atlas — universal project workspace (public foundation)

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
- Multi-user collaboration, role-based access control, enterprise audit controls, legal/medical protections, encrypted data at rest, cloud backup, or sync across devices.
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