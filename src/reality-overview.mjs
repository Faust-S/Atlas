// Read-only Atlas project overview of requirements, observations and decisions.
// All source observations and authority remain in their existing owners.
export function realityOverview(project, trace, impact) {
  if (!project || !Array.isArray(project.items) || !Array.isArray(project.sources) ||
      !Array.isArray(project.decisions) || !trace || trace.projectId !== project.id ||
      !Array.isArray(trace.rows) || !impact || impact.projectId !== project.id ||
      !Array.isArray(impact.rows)) throw Error('Invalid Atlas reality overview input');

  const sources = new Map(project.sources.map(source => [source.id, source]));
  const impacts = new Map(impact.rows.map(row => [row.targetId, row]));
  const changes = new Map((project.changes || []).map(change => [change.id, change]));
  const decisions = new Map(project.decisions.filter(d => d.changeId).map(d => [d.changeId, d]));
  const reviews = new Map(project.decisions.filter(d => d.kind === 'plan_review').map(d => [d.id, d]));

  const rows = trace.rows.map((target, index) => {
    const linked = impacts.get(target.id);
    const observation = target.latest || null;
    const source = observation?.sourceId ? sources.get(observation.sourceId) : null;
    const proposed = (target.relatedChanges || []).at(-1);
    const change = proposed ? changes.get(proposed.id) : null;
    const decision = change && (decisions.get(change.id) || reviews.get(change.planReviewDecisionId));
    return {
      id: target.id,
      title: target.title,
      desired: target.desired,
      intent: target.intent,
      assessment: target.assessment,
      needsAttention: target.intent === 'committed' && Boolean(linked?.priority),
      observation: observation ? {
        result: observation.result, level: observation.level,
        observedAt: observation.observedAt, note: observation.note || '',
        reference: observation.reference || null
      } : null,
      source: observation?.sourceId ? {
        locator: source?.locator || 'Источник недоступен',
        ref: observation.ref || null, revision: observation.revision || null,
        freshness: target.freshness?.state || 'unknown',
        freshnessNote: target.freshness?.note || ''
      } : null,
      reasons: (linked?.reasons || []).slice(0, 3),
      workCount: linked?.work?.length || 0,
      openWork: linked?.openWork || 0,
      change: change ? {
        id: change.id, title: change.title, status: change.status,
        planApplied: Boolean(change.planAppliedAt),
        decision: decision?.text || null, decidedAt: decision?.at || null
      } : null,
      index
    };
  });

  rows.sort((a, b) =>
    Number(b.needsAttention) - Number(a.needsAttention) ||
    Number(b.intent === 'committed') - Number(a.intent === 'committed') ||
    a.index - b.index
  );
  const unlinkedChanges = (project.changes || []).filter(c => !(c.targetIds || []).length).length;
  return {
    projectId: project.id,
    rows: rows.map(({index, ...row}) => row),
    count: rows.length,
    attention: rows.filter(row => row.needsAttention).length,
    unlinkedChanges,
    // Claims, including manual 'acceptance' claims, never assert verified completion.
    independentAcceptance: false
  };
}
