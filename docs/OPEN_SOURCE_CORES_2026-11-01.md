# Atlas: reusable open-source cores — 2026-11-01

## Selection rule

Reuse a mature library as an independent, explicitly scoped engine, not an entire task management product. Any selected core must support local-first execution and commercial distribution, be separable from Atlas's own project semantics, and preserve the existing Personal Agent executor and Programs Center boundaries.

| Candidate | Capability | Evidence / license | Current verdict |
| --- | --- | --- | --- |
| Marcel Klehr **toposort** | Directed dependency order and cycle rejection | MIT, GitHub source and license inspected | **Vendored as ES module** in `src/vendor/`; exercised in scheduling tests |
| DagreJS **Graphlib** | General graph APIs and algorithms | MIT; https://github.com/dagrejs/graphlib | **Review / later**: do not ship a second graph runtime before needs justify it |
| **OpenPlan** | WBS, Gantt, cost, critical path and resource concepts | MIT according to project; https://github.com/MNSBaanu/OpenPlan | **Research reference**; maturity and algorithms need deeper independent verification |
| **Dexie.js** | IndexedDB persistence for standalone mode | Apache-2.0; https://github.com/dexie/Dexie.js | **Selected candidate, not installed**; first assess browser/data migration contract |
| **Automerge** | Offline local-first document collaboration | MIT; https://github.com/automerge/automerge | **Evaluate later**, not needed for single-user delivery |
| **Yjs** | CRDT collaborative updates | MIT; https://github.com/yjs/yjs | **Automerge alternative**, never add both without comparative tests |
| **XState** | Hierarchical UI state machine | MIT; https://github.com/statelyai/xstate | **Targeted option** for complex UI state; not another Task Engine |
| **OR-Tools** | Constraint solver for resource scheduling | Apache-2.0; https://github.com/google/or-tools | **Optional compute module** for resource constraints; not part of the lightweight UI process |
| **React Flow (xyflow)** | Interactive dependency graph visualization | MIT; https://github.com/xyflow/xyflow | **Candidate**; integrate only when an actual graph screen is ready |
| **Frappe Gantt** | Calendar timeline and drag interactions | MIT; https://github.com/frappe/gantt | **Candidate**; calendar/locale/resource validation required |

## Integrated product principles

- **Atlas** owns generic project/portfolio planning, links, stage/work overview and projections. A standalone deployment can keep its own project plans.
- **Personal Agent** remains the owner of its own Workspace, project, tool and permission state when Atlas is embedded.
- **Hermes, Task Engine, Goose and human assignees** are executor identities and workflow endpoints, not components running inside Atlas.
- **Obsidian, Anytype, Git and Jira** keep authoritative source data; a source adapter returns typed observations with freshness and provenance, never a second master copy.
- **Medical, private business and IWXA architectural records** are prohibited in public fixtures or public Actions.

## Implemented planning slice

`src/planning.mjs` offers topological sequencing and CPM earliest/latest day offsets, duration, float and critical path. It works from the existing Atlas project snapshot, uses a correctly licensed upstream topological sorting implementation, and **never updates task execution status**.

Planning limits are explicit: calendar days, no resource leveling, no working-day calendar, no lead/lag, no percent-complete forecasting and no automatic certification. These require further qualified engines rather than misleading "complete" labels. A zero-duration work item can represent a milestone.

## Next product implementation priority

Replace prototype localStorage with a migration-safe local storage adapter (Dexie/IndexedDB candidate); build a useful graphical dependency and timeline view rather than multiplying headless tests; qualify one real provider adapter before adding others. Keep the first user journey complete before considering CRDT collaboration or OR-Tools optimization.
