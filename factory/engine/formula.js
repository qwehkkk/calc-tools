/* ------------------------------------------------------------------
 * formula.js — 安全表达式求值器（无 eval / 无 new Function）
 * 用途：垂直产品的公式层用字符串描述，运行时求值。
 * 支持：+ - * / % ^ ( ) 比较 逻辑 三元 ?: 函数调用
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var FUNCS = {
    min: Math.min, max: Math.max, abs: Math.abs,
    ceil: Math.ceil, floor: Math.floor, sqrt: Math.sqrt,
    pow: Math.pow, log: Math.log, exp: Math.exp,
    round: function (x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; },
    clamp: function (x, a, b) { return Math.min(Math.max(x, a), b); },
    ifelse: function (c, a, b) { return c ? a : b; },
    sign: function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; },
    // 向上取整到 step 的整数倍（如取整到 10mm 纸度档位）
    snap: function (x, step) { return step > 0 ? Math.ceil(x / step) * step : x; }
  };

  var PREC = {
    '||': 1, '&&': 2,
    '==': 3, '!=': 3,
    '<': 4, '<=': 4, '>': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6, '%': 6,
    '^': 8
  };

  function tokenize(src) {
    var out = [], i = 0, n = src.length, c, j, k;
    var isDigit = function (x) { return x >= '0' && x <= '9'; };
    var isIdStart = function (x) { return /[A-Za-z_$]/.test(x); };
    var isId = function (x) { return /[A-Za-z0-9_$]/.test(x); };
    while (i < n) {
      c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        j = i;
        while (j < n && isDigit(src[j])) j++;
        if (src[j] === '.') { j++; while (j < n && isDigit(src[j])) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          k = j + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (isDigit(src[k])) { k++; while (k < n && isDigit(src[k])) k++; j = k; }
        }
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if (isIdStart(c)) {
        j = i;
        while (j < n && isId(src[j])) j++;
        out.push({ t: 'id', v: src.slice(i, j) });
        i = j; continue;
      }
      var two = src.substr(i, 2);
      if (['>=', '<=', '==', '!=', '&&', '||'].indexOf(two) >= 0) {
        out.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('+-*/%^()<>,?:!'.indexOf(c) >= 0) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '"' || c === "'") {
        j = i + 1;
        while (j < n && src[j] !== c) j++;
        out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue;
      }
      throw new Error('公式含非法字符: ' + c);
    }
    return out;
  }

  function Parser(tokens) { this.tk = tokens; this.p = 0; }
  Parser.prototype.peek = function () { return this.tk[this.p]; };
  Parser.prototype.next = function () { return this.tk[this.p++]; };
  Parser.prototype.eat = function (v) {
    var t = this.peek();
    if (t && t.t === 'op' && t.v === v) { this.p++; return true; }
    return false;
  };
  Parser.prototype.expect = function (v) {
    if (!this.eat(v)) throw new Error('公式缺少 "' + v + '"');
  };

  Parser.prototype.parseExpr = function (minPrec) {
    var left = this.parseUnary();
    for (;;) {
      var t = this.peek();
      if (!t) break;
      if (t.t === 'op' && t.v === '?') {
        if ((minPrec || 0) > 0) break;          // 三元优先级最低
        this.next();
        var a = this.parseExpr(0);
        this.expect(':');
        var b = this.parseExpr(0);
        left = { k: 'cond', c: left, a: a, b: b };
        continue;
      }
      if (t.t !== 'op' || !(t.v in PREC)) break;
      var prec = PREC[t.v];
      if (prec < (minPrec || 0)) break;
      this.next();
      var right = this.parseExpr(t.v === '^' ? prec : prec + 1); // ^ 右结合
      left = { k: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    var t = this.peek();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
      this.next();
      return { k: 'un', op: t.v, v: this.parseUnary() };
    }
    return this.parsePostfix();
  };

  Parser.prototype.parsePostfix = function () {
    var node = this.parsePrimary();
    while (this.peek() && this.peek().t === 'op' && this.peek().v === '^') {
      this.next();
      node = { k: 'bin', op: '^', l: node, r: this.parseUnary() };
    }
    return node;
  };

  Parser.prototype.parsePrimary = function () {
    var t = this.next();
    if (!t) throw new Error('公式意外结束');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'id') {
      if (this.peek() && this.peek().t === 'op' && this.peek().v === '(') {
        this.next();
        var args = [];
        if (!this.eat(')')) {
          do { args.push(this.parseExpr(0)); } while (this.eat(','));
          this.expect(')');
        }
        return { k: 'call', name: t.v, args: args };
      }
      return { k: 'var', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      var e = this.parseExpr(0);
      this.expect(')');
      return e;
    }
    throw new Error('公式无法解析: ' + JSON.stringify(t));
  };

  function compile(src) {
    var p = new Parser(tokenize(String(src)));
    var ast = p.parseExpr(0);
    if (p.p !== p.tk.length) throw new Error('公式多余内容: ' + src);
    return ast;
  }

  function evalNode(node, scope) {
    switch (node.k) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'var': {
        if (Object.prototype.hasOwnProperty.call(scope, node.name)) return scope[node.name];
        throw new Error('未定义变量: ' + node.name);
      }
      case 'un': {
        var v = evalNode(node.v, scope);
        return node.op === '-' ? -v : node.op === '+' ? +v : !v;
      }
      case 'bin': {
        var a = evalNode(node.l, scope), b = evalNode(node.r, scope);
        switch (node.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? 0 : a / b;
          case '%': return b === 0 ? 0 : a % b;
          case '^': return Math.pow(a, b);
          case '<': return a < b;
          case '<=': return a <= b;
          case '>': return a > b;
          case '>=': return a >= b;
          case '==': return a === b;
          case '!=': return a !== b;
          case '&&': return a && b;
          case '||': return a || b;
        }
        throw new Error('未知运算符: ' + node.op);
      }
      case 'cond': return evalNode(node.c, scope) ? evalNode(node.a, scope) : evalNode(node.b, scope);
      case 'call': {
        var fn = FUNCS[node.name];
        if (!fn) throw new Error('未知函数: ' + node.name);
        return fn.apply(null, node.args.map(function (x) { return evalNode(x, scope); }));
      }
    }
    throw new Error('公式节点异常');
  }

  var cache = Object.create(null);
  function evaluate(src, scope) {
    var ast = cache[src] || (cache[src] = compile(src));
    return evalNode(ast, scope || {});
  }

  root.Formula = { compile: compile, evaluate: evaluate, FUNCS: FUNCS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
