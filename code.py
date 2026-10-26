def insertion_sort(a):
    for i in range(1, len(a)):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
    return a
   
 def selection_sort(a):
    n = len(a)
    for i in range(n - 1):
        m = i
        for j in range(i + 1, n):
            if a[j] < a[m]:
                m = j
        a[i], a[m] = a[m], a[i]
    return a
 
 def merge(a, lo, mid, hi):
    aux = a[lo:hi + 1]
    i, j, k = lo, mid + 1, lo
    while k <= hi:
        if j > hi or (i <= mid and
                      aux[i-lo] <= aux[j-lo]):
            a[k] = aux[i - lo]; i += 1
        else:
            a[k] = aux[j - lo]; j += 1
        k += 1
 
 def bubble_sort(a):
    n = len(a)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
            a[j], a[j+1] = a[j+1], a[j]
        # a[n-1-i] is now in place
    return a
    
 def quicksort(a, lo, hi):
    if lo >= hi: return
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    quicksort(a, lo, i-1); quicksort(a, i+1, hi)
    
def heap_sort(a):
    n = len(a)
    for s in range(n//2 - 1, -1, -1):
        sift_down(a, s, n - 1)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        sift_down(a, 0, end - 1)
    return a
    
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
    
    
def counting_sort(a):
    count = [0] * (max(a) + 1)
    for x in a:
        count[x] += 1
    i = 0
    for v in range(len(count)):
        while count[v] > 0:
            a[i] = v; i += 1
            count[v] -= 1
    return a
    
class Node:
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
print("search(5): ", search(root, 5))

stack = []

# Push three values onto the top
for value in [3, 7, 5]:
    stack.append(value)
    print(f"push {value} -> {stack}")

# Pop them back off: last in, first out
while stack:
    value = stack.pop()
    print(f"pop  {value} -> {stack}")

print("empty:", len(stack) == 0)

from collections import deque

queue = deque()

# Enqueue three values at the rear
for value in [3, 7, 5]:
    queue.append(value)
    print(f"enqueue {value} -> {list(queue)}")

# Dequeue them from the front: first in, first out
while queue:
    value = queue.popleft()
    print(f"dequeue {value} -> {list(queue)}")

print("empty:", len(queue) == 0)


import heapq


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
    print(f"A -> {node}: {d}")
    
    
def bellman_ford(vertices, edges, start):
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
    print(f"A -> {node}: {d}")
    
    
def find(parent, x):
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
print("Total MST weight:", total)


from collections import deque


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

print(" -> ".join(topological_sort(graph)))

from collections import deque


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

print("BFS order:", " -> ".join(bfs(graph, "A")))

def dfs(graph, node, visited):
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
print("DFS order:", " -> ".join(order))


def binary_search(a, target):
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
print("Index of 4:", binary_search(nums, 4))


calls = 0

def fib(n, depth=0):
    global calls
    calls += 1
    # Print the call with its depth so the recursion is visible
    print("  " * depth + f"fib({n})")
    if n <= 1:
        return n
    return fib(n - 1, depth + 1) + fib(n - 2, depth + 1)


print("fib(5) =", fib(5))
print("calls made:", calls)
