/**
 * Motor de visualización gráfica adaptativa para el subset de Python:
 * - Grafos (dirigidos, no dirigidos, ponderados, BFS/DFS, Dijkstra, Bellman-Ford, Kruskal, Kahn)
 * - Árboles Binarios (instancias de clase Node con key, left, right y punteros activos)
 * - Listas / Arrays (barras proporcionales, celdas indexadas, subrango [lo..hi], punteros i/j/k/m/lo/mid/hi)
 * - Colas (deque FIFO), Pilas (stack LIFO), Colas de Prioridad (heapq)
 * - Diccionarios (dist, in_degree, parent) y Conjuntos (visited)
 * - Pila de llamadas (Call Stack) e Inspector de Variables
 */

const POINTER_NAMES = new Set([
  'i', 'j', 'k', 'm', 'lo', 'hi', 'mid', 's', 'end', 'start', 'root', 'child', 'v'
]);

const POINTER_COLORS = {
  i: '#3b82f6',     // Azul
  j: '#f59e0b',     // Ámbar
  k: '#10b981',     // Esmeralda
  m: '#ec4899',     // Rosa
  lo: '#8b5cf6',    // Violeta
  mid: '#06b6d4',   // Cian
  hi: '#ef4444',    // Rojo
  s: '#6366f1',     // Índigo
  end: '#f97316',   // Naranja
  root: '#14b8a6',  // Teal
  child: '#eab308', // Amarillo
  v: '#a855f7'      // Púrpura
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScalar(val) {
  if (val === null || val === undefined) return 'None';
  if (val === true) return 'True';
  if (val === false) return 'False';
  if (typeof val === 'number') {
    if (val === Infinity) return '∞';
    if (val === -Infinity) return '-∞';
    return String(val);
  }
  if (typeof val === 'string') return `"${val}"`;
  if (val.__py === 'tuple') {
    return `(${val.items.map(formatScalar).join(', ')})`;
  }
  if (val.__py === 'list') {
    return `[${val.items.map(formatScalar).join(', ')}]`;
  }
  if (val.__py === 'instance' && val.className === 'Node') {
    return `Node(${formatScalar(val.attrs.key)})`;
  }
  return String(val);
}

/**
 * Combina las variables del frame global y del frame activo para inspección rápida
 */
function collectVisibleVars(step) {
  if (!step || !step.frames || step.frames.length === 0) {
    return { activeFrame: null, globalFrame: null, merged: {} };
  }
  const globalFrame = step.frames[0];
  const activeFrame = step.frames[step.frames.length - 1];
  const merged = {};

  for (const [k, info] of Object.entries(globalFrame.vars)) {
    merged[k] = { ...info, scope: '<global>' };
  }
  if (activeFrame !== globalFrame) {
    for (const [k, info] of Object.entries(activeFrame.vars)) {
      merged[k] = { ...info, scope: activeFrame.name };
    }
  }
  return { activeFrame, globalFrame, merged };
}

/**
 * Detecta si hay un grafo en las variables visibles y extrae nodos, aristas y metadatos
 */
function detectGraph(merged) {
  // Caso 1: diccionario `graph` (ej. BFS, DFS, Dijkstra, Topological Sort)
  if (merged.graph && merged.graph.value && merged.graph.value.__py === 'dict') {
    const dict = merged.graph.value;
    const nodes = [];
    const nodeSet = new Set();
    const edges = [];
    let weighted = false;

    for (const entry of dict.entries) {
      const u = String(entry.key);
      if (!nodeSet.has(u)) {
        nodeSet.add(u);
        nodes.push(u);
      }
    }

    for (const entry of dict.entries) {
      const u = String(entry.key);
      const neighbors = entry.value;
      if (neighbors && neighbors.__py === 'list') {
        for (const item of neighbors.items) {
          if (item && (item.__py === 'tuple' || item.__py === 'list') && item.items.length >= 2) {
            const v = String(item.items[0]);
            const w = item.items[1];
            weighted = true;
            if (!nodeSet.has(v)) {
              nodeSet.add(v);
              nodes.push(v);
            }
            edges.push({ u, v, w, directed: true });
          } else {
            const v = String(item);
            if (!nodeSet.has(v)) {
              nodeSet.add(v);
              nodes.push(v);
            }
            edges.push({ u, v, w: null, directed: true });
          }
        }
      }
    }

    return { nodes, edges, weighted, directed: true, sourceType: 'adj_dict' };
  }

  // Caso 2: listas `vertices` y `edges` (ej. Bellman-Ford, Kruskal)
  if (
    merged.vertices && merged.vertices.value && merged.vertices.value.__py === 'list' &&
    merged.edges && merged.edges.value && merged.edges.value.__py === 'list'
  ) {
    const nodes = merged.vertices.value.items.map(String);
    const edges = [];
    let directed = true;

    // En Kruskal las tuplas son (w, u, v); en Bellman-Ford son (u, v, w)
    const isKruskal = Boolean(merged.mst || merged.parent);
    if (isKruskal) directed = false;

    for (const item of merged.edges.value.items) {
      if (item && (item.__py === 'tuple' || item.__py === 'list') && item.items.length >= 3) {
        const [a, b, c] = item.items;
        if (typeof a === 'number' && typeof b === 'string') {
          edges.push({ u: String(b), v: String(c), w: a, directed: false });
          directed = false;
        } else {
          edges.push({ u: String(a), v: String(b), w: c, directed });
        }
      }
    }
    return { nodes, edges, weighted: true, directed, sourceType: 'edge_list' };
  }

  return null;
}

/**
 * Renderiza un grafo en SVG con superposición de visitados, distancias, grados de entrada y arista activa
 */
function renderGraphSection(graphData, merged, step) {
  const { nodes, edges, directed } = graphData;
  const width = 660;
  const height = 310;
  const cx = width / 2;
  const cy = height / 2 + 6;

  // Calcular posiciones de los nodos
  const positions = {};
  const n = nodes.length;
  if (n <= 6) {
    // Disposición elíptica equilibrada evitando colisiones de aristas horizontales
    const rx = 225;
    const ry = 108;
    nodes.forEach((nodeId, idx) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      positions[nodeId] = {
        x: Math.round(cx + rx * Math.cos(angle)),
        y: Math.round(cy + ry * Math.sin(angle))
      };
    });
  } else {
    const rx = 245;
    const ry = 115;
    nodes.forEach((nodeId, idx) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      positions[nodeId] = {
        x: Math.round(cx + rx * Math.cos(angle)),
        y: Math.round(cy + ry * Math.sin(angle))
      };
    });
  }

  // Extraer estado algorítmico superpuesto
  const visitedSet = new Set();
  if (merged.visited && merged.visited.value && merged.visited.value.__py === 'set') {
    for (const v of merged.visited.value.items) visitedSet.add(String(v));
  }
  if (merged.order && merged.order.value && merged.order.value.__py === 'list') {
    for (const v of merged.order.value.items) visitedSet.add(String(v));
  }

  const activeNode = merged.node && typeof merged.node.value === 'string'
    ? merged.node.value
    : (merged.u && typeof merged.u.value === 'string' ? merged.u.value : null);

  const activeNeighbor = merged.neighbor && typeof merged.neighbor.value === 'string'
    ? merged.neighbor.value
    : (merged.v && typeof merged.v.value === 'string' ? merged.v.value : null);

  // Aristas en el MST (Kruskal)
  const mstEdges = new Set();
  if (merged.mst && merged.mst.value && merged.mst.value.__py === 'list') {
    for (const item of merged.mst.value.items) {
      if (item && item.items && item.items.length >= 2) {
        const u = String(item.items[0]);
        const v = String(item.items[1]);
        mstEdges.add(`${u}->${v}`);
        mstEdges.add(`${v}->${u}`);
      }
    }
  }

  // Diccionario dist o in_degree o parent
  const distMap = new Map();
  if (merged.dist && merged.dist.value && merged.dist.value.__py === 'dict') {
    for (const e of merged.dist.value.entries) {
      distMap.set(String(e.key), e.value === Infinity ? '∞' : String(e.value));
    }
  }
  const inDegreeMap = new Map();
  if (merged.in_degree && merged.in_degree.value && merged.in_degree.value.__py === 'dict') {
    for (const e of merged.in_degree.value.entries) {
      inDegreeMap.set(String(e.key), String(e.value));
    }
  }
  const parentMap = new Map();
  if (merged.parent && merged.parent.value && merged.parent.value.__py === 'dict') {
    for (const e of merged.parent.value.entries) {
      parentMap.set(String(e.key), String(e.value));
    }
  }

  // Detectar pares con aristas recíprocas para curvarlas
  const edgePairs = new Set(edges.map((e) => `${e.u}->${e.v}`));

  let edgesSvg = '';
  for (const e of edges) {
    const p1 = positions[e.u];
    const p2 = positions[e.v];
    if (!p1 || !p2) continue;

    const isReciprocal = directed && edgePairs.has(`${e.v}->${e.u}`);
    const isActiveEdge = activeNode === e.u && activeNeighbor === e.v;
    const isMstEdge = mstEdges.has(`${e.u}->${e.v}`);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nodeRadius = 24;

    const ux = dx / dist;
    const uy = dy / dist;

    const startX = p1.x + ux * nodeRadius;
    const startY = p1.y + uy * nodeRadius;
    const endPad = directed ? nodeRadius + 7 : nodeRadius;
    const endX = p2.x - ux * endPad;
    const endY = p2.y - uy * endPad;

    let pathD = '';
    let labelX = (startX + endX) / 2;
    let labelY = (startY + endY) / 2;

    if (isReciprocal) {
      const nx = -uy;
      const ny = ux;
      const curveOffset = 26;
      const cxCtrl = (startX + endX) / 2 + nx * curveOffset;
      const cyCtrl = (startY + endY) / 2 + ny * curveOffset;
      pathD = `M ${startX} ${startY} Q ${cxCtrl} ${cyCtrl} ${endX} ${endY}`;
      labelX = (startX + 2 * cxCtrl + endX) / 4;
      labelY = (startY + 2 * cyCtrl + endY) / 4;
    } else {
      pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    let strokeClass = 'graph-edge';
    let marker = directed ? 'url(#arrow-default)' : '';
    if (isActiveEdge) {
      strokeClass += ' edge-active';
      marker = directed ? 'url(#arrow-active)' : '';
    } else if (isMstEdge) {
      strokeClass += ' edge-mst';
      marker = directed ? 'url(#arrow-mst)' : '';
    }

    edgesSvg += `<path d="${pathD}" class="${strokeClass}" marker-end="${marker}" />`;

    if (e.w !== null && e.w !== undefined) {
      edgesSvg += `
        <g transform="translate(${labelX}, ${labelY})">
          <rect x="-14" y="-10" width="28" height="20" rx="5" class="edge-weight-bg ${isActiveEdge ? 'weight-active' : ''}" />
          <text x="0" y="4" text-anchor="middle" class="edge-weight-text">${escapeHtml(e.w)}</text>
        </g>
      `;
    }
  }

  let nodesSvg = '';
  for (const nodeId of nodes) {
    const p = positions[nodeId];
    if (!p) continue;
    const isVisited = visitedSet.has(nodeId);
    const isCurrent = activeNode === nodeId;
    const isNeighbor = activeNeighbor === nodeId;

    let nodeClass = 'graph-node';
    if (isCurrent) nodeClass += ' node-current';
    else if (isNeighbor) nodeClass += ' node-neighbor';
    else if (isVisited) nodeClass += ' node-visited';

    const labelRadius = nodeId.length > 2 ? 26 : 23;

    // Etiquetas superiores de puntero (node / u / neighbor / v)
    const ptrBadges = [];
    if (merged.node && merged.node.value === nodeId) ptrBadges.push('node');
    if (merged.u && merged.u.value === nodeId) ptrBadges.push('u');
    if (merged.neighbor && merged.neighbor.value === nodeId) ptrBadges.push('neighbor');
    if (merged.v && merged.v.value === nodeId) ptrBadges.push('v');
    if (merged.start && merged.start.value === nodeId) ptrBadges.push('start');

    let badgeSvg = '';
    if (ptrBadges.length > 0) {
      const txt = ptrBadges.join(', ');
      const bw = Math.max(38, txt.length * 7.5 + 12);
      badgeSvg += `
        <g transform="translate(${p.x}, ${p.y - labelRadius - 14})">
          <rect x="${-bw / 2}" y="-10" width="${bw}" height="18" rx="9" class="node-ptr-pill" />
          <text x="0" y="3" text-anchor="middle" class="node-ptr-text">${escapeHtml(txt)}</text>
        </g>
      `;
    }

    // Etiqueta inferior (dist, in_degree o parent)
    let metaText = '';
    if (distMap.has(nodeId)) {
      metaText = `d=${distMap.get(nodeId)}`;
    } else if (inDegreeMap.has(nodeId)) {
      metaText = `in=${inDegreeMap.get(nodeId)}`;
    } else if (parentMap.has(nodeId)) {
      metaText = `p=${parentMap.get(nodeId)}`;
    }

    let metaSvg = '';
    if (metaText) {
      const mw = Math.max(38, metaText.length * 7 + 12);
      metaSvg = `
        <g transform="translate(${p.x}, ${p.y + labelRadius + 14})">
          <rect x="${-mw / 2}" y="-9" width="${mw}" height="18" rx="6" class="node-meta-pill" />
          <text x="0" y="4" text-anchor="middle" class="node-meta-text">${escapeHtml(metaText)}</text>
        </g>
      `;
    }

    nodesSvg += `
      <g class="${nodeClass}">
        <circle cx="${p.x}" cy="${p.y}" r="${labelRadius}" class="node-circle" />
        <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" class="node-label">${escapeHtml(nodeId)}</text>
        ${badgeSvg}
        ${metaSvg}
      </g>
    `;
  }

  return `
    <div class="viz-card">
      <div class="viz-card-header">
        <span class="viz-card-title">Grafo (${directed ? 'Dirigido' : 'No Dirigido / MST'})</span>
        <div class="viz-legend">
          <span class="legend-item"><span class="legend-dot dot-current"></span>Activo (node/u)</span>
          <span class="legend-item"><span class="legend-dot dot-neighbor"></span>Vecino (neighbor/v)</span>
          <span class="legend-item"><span class="legend-dot dot-visited"></span>Visitado / MST</span>
        </div>
      </div>
      <div class="svg-stage">
        <svg viewBox="0 0 ${width} ${height}" class="viz-svg" role="img" aria-label="Visualización del grafo">
          <defs>
            <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" class="arrow-fill-default" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" class="arrow-fill-active" />
            </marker>
            <marker id="arrow-mst" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" class="arrow-fill-mst" />
            </marker>
          </defs>
          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>
    </div>
  `;
}

/**
 * Detecta y renderiza árboles binarios compuestos por instancias de Node(key, left, right)
 */
function detectAndRenderBinaryTree(step, merged) {
  // Buscar todas las instancias de clase Node en cualquier frame
  const allNodesById = new Map();
  const childIds = new Set();
  const pointersByNodeId = new Map();

  for (const frame of step.frames) {
    for (const [varName, info] of Object.entries(frame.vars)) {
      const val = info.value;
      if (val && val.__py === 'instance' && val.className === 'Node') {
        collectTreeNodes(val, allNodesById, childIds);
        if (!pointersByNodeId.has(val.id)) pointersByNodeId.set(val.id, []);
        const label = frame.name === '<global>' ? varName : `${varName}`;
        if (!pointersByNodeId.get(val.id).includes(label)) {
          pointersByNodeId.get(val.id).push(label);
        }
      }
    }
  }

  if (allNodesById.size === 0) return '';

  // Determinar nodo raíz principal (preferir root global o nodo sin padre)
  let mainRoot = null;
  if (merged.root && merged.root.value && merged.root.value.__py === 'instance') {
    mainRoot = merged.root.value;
  } else {
    for (const [id, node] of allNodesById.entries()) {
      if (!childIds.has(id)) {
        mainRoot = node;
        break;
      }
    }
  }
  if (!mainRoot) {
    mainRoot = Array.from(allNodesById.values())[0];
  }

  const width = 660;
  const levelHeight = 64;
  const maxDepth = getTreeDepth(mainRoot);
  const height = Math.max(220, (maxDepth + 1) * levelHeight + 40);

  const layoutNodes = [];
  const layoutEdges = [];

  function assignCoords(node, depth, xMin, xMax, visited = new Set()) {
    if (!node || node.__py !== 'instance' || visited.has(node.id)) return null;
    visited.add(node.id);
    const x = (xMin + xMax) / 2;
    const y = 42 + depth * levelHeight;
    layoutNodes.push({ node, x, y });

    const left = node.attrs.left;
    if (left && left.__py === 'instance') {
      const childPos = assignCoords(left, depth + 1, xMin, x, visited);
      if (childPos) {
        layoutEdges.push({ x1: x, y1: y, x2: childPos.x, y2: childPos.y, dir: 'L' });
      }
    }
    const right = node.attrs.right;
    if (right && right.__py === 'instance') {
      const childPos = assignCoords(right, depth + 1, x, xMax, visited);
      if (childPos) {
        layoutEdges.push({ x1: x, y1: y, x2: childPos.x, y2: childPos.y, dir: 'R' });
      }
    }
    return { x, y };
  }

  assignCoords(mainRoot, 0, 24, width - 24);

  let svgContent = '';
  for (const e of layoutEdges) {
    svgContent += `
      <line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" class="tree-edge" />
    `;
  }

  const activeNodeId = merged.node && merged.node.value && merged.node.value.__py === 'instance'
    ? merged.node.value.id
    : (merged.self && merged.self.value && merged.self.value.__py === 'instance' ? merged.self.value.id : null);

  for (const { node, x, y } of layoutNodes) {
    const isActive = node.id === activeNodeId;
    const ptrs = pointersByNodeId.get(node.id) || [];
    let ptrBadge = '';
    if (ptrs.length > 0) {
      const txt = ptrs.join(', ');
      const bw = Math.max(38, txt.length * 7.5 + 12);
      ptrBadge = `
        <g transform="translate(${x}, ${y - 32})">
          <rect x="${-bw / 2}" y="-10" width="${bw}" height="18" rx="9" class="node-ptr-pill" />
          <text x="0" y="3" text-anchor="middle" class="node-ptr-text">${escapeHtml(txt)}</text>
        </g>
      `;
    }

    svgContent += `
      <g class="tree-node ${isActive ? 'node-current' : ''}">
        <circle cx="${x}" cy="${y}" r="20" class="node-circle" />
        <text x="${x}" y="${y + 4}" text-anchor="middle" class="node-label">${escapeHtml(node.attrs.key)}</text>
        ${ptrBadge}
      </g>
    `;
  }

  const keyInfo = merged.key !== undefined && typeof merged.key.value === 'number'
    ? `<span class="viz-pill">key = <strong>${escapeHtml(merged.key.value)}</strong></span>`
    : '';

  return `
    <div class="viz-card">
      <div class="viz-card-header">
        <span class="viz-card-title">Árbol Binario de Búsqueda (Node)</span>
        <div class="viz-legend">${keyInfo}</div>
      </div>
      <div class="svg-stage">
        <svg viewBox="0 0 ${width} ${height}" class="viz-svg" role="img" aria-label="Árbol binario de búsqueda">
          ${svgContent}
        </svg>
      </div>
    </div>
  `;
}

function collectTreeNodes(node, map, childIds) {
  if (!node || node.__py !== 'instance' || map.has(node.id)) return;
  map.set(node.id, node);
  if (node.attrs.left && node.attrs.left.__py === 'instance') {
    childIds.add(node.attrs.left.id);
    collectTreeNodes(node.attrs.left, map, childIds);
  }
  if (node.attrs.right && node.attrs.right.__py === 'instance') {
    childIds.add(node.attrs.right.id);
    collectTreeNodes(node.attrs.right, map, childIds);
  }
}

function getTreeDepth(node, visited = new Set()) {
  if (!node || node.__py !== 'instance' || visited.has(node.id)) return 0;
  visited.add(node.id);
  return 1 + Math.max(getTreeDepth(node.attrs.left, visited), getTreeDepth(node.attrs.right, visited));
}

/**
 * Renderiza listas, arrays con barras/índices/punteros, colas (deque), pilas (stack) y heaps (pq)
 */
function renderSequencesSection(step, merged, hasGraph) {
  const sequences = [];
  const seenIds = new Set();

  // Recoger secuencias dando prioridad al frame activo
  const framesReversed = [...step.frames].reverse();
  for (const frame of framesReversed) {
    for (const [name, info] of Object.entries(frame.vars)) {
      const val = info.value;
      if (!val || (val.__py !== 'list' && val.__py !== 'deque')) continue;
      if (hasGraph && (name === 'vertices' || name === 'edges')) continue;

      if (seenIds.has(val.id)) {
        const existing = sequences.find((s) => s.val.id === val.id);
        if (existing && !existing.aliases.includes(name)) {
          existing.aliases.push(name);
        }
        continue;
      }
      seenIds.add(val.id);
      sequences.push({
        name,
        aliases: [name],
        val,
        scope: frame.name
      });
    }
  }

  if (sequences.length === 0) return '';

  // Extraer punteros enteros del frame activo (ej. i, j, k, m, lo, mid, hi)
  const activeVars = step.frames[step.frames.length - 1].vars;
  const intPointers = {};
  for (const [vName, vInfo] of Object.entries(activeVars)) {
    if (POINTER_NAMES.has(vName) && typeof vInfo.value === 'number' && Number.isInteger(vInfo.value)) {
      intPointers[vName] = vInfo.value;
    }
  }

  const loBound = typeof intPointers.lo === 'number' ? intPointers.lo : null;
  const hiBound = typeof intPointers.hi === 'number' ? intPointers.hi : null;

  const readIndicesByObj = new Map();
  for (const r of step.reads || []) {
    if (r.index !== undefined) {
      if (!readIndicesByObj.has(r.targetId)) readIndicesByObj.set(r.targetId, new Set());
      readIndicesByObj.get(r.targetId).add(r.index);
    }
  }

  const writeIndicesByObj = new Map();
  for (const w of step.writes || []) {
    if (w.index !== undefined) {
      if (!writeIndicesByObj.has(w.targetId)) writeIndicesByObj.set(w.targetId, new Set());
      writeIndicesByObj.get(w.targetId).add(w.index);
    }
  }

  let html = '';
  for (const seq of sequences) {
    const items = seq.val.items;
    const isDeque = seq.val.__py === 'deque';
    const isStack = seq.aliases.includes('stack');
    const isPq = seq.aliases.includes('pq');
    const isPrimaryArray = seq.aliases.includes('a') || seq.aliases.includes('nums');
    const isCountArray = seq.aliases.includes('count');

    const allNumbers = items.length > 0 && items.every((x) => typeof x === 'number' && Number.isFinite(x));
    const showBars = allNumbers && (isPrimaryArray || seq.aliases.includes('aux') || seq.aliases.includes('out'));

    let maxVal = 1;
    let minVal = 0;
    if (showBars) {
      maxVal = Math.max(1, ...items.map((x) => Math.abs(x)));
      minVal = Math.min(0, ...items);
    }

    const reads = readIndicesByObj.get(seq.val.id) || new Set();
    const writes = writeIndicesByObj.get(seq.val.id) || new Set();

    let badgeLabel = 'list';
    if (isDeque) badgeLabel = 'deque (Cola FIFO: popleft ⟵ ... ⟵ append)';
    else if (isStack) badgeLabel = 'list (Pila LIFO: append / pop ⟶)';
    else if (isPq) badgeLabel = 'list (Cola de Prioridad / Min-Heap)';

    // Determinar qué punteros aplican a esta secuencia
    const applicablePointers = {};
    if (isPrimaryArray) {
      for (const [pName, pVal] of Object.entries(intPointers)) {
        if (pName === 'v' && isCountArray) continue;
        applicablePointers[pName] = pVal;
      }
    } else if (isCountArray && intPointers.v !== undefined) {
      applicablePointers.v = intPointers.v;
    }

    let cellsHtml = '';
    if (items.length === 0) {
      cellsHtml = `<div class="empty-seq">Secuencia vacía <code>[]</code></div>`;
    } else {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const isRead = reads.has(idx);
        const isWrite = writes.has(idx);
        const outOfRange = isPrimaryArray && loBound !== null && hiBound !== null && (idx < loBound || idx > hiBound);

        let cellClass = 'array-col';
        if (isWrite) cellClass += ' col-write';
        else if (isRead) cellClass += ' col-read';
        if (outOfRange) cellClass += ' col-dimmed';

        // Barra proporcional
        let barHtml = '';
        if (showBars) {
          const ratio = Math.max(0.1, Math.abs(item) / maxVal);
          const heightPct = Math.round(ratio * 100);
          barHtml = `
            <div class="bar-track">
              <div class="bar-fill" style="height: ${heightPct}%"></div>
            </div>
          `;
        }

        // Punteros que apuntan a este índice
        const ptrsHere = Object.entries(applicablePointers)
          .filter(([, val]) => val === idx)
          .map(([name]) => name);

        let ptrHtml = '';
        if (ptrsHere.length > 0) {
          ptrHtml = `<div class="ptr-stack">` +
            ptrsHere.map((pName) => {
              const color = POINTER_COLORS[pName] || '#6366f1';
              return `<span class="ptr-tag" style="--ptr-color: ${color}">▲ ${escapeHtml(pName)}</span>`;
            }).join('') +
            `</div>`;
        } else if (Object.keys(applicablePointers).length > 0) {
          ptrHtml = `<div class="ptr-stack ptr-placeholder"></div>`;
        }

        cellsHtml += `
          <div class="${cellClass}">
            ${barHtml}
            <div class="cell-box">${escapeHtml(formatScalar(item))}</div>
            <div class="cell-index">${idx}</div>
            ${ptrHtml}
          </div>
        `;
      }
    }

    // Mostrar punteros en -1 (por ejemplo j = -1 al salir del bucle en insertion_sort)
    const minusOnePtrs = Object.entries(applicablePointers)
      .filter(([, val]) => val < 0 || val >= items.length)
      .map(([name, val]) => `${name}=${val}`);

    const outBoundsBadge = minusOnePtrs.length > 0
      ? `<span class="viz-pill pill-warn">Fuera de rango: ${escapeHtml(minusOnePtrs.join(', '))}</span>`
      : '';

    const displayName = seq.aliases.join(' / ');
    html += `
      <div class="viz-card">
        <div class="viz-card-header">
          <div>
            <span class="viz-card-title"><code>${escapeHtml(displayName)}</code></span>
            <span class="viz-type-badge">${escapeHtml(badgeLabel)}</span>
          </div>
          <div class="viz-legend">
            ${outBoundsBadge}
            <span class="legend-item"><span class="legend-dot dot-read"></span>Lectura</span>
            <span class="legend-item"><span class="legend-dot dot-write"></span>Escritura</span>
          </div>
        </div>
        <div class="array-stage">
          ${cellsHtml}
        </div>
      </div>
    `;
  }

  return html;
}

/**
 * Renderiza variables escalares clave (key, pivot, target, total, calls, etc.) y conjuntos/diccionarios auxiliares
 */
function renderScalarsAndSetsSection(step, merged, hasGraph) {
  const scalarCards = [];
  const changedSet = new Set((step.changedVars || []).map((c) => c.varName));

  for (const [name, info] of Object.entries(merged)) {
    const val = info.value;
    if (val === null || typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
      // Destacar variables escalares relevantes
      const isChanged = changedSet.has(name);
      scalarCards.push({
        name,
        valStr: formatScalar(val),
        type: info.type,
        isChanged,
        color: POINTER_COLORS[name] || null
      });
    } else if (val && val.__py === 'set') {
      scalarCards.push({
        name,
        valStr: val.items.length === 0 ? '∅ (vacío)' : `{ ${val.items.map(formatScalar).join(', ')} }`,
        type: 'set',
        isChanged: changedSet.has(name),
        color: null
      });
    } else if (val && val.__py === 'dict' && name !== 'graph') {
      const pairs = val.entries.map((e) => `${formatScalar(e.key)}: ${formatScalar(e.value)}`).join(', ');
      scalarCards.push({
        name,
        valStr: `{ ${pairs} }`,
        type: 'dict',
        isChanged: changedSet.has(name),
        color: null
      });
    }
  }

  if (scalarCards.length === 0) return '';

  const itemsHtml = scalarCards.map((c) => {
    const borderStyle = c.color ? `style="border-left: 3px solid ${c.color}"` : '';
    return `
      <div class="scalar-chip ${c.isChanged ? 'chip-changed' : ''}" ${borderStyle}>
        <span class="scalar-name">${escapeHtml(c.name)}</span>
        <span class="scalar-val">${escapeHtml(c.valStr)}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="scalars-bar">
      ${itemsHtml}
    </div>
  `;
}

/**
 * Renderiza la Pila de Llamadas (Call Stack)
 */
function renderCallStack(step) {
  if (!step || !step.frames) return '';
  const frames = [...step.frames].reverse();

  return frames.map((frame, idx) => {
    const isTop = idx === 0;
    const varEntries = Object.entries(frame.vars);
    const varsHtml = varEntries.length === 0
      ? `<span class="frame-empty">Sin variables locales</span>`
      : varEntries.map(([k, info]) => `
          <div class="frame-var-row">
            <span class="frame-var-key">${escapeHtml(k)}</span>
            <span class="frame-var-val">${escapeHtml(info.repr)}</span>
          </div>
        `).join('');

    return `
      <div class="stack-frame ${isTop ? 'frame-active' : ''}">
        <div class="stack-frame-header">
          <span class="frame-fn-name">${escapeHtml(frame.name)}</span>
          <span class="frame-line-badge">Línea ${frame.line}</span>
        </div>
        <div class="stack-frame-body">
          ${varsHtml}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza la Tabla Inspectora de Variables detallada
 */
function renderVariablesTable(step) {
  if (!step || !step.frames) return '';
  const { merged } = collectVisibleVars(step);
  const changedSet = new Set((step.changedVars || []).map((c) => c.varName));
  const entries = Object.entries(merged);

  if (entries.length === 0) {
    return `<div class="empty-panel-msg">No hay variables definidas en este paso.</div>`;
  }

  const rows = entries.map(([name, info]) => {
    const changed = changedSet.has(name);
    return `
      <tr class="${changed ? 'row-changed' : ''}">
        <td><code>${escapeHtml(name)}</code></td>
        <td><span class="type-pill">${escapeHtml(info.type)}</span></td>
        <td><span class="scope-pill">${escapeHtml(info.scope)}</span></td>
        <td class="val-cell"><code>${escapeHtml(info.repr)}</code></td>
      </tr>
    `;
  }).join('');

  return `
    <table class="vars-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Tipo</th>
          <th>Ámbito</th>
          <th>Valor actual</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Función principal que actualiza todos los paneles visuales para un paso dado
 */
function renderStepVisualization(step, containers) {
  const { stageEl, callStackEl, varsTableEl, consoleEl } = containers;

  if (!step) {
    stageEl.innerHTML = `<div class="empty-stage">Selecciona un algoritmo o pulsa Ejecutar para visualizar paso a paso.</div>`;
    callStackEl.innerHTML = '';
    varsTableEl.innerHTML = '';
    consoleEl.innerHTML = '';
    return;
  }

  const { merged } = collectVisibleVars(step);

  const graphData = detectGraph(merged);
  const graphHtml = graphData ? renderGraphSection(graphData, merged, step) : '';
  const treeHtml = detectAndRenderBinaryTree(step, merged);
  const seqHtml = renderSequencesSection(step, merged, Boolean(graphData));
  const scalarsHtml = renderScalarsAndSetsSection(step, merged, Boolean(graphData));

  let stageContent = scalarsHtml + graphHtml + treeHtml + seqHtml;
  if (!graphHtml && !treeHtml && !seqHtml) {
    // Si es un algoritmo puramente recursivo escalar (como fib), mostramos la pila visual en el lienzo
    stageContent += `
      <div class="viz-card">
        <div class="viz-card-header">
          <span class="viz-card-title">Profundidad de Pila de Llamadas (${step.frames.length} niveles activos)</span>
        </div>
        <div class="recursion-stage">
          ${step.frames.map((f, i) => `
            <div class="rec-step" style="margin-left: ${i * 18}px">
              <span class="rec-badge">#${i}</span>
              <strong>${escapeHtml(f.name)}</strong>
              <span class="rec-vars">${Object.entries(f.vars).map(([k, v]) => `${escapeHtml(k)}=${escapeHtml(v.repr)}`).join(', ')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  stageEl.innerHTML = stageContent;
  callStackEl.innerHTML = renderCallStack(step);
  varsTableEl.innerHTML = renderVariablesTable(step);

  if (step.stdout.length === 0) {
    consoleEl.innerHTML = `<div class="console-placeholder"># Sin salida en print() todavía...</div>`;
  } else {
    consoleEl.innerHTML = step.stdout
      .map((line, i) => `<div class="console-line ${i === step.stdout.length - 1 ? 'console-latest' : ''}">${escapeHtml(line)}</div>`)
      .join('');
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

if (typeof window !== 'undefined') {
  window.PyVisualizer = {
    renderStepVisualization
  };
}
