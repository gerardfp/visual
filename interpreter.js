/**
 * Intérprete del subset de Python extraído de code.py
 * Incluye: Lexer (con INDENT/DEDENT y soporte multilínea), Parser AST y Evaluador paso a paso.
 */

class PySyntaxError extends Error {
  constructor(message, line) {
    super(line ? `Línea ${line}: ${message}` : message);
    this.name = 'SyntaxError';
    this.line = line || 1;
  }
}

class PyRuntimeError extends Error {
  constructor(message, line, pyType = 'RuntimeError') {
    super(line ? `Línea ${line} (${pyType}): ${message}` : `${pyType}: ${message}`);
    this.name = pyType;
    this.pyType = pyType;
    this.line = line || 1;
  }
}

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

class BreakSignal {}
class ContinueSignal {}

// --- Representación de objetos de Python en el Heap ---
let nextObjectId = 1;
function resetObjectIds() {
  nextObjectId = 1;
}

function createList(items = []) {
  return { __py: 'list', id: nextObjectId++, items: [...items] };
}

function createTuple(items = []) {
  return { __py: 'tuple', id: nextObjectId++, items: [...items] };
}

function createDeque(items = []) {
  return { __py: 'deque', id: nextObjectId++, items: [...items] };
}

function createSet(items = []) {
  const s = { __py: 'set', id: nextObjectId++, map: new Map() };
  for (const item of items) {
    setAdd(s, item);
  }
  return s;
}

function createDict(pairs = []) {
  const d = { __py: 'dict', id: nextObjectId++, map: new Map() };
  for (const [k, v] of pairs) {
    dictSet(d, k, v);
  }
  return d;
}

function createInstance(className, attrs = {}) {
  return { __py: 'instance', id: nextObjectId++, className, attrs: { ...attrs } };
}

function pyKey(val) {
  if (val === null) return 'N:None';
  if (typeof val === 'boolean') return `B:${val}`;
  if (typeof val === 'number') return `D:${val}`;
  if (typeof val === 'string') return `S:${val}`;
  if (val && val.__py === 'tuple') {
    return `T:(${val.items.map(pyKey).join(',')})`;
  }
  if (val && val.id) return `O:${val.id}`;
  return `?:${String(val)}`;
}

function setAdd(s, val) {
  s.map.set(pyKey(val), val);
}

function setHas(s, val) {
  return s.map.has(pyKey(val));
}

function dictSet(d, k, v) {
  const key = pyKey(k);
  d.map.set(key, { keyObj: k, value: v });
}

function dictGet(d, k, line) {
  const key = pyKey(k);
  if (!d.map.has(key)) {
    throw new PyRuntimeError(`KeyError: ${pyRepr(k)}`, line, 'KeyError');
  }
  return d.map.get(key).value;
}

function dictHas(d, k) {
  return d.map.has(pyKey(k));
}

function pyTruthy(val) {
  if (val === null || val === undefined || val === false) return false;
  if (val === true) return true;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  if (val.__py === 'list' || val.__py === 'tuple' || val.__py === 'deque') {
    return val.items.length > 0;
  }
  if (val.__py === 'set' || val.__py === 'dict') {
    return val.map.size > 0;
  }
  return true;
}

function pyEquals(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
  if (a.__py && b.__py && a.__py === b.__py) {
    if (a.__py === 'list' || a.__py === 'tuple' || a.__py === 'deque') {
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!pyEquals(a.items[i], b.items[i])) return false;
      }
      return true;
    }
    if (a.__py === 'set') {
      if (a.map.size !== b.map.size) return false;
      for (const k of a.map.keys()) {
        if (!b.map.has(k)) return false;
      }
      return true;
    }
    if (a.__py === 'dict') {
      if (a.map.size !== b.map.size) return false;
      for (const [k, entry] of a.map.entries()) {
        if (!b.map.has(k)) return false;
        if (!pyEquals(entry.value, b.map.get(k).value)) return false;
      }
      return true;
    }
    if (a.__py === 'instance') {
      return a.id === b.id;
    }
  }
  return false;
}

function pyCompare(a, b, line) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a && b && ((a.__py === 'tuple' && b.__py === 'tuple') || (a.__py === 'list' && b.__py === 'list'))) {
    const len = Math.min(a.items.length, b.items.length);
    for (let i = 0; i < len; i++) {
      const cmp = pyCompare(a.items[i], b.items[i], line);
      if (cmp !== 0) return cmp;
    }
    return a.items.length < b.items.length ? -1 : a.items.length > b.items.length ? 1 : 0;
  }
  throw new PyRuntimeError(`No se pueden comparar valores de tipo incompatible: ${pyRepr(a)} y ${pyRepr(b)}`, line, 'TypeError');
}

function pyStr(val) {
  if (val === null || val === undefined) return 'None';
  if (val === true) return 'True';
  if (val === false) return 'False';
  if (typeof val === 'number') {
    if (val === Infinity) return 'inf';
    if (val === -Infinity) return '-inf';
    return String(val);
  }
  if (typeof val === 'string') return val;
  return pyRepr(val);
}

function pyRepr(val) {
  if (val === null || val === undefined) return 'None';
  if (val === true) return 'True';
  if (val === false) return 'False';
  if (typeof val === 'number') {
    if (val === Infinity) return 'inf';
    if (val === -Infinity) return '-inf';
    return String(val);
  }
  if (typeof val === 'string') {
    return `'${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (val.__py === 'list') {
    return `[${val.items.map(pyRepr).join(', ')}]`;
  }
  if (val.__py === 'tuple') {
    if (val.items.length === 1) return `(${pyRepr(val.items[0])},)`;
    return `(${val.items.map(pyRepr).join(', ')})`;
  }
  if (val.__py === 'deque') {
    return `deque([${val.items.map(pyRepr).join(', ')}])`;
  }
  if (val.__py === 'set') {
    if (val.map.size === 0) return 'set()';
    return `{${Array.from(val.map.values()).map(pyRepr).join(', ')}}`;
  }
  if (val.__py === 'dict') {
    const parts = [];
    for (const { keyObj, value } of val.map.values()) {
      parts.push(`${pyRepr(keyObj)}: ${pyRepr(value)}`);
    }
    return `{${parts.join(', ')}}`;
  }
  if (val.__py === 'instance') {
    if (val.className === 'Node' && 'key' in val.attrs) {
      return `Node(${pyRepr(val.attrs.key)})`;
    }
    return `<${val.className} #${val.id}>`;
  }
  if (val.__py === 'function') return `<function ${val.name}>`;
  if (val.__py === 'class') return `<class ${val.name}>`;
  return String(val);
}

function pyIterate(val, line) {
  if (val === null || val === undefined) {
    throw new PyRuntimeError(`'NoneType' no es iterable`, line, 'TypeError');
  }
  if (typeof val === 'string') {
    return val.split('');
  }
  if (val.__py === 'list' || val.__py === 'tuple' || val.__py === 'deque') {
    return [...val.items];
  }
  if (val.__py === 'set') {
    return Array.from(val.map.values());
  }
  if (val.__py === 'dict') {
    return Array.from(val.map.values()).map((e) => e.keyObj);
  }
  if (Array.isArray(val)) {
    return [...val];
  }
  throw new PyRuntimeError(`El objeto ${pyRepr(val)} no es iterable`, line, 'TypeError');
}

// --- LEXER ---
const KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'while', 'for', 'in',
  'and', 'or', 'not', 'is', 'None', 'True', 'False',
  'class', 'continue', 'break', 'global', 'import', 'from', 'raise', 'pass'
]);

function tokenize(source) {
  const tokens = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const indentStack = [0];
  let bracketDepth = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const rawLine = lines[lineIdx];

    // Calcular indentación si no estamos dentro de paréntesis/corchetes/llaves
    let pos = 0;
    if (bracketDepth === 0) {
      let indent = 0;
      while (pos < rawLine.length) {
        if (rawLine[pos] === ' ') {
          indent++;
          pos++;
        } else if (rawLine[pos] === '\t') {
          indent += 4;
          pos++;
        } else {
          break;
        }
      }
      // Ignorar líneas vacías o solo comentarios
      const rest = rawLine.slice(pos);
      if (rest.length === 0 || rest.startsWith('#')) {
        continue;
      }

      const currentIndent = indentStack[indentStack.length - 1];
      if (indent > currentIndent) {
        indentStack.push(indent);
        tokens.push({ type: 'INDENT', value: indent, line: lineNum });
      } else if (indent < currentIndent) {
        while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
          indentStack.pop();
          tokens.push({ type: 'DEDENT', value: indent, line: lineNum });
        }
        // Si hay una pequeña discrepancia (como en code.py línea 11 con 1 espacio), ajustamos al nivel actual
        if (indentStack[indentStack.length - 1] !== indent) {
          indentStack[indentStack.length - 1] = indent;
        }
      }
    }

    while (pos < rawLine.length) {
      const ch = rawLine[pos];

      if (ch === ' ' || ch === '\t') {
        pos++;
        continue;
      }

      if (ch === '#') {
        break; // Comentario hasta fin de línea
      }

      // F-strings: f"..." o f'...'
      if ((ch === 'f' || ch === 'F') && (rawLine[pos + 1] === '"' || rawLine[pos + 1] === "'")) {
        const quote = rawLine[pos + 1];
        pos += 2;
        let strVal = '';
        while (pos < rawLine.length && rawLine[pos] !== quote) {
          if (rawLine[pos] === '\\' && pos + 1 < rawLine.length) {
            strVal += rawLine[pos] + rawLine[pos + 1];
            pos += 2;
          } else {
            strVal += rawLine[pos++];
          }
        }
        if (rawLine[pos] !== quote) {
          throw new PySyntaxError('F-string sin cerrar', lineNum);
        }
        pos++;
        tokens.push({ type: 'FSTRING', value: strVal, line: lineNum });
        continue;
      }

      // Strings normales
      if (ch === '"' || ch === "'") {
        const quote = ch;
        pos++;
        let strVal = '';
        while (pos < rawLine.length && rawLine[pos] !== quote) {
          if (rawLine[pos] === '\\' && pos + 1 < rawLine.length) {
            const next = rawLine[pos + 1];
            if (next === 'n') strVal += '\n';
            else if (next === 't') strVal += '\t';
            else strVal += next;
            pos += 2;
          } else {
            strVal += rawLine[pos++];
          }
        }
        if (rawLine[pos] !== quote) {
          throw new PySyntaxError('Cadena de texto sin cerrar', lineNum);
        }
        pos++;
        tokens.push({ type: 'STRING', value: strVal, line: lineNum });
        continue;
      }

      // Números
      if (/[0-9]/.test(ch)) {
        let numStr = '';
        while (pos < rawLine.length && /[0-9.]/.test(rawLine[pos])) {
          numStr += rawLine[pos++];
        }
        tokens.push({ type: 'NUMBER', value: Number(numStr), line: lineNum });
        continue;
      }

      // Identificadores y palabras clave
      if (/[a-zA-Z_]/.test(ch)) {
        let ident = '';
        while (pos < rawLine.length && /[a-zA-Z0-9_]/.test(rawLine[pos])) {
          ident += rawLine[pos++];
        }
        if (KEYWORDS.has(ident)) {
          tokens.push({ type: 'KEYWORD', value: ident, line: lineNum });
        } else {
          tokens.push({ type: 'IDENT', value: ident, line: lineNum });
        }
        continue;
      }

      // Operadores de dos o tres caracteres
      const twoChar = rawLine.slice(pos, pos + 2);
      const threeChar = rawLine.slice(pos, pos + 3);
      if (threeChar === '//=' || threeChar === '**=') {
        tokens.push({ type: 'OP', value: threeChar, line: lineNum });
        pos += 3;
        continue;
      }
      if (['==', '!=', '<=', '>=', '//', '**', '+=', '-=', '*=', '/=', '%='] .includes(twoChar)) {
        tokens.push({ type: 'OP', value: twoChar, line: lineNum });
        pos += 2;
        continue;
      }

      // Paréntesis, corchetes, llaves
      if (ch === '(' || ch === '[' || ch === '{') {
        bracketDepth++;
        tokens.push({ type: 'PUNCT', value: ch, line: lineNum });
        pos++;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        bracketDepth = Math.max(0, bracketDepth - 1);
        tokens.push({ type: 'PUNCT', value: ch, line: lineNum });
        pos++;
        continue;
      }

      // Punto y coma separa sentencias en la misma línea
      if (ch === ';') {
        if (bracketDepth === 0) {
          tokens.push({ type: 'NEWLINE', value: ';', line: lineNum });
        }
        pos++;
        continue;
      }

      if ([':', ',', '.'].includes(ch)) {
        tokens.push({ type: 'PUNCT', value: ch, line: lineNum });
        pos++;
        continue;
      }

      if (['+', '-', '*', '/', '%', '<', '>', '='].includes(ch)) {
        tokens.push({ type: 'OP', value: ch, line: lineNum });
        pos++;
        continue;
      }

      throw new PySyntaxError(`Carácter inesperado '${ch}'`, lineNum);
    }

    if (bracketDepth === 0 && tokens.length > 0 && tokens[tokens.length - 1].type !== 'NEWLINE') {
      tokens.push({ type: 'NEWLINE', value: '\n', line: lineNum });
    }
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: 'DEDENT', value: 0, line: lines.length });
  }
  tokens.push({ type: 'EOF', value: null, line: lines.length });
  return tokens;
}

// --- PARSER AST ---
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset] || this.tokens[this.tokens.length - 1];
  }

  next() {
    return this.tokens[this.pos++];
  }

  match(type, value = undefined) {
    const t = this.peek();
    if (t.type === type && (value === undefined || t.value === value)) {
      this.pos++;
      return t;
    }
    return null;
  }

  expect(type, value = undefined) {
    const t = this.match(type, value);
    if (!t) {
      const cur = this.peek();
      throw new PySyntaxError(
        `Se esperaba ${value || type}, pero se encontró '${cur.value ?? cur.type}'`,
        cur.line
      );
    }
    return t;
  }

  skipNewlines() {
    while (this.peek().type === 'NEWLINE') {
      this.next();
    }
  }

  parseProgram() {
    const body = [];
    this.skipNewlines();
    while (this.peek().type !== 'EOF') {
      if (this.peek().type === 'DEDENT' || this.peek().type === 'INDENT') {
        this.next();
        continue;
      }
      body.push(this.parseStatement());
      this.skipNewlines();
    }
    return { type: 'Program', body };
  }

  parseSuite() {
    // Puede ser en la misma línea (ej. `if lo >= hi: return`) o un bloque INDENT ... DEDENT
    if (this.peek().type !== 'NEWLINE') {
      const stmts = [this.parseSimpleStatement()];
      this.skipNewlines();
      return stmts;
    }
    this.skipNewlines();
    this.expect('INDENT');
    const stmts = [];
    this.skipNewlines();
    while (this.peek().type !== 'DEDENT' && this.peek().type !== 'EOF') {
      stmts.push(this.parseStatement());
      this.skipNewlines();
    }
    this.match('DEDENT');
    return stmts;
  }

  parseStatement() {
    const t = this.peek();
    if (t.type === 'KEYWORD') {
      if (t.value === 'def') return this.parseFuncDef();
      if (t.value === 'class') return this.parseClassDef();
      if (t.value === 'if') return this.parseIf();
      if (t.value === 'while') return this.parseWhile();
      if (t.value === 'for') return this.parseFor();
    }
    const stmt = this.parseSimpleStatement();
    this.match('NEWLINE');
    return stmt;
  }

  parseSimpleStatement() {
    const t = this.peek();
    if (t.type === 'KEYWORD') {
      if (t.value === 'return') {
        this.next();
        if (this.peek().type === 'NEWLINE' || this.peek().type === 'DEDENT' || this.peek().type === 'EOF') {
          return { type: 'Return', value: null, line: t.line };
        }
        const value = this.parseTupleOrExpr();
        return { type: 'Return', value, line: t.line };
      }
      if (t.value === 'continue') {
        this.next();
        return { type: 'Continue', line: t.line };
      }
      if (t.value === 'break') {
        this.next();
        return { type: 'Break', line: t.line };
      }
      if (t.value === 'pass') {
        this.next();
        return { type: 'Pass', line: t.line };
      }
      if (t.value === 'global') {
        this.next();
        const names = [this.expect('IDENT').value];
        while (this.match('PUNCT', ',')) {
          names.push(this.expect('IDENT').value);
        }
        return { type: 'Global', names, line: t.line };
      }
      if (t.value === 'import') {
        this.next();
        const mod = this.expect('IDENT').value;
        return { type: 'Import', module: mod, line: t.line };
      }
      if (t.value === 'from') {
        this.next();
        const mod = this.expect('IDENT').value;
        this.expect('KEYWORD', 'import');
        const names = [this.expect('IDENT').value];
        while (this.match('PUNCT', ',')) {
          names.push(this.expect('IDENT').value);
        }
        return { type: 'FromImport', module: mod, names, line: t.line };
      }
      if (t.value === 'raise') {
        this.next();
        const expr = this.parseExpr();
        return { type: 'Raise', expr, line: t.line };
      }
    }

    // Expresión o Asignación (simple, múltiple/unpacking o aumentada)
    const expr = this.parseTupleOrExpr();
    const nextTok = this.peek();

    if (nextTok.type === 'OP' && nextTok.value === '=') {
      this.next();
      const right = this.parseTupleOrExpr();
      return { type: 'Assign', target: expr, value: right, line: expr.line };
    }

    if (nextTok.type === 'OP' && ['+=', '-=', '*=', '/=', '//=', '%='].includes(nextTok.value)) {
      const op = this.next().value;
      const right = this.parseExpr();
      return { type: 'AugAssign', target: expr, op, value: right, line: expr.line };
    }

    return { type: 'ExprStmt', expr, line: expr.line };
  }

  parseFuncDef() {
    const defTok = this.expect('KEYWORD', 'def');
    const name = this.expect('IDENT').value;
    this.expect('PUNCT', '(');
    const params = [];
    if (!this.match('PUNCT', ')')) {
      do {
        const paramName = this.expect('IDENT').value;
        let defaultValue = null;
        if (this.match('OP', '=')) {
          defaultValue = this.parseExpr();
        }
        params.push({ name: paramName, defaultValue });
      } while (this.match('PUNCT', ','));
      this.expect('PUNCT', ')');
    }
    this.expect('PUNCT', ':');
    const body = this.parseSuite();
    return { type: 'FuncDef', name, params, body, line: defTok.line };
  }

  parseClassDef() {
    const clsTok = this.expect('KEYWORD', 'class');
    const name = this.expect('IDENT').value;
    if (this.match('PUNCT', '(')) {
      this.expect('PUNCT', ')');
    }
    this.expect('PUNCT', ':');
    const body = this.parseSuite();
    return { type: 'ClassDef', name, body, line: clsTok.line };
  }

  parseIf() {
    const ifTok = this.expect('KEYWORD', 'if');
    const test = this.parseExpr();
    this.expect('PUNCT', ':');
    const consequent = this.parseSuite();
    const elifs = [];
    let alternate = null;

    this.skipNewlines();
    while (this.peek().type === 'KEYWORD' && this.peek().value === 'elif') {
      const elifTok = this.next();
      const elifTest = this.parseExpr();
      this.expect('PUNCT', ':');
      const elifBody = this.parseSuite();
      elifs.push({ test: elifTest, body: elifBody, line: elifTok.line });
      this.skipNewlines();
    }

    if (this.peek().type === 'KEYWORD' && this.peek().value === 'else') {
      this.next();
      this.expect('PUNCT', ':');
      alternate = this.parseSuite();
    }

    return { type: 'If', test, consequent, elifs, alternate, line: ifTok.line };
  }

  parseWhile() {
    const wTok = this.expect('KEYWORD', 'while');
    const test = this.parseExpr();
    this.expect('PUNCT', ':');
    const body = this.parseSuite();
    return { type: 'While', test, body, line: wTok.line };
  }

  parseFor() {
    const fTok = this.expect('KEYWORD', 'for');
    const target = this.parseForTarget();
    this.expect('KEYWORD', 'in');
    const iter = this.parseExpr();
    this.expect('PUNCT', ':');
    const body = this.parseSuite();
    return { type: 'For', target, iter, body, line: fTok.line };
  }

  parseForTarget() {
    const first = this.expect('IDENT');
    const firstNode = { type: 'Identifier', name: first.value, line: first.line };
    if (this.peek().type === 'PUNCT' && this.peek().value === ',') {
      const items = [firstNode];
      while (this.match('PUNCT', ',')) {
        const id = this.expect('IDENT');
        items.push({ type: 'Identifier', name: id.value, line: id.line });
      }
      return { type: 'TupleLiteral', items, line: first.line };
    }
    return firstNode;
  }

  parseTupleOrExpr() {
    const first = this.parseExpr();
    if (this.peek().type === 'PUNCT' && this.peek().value === ',') {
      const items = [first];
      while (this.match('PUNCT', ',')) {
        if (this.peek().type === 'NEWLINE' || this.peek().type === 'PUNCT') break;
        items.push(this.parseExpr());
      }
      return { type: 'TupleLiteral', items, line: first.line };
    }
    return first;
  }

  parseExpr() {
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek().type === 'KEYWORD' && this.peek().value === 'or') {
      const opTok = this.next();
      const right = this.parseAnd();
      left = { type: 'LogicalOp', op: 'or', left, right, line: opTok.line };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.peek().type === 'KEYWORD' && this.peek().value === 'and') {
      const opTok = this.next();
      const right = this.parseNot();
      left = { type: 'LogicalOp', op: 'and', left, right, line: opTok.line };
    }
    return left;
  }

  parseNot() {
    if (this.peek().type === 'KEYWORD' && this.peek().value === 'not') {
      const opTok = this.next();
      const arg = this.parseNot();
      return { type: 'UnaryOp', op: 'not', arg, line: opTok.line };
    }
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseAddSub();
    while (true) {
      const t = this.peek();
      if (t.type === 'OP' && ['<', '<=', '>', '>=', '==', '!='].includes(t.value)) {
        this.next();
        const right = this.parseAddSub();
        left = { type: 'BinaryOp', op: t.value, left, right, line: t.line };
      } else if (t.type === 'KEYWORD' && t.value === 'is') {
        this.next();
        let op = 'is';
        if (this.peek().type === 'KEYWORD' && this.peek().value === 'not') {
          this.next();
          op = 'is not';
        }
        const right = this.parseAddSub();
        left = { type: 'BinaryOp', op, left, right, line: t.line };
      } else if (t.type === 'KEYWORD' && t.value === 'in') {
        this.next();
        const right = this.parseAddSub();
        left = { type: 'BinaryOp', op: 'in', left, right, line: t.line };
      } else if (t.type === 'KEYWORD' && t.value === 'not' && this.peek(1).type === 'KEYWORD' && this.peek(1).value === 'in') {
        this.next();
        this.next();
        const right = this.parseAddSub();
        left = { type: 'BinaryOp', op: 'not in', left, right, line: t.line };
      } else {
        break;
      }
    }
    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const opTok = this.next();
      const right = this.parseMulDiv();
      left = { type: 'BinaryOp', op: opTok.value, left, right, line: opTok.line };
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && ['*', '/', '//', '%', '**'].includes(this.peek().value)) {
      const opTok = this.next();
      const right = this.parseUnary();
      left = { type: 'BinaryOp', op: opTok.value, left, right, line: opTok.line };
    }
    return left;
  }

  parseUnary() {
    if (this.peek().type === 'OP' && (this.peek().value === '-' || this.peek().value === '+')) {
      const opTok = this.next();
      const arg = this.parseUnary();
      return { type: 'UnaryOp', op: opTok.value, arg, line: opTok.line };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    while (true) {
      if (this.match('PUNCT', '(')) {
        const args = [];
        if (!this.match('PUNCT', ')')) {
          do {
            if (this.peek().type === 'PUNCT' && this.peek().value === ')') break;
            const expr = this.parseExpr();
            // Soporte para expresión generadora en argumento: deque(node for node in graph if ...)
            if (this.peek().type === 'KEYWORD' && this.peek().value === 'for') {
              this.next();
              const target = this.parseForTarget();
              this.expect('KEYWORD', 'in');
              const iter = this.parseExpr();
              let filter = null;
              if (this.peek().type === 'KEYWORD' && this.peek().value === 'if') {
                this.next();
                filter = this.parseExpr();
              }
              args.push({ type: 'ListComp', expr, target, iter, filter, line: expr.line });
            } else {
              args.push(expr);
            }
          } while (this.match('PUNCT', ','));
          this.expect('PUNCT', ')');
        }
        node = { type: 'Call', callee: node, args, line: node.line };
      } else if (this.match('PUNCT', '[')) {
        // Índice o Slice a[lo:hi+1]
        let lower = null;
        let upper = null;
        let isSlice = false;
        if (this.peek().type === 'PUNCT' && this.peek().value === ':') {
          isSlice = true;
          this.next();
          if (!(this.peek().type === 'PUNCT' && this.peek().value === ']')) {
            upper = this.parseExpr();
          }
        } else {
          lower = this.parseExpr();
          if (this.match('PUNCT', ':')) {
            isSlice = true;
            if (!(this.peek().type === 'PUNCT' && this.peek().value === ']')) {
              upper = this.parseExpr();
            }
          }
        }
        this.expect('PUNCT', ']');
        if (isSlice) {
          node = { type: 'Slice', object: node, lower, upper, line: node.line };
        } else {
          node = { type: 'Subscript', object: node, index: lower, line: node.line };
        }
      } else if (this.match('PUNCT', '.')) {
        const prop = this.expect('IDENT');
        node = { type: 'Attribute', object: node, attr: prop.value, line: prop.line };
      } else {
        break;
      }
    }
    return node;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === 'NUMBER') {
      this.next();
      return { type: 'Literal', value: t.value, line: t.line };
    }

    if (t.type === 'STRING') {
      this.next();
      return { type: 'Literal', value: t.value, line: t.line };
    }

    if (t.type === 'FSTRING') {
      this.next();
      return { type: 'FString', raw: t.value, line: t.line };
    }

    if (t.type === 'KEYWORD') {
      if (t.value === 'True') {
        this.next();
        return { type: 'Literal', value: true, line: t.line };
      }
      if (t.value === 'False') {
        this.next();
        return { type: 'Literal', value: false, line: t.line };
      }
      if (t.value === 'None') {
        this.next();
        return { type: 'Literal', value: null, line: t.line };
      }
    }

    if (t.type === 'IDENT') {
      this.next();
      return { type: 'Identifier', name: t.value, line: t.line };
    }

    // Paréntesis o Tupla
    if (this.match('PUNCT', '(')) {
      if (this.match('PUNCT', ')')) {
        return { type: 'TupleLiteral', items: [], line: t.line };
      }
      const first = this.parseExpr();
      // ¿Expresión generadora entre paréntesis?
      if (this.peek().type === 'KEYWORD' && this.peek().value === 'for') {
        this.next();
        const target = this.parseForTarget();
        this.expect('KEYWORD', 'in');
        const iter = this.parseExpr();
        let filter = null;
        if (this.peek().type === 'KEYWORD' && this.peek().value === 'if') {
          this.next();
          filter = this.parseExpr();
        }
        this.expect('PUNCT', ')');
        return { type: 'ListComp', expr: first, target, iter, filter, line: t.line };
      }
      if (this.match('PUNCT', ',')) {
        const items = [first];
        if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
          do {
            if (this.peek().type === 'PUNCT' && this.peek().value === ')') break;
            items.push(this.parseExpr());
          } while (this.match('PUNCT', ','));
        }
        this.expect('PUNCT', ')');
        return { type: 'TupleLiteral', items, line: t.line };
      }
      this.expect('PUNCT', ')');
      return first;
    }

    // Lista o List Comprehension
    if (this.match('PUNCT', '[')) {
      if (this.match('PUNCT', ']')) {
        return { type: 'ListLiteral', items: [], line: t.line };
      }
      const first = this.parseExpr();
      if (this.peek().type === 'KEYWORD' && this.peek().value === 'for') {
        this.next();
        const target = this.parseForTarget();
        this.expect('KEYWORD', 'in');
        const iter = this.parseExpr();
        let filter = null;
        if (this.peek().type === 'KEYWORD' && this.peek().value === 'if') {
          this.next();
          filter = this.parseExpr();
        }
        this.expect('PUNCT', ']');
        return { type: 'ListComp', expr: first, target, iter, filter, line: t.line };
      }
      const items = [first];
      while (this.match('PUNCT', ',')) {
        if (this.peek().type === 'PUNCT' && this.peek().value === ']') break;
        items.push(this.parseExpr());
      }
      this.expect('PUNCT', ']');
      return { type: 'ListLiteral', items, line: t.line };
    }

    // Diccionario, Dict Comprehension o Set Literal
    if (this.match('PUNCT', '{')) {
      if (this.match('PUNCT', '}')) {
        return { type: 'DictLiteral', entries: [], line: t.line };
      }
      const firstKeyOrElem = this.parseExpr();
      if (this.match('PUNCT', ':')) {
        const firstVal = this.parseExpr();
        // ¿Dict comprehension? ej: {node: float("inf") for node in graph}
        if (this.peek().type === 'KEYWORD' && this.peek().value === 'for') {
          this.next();
          const target = this.parseForTarget();
          this.expect('KEYWORD', 'in');
          const iter = this.parseExpr();
          let filter = null;
          if (this.peek().type === 'KEYWORD' && this.peek().value === 'if') {
            this.next();
            filter = this.parseExpr();
          }
          this.expect('PUNCT', '}');
          return {
            type: 'DictComp',
            keyExpr: firstKeyOrElem,
            valExpr: firstVal,
            target,
            iter,
            filter,
            line: t.line
          };
        }
        const entries = [{ key: firstKeyOrElem, value: firstVal }];
        while (this.match('PUNCT', ',')) {
          if (this.peek().type === 'PUNCT' && this.peek().value === '}') break;
          const k = this.parseExpr();
          this.expect('PUNCT', ':');
          const v = this.parseExpr();
          entries.push({ key: k, value: v });
        }
        this.expect('PUNCT', '}');
        return { type: 'DictLiteral', entries, line: t.line };
      } else {
        // Set Literal: ej. visited = {start}
        const items = [firstKeyOrElem];
        while (this.match('PUNCT', ',')) {
          if (this.peek().type === 'PUNCT' && this.peek().value === '}') break;
          items.push(this.parseExpr());
        }
        this.expect('PUNCT', '}');
        return { type: 'SetLiteral', items, line: t.line };
      }
    }

    throw new PySyntaxError(`Expresión inesperada '${t.value ?? t.type}'`, t.line);
  }
}

// --- INTÉRPRETE Y GRABADOR DE PASOS ---
class Scope {
  constructor(name, parent = null, line = 1) {
    this.name = name;
    this.parent = parent;
    this.vars = new Map();
    this.globals = new Set();
    this.line = line;
  }

  get(name, line) {
    if (this.globals.has(name) && this.parent) {
      return this.getRoot().get(name, line);
    }
    if (this.vars.has(name)) {
      return this.vars.get(name);
    }
    if (this.parent) {
      return this.parent.get(name, line);
    }
    throw new PyRuntimeError(`La variable '${name}' no está definida`, line, 'NameError');
  }

  set(name, value) {
    if (this.globals.has(name) && this.parent) {
      this.getRoot().vars.set(name, value);
      return;
    }
    this.vars.set(name, value);
  }

  getRoot() {
    let cur = this;
    while (cur.parent) cur = cur.parent;
    return cur;
  }
}

// Operaciones de min-heap (módulo heapq de Python)
function heapPush(listObj, item, line) {
  const arr = listObj.items;
  arr.push(item);
  let idx = arr.length - 1;
  while (idx > 0) {
    const parentIdx = (idx - 1) >> 1;
    if (pyCompare(arr[idx], arr[parentIdx], line) < 0) {
      const tmp = arr[idx];
      arr[idx] = arr[parentIdx];
      arr[parentIdx] = tmp;
      idx = parentIdx;
    } else {
      break;
    }
  }
}

function heapPop(listObj, line) {
  const arr = listObj.items;
  if (arr.length === 0) {
    throw new PyRuntimeError('heappop sobre una lista vacía', line, 'IndexError');
  }
  const top = arr[0];
  const last = arr.pop();
  if (arr.length > 0) {
    arr[0] = last;
    let idx = 0;
    const n = arr.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && pyCompare(arr[left], arr[smallest], line) < 0) {
        smallest = left;
      }
      if (right < n && pyCompare(arr[right], arr[smallest], line) < 0) {
        smallest = right;
      }
      if (smallest !== idx) {
        const tmp = arr[idx];
        arr[idx] = arr[smallest];
        arr[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
  return top;
}

// Clonado profundo del estado para cada snapshot de visualización
function cloneStateValue(val, heapMap = new Map()) {
  if (val === null || val === undefined || typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
    return val;
  }
  if (val.__py === 'function' || val.__py === 'class' || val.__py === 'module') {
    return { __py: val.__py, name: val.name };
  }
  if (heapMap.has(val.id)) {
    return heapMap.get(val.id);
  }
  if (val.__py === 'list' || val.__py === 'tuple' || val.__py === 'deque') {
    const copy = { __py: val.__py, id: val.id, items: [] };
    heapMap.set(val.id, copy);
    copy.items = val.items.map((x) => cloneStateValue(x, heapMap));
    return copy;
  }
  if (val.__py === 'set') {
    const copy = { __py: 'set', id: val.id, items: [] };
    heapMap.set(val.id, copy);
    copy.items = Array.from(val.map.values()).map((x) => cloneStateValue(x, heapMap));
    return copy;
  }
  if (val.__py === 'dict') {
    const copy = { __py: 'dict', id: val.id, entries: [] };
    heapMap.set(val.id, copy);
    for (const { keyObj, value } of val.map.values()) {
      copy.entries.push({
        key: cloneStateValue(keyObj, heapMap),
        value: cloneStateValue(value, heapMap)
      });
    }
    return copy;
  }
  if (val.__py === 'instance') {
    const copy = { __py: 'instance', id: val.id, className: val.className, attrs: {} };
    heapMap.set(val.id, copy);
    for (const [k, v] of Object.entries(val.attrs)) {
      copy.attrs[k] = cloneStateValue(v, heapMap);
    }
    return copy;
  }
  return val;
}

class Interpreter {
  constructor(maxSteps = 4000) {
    this.maxSteps = maxSteps;
    this.reset();
  }

  reset() {
    resetObjectIds();
    this.globalScope = new Scope('<global>', null, 1);
    this.callStack = [this.globalScope];
    this.steps = [];
    this.stdout = [];
    this.stepReads = [];
    this.stepWrites = [];
    this.stepChangedVars = [];
  }

  currentScope() {
    return this.callStack[this.callStack.length - 1];
  }

  recordRead(info) {
    this.stepReads.push(info);
  }

  recordWrite(info) {
    this.stepWrites.push(info);
  }

  recordVarChange(varName) {
    const scope = this.currentScope();
    const scopeName = scope.globals.has(varName) && scope.parent ? '<global>' : scope.name;
    this.stepChangedVars.push({ scopeName, varName });
  }

  recordStep(line, eventType, description = '', extra = {}) {
    if (this.steps.length >= this.maxSteps) {
      throw new PyRuntimeError(
        `Se alcanzó el límite de ${this.maxSteps} pasos de ejecución (posible bucle infinito).`,
        line,
        'StepLimitExceeded'
      );
    }
    const heapMap = new Map();
    const frames = this.callStack.map((scope) => {
      const vars = {};
      for (const [k, v] of scope.vars.entries()) {
        if (v && (v.__py === 'function' || v.__py === 'class' || v.__py === 'module')) {
          continue;
        }
        vars[k] = {
          value: cloneStateValue(v, heapMap),
          repr: pyRepr(v),
          type: v === null ? 'None' : v.__py || typeof v
        };
      }
      return {
        name: scope.name,
        line: scope.line,
        vars
      };
    });

    this.steps.push({
      stepIndex: this.steps.length,
      line,
      eventType,
      description,
      frames,
      stdout: [...this.stdout],
      reads: [...this.stepReads],
      writes: [...this.stepWrites],
      changedVars: [...this.stepChangedVars],
      ...extra
    });
    this.stepReads = [];
    this.stepWrites = [];
    this.stepChangedVars = [];
  }

  run(source) {
    this.reset();
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    const ast = parser.parseProgram();

    this.execBlock(ast.body);
    return {
      steps: this.steps,
      stdout: this.stdout,
      ast
    };
  }

  execBlock(stmts) {
    for (const stmt of stmts) {
      this.execStmt(stmt);
    }
  }

  execStmt(stmt) {
    this.currentScope().line = stmt.line;

    switch (stmt.type) {
      case 'Pass':
        return;

      case 'Import': {
        this.globalScope.set(stmt.module, { __py: 'module', name: stmt.module });
        return;
      }

      case 'FromImport': {
        for (const name of stmt.names) {
          this.globalScope.set(name, { __py: 'module', name });
        }
        return;
      }

      case 'Global': {
        for (const name of stmt.names) {
          this.currentScope().globals.add(name);
        }
        return;
      }

      case 'FuncDef': {
        const fnObj = {
          __py: 'function',
          name: stmt.name,
          params: stmt.params,
          body: stmt.body,
          line: stmt.line
        };
        this.currentScope().set(stmt.name, fnObj);
        return;
      }

      case 'ClassDef': {
        const methods = {};
        for (const item of stmt.body) {
          if (item.type === 'FuncDef') {
            methods[item.name] = {
              __py: 'function',
              name: item.name,
              params: item.params,
              body: item.body,
              line: item.line
            };
          }
        }
        this.currentScope().set(stmt.name, {
          __py: 'class',
          name: stmt.name,
          methods,
          line: stmt.line
        });
        return;
      }

      case 'Assign': {
        const val = this.evalExpr(stmt.value);
        const desc = this.assignTarget(stmt.target, val, stmt.line);
        this.recordStep(stmt.line, 'assign', desc);
        return;
      }

      case 'AugAssign': {
        const desc = this.execAugAssign(stmt);
        this.recordStep(stmt.line, 'assign', desc);
        return;
      }

      case 'ExprStmt': {
        this.evalExpr(stmt.expr);
        this.recordStep(stmt.line, 'expr', this.describeExprStmt(stmt.expr));
        return;
      }

      case 'Return': {
        const val = stmt.value ? this.evalExpr(stmt.value) : null;
        this.recordStep(stmt.line, 'return', `return ${pyRepr(val)}`, { returnValue: pyRepr(val) });
        throw new ReturnSignal(val);
      }

      case 'Continue': {
        this.recordStep(stmt.line, 'continue', 'continue (siguiente iteración)');
        throw new ContinueSignal();
      }

      case 'Break': {
        this.recordStep(stmt.line, 'break', 'break (salir del bucle)');
        throw new BreakSignal();
      }

      case 'Raise': {
        const errVal = this.evalExpr(stmt.expr);
        const msg = errVal && errVal.message ? errVal.message : pyStr(errVal);
        this.recordStep(stmt.line, 'exception', `Excepción: ${msg}`);
        throw new PyRuntimeError(msg, stmt.line, 'ValueError');
      }

      case 'If': {
        const cond = pyTruthy(this.evalExpr(stmt.test));
        this.recordStep(stmt.line, 'condition', `Evaluando condición if → ${cond ? 'True' : 'False'}`);
        if (cond) {
          this.execBlock(stmt.consequent);
          return;
        }
        for (const elifBranch of stmt.elifs) {
          const elifCond = pyTruthy(this.evalExpr(elifBranch.test));
          this.recordStep(elifBranch.line, 'condition', `Evaluando condición elif → ${elifCond ? 'True' : 'False'}`);
          if (elifCond) {
            this.execBlock(elifBranch.body);
            return;
          }
        }
        if (stmt.alternate) {
          this.execBlock(stmt.alternate);
        }
        return;
      }

      case 'While': {
        while (true) {
          const cond = pyTruthy(this.evalExpr(stmt.test));
          this.recordStep(stmt.line, 'loop', `Condición while → ${cond ? 'True' : 'False'}`);
          if (!cond) break;
          try {
            this.execBlock(stmt.body);
          } catch (sig) {
            if (sig instanceof ContinueSignal) continue;
            if (sig instanceof BreakSignal) break;
            throw sig;
          }
        }
        return;
      }

      case 'For': {
        const iterVal = this.evalExpr(stmt.iter);
        const items = pyIterate(iterVal, stmt.line);
        for (let idx = 0; idx < items.length; idx++) {
          const desc = this.assignTarget(stmt.target, items[idx], stmt.line);
          this.recordStep(stmt.line, 'loop', `Iteración for: ${desc}`);
          try {
            this.execBlock(stmt.body);
          } catch (sig) {
            if (sig instanceof ContinueSignal) continue;
            if (sig instanceof BreakSignal) break;
            throw sig;
          }
        }
        return;
      }

      default:
        throw new PyRuntimeError(`Sentencia no soportada: ${stmt.type}`, stmt.line);
    }
  }

  describeExprStmt(expr) {
    if (expr.type === 'Call') {
      if (expr.callee.type === 'Identifier') {
        return `Llamada a ${expr.callee.name}()`;
      }
      if (expr.callee.type === 'Attribute') {
        return `Operación .${expr.callee.attr}()`;
      }
    }
    return 'Ejecutando expresión';
  }

  assignTarget(target, val, line) {
    if (target.type === 'Identifier') {
      this.currentScope().set(target.name, val);
      this.recordVarChange(target.name);
      return `${target.name} = ${pyRepr(val)}`;
    }

    if (target.type === 'TupleLiteral' || target.type === 'ListLiteral') {
      const items = pyIterate(val, line);
      if (items.length !== target.items.length) {
        throw new PyRuntimeError(
          `Desempaquetado inválido: se esperaban ${target.items.length} valores, pero hay ${items.length}`,
          line,
          'ValueError'
        );
      }
      const parts = [];
      for (let i = 0; i < target.items.length; i++) {
        parts.push(this.assignTarget(target.items[i], items[i], line));
      }
      return parts.join(', ');
    }

    if (target.type === 'Subscript') {
      const obj = this.evalExpr(target.object);
      const idx = this.evalExpr(target.index);
      if (obj && obj.__py === 'list') {
        const realIdx = idx < 0 ? obj.items.length + idx : idx;
        if (realIdx < 0 || realIdx >= obj.items.length) {
          throw new PyRuntimeError(`Índice ${idx} fuera de rango`, line, 'IndexError');
        }
        obj.items[realIdx] = val;
        this.recordWrite({ targetId: obj.id, index: realIdx });
        const objName = target.object.type === 'Identifier' ? target.object.name : 'lista';
        return `${objName}[${realIdx}] = ${pyRepr(val)}`;
      }
      if (obj && obj.__py === 'dict') {
        dictSet(obj, idx, val);
        this.recordWrite({ targetId: obj.id, key: pyStr(idx) });
        const objName = target.object.type === 'Identifier' ? target.object.name : 'dict';
        return `${objName}[${pyRepr(idx)}] = ${pyRepr(val)}`;
      }
      throw new PyRuntimeError(`El objeto no soporta asignación por índice`, line, 'TypeError');
    }

    if (target.type === 'Attribute') {
      const obj = this.evalExpr(target.object);
      if (obj && obj.__py === 'instance') {
        obj.attrs[target.attr] = val;
        this.recordWrite({ targetId: obj.id, attr: target.attr });
        const objName = target.object.type === 'Identifier' ? target.object.name : obj.className;
        return `${objName}.${target.attr} = ${pyRepr(val)}`;
      }
      throw new PyRuntimeError(`No se puede asignar el atributo '${target.attr}'`, line, 'AttributeError');
    }

    throw new PySyntaxError(`Destino de asignación inválido`, line);
  }

  execAugAssign(stmt) {
    const baseOp = stmt.op.slice(0, -1);
    const rightVal = this.evalExpr(stmt.value);
    const target = stmt.target;

    if (target.type === 'Identifier') {
      const curVal = this.currentScope().get(target.name, stmt.line);
      const nextVal = this.applyBinaryOp(baseOp, curVal, rightVal, stmt.line);
      this.currentScope().set(target.name, nextVal);
      this.recordVarChange(target.name);
      return `${target.name} ${stmt.op} ${pyRepr(rightVal)} → ${pyRepr(nextVal)}`;
    }

    if (target.type === 'Subscript') {
      const obj = this.evalExpr(target.object);
      const idx = this.evalExpr(target.index);
      if (obj && obj.__py === 'list') {
        const realIdx = idx < 0 ? obj.items.length + idx : idx;
        const curVal = obj.items[realIdx];
        const nextVal = this.applyBinaryOp(baseOp, curVal, rightVal, stmt.line);
        obj.items[realIdx] = nextVal;
        this.recordWrite({ targetId: obj.id, index: realIdx });
        const objName = target.object.type === 'Identifier' ? target.object.name : 'lista';
        return `${objName}[${realIdx}] ${stmt.op} ${pyRepr(rightVal)} → ${pyRepr(nextVal)}`;
      }
      if (obj && obj.__py === 'dict') {
        const curVal = dictGet(obj, idx, stmt.line);
        const nextVal = this.applyBinaryOp(baseOp, curVal, rightVal, stmt.line);
        dictSet(obj, idx, nextVal);
        this.recordWrite({ targetId: obj.id, key: pyStr(idx) });
        const objName = target.object.type === 'Identifier' ? target.object.name : 'dict';
        return `${objName}[${pyRepr(idx)}] ${stmt.op} ${pyRepr(rightVal)} → ${pyRepr(nextVal)}`;
      }
    }

    if (target.type === 'Attribute') {
      const obj = this.evalExpr(target.object);
      if (obj && obj.__py === 'instance') {
        const curVal = obj.attrs[target.attr];
        const nextVal = this.applyBinaryOp(baseOp, curVal, rightVal, stmt.line);
        obj.attrs[target.attr] = nextVal;
        this.recordWrite({ targetId: obj.id, attr: target.attr });
        return `${target.attr} ${stmt.op} ${pyRepr(rightVal)} → ${pyRepr(nextVal)}`;
      }
    }

    throw new PyRuntimeError(`Asignación aumentada no soportada en este destino`, stmt.line);
  }

  evalExpr(expr) {
    if (!expr) return null;

    switch (expr.type) {
      case 'Literal':
        return expr.value;

      case 'FString':
        return this.evalFString(expr.raw, expr.line);

      case 'Identifier':
        return this.currentScope().get(expr.name, expr.line);

      case 'ListLiteral':
        return createList(expr.items.map((x) => this.evalExpr(x)));

      case 'TupleLiteral':
        return createTuple(expr.items.map((x) => this.evalExpr(x)));

      case 'SetLiteral':
        return createSet(expr.items.map((x) => this.evalExpr(x)));

      case 'DictLiteral': {
        const pairs = expr.entries.map((e) => [this.evalExpr(e.key), this.evalExpr(e.value)]);
        return createDict(pairs);
      }

      case 'ListComp': {
        const iterVal = this.evalExpr(expr.iter);
        const items = pyIterate(iterVal, expr.line);
        const result = [];
        const compScope = new Scope('<comp>', this.currentScope(), expr.line);
        this.callStack.push(compScope);
        try {
          for (const item of items) {
            this.assignTarget(expr.target, item, expr.line);
            if (!expr.filter || pyTruthy(this.evalExpr(expr.filter))) {
              result.push(this.evalExpr(expr.expr));
            }
          }
        } finally {
          this.callStack.pop();
        }
        return createList(result);
      }

      case 'DictComp': {
        const iterVal = this.evalExpr(expr.iter);
        const items = pyIterate(iterVal, expr.line);
        const pairs = [];
        const compScope = new Scope('<dictcomp>', this.currentScope(), expr.line);
        this.callStack.push(compScope);
        try {
          for (const item of items) {
            this.assignTarget(expr.target, item, expr.line);
            if (!expr.filter || pyTruthy(this.evalExpr(expr.filter))) {
              pairs.push([this.evalExpr(expr.keyExpr), this.evalExpr(expr.valExpr)]);
            }
          }
        } finally {
          this.callStack.pop();
        }
        return createDict(pairs);
      }

      case 'UnaryOp': {
        const val = this.evalExpr(expr.arg);
        if (expr.op === '-') return -val;
        if (expr.op === '+') return +val;
        if (expr.op === 'not') return !pyTruthy(val);
        throw new PyRuntimeError(`Operador unario desconocido ${expr.op}`, expr.line);
      }

      case 'LogicalOp': {
        const left = this.evalExpr(expr.left);
        if (expr.op === 'and') {
          return pyTruthy(left) ? this.evalExpr(expr.right) : left;
        }
        if (expr.op === 'or') {
          return pyTruthy(left) ? left : this.evalExpr(expr.right);
        }
        return null;
      }

      case 'BinaryOp': {
        const left = this.evalExpr(expr.left);
        const right = this.evalExpr(expr.right);
        return this.applyBinaryOp(expr.op, left, right, expr.line);
      }

      case 'Subscript': {
        const obj = this.evalExpr(expr.object);
        const idx = this.evalExpr(expr.index);
        if (obj === null || obj === undefined) {
          throw new PyRuntimeError(`'NoneType' no es indexable`, expr.line, 'TypeError');
        }
        if (typeof obj === 'string') {
          const realIdx = idx < 0 ? obj.length + idx : idx;
          if (realIdx < 0 || realIdx >= obj.length) {
            throw new PyRuntimeError(`Índice de cadena fuera de rango`, expr.line, 'IndexError');
          }
          return obj[realIdx];
        }
        if (obj.__py === 'list' || obj.__py === 'tuple' || obj.__py === 'deque') {
          const realIdx = idx < 0 ? obj.items.length + idx : idx;
          if (realIdx < 0 || realIdx >= obj.items.length) {
            throw new PyRuntimeError(`Índice ${idx} fuera de rango`, expr.line, 'IndexError');
          }
          this.recordRead({ targetId: obj.id, index: realIdx });
          return obj.items[realIdx];
        }
        if (obj.__py === 'dict') {
          this.recordRead({ targetId: obj.id, key: pyStr(idx) });
          return dictGet(obj, idx, expr.line);
        }
        throw new PyRuntimeError(`El objeto no es indexable`, expr.line, 'TypeError');
      }

      case 'Slice': {
        const obj = this.evalExpr(expr.object);
        if (!obj || (obj.__py !== 'list' && obj.__py !== 'tuple' && typeof obj !== 'string')) {
          throw new PyRuntimeError(`El objeto no soporta slicing`, expr.line, 'TypeError');
        }
        const len = typeof obj === 'string' ? obj.length : obj.items.length;
        let lo = expr.lower !== null ? this.evalExpr(expr.lower) : 0;
        let hi = expr.upper !== null ? this.evalExpr(expr.upper) : len;
        if (lo < 0) lo = Math.max(0, len + lo);
        if (hi < 0) hi = Math.max(0, len + hi);
        if (typeof obj === 'string') {
          return obj.slice(lo, hi);
        }
        const sliced = obj.items.slice(lo, hi);
        return obj.__py === 'tuple' ? createTuple(sliced) : createList(sliced);
      }

      case 'Attribute': {
        const obj = this.evalExpr(expr.object);
        if (obj && obj.__py === 'instance') {
          if (expr.attr in obj.attrs) {
            this.recordRead({ targetId: obj.id, attr: expr.attr });
            return obj.attrs[expr.attr];
          }
          throw new PyRuntimeError(`'${obj.className}' no tiene el atributo '${expr.attr}'`, expr.line, 'AttributeError');
        }
        throw new PyRuntimeError(`Acceso a atributo '.${expr.attr}' no válido`, expr.line, 'AttributeError');
      }

      case 'Call':
        return this.evalCall(expr);

      default:
        throw new PyRuntimeError(`Expresión no soportada: ${expr.type}`, expr.line);
    }
  }

  evalFString(raw, line) {
    let result = '';
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < raw.length && depth > 0) {
          if (raw[j] === '{') depth++;
          else if (raw[j] === '}') depth--;
          j++;
        }
        const innerCode = raw.slice(i + 1, j - 1).trim();
        const innerTokens = tokenize(innerCode);
        const innerParser = new Parser(innerTokens);
        const innerExpr = innerParser.parseExpr();
        const val = this.evalExpr(innerExpr);
        result += pyStr(val);
        i = j;
      } else {
        result += raw[i++];
      }
    }
    return result;
  }

  applyBinaryOp(op, left, right, line) {
    switch (op) {
      case '+': {
        if (typeof left === 'number' && typeof right === 'number') return left + right;
        if (typeof left === 'string' && typeof right === 'string') return left + right;
        if (left && right && left.__py === 'list' && right.__py === 'list') {
          return createList([...left.items, ...right.items]);
        }
        if (left && right && left.__py === 'tuple' && right.__py === 'tuple') {
          return createTuple([...left.items, ...right.items]);
        }
        throw new PyRuntimeError(`Operación '+' no soportada entre ${pyRepr(left)} y ${pyRepr(right)}`, line, 'TypeError');
      }
      case '-':
        return left - right;
      case '*': {
        if (typeof left === 'number' && typeof right === 'number') return left * right;
        if (typeof left === 'string' && typeof right === 'number') {
          return right > 0 ? left.repeat(right) : '';
        }
        if (typeof left === 'number' && typeof right === 'string') {
          return left > 0 ? right.repeat(left) : '';
        }
        if (left && left.__py === 'list' && typeof right === 'number') {
          const items = [];
          for (let i = 0; i < right; i++) {
            items.push(...left.items);
          }
          return createList(items);
        }
        if (typeof left === 'number' && right && right.__py === 'list') {
          const items = [];
          for (let i = 0; i < left; i++) {
            items.push(...right.items);
          }
          return createList(items);
        }
        throw new PyRuntimeError(`Operación '*' no soportada`, line, 'TypeError');
      }
      case '/':
        if (right === 0) throw new PyRuntimeError('División por cero', line, 'ZeroDivisionError');
        return left / right;
      case '//':
        if (right === 0) throw new PyRuntimeError('División entera por cero', line, 'ZeroDivisionError');
        return Math.floor(left / right);
      case '%':
        if (right === 0) throw new PyRuntimeError('Módulo por cero', line, 'ZeroDivisionError');
        return ((left % right) + right) % right;
      case '**':
        return Math.pow(left, right);
      case '==':
        return pyEquals(left, right);
      case '!=':
        return !pyEquals(left, right);
      case '<':
        return pyCompare(left, right, line) < 0;
      case '<=':
        return pyCompare(left, right, line) <= 0;
      case '>':
        return pyCompare(left, right, line) > 0;
      case '>=':
        return pyCompare(left, right, line) >= 0;
      case 'is':
        return left === right;
      case 'is not':
        return left !== right;
      case 'in':
        return this.checkMembership(left, right, line);
      case 'not in':
        return !this.checkMembership(left, right, line);
      default:
        throw new PyRuntimeError(`Operador binario desconocido: ${op}`, line);
    }
  }

  checkMembership(item, container, line) {
    if (typeof container === 'string') {
      return container.includes(String(item));
    }
    if (container && (container.__py === 'list' || container.__py === 'tuple' || container.__py === 'deque')) {
      return container.items.some((x) => pyEquals(x, item));
    }
    if (container && container.__py === 'set') {
      return setHas(container, item);
    }
    if (container && container.__py === 'dict') {
      return dictHas(container, item);
    }
    throw new PyRuntimeError(`El contenedor no soporta el operador 'in'`, line, 'TypeError');
  }

  evalCall(expr) {
    const args = expr.args.map((a) => this.evalExpr(a));

    // Llamadas a métodos: obj.method(...)
    if (expr.callee.type === 'Attribute') {
      const obj = this.evalExpr(expr.callee.object);
      const method = expr.callee.attr;

      // Módulo heapq
      if (obj && obj.__py === 'module' && obj.name === 'heapq') {
        if (method === 'heappush') {
          heapPush(args[0], args[1], expr.line);
          return null;
        }
        if (method === 'heappop') {
          return heapPop(args[0], expr.line);
        }
      }

      // Métodos de list
      if (obj && obj.__py === 'list') {
        if (method === 'append') {
          obj.items.push(args[0]);
          this.recordWrite({ targetId: obj.id, index: obj.items.length - 1 });
          return null;
        }
        if (method === 'pop') {
          if (obj.items.length === 0) throw new PyRuntimeError('pop de una lista vacía', expr.line, 'IndexError');
          const idx = args.length > 0 ? args[0] : obj.items.length - 1;
          this.recordWrite({ targetId: obj.id, index: idx });
          return obj.items.splice(idx, 1)[0];
        }
        if (method === 'extend') {
          const more = pyIterate(args[0], expr.line);
          obj.items.push(...more);
          return null;
        }
      }

      // Métodos de deque
      if (obj && obj.__py === 'deque') {
        if (method === 'append') {
          obj.items.push(args[0]);
          this.recordWrite({ targetId: obj.id, index: obj.items.length - 1 });
          return null;
        }
        if (method === 'appendleft') {
          obj.items.unshift(args[0]);
          this.recordWrite({ targetId: obj.id, index: 0 });
          return null;
        }
        if (method === 'popleft') {
          if (obj.items.length === 0) throw new PyRuntimeError('popleft de un deque vacío', expr.line, 'IndexError');
          this.recordWrite({ targetId: obj.id, index: 0 });
          return obj.items.shift();
        }
        if (method === 'pop') {
          if (obj.items.length === 0) throw new PyRuntimeError('pop de un deque vacío', expr.line, 'IndexError');
          return obj.items.pop();
        }
      }

      // Métodos de set
      if (obj && obj.__py === 'set') {
        if (method === 'add') {
          setAdd(obj, args[0]);
          return null;
        }
        if (method === 'remove' || method === 'discard') {
          obj.map.delete(pyKey(args[0]));
          return null;
        }
      }

      // Métodos de dict
      if (obj && obj.__py === 'dict') {
        if (method === 'items') {
          const pairs = [];
          for (const { keyObj, value } of obj.map.values()) {
            pairs.push(createTuple([keyObj, value]));
          }
          return createList(pairs);
        }
        if (method === 'keys') {
          return createList(Array.from(obj.map.values()).map((e) => e.keyObj));
        }
        if (method === 'values') {
          return createList(Array.from(obj.map.values()).map((e) => e.value));
        }
        if (method === 'get') {
          return dictHas(obj, args[0]) ? dictGet(obj, args[0], expr.line) : (args[1] ?? null);
        }
      }

      // Métodos de string
      if (typeof obj === 'string') {
        if (method === 'join') {
          const items = pyIterate(args[0], expr.line);
          return items.map(pyStr).join(obj);
        }
      }

      throw new PyRuntimeError(`Método '.${method}()' no soportado`, expr.line, 'AttributeError');
    }

    // Llamadas a funciones built-in o definidas por el usuario
    if (expr.callee.type === 'Identifier') {
      const name = expr.callee.name;

      if (name === 'len') {
        const arg = args[0];
        if (typeof arg === 'string') return arg.length;
        if (arg && (arg.__py === 'list' || arg.__py === 'tuple' || arg.__py === 'deque')) return arg.items.length;
        if (arg && (arg.__py === 'set' || arg.__py === 'dict')) return arg.map.size;
        throw new PyRuntimeError(`len() no soportado para ${pyRepr(arg)}`, expr.line, 'TypeError');
      }

      if (name === 'range') {
        let start = 0, stop = 0, step = 1;
        if (args.length === 1) {
          stop = args[0];
        } else if (args.length === 2) {
          start = args[0];
          stop = args[1];
        } else if (args.length === 3) {
          start = args[0];
          stop = args[1];
          step = args[2];
        }
        if (step === 0) throw new PyRuntimeError('El paso de range() no puede ser 0', expr.line, 'ValueError');
        const arr = [];
        if (step > 0) {
          for (let i = start; i < stop; i += step) arr.push(i);
        } else {
          for (let i = start; i > stop; i += step) arr.push(i);
        }
        return createList(arr);
      }

      if (name === 'max' || name === 'min') {
        const items = args.length === 1 ? pyIterate(args[0], expr.line) : args;
        if (items.length === 0) throw new PyRuntimeError(`${name}() sobre secuencia vacía`, expr.line, 'ValueError');
        let best = items[0];
        for (let i = 1; i < items.length; i++) {
          const cmp = pyCompare(items[i], best, expr.line);
          if ((name === 'max' && cmp > 0) || (name === 'min' && cmp < 0)) {
            best = items[i];
          }
        }
        return best;
      }

      if (name === 'sorted') {
        const items = pyIterate(args[0], expr.line);
        items.sort((a, b) => pyCompare(a, b, expr.line));
        return createList(items);
      }

      if (name === 'list') {
        if (args.length === 0) return createList([]);
        return createList(pyIterate(args[0], expr.line));
      }

      if (name === 'set') {
        if (args.length === 0) return createSet([]);
        return createSet(pyIterate(args[0], expr.line));
      }

      if (name === 'deque') {
        if (args.length === 0) return createDeque([]);
        return createDeque(pyIterate(args[0], expr.line));
      }

      if (name === 'float') {
        if (args[0] === 'inf' || args[0] === '+inf') return Infinity;
        if (args[0] === '-inf') return -Infinity;
        return Number(args[0]);
      }

      if (name === 'int') return Math.trunc(Number(args[0]));
      if (name === 'str') return pyStr(args[0]);
      if (name === 'abs') return Math.abs(args[0]);
      if (name === 'sum') {
        const items = pyIterate(args[0], expr.line);
        return items.reduce((acc, x) => acc + x, args[1] ?? 0);
      }

      if (name === 'ValueError') {
        return { message: args[0] ? pyStr(args[0]) : 'ValueError' };
      }

      if (name === 'print') {
        const text = args.map(pyStr).join(' ');
        this.stdout.push(text);
        return null;
      }
    }

    const fn = this.evalExpr(expr.callee);

    // Instanciación de clase (ej: Node(key))
    if (fn && fn.__py === 'class') {
      const instance = createInstance(fn.name, {});
      const initFn = fn.methods.__init__;
      if (initFn) {
        const fnScope = new Scope(`${fn.name}.__init__`, this.globalScope, initFn.line);
        fnScope.set('self', instance);
        for (let i = 1; i < initFn.params.length; i++) {
          const p = initFn.params[i];
          const val = i - 1 < args.length ? args[i - 1] : this.evalExpr(p.defaultValue);
          fnScope.set(p.name, val);
        }
        this.callStack.push(fnScope);
        this.recordStep(initFn.line, 'call', `Creando instancia ${fn.name}(${args.map(pyRepr).join(', ')})`);
        try {
          this.execBlock(initFn.body);
        } catch (sig) {
          if (!(sig instanceof ReturnSignal)) throw sig;
        } finally {
          this.callStack.pop();
        }
      }
      return instance;
    }

    // Llamada a función de usuario
    if (fn && fn.__py === 'function') {
      const fnScope = new Scope(fn.name, this.globalScope, fn.line);
      for (let i = 0; i < fn.params.length; i++) {
        const p = fn.params[i];
        const val = i < args.length ? args[i] : this.evalExpr(p.defaultValue);
        fnScope.set(p.name, val);
      }
      this.callStack.push(fnScope);
      this.recordStep(fn.line, 'call', `Llamada a ${fn.name}(${args.map(pyRepr).join(', ')})`);
      try {
        this.execBlock(fn.body);
        this.recordStep(fn.line, 'return', `${fn.name} retorna None`, { returnValue: 'None' });
        return null;
      } catch (sig) {
        if (sig instanceof ReturnSignal) {
          return sig.value;
        }
        throw sig;
      } finally {
        this.callStack.pop();
      }
    }

    throw new PyRuntimeError(`El objeto no es invocable`, expr.line, 'TypeError');
  }
}

if (typeof window !== 'undefined') {
  window.PySubset = {
    Interpreter,
    tokenize,
    Parser,
    pyRepr,
    pyStr
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Interpreter,
    tokenize,
    Parser,
    pyRepr,
    pyStr
  };
}
