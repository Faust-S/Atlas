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
  const state = new Uint8Array(nodes.length); // 0: unseen, 1: visiting, 2: ordered
  const outgoingEdges = outgoing(edges);
  const nodesHash = new Map(nodes.map((node, index) => [node, index]));
  for (const [from, to] of edges) {
    if (!nodesHash.has(from) || !nodesHash.has(to)) {
      throw new Error('Unknown node in supplied edges');
    }
  }

  // Preserve the original depth-first order (including isolated nodes and the
  // reverse insertion order of children) without recursion. Project work DAGs
  // can be thousands of nodes deep and must not exhaust the JS call stack.
  for (let start = nodes.length - 1; start >= 0; start--) {
    if (state[start] !== 0) continue;
    const stack = [{index: start, remaining: null}];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.remaining === null) {
        state[frame.index] = 1;
        frame.remaining = Array.from(outgoingEdges.get(nodes[frame.index]) || []);
      }
      if (frame.remaining.length) {
        const child = frame.remaining.pop();
        const index = nodesHash.get(child);
        if (state[index] === 1) throw new Error('Cyclic dependency, node: ' + String(child));
        if (state[index] === 0) stack.push({index, remaining: null});
      } else {
        state[frame.index] = 2;
        sorted[--cursor] = nodes[frame.index];
        stack.pop();
      }
    }
  }
  return sorted;
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
