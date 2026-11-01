# Atlas technology selection and current/target/change model — 2026-11-01

## Purpose

A project is **not** equal to one Git repository, one Task Engine task or one document. Atlas must show a human:
1. **Desired** — accepted project goals, requirements, baselines and acceptance criteria.
2. **Observed** — facts obtained from programs, repositories and user declarations, with version, timestamps and authority.
3. **Delta** — missing, partial, contradictory, expired or unverified evidence.
4. **Proposed/approved changes** — desired change, rationale, status and affected requirements.
5. **Constraints** — dependencies, owners, resource/financial/time limits, risks, external blockers.
6. **Confidence/traceability** — who asserted each claim, what was observed, whether the source was accessible, which revision is referenced, and whether verification remains valid.

These are multiple representations of **one** project. Do not invent another Agent, Task Engine, Git host, Programs Center, or normative IWXA control plane.

## Detailed selection: engineering evidence and relation layer

| Candidate | Reuse and fitness | Trade-off / deployment | Decision |
| --- | --- | --- | --- |
| Backstage https://github.com/backstage/backstage | Apache-2.0: ownership catalog, entity relationships, discovery providers and catalog processing | Very capable developer portal, but large Node/web service, enterprise-oriented; does not itself certify product acceptance | **Study and reuse catalog-provider patterns; not an embedded runtime** |
| Apache DevLake https://github.com/apache/incubator-devlake | Apache-2.0: Git/Jira/CI connectors, unified metrics, dashboards | Server database/ingestion/BI footprint; engineering activity metrics are not accepted product capabilities | **External source integration candidate for large installations; no embedded copy** |
| OSLC https://open-services.net/ | Linked-data/traceability principles between requirements, defects, changes and tests | Standards/API interoperability, not an installable mini-library | **Adopt typed links, provenance, source ownership; avoid declaring full OSLC compliance** |
| OpenTelemetry https://github.com/open-telemetry | Standardized telemetry tracing, logs and metrics | Instrumentation does not prove task completion or acceptance | **Future execution observation source only** |
| Graphlib https://github.com/dagrejs/graphlib | MIT graph model and algorithms | Overlaps the small MIT toposort already vendored | **Defer until graph scale/feature needs justify replacement** |
| Cytoscape.js https://github.com/cytoscape/cytoscape.js | MIT graph rendering and analytics, layouts for larger relationship maps | Renderer has separate UI ecosystem; visual correctness/performance must be measured with realistic data | **Evaluate against React Flow for Atlas knowledge / dependency map** |
| React Flow https://github.com/xyflow/xyflow | MIT rich interactive node editing for smaller curated project graphs | Many complex nodes and edges can affect UI responsiveness | **Likely for editable project graph, not yet integrated** |
| Dagre https://github.com/dagrejs/dagre | MIT automatic directed graph layout | Layout alone, not provenance, permissions or graph semantic layer | **Optional renderer layout** |

**Core boundary:** source connectors return typed, scoped observations. Atlas creates materialized project *views*; project goals and baselines must be authorized by their project owner, not silently overwritten by Git pushes. A claim of implementation, test or acceptance must never be inferred from commit activity. The source owner's authoritative record remains in the originating program.

## Detailed selection: project planning, storage and collaboration

| Candidate | Reuse | Cost / risk | Decision |
| --- | --- | --- | --- |
| Marcel Klehr toposort https://github.com/marcelklehr/toposort | MIT directed order and cycles, integrated in `src/vendor/toposort.mjs` | Does not implement scheduling or resource leveling | **Retain existing integrated dependency core** |
| OpenPlan https://github.com/MNSBaanu/OpenPlan | MIT reference: Gantt, WBS, cost and CPM concepts | Young project, implementation maturity not independently verified; no verified scaling | **Review algorithms before any adoption; not chosen as Atlas base** |
| Dexie.js https://github.com/dexie/Dexie.js | Apache-2.0 IndexedDB schema/migrations/transactions | Browser storage durability/quota, export/recovery and migration need real tests; Agent must use existing storage authority | **Top candidate for standalone persistence, not yet bundled** |
| SQLite (Tauri host / browser WASM) | Mature transactional local database | Tauri host adds platform integration; browser WASM/persistence differs | **Alternative for native host, not an automatic second store** |
| Automerge https://github.com/automerge/automerge | MIT CRDT offline-first edits | Conflicts, schema migrations, binary formats, performance require qualification | **Defer until multi-user acceptance** |
| Yjs https://github.com/yjs/yjs | MIT CRDT and text collaboration ecosystem | Same interoperability and concurrency complexity | **Compare against Automerge on actual collaboration use-cases before choosing** |
| XState https://github.com/statelyai/xstate | MIT visual UI/wizard lifecycle control | Could become a duplicate task/work engine if misused | **Use only if UI state warrants it; not core** |
| Google OR-Tools https://github.com/google/or-tools | Apache-2.0 resource constraints optimization and CP-SAT | Heavy optional compute; browser packaging/cost and solver tuning | **External/on-demand calculation module; not initial startup dependency** |
| Frappe Gantt https://github.com/frappe/gantt | MIT interactive timeline | Work calendars, locale, enterprise cases require integration tests | **Candidate for timeline UI, not yet installed** |

## Why not one all-in-one PM fork?

Plane, OpenProject, Leantime, Vikunja and similar systems carry their own task/workspace authorities and often server infrastructure and copyleft constraints. Their enterprise planning and usability practices are valuable; importing them wholesale would duplicate Atlas/Agent ownership and impose avoidable dependencies.

## Evidence-state semantics in current Atlas branch

Implemented in `src/trace.mjs` and surfaced in `src/app.mjs`. Every statement is explicitly a **claim**. A user can add a committed or candidate desired capability, then attach implementation/test/acceptance claim with a source ID, revision and timestamp. Atlas displays:
- unknown, conflict, stale,
- gap_reported, partial_reported,
- implemented_claim, test_claim, acceptance_claim.

Proposals and approved changes are separate records. Approving a change does **not** flip implementation readiness. A Git source revision mismatch or lost/stale source causes stale evidence, not PASS. Contradictory claims at the same source revision cause conflict. An unreachable or incomplete enumerated source never silently becomes current. The initial API does **not** cryptographically authenticate evidence, independently run tests, verify test authority or resolve cross-source precedence; do not call its acceptance_claim a qualified release.

## Public/private separation

Public `Faust-S/Atlas`: generic model/UI, synthetic examples, permissive upstream licenses, public-repo reader. Private IWXA deployment: repo inventory, actual branches/commits, internal status baselines, private connector permissions and keys, business/medical records. Never embed project-specific private evidence in public repo code or Actions.

## Required qualification before production

1. Real SQLite/Dexie persistence with migrations, transaction crash recovery, export+import and large-project quota/failure handling.
2. Source integrity: authenticated private API, pagination, rate-limit backoff, source ID revision, branch deletion and rename, webhook gaps and periodic discovery.
3. Evidence authority: binding of requirement → exact tested revision → test outcome → human/owner acceptance, with conflict and revocation model.
4. Cross-source project composition: compare observed repository/doc/task graphs to one accepted goal baseline; never count branch activity as delivered value.
5. UI acceptance: visual relation map + timeline, filtering by missing/partial/stale, accessibility and real browser acceptance.
6. Agent embed: reuse Agent Workspace, Task Engine/other executors (Hermes etc.), Programs Center, permissions and persistence; no duplicate active connector poller.

No benchmark claims are made for candidate cores. Only the upstream MIT topological implementation is currently integrated; all other libraries remain candidates or external adapters.
