/**
 * LearnForge Go Transpiler & Kata Evaluator
 * Translates Go code into asynchronous JavaScript that runs against the Go concurrency runtime.
 */

import {
  GoChannel,
  GoContext,
  GoMutex,
  GoRWMutex,
  GoScheduler,
  GoTestingT,
  GoWaitGroup,
  formatGoPrintf,
} from './runtime';
import { GoAnalyzedStructures } from './types';

export interface GoExecutionOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  testFailures: Array<{ name: string; error: string }>;
  testPasses: string[];
}

export class GoTranspiler {
  /**
   * Statically inspects Go code structures
   */
  analyze(goCode: string): GoAnalyzedStructures {
    const testFunctions: string[] = [];
    const testFnRegex = /func\s+(Test[A-Za-z0-9_]+)\s*\(\s*\w+\s*\*testing\.T\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = testFnRegex.exec(goCode)) !== null) {
      testFunctions.push(match[1]);
    }

    const importedPackages: string[] = [];
    const importBlockRegex = /import\s*\(([\s\S]*?)\)/g;
    let impBlockMatch: RegExpExecArray | null;
    while ((impBlockMatch = importBlockRegex.exec(goCode)) !== null) {
      const lines = impBlockMatch[1].split('\n');
      for (const line of lines) {
        const pkg = line.replace(/["\s]/g, '');
        if (pkg) importedPackages.push(pkg);
      }
    }
    const singleImportRegex = /import\s+"([^"]+)"/g;
    let singleImpMatch: RegExpExecArray | null;
    while ((singleImpMatch = singleImportRegex.exec(goCode)) !== null) {
      importedPackages.push(singleImpMatch[1]);
    }

    return {
      hasMain: /func\s+main\s*\(\s*\)/.test(goCode),
      hasGoroutines: /\bgo\s+/.test(goCode),
      hasChannels: /\bchan\b|\bmake\s*\(\s*chan\b|<-/.test(goCode),
      hasWaitGroups: /sync\.WaitGroup/.test(goCode),
      hasMutexes: /sync\.(?:RW)?Mutex/.test(goCode),
      hasSelect: /\bselect\s*\{/.test(goCode),
      hasContext: /\bcontext\./.test(goCode),
      testFunctions,
      importedPackages,
    };
  }

  /**
   * Transpiles Go code to runnable asynchronous JavaScript
   */
  transpile(goCode: string): string {
    let code = goCode;

    // 1. Remove comments while preserving newlines
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');
    code = code.replace(/\/\/.*/g, '');

    // 2. Remove package declaration
    code = code.replace(/^\s*package\s+[A-Za-z0-9_]+/gm, '');

    // 3. Remove import blocks: import ( ... ) and import "..."
    code = code.replace(/import\s*\([\s\S]*?\)/g, '');
    code = code.replace(/import\s+"[^"]+"/g, '');

    // 4. Collect and transform struct definitions
    const knownStructs = new Set<string>();
    code = code.replace(/type\s+([A-Za-z0-9_]+)\s+struct\s*\{[\s\S]*?\}/g, (_m, structName) => {
      knownStructs.add(structName);
      return `class ${structName} { constructor(props = {}) { Object.assign(this, props); } }`;
    });

    // Transform type interfaces to comments
    code = code.replace(/type\s+([A-Za-z0-9_]+)\s+interface\s*\{[\s\S]*?\}/g, '// interface $1');

    // 5. Transform struct instantiations: &StructName{...} or StructName{...} -> new StructName({ ... })
    for (const structName of knownStructs) {
      const structRegex = new RegExp(`(?<!class\\s+)(?:&)?\\b${structName}\\s*\\{([\\s\\S]*?)\\}`, 'g');
      code = code.replace(structRegex, (_m, fields) => {
        return `new ${structName}({ ${fields.trim()} })`;
      });
    }

    // 6. Transform channel make: make(chan T, cap) -> new GoChannel(cap) / make(chan T) -> new GoChannel(0)
    code = code.replace(/make\s*\(\s*chan\s+[^,)]+,\s*([^)]+)\)/g, 'new GoChannel($1)');
    code = code.replace(/make\s*\(\s*chan\s+[^)]+\)/g, 'new GoChannel(0)');

    // 7. Transform sync and context variables
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+sync\.WaitGroup/g, 'const $1 = new GoWaitGroup()');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+sync\.Mutex/g, 'const $1 = new GoMutex()');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+sync\.RWMutex/g, 'const $1 = new GoRWMutex()');

    // Atomic operations (sync/atomic)
    code = code.replace(/atomic\.Add(?:Int32|Int64|Uint32|Uint64)\s*\(\s*&?([A-Za-z0-9_]+)\s*,\s*([^)]+)\)/g, '$1 += ($2)');
    code = code.replace(/atomic\.Load(?:Int32|Int64|Uint32|Uint64)\s*\(\s*&?([A-Za-z0-9_]+)\s*\)/g, '$1');
    code = code.replace(/atomic\.Store(?:Int32|Int64|Uint32|Uint64)\s*\(\s*&?([A-Za-z0-9_]+)\s*,\s*([^)]+)\)/g, '$1 = ($2)');

    // Primitive var declarations
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+(?:int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|byte|rune)\s*=\s*([^;\n]+)/g, 'let $1 = $2');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+(?:int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|byte|rune)\b/g, 'let $1 = 0');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+string\s*=\s*([^;\n]+)/g, 'let $1 = $2');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+string\b/g, 'let $1 = ""');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+bool\s*=\s*([^;\n]+)/g, 'let $1 = $2');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+bool\b/g, 'let $1 = false');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+\[\][A-Za-z0-9_.*]+\b/g, 'let $1 = []');
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+map\[[^\]]+\][A-Za-z0-9_.*]+\b/g, 'let $1 = {}');

    // WaitGroup & Mutex methods
    code = code.replace(/([A-Za-z0-9_]+)\.Add\(([^)]+)\)/g, '$1.add($2)');
    code = code.replace(/([A-Za-z0-9_]+)\.Done\(\)/g, '$1.done()');
    code = code.replace(/([A-Za-z0-9_]+)\.Wait\(\)/g, 'await $1.wait()');
    code = code.replace(/([A-Za-z0-9_]+)\.Lock\(\)/g, 'await $1.lock()');
    code = code.replace(/([A-Za-z0-9_]+)\.Unlock\(\)/g, '$1.unlock()');
    code = code.replace(/([A-Za-z0-9_]+)\.RLock\(\)/g, 'await $1.rlock()');
    code = code.replace(/([A-Za-z0-9_]+)\.RUnlock\(\)/g, '$1.runlock()');

    // Context methods
    code = code.replace(/context\.Background\(\)/g, 'GoContext.Background()');
    code = code.replace(/context\.WithCancel\(([^)]+)\)/g, 'GoContext.WithCancel($1)');
    code = code.replace(/context\.WithTimeout\(([^,]+),\s*([^)]+)\)/g, 'GoContext.WithTimeout($1, $2)');

    // Time methods
    code = code.replace(/time\.Millisecond/g, '1');
    code = code.replace(/time\.Second/g, '1000');
    code = code.replace(/time\.Sleep\(([^)]+)\)/g, 'await __time_sleep($1)');
    code = code.replace(/time\.After\(([^)]+)\)/g, '__time_after($1)');

    // 8. Transform built-in close(ch) -> ch.close()
    code = code.replace(/\bclose\s*\(\s*([A-Za-z0-9_]+)\s*\)/g, '$1.close()');

    // 9. Transform fmt calls
    code = code.replace(/fmt\.Println\(([\s\S]*?)\)/g, '__fmt_println($1)');
    code = code.replace(/fmt\.Printf\(([\s\S]*?)\)/g, '__fmt_printf($1)');
    code = code.replace(/fmt\.Sprintf\(([\s\S]*?)\)/g, '__fmt_sprintf($1)');

    // 10. Transform select statements
    code = this.transformSelect(code);

    // 11. Transform goroutines before top-level function transform so closures capture their own defers
    // go func(...) { ... }(...)
    code = code.replace(/\bgo\s+func\s*\((.*?)\)\s*\{([\s\S]*?)\}\s*\((.*?)\)/g, (_m: string, params: string, body: string, args: string) => {
      let inner = body;
      const defers: string[] = [];
      inner = inner.replace(/^\s*defer\s+([^;\n]+)/gm, (_dm: string, expr: string) => {
        defers.push(expr.trim());
        return '';
      });
      if (defers.length > 0) {
        const deferCalls = defers
          .map((d) => `await ${d.replace(/\.Done\(\)/, '.done()').replace(/\.Unlock\(\)/, '.unlock()')};`)
          .reverse()
          .join(' ');
        inner = `try { ${inner} } finally { ${deferCalls} }`;
      }
      return `__scheduler.go(async () => { (async (${params}) => { ${inner} })(${args}); })`;
    });

    // go fnName(arg1, arg2)
    code = code.replace(/\bgo\s+([A-Za-z0-9_]+)\s*\((.*?)\)/g, (_m: string, fnName: string, args: string) => {
      if (fnName === '__scheduler') return _m;
      const cleanArgs = args.replace(/&([A-Za-z0-9_]+)/g, '$1');
      return `__scheduler.go(async () => { await ${fnName}(${cleanArgs}); })`;
    });

    // 12. Transform function declarations (stripping types, channel arrows in params, etc.)
    const { code: fnCode, asyncFns } = this.transformFunctionsWithDefer(code);
    code = fnCode;

    // 13. Transform channel range: for item := range ch { ... }
    code = code.replace(/for\s+([A-Za-z0-9_]+)\s*:=\s*range\s+([A-Za-z0-9_]+)\s*\{/g, 'for await (const $1 of $2.iterate()) {');
    // Transform for i, item := range slice { ... }
    code = code.replace(/for\s+([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*:=\s*range\s+([A-Za-z0-9_]+)\s*\{/g, 'for (const [$1, $2] of $3.entries()) {');
    // Transform C-style for loop: for i := 0; i < n; i++ {
    code = code.replace(/for\s+([A-Za-z0-9_]+)\s*:=\s*([^;]+);\s*([^;]+);\s*([^{]+)\s*\{/g, 'for (let $1 = $2; $3; $4) {');

    // 14. Transform Channel receive:
    // val, ok := <-ch
    code = code.replace(/([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*:=\s*<-\s*([A-Za-z0-9_]+)/g, 'const { value: $1, ok: $2 } = await $3.receive()');
    // val := <-ch
    code = code.replace(/([A-Za-z0-9_]+)\s*:=\s*<-\s*([A-Za-z0-9_]+)/g, 'const $1 = (await $3.receive()).value');
    // <-ctx.Done()
    code = code.replace(/<-\s*([A-Za-z0-9_]+)\.Done\(\)/g, 'await $1.done().receive()');
    // standalone <-ch
    code = code.replace(/(?:^|\n)\s*<-\s*([A-Za-z0-9_]+)/g, 'await $1.receive()');

    // 15. Transform Channel send: ch <- val
    // (Only lines where ch <- val appears as a statement)
    code = code.replace(/^(\s*)([A-Za-z0-9_]+)\s*<-\s*([^;\n]+)/gm, '$1await $2.send($3)');

    // 16. Transform short variable assignment:
    // Multiple assignment: a, b := fn() -> let [a, b] = fn()
    code = code.replace(/([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*:=\s*/g, 'let [$1, $2] = ');
    // Single assignment: foo := bar -> let foo = bar
    code = code.replace(/([A-Za-z0-9_]+)\s*:=\s*/g, 'let $1 = ');

    // 17. Transform Go if statements: if condition { -> if (condition) {
    code = code.replace(/^(\s*)if\s+([^{]+)\s*\{/gm, (_m, indent, cond) => {
      const trimmedCond = cond.trim();
      if (trimmedCond.startsWith('(') && trimmedCond.endsWith(')')) {
        return `${indent}if ${trimmedCond} {`;
      }
      return `${indent}if (${trimmedCond}) {`;
    });

    // 18. Prepend await to calls of detected async functions
    for (const fn of asyncFns) {
      if (fn === 'main') continue;
      const callRegex = new RegExp(`(?<!\\bawait\\s+|\\bgo\\s+|function\\s+|async\\s+function\\s+|\\.)\\b${fn}\\s*\\(`, 'g');
      code = code.replace(callRegex, `await ${fn}(`);
    }

    // Strip address-of operator & on pointers
    code = code.replace(/&([A-Za-z0-9_]+)/g, '$1');

    return code;
  }

  /**
   * Transforms Go select { case ...: default: ... } blocks into JS branch execution
   */
  private transformSelect(code: string): string {
    return code.replace(/select\s*\{([\s\S]*?)\}/g, (_m, body) => {
      const lines = body.split('\n');
      const cases: Array<{ trigger: string; code: string[] }> = [];
      let defaultCode: string[] | null = null;
      let currentSection: 'case' | 'default' | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        const caseMatch = trimmed.match(/^case\s+(.+?):/);
        const defaultMatch = trimmed.match(/^default\s*:/);

        if (caseMatch) {
          currentSection = 'case';
          cases.push({ trigger: caseMatch[1].trim(), code: [] });
          continue;
        }

        if (defaultMatch) {
          currentSection = 'default';
          defaultCode = [];
          continue;
        }

        if (currentSection === 'case' && cases.length > 0) {
          cases[cases.length - 1].code.push(line);
        } else if (currentSection === 'default' && defaultCode) {
          defaultCode.push(line);
        }
      }

      if (cases.length === 0 && defaultCode) {
        return defaultCode.join('\n');
      }

      const branchBlocks: string[] = [];
      for (const c of cases) {
        // e.g. <-ctx.Done() or <-ch or val := <-ch
        let chExpr = c.trigger.replace(/^<-\s*/, '').replace(/\.Done\(\)/, '.done()');
        let assignment = '';
        const assignMatch = c.trigger.match(/([A-Za-z0-9_]+)\s*:=\s*<-\s*(.+)/);
        if (assignMatch) {
          chExpr = assignMatch[2].replace(/\.Done\(\)/, '.done()');
          assignment = `const ${assignMatch[1]} = (await ${chExpr}.receive()).value;\n`;
        } else if (c.trigger.startsWith('<-')) {
          assignment = `await ${chExpr}.receive();\n`;
        }

        branchBlocks.push(`if (${chExpr}.canReceiveImmediately()) {\n  ${assignment}  ${c.code.join('\n')}\n}`);
      }

      if (defaultCode) {
        return branchBlocks.join(' else ') + ` else {\n  ${defaultCode.join('\n')}\n}`;
      }

      return branchBlocks.join(' else ');
    });
  }

  /**
   * Transforms Go functions with precise brace tracking to insert defer cleanup only at function exit.
   */
  private transformFunctionsWithDefer(code: string): { code: string; asyncFns: Set<string> } {
    const lines = code.split('\n');
    const result: string[] = [];
    const asyncFns = new Set<string>();

    let inFunction = false;
    let braceDepth = 0;
    let isAsyncFunc = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Detect function definition:
      // func (recv *Type) Name(params) [returnType] { ... }
      // func Name(params) [returnType] { ... }
      const funcMatch = line.match(/^(\s*)func\s+(?:(?:\(([^)]+)\)\s+)?([A-Za-z0-9_]+))\s*\((.*?)\)(?:\s+([^{]+))?\s*\{/);

      if (funcMatch) {
        const [, indent, receiver, name, params] = funcMatch;
        const paramNames = this.extractParamNames(params);

        inFunction = true;
        braceDepth = 1;

        // Check whether function needs async (main, Test*, or uses concurrency/defers)
        const isMainOrTest = name === 'main' || name.startsWith('Test');
        // Look ahead in subsequent lines up to closing brace to see if it uses concurrency/defer
        let lookAheadUsesConcurrency = false;
        let depth = 1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (/(\bdefer\s+|\bgo\s+|<-|\bchan\b|\bselect\b|\.Wait\(\)|\.wait\(\)|\.Lock\(\)|\.RLock\(\)|time\.Sleep|__scheduler)/.test(l)) {
            lookAheadUsesConcurrency = true;
          }
          depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
          if (depth <= 0) break;
        }

        isAsyncFunc = isMainOrTest || lookAheadUsesConcurrency;
        if (isAsyncFunc) {
          asyncFns.add(name);
        }

        if (receiver) {
          const recMatch = receiver.trim().match(/([A-Za-z0-9_]+)\s+\*?([A-Za-z0-9_]+)/);
          if (recMatch) {
            const [, recVar, recType] = recMatch;
            if (isAsyncFunc) {
              line = `${indent}${recType}.prototype.${name} = async function(${paramNames.join(', ')}) {\n${indent}  const ${recVar} = this;\n${indent}  const __defers = [];\n${indent}  try {`;
            } else {
              line = `${indent}${recType}.prototype.${name} = function(${paramNames.join(', ')}) {\n${indent}  const ${recVar} = this;`;
            }
          }
        } else {
          if (isAsyncFunc) {
            line = `${indent}async function ${name}(${paramNames.join(', ')}) {\n${indent}  const __defers = [];\n${indent}  try {`;
          } else {
            line = `${indent}function ${name}(${paramNames.join(', ')}) {`;
          }
        }

        result.push(line);
        continue;
      }

      if (inFunction) {
        // Handle defer line: defer foo()
        const deferMatch = line.match(/^(\s*)defer\s+(.+)$/);
        if (deferMatch) {
          const [, indent, deferExpr] = deferMatch;
          const cleaned = deferExpr.replace(/;$/, '').trim();
          line = `${indent}__defers.push(async () => { await ${cleaned}; });`;
          result.push(line);
          continue;
        }

        // Count braces to track function scope boundary
        const openCount = (line.match(/\{/g) || []).length;
        const closeCount = (line.match(/\}/g) || []).length;
        braceDepth += openCount - closeCount;

        if (braceDepth <= 0) {
          // Reached end of function!
          inFunction = false;
          braceDepth = 0;
          if (isAsyncFunc) {
            line = line.replace(/\}\s*$/, `  } finally {\n    while (__defers.length > 0) {\n      const __fn = __defers.pop();\n      await __fn();\n    }\n  }\n}`);
          }
        }
      }

      result.push(line);
    }

    return { code: result.join('\n'), asyncFns };
  }

  /**
   * Extracts parameter names from Go parameter signature strings.
   * e.g. "id int, jobs <-chan Task, results chan<- Result, wg *sync.WaitGroup"
   * -> ["id", "jobs", "results", "wg"]
   */
  private extractParamNames(paramsStr: string): string[] {
    if (!paramsStr || !paramsStr.trim()) return [];

    const names: string[] = [];
    const parts = paramsStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Match the first valid identifier before any types
      const match = trimmed.match(/^([A-Za-z0-9_]+)/);
      if (match) {
        names.push(match[1]);
      }
    }

    return names;
  }
}
