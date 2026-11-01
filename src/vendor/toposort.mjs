/**
 * Adapted to ES modules from Marcel Klehr's toposort (MIT).
 * Original: https://github.com/marcelklehr/toposort/blob/master/index.js
 * Copyright (c) 2012 Marcel Klehr. See LICENSE-toposort.txt.
 * The graph's nodes and directed edges are inputs; the dependency-order
 * computation is provided by the upstream implementation.
 */
export default function toposort(edges) {
  return sort([...new Set(edges.flat())], edges);
}
toposort.array = sort;
function sort(nodes, edges) {
  let cursor = nodes.length;
  const sorted = new Array(cursor);
  const visited = {};
  let i = cursor;
  const outgoingEdges = outgoing(edges);
  const nodesHash = new Map(nodes.map((node, index) => [node, index]));
  edges.forEach(edge => {
    if (!nodesHash.has(edge[0]) || !nodesHash.has(edge[1])) {
      throw new Error('Unknown node in supplied edges');
    }
  });
  while (i--) if (!visited[i]) visit(nodes[i], i, new Set());
  return sorted;
  function visit(node, i, predecessors) {
    if (predecessors.has(node)) throw new Error('Cyclic dependency, node: ' + String(node));
    if (!nodesHash.has(node)) throw new Error('Unknown node: ' + String(node));
    if (visited[i]) return;
    visited[i] = true;
    let nodesOut = Array.from(outgoingEdges.get(node) || new Set());
    if (i = nodesOut.length) {
      predecessors.add(node);
      do {
        const child = nodesOut[--i];
        visit(child, nodesHash.get(child), predecessors);
      } while (i);
      predecessors.delete(node);
    }
    sorted[--cursor] = node;
  }
}
function outgoing(edges) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
  }
  return adj;
}
