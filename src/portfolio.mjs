// Portfolio dependencies live inside the existing Atlas snapshot, not another store.
// A project-level dependency is a declared planning constraint, not accepted delivery.
const MAX_LINKS = 2000;
const asText = value => String(value ?? '').trim();
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function validatePortfolioLinks(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.projects)) throw Error('Invalid Atlas portfolio');
  const links = snapshot.portfolioLinks ?? [];
  if (!Array.isArray(links) || links.length > MAX_LINKS) throw Error('Invalid portfolio links');
  const ids = new Set(snapshot.projects.map(p => p.id));
  const seenIds = new Set(), seenEdges = new Set();
  const indegree = new Map([...ids].map(id => [id, 0]));
  const adjacency = new Map([...ids].map(id => [id, []]));
  for (const link of links) {
    if (!link || typeof link.id !== 'string' || !link.id.trim() ||
      link.kind !== 'blocks' || !ids.has(link.from) || !ids.has(link.to) || link.from === link.to ||
      (link.note !== undefined && (typeof link.note !== 'string' || link.note.length > 2000))) {
      throw Error('Invalid portfolio link');
    }
    if (seenIds.has(link.id)) throw Error('Duplicate portfolio link ID');
    const edgeKey = JSON.stringify([link.from, link.to]);
    if (seenEdges.has(edgeKey)) throw Error('Duplicate portfolio dependency');
    seenIds.add(link.id);seenEdges.add(edgeKey);
    indegree.set(link.to, indegree.get(link.to) + 1);
    adjacency.get(link.from).push(link.to);
  }
  const queue = [...ids].filter(id => indegree.get(id) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const to of adjacency.get(queue[i])) {
      indegree.set(to, indegree.get(to) - 1);
      if (indegree.get(to) === 0) queue.push(to);
    }
  }
  if (queue.length !== ids.size) throw Error('Portfolio dependency cycle');
  return queue;
}

export function addPortfolioLink(snapshot, {from, to, note = ''}, newId = () => crypto.randomUUID()) {
  validatePortfolioLinks(snapshot);
  const next = structuredClone(snapshot);
  next.portfolioLinks ??= [];
  next.portfolioLinks.push({id:newId(),kind:'blocks',from,to,note:asText(note)});
  validatePortfolioLinks(next);
  next.revision++;
  return next;
}

export function removePortfolioLink(snapshot, id) {
  validatePortfolioLinks(snapshot);
  if (!(snapshot.portfolioLinks || []).some(link => link.id === id)) throw Error('Unknown portfolio link');
  const next = structuredClone(snapshot);
  next.portfolioLinks = next.portfolioLinks.filter(link => link.id !== id);
  validatePortfolioLinks(next);
  next.revision++;
  return next;
}

export function portfolioNetwork(snapshot) {
  const order = validatePortfolioLinks(snapshot);
  const projects = new Map(snapshot.projects.map(p => [p.id, p]));
  const incoming = new Map(order.map(id => [id, []]));
  for (const link of snapshot.portfolioLinks || []) incoming.get(link.to).push(link.from);
  const levels = new Map();
  for (const id of order) levels.set(id, Math.max(0, ...incoming.get(id).map(parent => levels.get(parent) + 1)));
  const lanes = new Map();
  for (const id of order) {const level = levels.get(id);if (!lanes.has(level)) lanes.set(level, []);lanes.get(level).push(id)}
  const nodes = order.map(id => {
    const project = projects.get(id), level = levels.get(id), row = lanes.get(level).indexOf(id);
    return {id, name:project.name, status:project.status, targets:(project.targets || []).filter(t => t.intent === 'committed').length,
      x:22 + level * 254, y:22 + row * 102};
  });
  const links = (snapshot.portfolioLinks || []).map(link => ({...link,fromName:projects.get(link.from).name,toName:projects.get(link.to).name,
    upstreamStatus:projects.get(link.from).status}));
  const affected = new Set(links.map(link => link.to));
  const pending = links.filter(link => link.upstreamStatus !== 'completed').length;
  const needsReview = links.filter(link => link.upstreamStatus === 'completed').length;
  return {nodes,links,affected:affected.size,pending,needsReview};
}

export function renderPortfolioNetwork(snapshot, escape = htmlEscape) {
  const network = portfolioNetwork(snapshot);
  const rows = network.links.map(link => '<tr><td>'+escape(link.fromName)+'</td><td>'+escape(link.toName)+'</td><td>'+escape(link.note||'Не указано')+'</td><td>'+
    (link.upstreamStatus==='completed'?'Завершение заявлено, проверить приёмку':'Ожидается результат предшественника')+'</td><td><button data-action="unlink:'+escape(link.id)+'">Удалить связь</button></td></tr>').join('');
  const table = '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Предшественник</th><th>Зависимый проект</th><th>Условие</th><th>Состояние</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  let graph = '';
  if(network.nodes.length > 100) graph = '<p class="muted">Для крупных портфелей оставлена таблица связей. Отображение графа ограничено 100 проектами.</p>';
  else if(network.nodes.length) {
    const byId = new Map(network.nodes.map(node=>[node.id,node]));
    const width = Math.max(340,...network.nodes.map(node=>node.x+224));
    const height = Math.max(150,...network.nodes.map(node=>node.y+76));
    const edges = network.links.map(link => {
      const a=byId.get(link.from),b=byId.get(link.to),x1=a.x+204,y1=a.y+31,x2=b.x,y2=b.y+31,cx=(x1+x2)/2;
      return '<path d="M'+x1+' '+y1+' C'+cx+' '+y1+' '+cx+' '+y2+' '+x2+' '+y2+'" fill="none" stroke="#8999a9" stroke-width="2" marker-end="url(#atlas-portfolio-arrow)"/>';
    }).join('');
    const nodes = network.nodes.map(node=>{
      const label = node.name.length>26?node.name.slice(0,25)+'…':node.name;
      const stroke = node.status==='completed'?'#387d77':'#556b8a';
      return '<g><title>'+escape(node.name+'; '+node.status)+'</title><rect x="'+node.x+'" y="'+node.y+'" width="204" height="64" rx="10" fill="#fff" stroke="'+stroke+'" stroke-width="2"/><text x="'+(node.x+12)+'" y="'+(node.y+26)+'" fill="#203044" font-size="13">'+escape(label)+'</text><text x="'+(node.x+12)+'" y="'+(node.y+47)+'" fill="#587187" font-size="11">'+escape(node.status)+' · требований: '+node.targets+'</text></g>';
    }).join('');
    graph = '<div class="atlas-graph-scroll" role="region" aria-label="Связи проектов" tabindex="0"><svg role="img" aria-label="Граф зависимостей портфеля" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><defs><marker id="atlas-portfolio-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#8999a9"/></marker></defs>'+edges+nodes+'</svg></div>';
  }
  return '<section class="card"><div class="row"><h2>Зависимости между проектами</h2><button data-action="portfolio-link">＋ Связать проекты</button></div>'+
    '<p class="muted">Направление стрелки: результат первого проекта необходим второму. Статус «завершён» заявлен вручную и не подтверждает приёмку.</p>'+
    '<div class="atlas-kpis"><div><small>Явных связей</small><strong>'+network.links.length+'</strong></div><div><small>Зависимых проектов</small><strong>'+network.affected+'</strong></div><div><small>Предшественники не завершены</small><strong>'+network.pending+'</strong></div><div><small>Проверить заявленное завершение</small><strong>'+network.needsReview+'</strong></div></div>'+
    graph+(network.links.length?table:'<p class="muted">Пока нет межпроектных зависимостей. Свяжите два проекта, чтобы видеть очередность и ограничения.</p>')+'</section>';
}

export function renderProjectRelations(snapshot, projectId, escape = htmlEscape) {
  const network = portfolioNetwork(snapshot);
  const incoming = network.links.filter(link => link.to === projectId);
  const outgoing = network.links.filter(link => link.from === projectId);
  if(!incoming.length&&!outgoing.length)return '';
  const item = (link, upstream) => {
    const otherName = upstream ? link.fromName : link.toName;
    const otherId = upstream ? link.from : link.to;
    return '<li><button class="atlas-plain-button" data-action="open:'+escape(otherId)+'">'+escape(otherName)+'</button>'+
      (link.note ? ' · '+escape(link.note) : '')+'</li>';
  };
  return '<section class="card"><h2>Связи с другими проектами</h2>'+
    (incoming.length ? '<h3>От каких проектов зависит</h3><ul>'+incoming.map(link=>item(link,true)).join('')+'</ul>' : '')+
    (outgoing.length ? '<h3>Какие проекты зависят от этого</h3><ul>'+outgoing.map(link=>item(link,false)).join('')+'</ul>' : '')+
    '<p class="muted">Это плановые зависимости портфеля, а не автоматическая приёмка или исполнение.</p></section>';
}
