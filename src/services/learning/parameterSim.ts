/**
 * Declarative Parameter Simulation & Safe Math Evaluator
 *
 * Powers interactive parameter-sweep instruments (`kind: "explorer"` inside
 * `forge-visual`) without ever executing arbitrary HTML or JavaScript from
 * model output. Expressions are parsed by a bounded recursive-descent grammar.
 */

export interface SimParameterSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  unit?: string;
}

export interface SimOutputSpec {
  id: string;
  label: string;
  expression: string;
  unit?: string;
  precision?: number;
}

export interface SimCurveSpec {
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  expression: string;
  markerXExpression?: string;
}

export interface ParameterSimSpec {
  parameters: SimParameterSpec[];
  outputs: SimOutputSpec[];
  curve?: SimCurveSpec;
  prompt?: string;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; name: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "^" }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "comma" };

const MAX_EXPR_LENGTH = 240;
const MAX_PARSE_DEPTH = 28;
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,23}$/;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
};

const UNARY_FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log10,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const MULTI_FUNCS: Record<string, (...args: number[]) => number> = {
  min: (a, b) => Math.min(a, b),
  max: (a, b) => Math.max(a, b),
  pow: (a, b) => Math.pow(a, b),
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
};

function tokenizeMath(expr: string): Token[] | null {
  if (!expr || typeof expr !== "string" || expr.length > MAX_EXPR_LENGTH) {
    return null;
  }
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^") {
      if (ch === "*" && expr[i + 1] === "*") {
        tokens.push({ kind: "op", op: "^" });
        i += 2;
      } else {
        tokens.push({ kind: "op", op: ch });
        i += 1;
      }
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const slice = expr.slice(i);
      const match = slice.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) return null;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const slice = expr.slice(i);
      const match = slice.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (!match || match[0].length > 24) return null;
      tokens.push({ kind: "id", name: match[0] });
      i += match[0].length;
      continue;
    }
    return null;
  }
  return tokens.length > 0 ? tokens : null;
}

/**
 * Evaluates a pure mathematical expression against declared numeric variables.
 * Returns `null` on syntax error, unknown identifier, division by zero, or overflow.
 */
export function evaluateMathExpression(
  expression: string,
  variables: Record<string, number>
): number | null {
  const tokens = tokenizeMath(expression);
  if (!tokens) return null;
  let cursor = 0;
  let failed = false;

  const peek = (): Token | undefined => tokens[cursor];
  const consume = (): Token | undefined => tokens[cursor++];

  const parseAddSub = (depth: number): number => {
    if (depth > MAX_PARSE_DEPTH) {
      failed = true;
      return NaN;
    }
    let left = parseMulDiv(depth + 1);
    while (!failed) {
      const next = peek();
      if (next?.kind === "op" && (next.op === "+" || next.op === "-")) {
        consume();
        const right = parseMulDiv(depth + 1);
        left = next.op === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseMulDiv = (depth: number): number => {
    if (depth > MAX_PARSE_DEPTH) {
      failed = true;
      return NaN;
    }
    let left = parsePower(depth + 1);
    while (!failed) {
      const next = peek();
      if (next?.kind === "op" && (next.op === "*" || next.op === "/")) {
        consume();
        const right = parsePower(depth + 1);
        if (next.op === "/") {
          if (right === 0) {
            failed = true;
            return NaN;
          }
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parsePower = (depth: number): number => {
    if (depth > MAX_PARSE_DEPTH) {
      failed = true;
      return NaN;
    }
    const base = parseUnary(depth + 1);
    const next = peek();
    if (!failed && next?.kind === "op" && next.op === "^") {
      consume();
      const exponent = parsePower(depth + 1);
      return Math.pow(base, exponent);
    }
    return base;
  };

  const parseUnary = (depth: number): number => {
    if (depth > MAX_PARSE_DEPTH) {
      failed = true;
      return NaN;
    }
    const next = peek();
    if (next?.kind === "op" && (next.op === "+" || next.op === "-")) {
      consume();
      const val = parseUnary(depth + 1);
      return next.op === "-" ? -val : val;
    }
    return parsePrimary(depth + 1);
  };

  const parsePrimary = (depth: number): number => {
    if (depth > MAX_PARSE_DEPTH) {
      failed = true;
      return NaN;
    }
    const tok = consume();
    if (!tok) {
      failed = true;
      return NaN;
    }
    if (tok.kind === "num") {
      return tok.value;
    }
    if (tok.kind === "paren" && tok.value === "(") {
      const inner = parseAddSub(depth + 1);
      const closing = consume();
      if (!closing || closing.kind !== "paren" || closing.value !== ")") {
        failed = true;
        return NaN;
      }
      return inner;
    }
    if (tok.kind === "id") {
      const next = peek();
      if (next?.kind === "paren" && next.value === "(") {
        consume(); // '('
        const args: number[] = [];
        if (!(peek()?.kind === "paren" && (peek() as { value?: string }).value === ")")) {
          args.push(parseAddSub(depth + 1));
          while (!failed && peek()?.kind === "comma") {
            consume();
            args.push(parseAddSub(depth + 1));
            if (args.length > 4) {
              failed = true;
              return NaN;
            }
          }
        }
        const close = consume();
        if (!close || close.kind !== "paren" || close.value !== ")") {
          failed = true;
          return NaN;
        }
        const fnName = tok.name.toLowerCase();
        if (fnName in UNARY_FUNCS && args.length === 1) {
          return UNARY_FUNCS[fnName](args[0]);
        }
        if (fnName in MULTI_FUNCS) {
          const expected = fnName === "clamp" ? 3 : 2;
          if (args.length === expected) {
            return MULTI_FUNCS[fnName](...args);
          }
        }
        failed = true;
        return NaN;
      }

      if (Object.prototype.hasOwnProperty.call(variables, tok.name)) {
        return variables[tok.name];
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, tok.name)) {
        return CONSTANTS[tok.name];
      }
      failed = true;
      return NaN;
    }

    failed = true;
    return NaN;
  };

  const result = parseAddSub(0);
  if (failed || cursor !== tokens.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
}

/**
 * Checks whether an expression parses cleanly using only the allowed variable names
 * (even if a particular sample point divides by zero, at least one sample must evaluate finitely).
 */
function expressionValidForVariables(
  expression: string,
  samples: Array<Record<string, number>>
): boolean {
  const tokens = tokenizeMath(expression);
  if (!tokens) return false;
  const allowedVars = new Set(Object.keys(samples[0] || {}));
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === "id") {
      const isCall =
        tokens[i + 1]?.kind === "paren" &&
        (tokens[i + 1] as { value: string }).value === "(";
      if (isCall) {
        const lower = tok.name.toLowerCase();
        if (!(lower in UNARY_FUNCS) && !(lower in MULTI_FUNCS)) return false;
      } else if (
        !allowedVars.has(tok.name) &&
        !Object.prototype.hasOwnProperty.call(CONSTANTS, tok.name)
      ) {
        return false;
      }
    }
  }
  return samples.some(
    (vars) => evaluateMathExpression(expression, vars) !== null
  );
}

function cleanStr(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

export function validateParameterSim(value: unknown): ParameterSimSpec | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    !Array.isArray(raw.parameters) ||
    raw.parameters.length < 1 ||
    raw.parameters.length > 4 ||
    !Array.isArray(raw.outputs) ||
    raw.outputs.length < 1 ||
    raw.outputs.length > 4
  ) {
    return null;
  }

  const parameters: SimParameterSpec[] = [];
  const paramIds = new Set<string>();
  for (const item of raw.parameters) {
    if (!item || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;
    const id = cleanStr(p.id, 24);
    const label = cleanStr(p.label, 80);
    const min = Number(p.min);
    const max = Number(p.max);
    const step = Number(p.step);
    const initial = Number(p.initial);
    if (
      !VALID_IDENTIFIER.test(id) ||
      id === "x" ||
      id in CONSTANTS ||
      paramIds.has(id) ||
      !label ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      max <= min ||
      !Number.isFinite(step) ||
      step <= 0 ||
      !Number.isFinite(initial)
    ) {
      return null;
    }
    paramIds.add(id);
    const clampedInitial = Math.min(max, Math.max(min, initial));
    const unit = cleanStr(p.unit, 20) || undefined;
    parameters.push({ id, label, min, max, step, initial: clampedInitial, unit });
  }

  const initialVars: Record<string, number> = {};
  const minVars: Record<string, number> = {};
  const maxVars: Record<string, number> = {};
  const midVars: Record<string, number> = {};
  for (const p of parameters) {
    initialVars[p.id] = p.initial;
    minVars[p.id] = p.min;
    maxVars[p.id] = p.max;
    midVars[p.id] = (p.min + p.max) / 2;
  }
  const paramSamples = [initialVars, midVars, minVars, maxVars];

  const outputs: SimOutputSpec[] = [];
  const outIds = new Set<string>();
  for (const item of raw.outputs) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const id = cleanStr(o.id, 32);
    const label = cleanStr(o.label, 80);
    const expression = cleanStr(o.expression, MAX_EXPR_LENGTH);
    if (
      !id ||
      outIds.has(id) ||
      !label ||
      !expressionValidForVariables(expression, paramSamples)
    ) {
      return null;
    }
    outIds.add(id);
    const precision =
      typeof o.precision === "number" &&
      Number.isInteger(o.precision) &&
      o.precision >= 0 &&
      o.precision <= 4
        ? o.precision
        : 2;
    const unit = cleanStr(o.unit, 20) || undefined;
    outputs.push({ id, label, expression, unit, precision });
  }

  let curve: SimCurveSpec | undefined;
  if (raw.curve !== undefined && raw.curve !== null) {
    if (typeof raw.curve !== "object") return null;
    const c = raw.curve as Record<string, unknown>;
    const xLabel = cleanStr(c.xLabel, 60);
    const yLabel = cleanStr(c.yLabel, 60);
    const xMin = Number(c.xMin);
    const xMax = Number(c.xMax);
    const expression = cleanStr(c.expression, MAX_EXPR_LENGTH);
    if (
      !xLabel ||
      !yLabel ||
      !Number.isFinite(xMin) ||
      !Number.isFinite(xMax) ||
      xMax <= xMin
    ) {
      return null;
    }
    const curveSamples = [
      { ...initialVars, x: xMin },
      { ...initialVars, x: (xMin + xMax) / 2 },
      { ...initialVars, x: xMax },
    ];
    if (!expressionValidForVariables(expression, curveSamples)) return null;

    let markerXExpression: string | undefined;
    if (typeof c.markerXExpression === "string" && c.markerXExpression.trim()) {
      const cleanMarker = cleanStr(c.markerXExpression, MAX_EXPR_LENGTH);
      if (!expressionValidForVariables(cleanMarker, paramSamples)) return null;
      markerXExpression = cleanMarker;
    }

    curve = {
      xLabel,
      yLabel,
      xMin,
      xMax,
      expression,
      markerXExpression,
    };
  }

  const prompt = cleanStr(raw.prompt, 220) || undefined;
  return { parameters, outputs, curve, prompt };
}

export function formatSimNumber(value: number | null, precision = 2): string {
  if (value === null || !Number.isFinite(value)) return "Undefined";
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
