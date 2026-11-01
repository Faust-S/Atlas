# Atlas architecture — public foundation, 2026-11-01

## Responsibility

Atlas is a **general-purpose project management, project composition and multi-source visualization** tool for individuals and organizations. It is **not** another AI agent, execution engine, Programs Center, or secrets manager.

A project can have a goal, owner, milestones/stages, scheduled work, dependencies, decisions, risks, budgets, and external references. Task execution happens in existing selected runtimes (human, Hermes, IWXA Task Engine, Goose, other agents), not inside Atlas.

## One implementation, two hosts

- Standalone Atlas: local-first project planning and authorized read-only source integration.
- Atlas inside Personal Agent: identical view/model through the **existing** Agent Project/Workspace, ToolRuntime, Programs Center and permissions. Never run two simultaneous independent connector registries for one source.

## Authority boundaries

| Object | Owner |
| --- | --- |
| Atlas project plan (standalone mode) | Locally authorized Atlas store |
| Atlas project in Agent | Existing Agent Workspace/Project store |
| Git commit, branch, CI | Git server |
| Obsidian note, Anytype object, Jira issue | Original external application |
| Task execution and results | User-selected executor, governed by its own host permissions |
| Atlas graphs and summaries | Rebuildable Atlas projections |

An imported Git push or green build **does not** automatically mean a release is accepted.

## Source observation contract (next iteration)

`listBindings(scope)` → authorized sources.
`enumerateObjects(binding,cursor)` → discovery including newly created repositories and branches.
`observe(binding,refs,since)` → source ID, object ID, revision, observedAt, provenance and status.
`subscribe(binding,cursor)` → optional events with fallback reconciliation.

The first implementation deliberately limits GitHub API observations to public repositories without authorization; private Git integration uses a separately authorized host later.

## Enterprise and domain adaptation

A shared project model must work across personal planning, engineering, enterprise portfolio management, research and professional workflows. Sensitive business and medical records (including BazMed) stay with their domain owner and cannot be placed in a public Atlas fixture or unencrypted localStorage. Domain policies govern who may access or write a linked record.

## Operational safety

- No source credentials in public code, logs or synthetic test fixtures.
- Private IWXA project mappings and development evidence remain in `Faust-S/IWXA-Atlas` or other private authoritative sources.
- Agents never receive execution authority just because they appear in an Atlas work-item assignment.
- Source outages and partial pagination are visible; cached information must not be mislabeled as current.
- Avoid a second Task Engine, duplicate host, or all-in-one fork of project-management monoliths.
- GPL/AGPL source requires intentional licensing review before incorporation; MIT dependencies require attribution and version pinning.

## Minimal user journey

Create project → create milestones/work items → link blocking dependencies → record risks/decisions → link source → observe source freshness → save/export → reload/import → inspect project overview. Finish this path before scaling adapters or tests.
