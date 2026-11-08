import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {desktopLoadPortfolio} from "./fixtures/desktop-portfolio-120.mjs";
import {validate,serialize,deserialize,editItem} from "../src/core.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {portfolioResources} from "../src/portfolio-resources.mjs";
import {planReviewQueue} from "../src/plan-review.mjs";
import {projectImpact,portfolioImpact} from "../src/impact.mjs";
import {buildPortfolioCommand,filterPortfolioCommand} from "../src/portfolio-command.mjs";
test("R5 reproducible portfolio has the required objects and supports 20 edits",()=>{
 const portfolio=desktopLoadPortfolio(),before=serialize(portfolio);
 assert.equal(portfolio.projects.length,120);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.items.length,0),1200);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.dependencies.length,0),300);
 assert.equal(portfolio.portfolioLinks.length,40);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.findings.length,0),200);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.decisions.length,0),100);
 const forecast=portfolioSchedule(portfolio);
 assert.equal(forecast.totals.dated,120);
 assert.equal(portfolioResources(portfolio,{schedule:forecast}).people.length,0);
 assert.ok(Array.isArray(planReviewQueue(portfolio).rows));
 let edited=portfolio;
 for(let i=0;i<20;i++)edited=editItem(edited,`load-project-${i}`,`load-work-${i}-0`,{estimateDays:2});
 assert.equal(edited.revision,20);
 assert.equal(validate(edited),true);
 assert.equal(deserialize(serialize(edited)).projects[0].items[0].estimateDays,2);
 assert.equal(serialize(portfolio),before);
});

test("cached 120-project impact lookup matches full domain aggregation for 1200 works",()=>{
 const snapshot=desktopLoadPortfolio();
 const summary=portfolioImpact(snapshot.projects);
 const cache=new Map(snapshot.projects.map(p=>[p.id,projectImpact(p)]));
 assert.equal(cache.size,120);
 assert.equal(summary.rows.length,120);
 for(const entry of summary.rows){
  const v=cache.get(entry.id);
  assert.equal(v.attention,entry.attention);
  assert.equal(v.missingWork,entry.missingWork);
  assert.equal(v.evidenceReview,entry.evidenceReview);
  assert.equal(v.sourceIssues.length,entry.sourceIssues);
 }
 const signatures=new Map([...cache].map(([id,projection])=>[id,projection]));
 for(const query of ["Project","Project 1","Project 11","Project 119","not found",""]){
  const visible=snapshot.projects.filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
  for(const p of visible)assert.equal(cache.get(p.id),signatures.get(p.id));
 }
 assert.equal(snapshot.projects.reduce((n,p)=>n+p.items.length,0),1200);
});

test("installed 0.4 uses the real R5 archive, native import approval, readback, search and charts",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../.github/workflows/atlas-0-2-1-branding.yml",import.meta.url),"utf8");
 for(const marker of [
  "ATLAS04_SCALE_NATIVE_PICKER_PASS","ATLAS04_SCALE_IMPORT_PRE_SAVE_UNCHANGED_PASS",
  "ATLAS04_SCALE_GUI_IMPORT_PASS projects=120 works=1200",
  "ATLAS04_SCALE_GUI_RESTART_READBACK_PASS","ATLAS04_SCALE_GUI_SEARCH_PASS",
  "ATLAS04_SCALE_GUI_GANTT_DAG_PASS","ATLAS04_SCALE_GUI_ACCEPTED_PASS"
 ])assert.ok(script.includes(marker),marker);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/Заменить портфель в черновике/);
 assert.match(ui,/autoFocus disabled=\{busy\} onClick=\{\(\)=>setPendingImport\(null\)\}/);
 assert.match(script,/keyboard\.send_keys\("\{TAB\}"\)/);
 assert.match(script,/keyboard\.send_keys\("\{ENTER\}"\)/);
 assert.match(script,/"ATLAS_R5_PORTFOLIO_JSON"/);
 assert.match(workflow,/python desktop\/tests\/installed-atlas04-scale\.py/);
 assert.match(workflow,/ATLAS_R5_PORTFOLIO_JSON=\$fixture/);
});

test("0.4 priority queue uses the already computed 120-project impact and CPM projections",()=>{
 const portfolio=desktopLoadPortfolio();
 const now="2026-11-08T14:00:00.000Z";
 const forecasts=portfolioSchedule(portfolio);
 const impacts=new Map(portfolio.projects.map(project=>[project.id,projectImpact(project,{now})]));
 const original=buildPortfolioCommand(portfolio,{now});
 const reused=buildPortfolioCommand(portfolio,{now,impacts,schedules:forecasts});
 assert.deepEqual(reused,original,"Cached and uncached priority, evidence and dates must match");
 assert.equal(reused.rows.length,120);
 const evidence=filterPortfolioCommand(reused,{filter:"evidence"});
 assert.equal(evidence.length,120);
 assert.equal(evidence.slice(0,8).length,8,"React must have a small initial window");
 assert.equal(filterPortfolioCommand(reused,{filter:"evidence",search:"Project 119"}).length,1);
 assert.equal(filterPortfolioCommand(reused,{filter:"sources"}).length,0);
 // UI invokes only navigation into the existing domain tabs, never an apply API.
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ui,/buildPortfolioCommand\(data,\{impacts:impactByProject,schedules:dates\}\)/);
 assert.match(ui,/attentionRows\.slice\(0,attentionLimit\)/);
 assert.match(ui,/inspectPortfolioSignal\(row\.id,row\.primary\)/);
 assert.match(ui,/onClick=\{\(\)=>setAttentionLimit\(n=>Math\.min\(attentionRows\.length,n\+8\)\)\}/);
 assert.match(css,/atlas-command-entry/);
});

test("0.4 project chain is bounded in the desktop and uses current portfolio projection",()=>{
 const queue=buildPortfolioCommand(desktopLoadPortfolio());
 const origin=queue.rows.find(row=>row.id==="load-project-0");
 const target=queue.rows.find(row=>row.id==="load-project-40");
 assert.equal(origin.dependencies.downstreamCount,40);
 assert.deepEqual(target.dependencies.predecessors.map(p=>p.id),["load-project-39"]);
 assert.equal(target.dependencies.downstreamCount,0);
 assert.ok(target.dependencies.inherited.some(c=>c.path.some(p=>p.id==="load-project-0")));
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/atlas-project-relations-detail/);
 assert.match(ui,/aria-expanded=\{showProjectRelations\}/);
 assert.match(ui,/if\(signal\.panel==="relations"\)\{[\s\S]*?setShowProjectRelations\(true\)/);
 assert.match(ui,/projectCommand\.dependencies\.inherited\.slice\(0,relationLimit\)/);
});

test("0.4 keeps facts ahead of optional chains and focuses inspected causes",()=>{
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.ok(main.indexOf('className="surface atlas-reality-overview"') <
  main.indexOf('aria-label="Зависимости проекта и влияние на другие проекты"'));
 assert.match(main,/projectCommand\.dependencies\.predecessors\.length>0/);
 assert.match(main,/relationSectionRef\.current/);
 assert.match(main,/scrollIntoView\(\{block:"start",behavior:"auto"\}\)/);
 assert.match(main,/element\.focus\(\{preventScroll:true\}\)/);
 assert.match(main,/setRelationJump\(projectId\)/);
 assert.match(main,/Нет утверждённых требований/);
 assert.match(main,/portfolioCommand\.totals\.missingCriteria/);
});

test("installed Win32 linked-project qualification distinguishes real title readback and optional UIA",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/def inspect_linked_project\(saved_generation\):/);
 assert.match(script,/wait_title\("Project 20 — Обзор"\)/);
 assert.match(script,/ATLAS04_SCALE_GUI_LINKED_PROJECT_PASS project=20/);
 assert.match(script,/ATLAS04_SCALE_GUI_RELATIONS_VISUAL_CAPTURED project=20/);
 assert.match(script,/ATLAS04_SCALE_GUI_RELATIONS_TOGGLE_UIA_PASS/);
 assert.match(script,/ATLAS04_SCALE_GUI_RELATIONS_TOGGLE_UIA_HOLD/);
 assert.match(script,/ATLAS04_SCALE_GUI_PREDECESSOR_NAVIGATION_UIA_PASS/);
 assert.match(script,/wait_title\("Project 19 — Обзор", timeout=12\)/);
 assert.match(script,/assert native\(\)\[0\]\["generation"\] == saved_generation/);
 assert.match(script,/inspect_linked_project\(saved\["generation"\]\)/);
 // No artificial WebView2 store write, browser automation, or renderer shortcut.
 assert.doesNotMatch(script,/playwright|puppeteer|chromium\.launch|execute_script/);
});

test("direct predecessor has unique accessible name, not the repeated cause-path name",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(ui,/aria-label=\{"Открыть предшественника: "\+p\.name\}/);
 assert.match(ui,/aria-label=\{"Открыть следующий проект: "\+p\.name\}/);
 assert.match(script,/title="Открыть предшественника: Project 19", control_type="Button"/);
 assert.doesNotMatch(script,/window\.child_window\(title="Project 19", control_type="Button"\)/);
 assert.match(script,/ATLAS04_SCALE_GUI_PREDECESSOR_NAVIGATION_UIA_HOLD/);
 assert.match(script,/ATLAS04_SCALE_GUI_PREDECESSOR_NAVIGATION_UIA_PASS/);
 assert.match(script,/assert native\(\)\[0\]\["generation"\] == saved_generation/);
});

test("R5 source-bound evidence signal retains the real target identifier",()=>{
 const snapshot=desktopLoadPortfolio(),queue=buildPortfolioCommand(snapshot);
 const row=queue.rows.find(value=>value.id==="load-project-119");
 const evidence=row.signals.find(signal=>signal.kind==="evidence"&&signal.ref);
 assert.ok(evidence);
 assert.equal(evidence.ref,"load-target-119");
 assert.equal(snapshot.projects[119].targets[0].id,evidence.ref);
 assert.match(evidence.label,/Expected result/);
});

test("installed Atlas 0.4 distinguishes exact fact navigation from optional UIA focus",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/def inspect_exact_requirement\(saved_generation\):/);
 assert.match(script,/title="Поиск в очереди внимания", control_type="Edit"/);
 assert.match(script,/Разобрать причину: Project 119 — Требует внимания: Expected result/);
 assert.match(script,/wait_title\("Project 119 — Обзор", timeout=12\)/);
 assert.match(script,/Требование: Expected result — Project 119/);
 for(const marker of [
  "ATLAS04_SCALE_REQUIREMENT_NAV_UIA_PASS",
  "ATLAS04_SCALE_REQUIREMENT_FOCUS_UIA_PASS",
  "ATLAS04_SCALE_REQUIREMENT_FOCUS_UIA_HOLD",
  "ATLAS04_SCALE_REQUIREMENT_UIA_HOLD"
 ])assert.ok(script.includes(marker),marker);
 assert.match(script,/assert native\(\)\[0\]\["generation"\] == saved_generation/);
 assert.match(script,/inspect_exact_requirement\(saved\["generation"\]\)/);
});

test("Win32 factual queue action uses accessible Portfolio navigation instead of count-dependent label",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/window\.child_window\(title="Открыть портфель проектов", control_type="Button"\)/);
 assert.doesNotMatch(script,/title_re=r"\^Портфель проектов"/);
 assert.match(script,/ATLAS04_SCALE_REQUIREMENT_NAV_UIA_PASS/);
});

test("installed Win32 approval uses actual editor, native Save, human rationale and two restarts",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/def inspect_cause_proposal_and_decision\(saved_generation\):/);
 assert.match(script,/title="Предложить устранение причины", control_type="Button"/);
 assert.match(script,/wait_title\("Форма: Изменение для устранения", timeout=12\)/);
 assert.match(script,/ATLAS04_CAUSE_PROPOSAL_DRAFT_PASS/);
 assert.match(script,/ATLAS04_CAUSE_PROPOSAL_NATIVE_SAVE_PASS/);
 assert.match(script,/ATLAS04_CAUSE_PROPOSAL_RESTART_READBACK_PASS/);
 assert.match(script,/visible_uia_action\(window, "Изменение по причине"\)/);
 assert.match(script,/title="Почему принято это решение\?", control_type="Edit"/);
 assert.match(script,/ATLAS04_CAUSE_DECISION_DRAFT_PASS/);
 assert.match(script,/ATLAS04_CAUSE_DECISION_NATIVE_SAVE_PASS/);
 assert.match(script,/ATLAS04_CAUSE_DECISION_RESTART_READBACK_PASS/);
 assert.match(script,/not current_change\.get\("planAppliedAt"\)/);
 assert.match(script,/not any\(i\.get\("changeId"\) == change\["id"\] for i in p\["items"\]\)/);
 assert.match(script,/inspect_cause_proposal_and_decision\(saved\["generation"\]\)/);
 assert.doesNotMatch(script,/playwright|puppeteer|chromium\.launch|execute_script/);
});

test("installed WebView2 cause actions must be physically visible before mouse click",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/def visible_uia_action\(window, name, attempts=13\):/);
 assert.match(script,/rectangle\.left >= bounds\[0\] \+ 245/);
 assert.match(script,/rectangle\.bottom < bounds\[3\] - 50/);
 assert.match(script,/mouse\.scroll\(coords=point, wheel_dist=2 if upward else -3\)/);
 assert.match(script,/change_action = visible_uia_action\(window, "Изменение по причине"\)/);
 assert.match(script,/decision_button = visible_uia_action\(window, "Решение"\)/);
 assert.match(script,/ATLAS04_CAUSE_ACTION_UIA_HOLD/);
 assert.match(script,/screenshot\("cause-change-before-click"\)/);
 assert.match(script,/wait_title\("Project 119 — Изменения", timeout=15\)/);
 assert.match(script,/screenshot\("cause-decision-before-click"\)/);
});

test("installed Win32 work is a separate explicit act after decision and survives native restart",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/visible_uia_action\(window, "Добавить работу по решению"\)/);
 assert.match(script,/wait_title\("Форма: Работа по утверждённому изменению", timeout=15\)/);
 assert.match(script,/ATLAS04_CAUSE_LINKED_WORK_DRAFT_PASS/);
 assert.match(script,/ATLAS04_CAUSE_LINKED_WORK_NATIVE_SAVE_PASS/);
 assert.match(script,/ATLAS04_CAUSE_LINKED_WORK_RESTART_READBACK_PASS/);
 assert.match(script,/work\["state"\] == "todo"/);
 assert.match(script,/work\.get\("executor"\) is None/);
 assert.match(script,/work\["targetIds"\] == \["load-target-119"\]/);
 assert.match(script,/ATLAS04_SCALE_GUI_BASELINE_PASS_EXTENDED_WORKFLOW_HOLD/);
 assert.match(script,/if completed:\s*print\("ATLAS04_SCALE_GUI_ACCEPTED_PASS"/);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/Связано работ: \{project\.items\.filter/);
 assert.match(ui,/＋ Создать связанную работу/);
 assert.match(ui,/＋ Ещё связанная работа/);
});

test("installed Atlas 0.4 opens source-bound fact editor from linked work without implicit data writes",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/wait_title\("Project 119 — Таблица", timeout=15\)/);
 assert.match(script,/Зафиксировать факт по работе: /);
 assert.match(script,/fact_action = visible_uia_action\(window, fact_label\)/);
 assert.match(script,/wait_title\("Форма: Фактическое состояние — заявление", timeout=15\)/);
 assert.match(script,/ATLAS04_WORK_FACT_EDITOR_UIA_PASS/);
 assert.match(script,/cancel\.click_input\(\)/);
 assert.match(script,/ATLAS04_WORK_FACT_CANCEL_NO_MUTATION_PASS/);
 assert.match(script,/len\(p\["findings"\]\) == len\(next\(pr for pr in expected\["projects"\]/);
 assert.match(script,/native\(\)\[0\]\["generation"\] == linked_head\["generation"\]/);
 assert.match(script,/ATLAS04_WORK_FACT_UIA_HOLD/);
});

test("installed linked-work observation requires explicit draft, Save and restart; never grants acceptance",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/observation_note = "Manual observation of partial output; independent review still required"/);
 assert.match(script,/title="Что именно наблюдалось", control_type="Edit"/);
 assert.match(script,/ATLAS04_WORK_FACT_DRAFT_PASS/);
 assert.match(script,/ATLAS04_WORK_FACT_NATIVE_SAVE_PASS/);
 assert.match(script,/ATLAS04_WORK_FACT_NO_AUTOMATIC_ACCEPTANCE_PASS/);
 assert.match(script,/ATLAS04_WORK_FACT_RESTART_READBACK_PASS/);
 assert.match(script,/finding\["targetId"\] == "load-target-119"/);
 assert.match(script,/finding\["workId"\] == work\["id"\]/);
 assert.match(script,/finding\["result"\] == "partial" and finding\["level"\] == "implementation"/);
 assert.match(script,/finding\["origin"\] == "manual" and finding\["sourceId"\] is None/);
 assert.match(script,/related\["state"\] == "todo" and related\["changeId"\] == change\["id"\]/);
 assert.match(script,/assert head\["generation"\] == recorded_head\["generation"\]/);
 assert.doesNotMatch(script,/ATLAS04_SCALE_GUI_BASELINE_PASS_CAUSE_WORKFLOW_HOLD/);
});

test("installed history verifies physical disclosure and requirement navigation separately from native saves",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 assert.match(script,/История наблюдений по работе: "\+work\["title"\]/);
 assert.match(script,/ATLAS04_WORK_HISTORY_DISCLOSURE_UIA_PASS/);
 assert.match(script,/ATLAS04_WORK_HISTORY_TO_REQUIREMENT_UIA_PASS/);
 assert.match(script,/ATLAS04_WORK_HISTORY_UIA_HOLD/);
 assert.match(script,/Открыть требование из наблюдения: "\+work\["title"\]\+" — Expected result"/);
 assert.match(script,/native\(\)\[0\]\["generation"\] == recorded_head\["generation"\]/);
});
