/**
 * Catálogo de algoritmos y estructuras de datos extraídos de code.py
 */

const ALGORITHM_EXAMPLES = [
  // ================= ORDENACIÓN =================
  {
    id: 'insertion_sort',
    title: 'Insertion Sort (Inserción)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n²) · Espacio: O(1)',
    summary: 'Inserta cada elemento en su posición correcta dentro de la sublista izquierda ya ordenada.',
    pointers: ['i', 'j'],
    code: `def insertion_sort(a):
    for i in range(1, len(a)):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
    return a

a = [9, 3, 7, 1, 5, 2]
print("Ordenado:", insertion_sort(a))`
  },
  {
    id: 'selection_sort',
    title: 'Selection Sort (Selección)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n²) · Espacio: O(1)',
    summary: 'Busca el mínimo de la parte no ordenada (índice m) y lo intercambia con la posición i.',
    pointers: ['i', 'j', 'm'],
    code: `def selection_sort(a):
    n = len(a)
    for i in range(n - 1):
        m = i
        for j in range(i + 1, n):
            if a[j] < a[m]:
                m = j
        a[i], a[m] = a[m], a[i]
    return a

a = [29, 10, 14, 37, 13, 8]
print("Ordenado:", selection_sort(a))`
  },
  {
    id: 'bubble_sort',
    title: 'Bubble Sort (Burbuja)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n²) · Espacio: O(1)',
    summary: 'Compara pares adyacentes e intercambia los desordenados haciendo "burbujear" el máximo al final.',
    pointers: ['i', 'j'],
    code: `def bubble_sort(a):
    n = len(a)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j+1] = a[j+1], a[j]
        # a[n-1-i] is now in place
    return a

a = [15, 6, 12, 3, 9]
print("Ordenado:", bubble_sort(a))`
  },
  {
    id: 'merge',
    title: 'Merge Sort (Mezcla)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n log n) · Espacio: O(n)',
    summary: 'Divide el vector en dos mitades recursivamente y las fusiona ordenadamente con un array auxiliar aux.',
    pointers: ['lo', 'mid', 'hi', 'i', 'j', 'k'],
    code: `def merge(a, lo, mid, hi):
    aux = a[lo:hi + 1]
    i, j, k = lo, mid + 1, lo
    while k <= hi:
        if j > hi or (i <= mid and
                      aux[i-lo] <= aux[j-lo]):
            a[k] = aux[i - lo]; i += 1
        else:
            a[k] = aux[j - lo]; j += 1
        k += 1

def merge_sort(a, lo, hi):
    if lo >= hi: return
    mid = (lo + hi) // 2
    merge_sort(a, lo, mid)
    merge_sort(a, mid + 1, hi)
    merge(a, lo, mid, hi)

a = [14, 7, 3, 12, 9, 11, 6, 2]
merge_sort(a, 0, len(a) - 1)
print("Ordenado:", a)`
  },
  {
    id: 'quicksort',
    title: 'Quicksort (Partición de Lomuto)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n log n) prom. · Espacio: O(log n)',
    summary: 'Elige un pivote (a[hi]), particiona los menores a la izquierda y ordena recursivamente ambas mitades.',
    pointers: ['lo', 'hi', 'i', 'j'],
    code: `def quicksort(a, lo, hi):
    if lo >= hi: return
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    quicksort(a, lo, i-1); quicksort(a, i+1, hi)

a = [10, 7, 8, 9, 1, 5]
quicksort(a, 0, len(a) - 1)
print("Ordenado:", a)`
  },
  {
    id: 'heap_sort',
    title: 'Heap Sort (Montículo)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n log n) · Espacio: O(1)',
    summary: 'Construye un max-heap in-place y extrae sucesivamente la raíz máxima hacia el final del array.',
    pointers: ['s', 'end', 'root', 'child'],
    code: `def sift_down(a, start, end):
    root = start
    while 2 * root + 1 <= end:
        child = 2 * root + 1
        if child + 1 <= end and a[child] < a[child + 1]:
            child += 1
        if a[root] < a[child]:
            a[root], a[child] = a[child], a[root]
            root = child
        else:
            return

def heap_sort(a):
    n = len(a)
    for s in range(n//2 - 1, -1, -1):
        sift_down(a, s, n - 1)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        sift_down(a, 0, end - 1)
    return a

a = [12, 11, 13, 5, 6, 7]
print("Ordenado:", heap_sort(a))`
  },
  {
    id: 'counting_sort',
    title: 'Counting Sort (Conteo)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(n + k) · Espacio: O(k)',
    summary: 'Cuenta la frecuencia de cada entero en un array auxiliar count y reconstruye la lista ordenada.',
    pointers: ['i', 'v'],
    code: `def counting_sort(a):
    count = [0] * (max(a) + 1)
    for x in a:
        count[x] += 1
    i = 0
    for v in range(len(count)):
        while count[v] > 0:
            a[i] = v; i += 1
            count[v] -= 1
    return a

a = [4, 2, 2, 8, 3, 3, 1]
print("Ordenado:", counting_sort(a))`
  },
  {
    id: 'radix_sort',
    title: 'Radix Sort (LSD por Dígitos)',
    category: 'Ordenación',
    complexity: 'Tiempo: O(d · (n + 10)) · Espacio: O(n)',
    summary: 'Ordena números dígito a dígito (unidades, decenas, centenas) usando conteo estable.',
    pointers: ['i'],
    code: `def counting_by_digit(a, exp):
    out = [0] * len(a)
    count = [0] * 10
    for x in a:
        count[(x // exp) % 10] += 1
    for i in range(1, 10):
        count[i] += count[i - 1]
    for i in range(len(a) - 1, -1, -1):
        d = (a[i] // exp) % 10
        count[d] -= 1
        out[count[d]] = a[i]
    return out

def radix_sort(a):
    exp = 1
    while max(a) // exp > 0:
        count = [0] * 10
        for x in a:
            count[(x // exp) % 10] += 1
        # prefix sums, then stable place
        a = counting_by_digit(a, exp)
        exp *= 10
    return a

a = [170, 45, 75, 90, 24, 2, 66]
print("Ordenado:", radix_sort(a))`
  },

  // ================= BÚSQUEDA Y RECURSIÓN =================
  {
    id: 'binary_search',
    title: 'Binary Search (Búsqueda Binaria)',
    category: 'Búsqueda y Recursión',
    complexity: 'Tiempo: O(log n) · Espacio: O(1)',
    summary: 'Divide el intervalo de búsqueda [lo, hi] a la mitad en un array ordenado hasta hallar target.',
    pointers: ['lo', 'mid', 'hi'],
    code: `def binary_search(a, target):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == target:
            return mid
        if a[mid] < target:
            lo = mid + 1  # search the right half
        else:
            hi = mid - 1  # search the left half
    return -1


nums = [1, 2, 3, 5, 7, 8, 9]  # must be sorted
print("Index of 5:", binary_search(nums, 5))
print("Index of 4:", binary_search(nums, 4))`
  },
  {
    id: 'fib',
    title: 'Fibonacci Recursivo (Árbol de Llamadas)',
    category: 'Búsqueda y Recursión',
    complexity: 'Tiempo: O(2ⁿ) · Espacio: O(n)',
    summary: 'Muestra cómo se expande la pila de llamadas recursivas y cuenta el total de invocaciones.',
    pointers: [],
    code: `calls = 0

def fib(n, depth=0):
    global calls
    calls += 1
    # Print the call with its depth so the recursion is visible
    print("  " * depth + f"fib({n})")
    if n <= 1:
        return n
    return fib(n - 1, depth + 1) + fib(n - 2, depth + 1)


print("fib(4) =", fib(4))
print("calls made:", calls)`
  },

  // ================= ESTRUCTURAS DE DATOS =================
  {
    id: 'bst',
    title: 'Árbol Binario de Búsqueda (BST)',
    category: 'Estructuras de Datos',
    complexity: 'Inserción/Búsqueda: O(h)',
    summary: 'Construye un árbol binario de búsqueda con nodos enlazados (left, right), recorrido inorden y búsqueda.',
    pointers: [],
    code: `class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    return node  # duplicates are ignored


def search(node, key):
    if node is None:
        return False
    if key == node.key:
        return True
    if key < node.key:
        return search(node.left, key)
    return search(node.right, key)


def inorder(node):
    if node is None:
        return []
    return inorder(node.left) + [node.key] + inorder(node.right)


root = None
for key in [8, 3, 10, 1, 6, 14, 4, 7]:
    root = insert(root, key)

print("Inorder (sorted):", inorder(root))
print("search(6): ", search(root, 6))
print("search(5): ", search(root, 5))`
  },
  {
    id: 'stack',
    title: 'Pila / Stack (LIFO)',
    category: 'Estructuras de Datos',
    complexity: 'Push/Pop: O(1)',
    summary: 'Estructura Last-In, First-Out implementada sobre lista de Python usando append() y pop().',
    pointers: [],
    code: `stack = []

# Push three values onto the top
for value in [3, 7, 5]:
    stack.append(value)
    print(f"push {value} -> {stack}")

# Pop them back off: last in, first out
while stack:
    value = stack.pop()
    print(f"pop  {value} -> {stack}")

print("empty:", len(stack) == 0)`
  },
  {
    id: 'queue',
    title: 'Cola / Queue (FIFO con deque)',
    category: 'Estructuras de Datos',
    complexity: 'Enqueue/Dequeue: O(1)',
    summary: 'Estructura First-In, First-Out usando collections.deque con append() y popleft().',
    pointers: [],
    code: `from collections import deque

queue = deque()

# Enqueue three values at the rear
for value in [3, 7, 5]:
    queue.append(value)
    print(f"enqueue {value} -> {list(queue)}")

# Dequeue them from the front: first in, first out
while queue:
    value = queue.popleft()
    print(f"dequeue {value} -> {list(queue)}")

print("empty:", len(queue) == 0)`
  },

  // ================= GRAFOS =================
  {
    id: 'bfs',
    title: 'BFS (Búsqueda en Anchura)',
    category: 'Grafos',
    complexity: 'Tiempo: O(V + E) · Espacio: O(V)',
    summary: 'Explora el grafo por niveles utilizando una cola FIFO (deque) y un conjunto de visitados.',
    pointers: [],
    code: `from collections import deque


def bfs(graph, start):
    visited = {start}
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)  # mark on enqueue, not dequeue
                queue.append(neighbor)
    return order


graph = {
    "A": ["B", "C"],
    "B": ["D", "E"],
    "C": ["F"],
    "D": [],
    "E": ["F"],
    "F": [],
}

print("BFS order:", " -> ".join(bfs(graph, "A")))`
  },
  {
    id: 'dfs',
    title: 'DFS (Búsqueda en Profundidad)',
    category: 'Grafos',
    complexity: 'Tiempo: O(V + E) · Espacio: O(V)',
    summary: 'Recorre cada rama del grafo en profundidad de forma recursiva antes de retroceder (backtracking).',
    pointers: [],
    code: `def dfs(graph, node, visited):
    visited.add(node)
    order = [node]
    for neighbor in graph[node]:
        if neighbor not in visited:
            order.extend(dfs(graph, neighbor, visited))
    return order


graph = {
    "A": ["B", "C"],
    "B": ["D", "E"],
    "C": ["F"],
    "D": [],
    "E": ["F"],
    "F": [],
}

order = dfs(graph, "A", set())
print("DFS order:", " -> ".join(order))`
  },
  {
    id: 'topological_sort',
    title: 'Ordenación Topológica (Kahn)',
    category: 'Grafos',
    complexity: 'Tiempo: O(V + E) · Espacio: O(V)',
    summary: 'Calcula los grados de entrada (in_degree) y extrae iterativamente nodos sin dependencias pendientes.',
    pointers: [],
    code: `from collections import deque


def topological_sort(graph):
    # Kahn's algorithm: repeatedly remove nodes with no incoming edges
    in_degree = {node: 0 for node in graph}
    for node in graph:
        for neighbor in graph[node]:
            in_degree[neighbor] += 1
    queue = deque(node for node in graph if in_degree[node] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    if len(order) != len(graph):
        raise ValueError("Graph has a cycle, no topological order")
    return order


graph = {
    "shirt": ["tie", "jacket"],
    "tie": ["jacket"],
    "pants": ["shoes", "jacket"],
    "socks": ["shoes"],
    "shoes": [],
    "jacket": [],
}

print(" -> ".join(topological_sort(graph)))`
  },
  {
    id: 'dijkstra',
    title: 'Dijkstra (Camino Mínimo con Heap)',
    category: 'Grafos',
    complexity: 'Tiempo: O((V + E) log V) · Espacio: O(V)',
    summary: 'Encuentra las distancias mínimas desde un origen en grafos con pesos no negativos usando heapq.',
    pointers: [],
    code: `import heapq


def dijkstra(graph, start):
    dist = {node: float("inf") for node in graph}
    dist[start] = 0
    pq = [(0, start)]
    while pq:
        d, node = heapq.heappop(pq)
        if d > dist[node]:
            continue  # stale entry, a shorter path was already found
        for neighbor, weight in graph[node]:
            new_dist = d + weight
            if new_dist < dist[neighbor]:
                dist[neighbor] = new_dist
                heapq.heappush(pq, (new_dist, neighbor))
    return dist


graph = {
    "A": [("B", 4), ("C", 1)],
    "B": [("D", 1)],
    "C": [("B", 2), ("D", 5)],
    "D": [("E", 3)],
    "E": [],
}

for node, d in dijkstra(graph, "A").items():
    print(f"A -> {node}: {d}")`
  },
  {
    id: 'bellman_ford',
    title: 'Bellman-Ford (Pesos Negativos)',
    category: 'Grafos',
    complexity: 'Tiempo: O(V · E) · Espacio: O(V)',
    summary: 'Relaja todas las aristas V - 1 veces permitiendo pesos negativos y detectando ciclos negativos.',
    pointers: [],
    code: `def bellman_ford(vertices, edges, start):
    dist = {v: float("inf") for v in vertices}
    dist[start] = 0
    # Relax every edge V-1 times
    for _ in range(len(vertices) - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    # One more pass: any improvement means a negative cycle
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
            raise ValueError("Graph contains a negative-weight cycle")
    return dist


vertices = ["A", "B", "C", "D", "E"]
edges = [
    ("A", "B", 6), ("A", "C", 7), ("B", "D", 5), ("B", "E", -4),
    ("C", "D", -3), ("D", "B", -2), ("E", "D", 7),
]

for node, d in bellman_ford(vertices, edges, "A").items():
    print(f"A -> {node}: {d}")`
  },
  {
    id: 'kruskal',
    title: 'Kruskal (Árbol Recubridor Mínimo)',
    category: 'Grafos',
    complexity: 'Tiempo: O(E log E) · Espacio: O(V)',
    summary: 'Ordena las aristas por peso y une componentes conexas mediante Union-Find con compresión de caminos.',
    pointers: [],
    code: `def find(parent, x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]  # path compression
        x = parent[x]
    return x


def kruskal(vertices, edges):
    # Take the cheapest edge that does not close a cycle
    parent = {v: v for v in vertices}
    mst, total = [], 0
    for w, u, v in sorted(edges):
        root_u, root_v = find(parent, u), find(parent, v)
        if root_u != root_v:
            parent[root_u] = root_v
            mst.append((u, v, w))
            total += w
    return mst, total


vertices = ["A", "B", "C", "D", "E"]
edges = [
    (4, "A", "B"), (1, "A", "C"), (3, "B", "C"), (2, "B", "D"),
    (5, "C", "D"), (6, "C", "E"), (7, "D", "E"),
]

mst, total = kruskal(vertices, edges)
for u, v, w in mst:
    print(f"{u} - {v} (weight {w})")
print("Total MST weight:", total)`
  }
];

if (typeof window !== 'undefined') {
  window.ALGORITHM_EXAMPLES = ALGORITHM_EXAMPLES;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ALGORITHM_EXAMPLES };
}
