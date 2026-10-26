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

    // Remove single line and multiline comments while preserving string literals
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');
    code = code.replace(/\/\/.*/g, '');

    // Remove package main
    code = code.replace(/^\s*package\s+[A-Za-z0-9_]+/m, '');

    // Remove import blocks: import ( ... ) and import "..."
    code = code.replace(/import\s*\([\s\S]*?\)/g, '');
    code = code.replace(/import\s+"[^"]+"/g, '');

    // Transform type struct definitions: type Foo struct { ... }
    code = code.replace(/type\s+([A-Za-z0-9_]+)\s+struct\s*\{[\s\S]*?\}/g, (_m, structName) => {
      return `class ${structName} { constructor(props = {}) { Object.assign(this, props); } }`;
    });

    // Transform type interfaces to empty no-op comment
    code = code.replace(/type\s+([A-Za-z0-9_]+)\s+interface\s*\{[\s\S]*?\}/g, '// interface $1');

    // Transform make(chan T, cap) -> new GoChannel(cap)
    code = code.replace(/make\s*\(\s*chan\s+[^,)]+,\s*([^)]+)\)/g, 'new GoChannel($1)');
    // Transform make(chan T) -> new GoChannel(0)
    code = code.replace(/make\s*\(\s*chan\s+[^)]+\)/g, 'new GoChannel(0)');

    // Transform var wg sync.WaitGroup -> const wg = new GoWaitGroup()
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+sync\.WaitGroup/g, 'const $1 = new GoWaitGroup()');
    // Transform var mu sync.Mutex -> const mu = new GoMutex()
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+sync\.Mutex/g, 'const $1 = new GoMutex()');
    // Transform var mu sync.RWMutex -> const mu = new GoRWMutex()
    code = code.replace(/var\s+([A-Za-z0-9_]+)\s+sync\.RWMutex/g, 'const $1 = new GoRWMutex()');

    // Transform WaitGroup methods
    code = code.replace(/([A-Za-z0-9_]+)\.Add\(([^)]+)\)/g, '$1.add($2)');
    code = code.replace(/([A-Za-z0-9_]+)\.Done\(\)/g, '$1.done()');
    code = code.replace(/([A-Za-z0-9_]+)\.Wait\(\)/g, 'await $1.wait()');

    // Transform Mutex methods
    code = code.replace(/([A-Za-z0-9_]+)\.Lock\(\)/g, 'await $1.lock()');
    code = code.replace(/([A-Za-z0-9_]+)\.Unlock\(\)/g, '$1.unlock()');
    code = code.replace(/([A-Za-z0-9_]+)\.RLock\(\)/g, 'await $1.rlock()');
    code = code.replace(/([A-Za-z0-9_]+)\.RUnlock\(\)/g, '$1.runlock()');

    // Transform context methods
    code = code.replace(/context\.Background\(\)/g, 'GoContext.Background()');
    code = code.replace(/context\.WithCancel\(([^)]+)\)/g, 'GoContext.WithCancel($1)');
    code = code.replace(/context\.WithTimeout\(([^,]+),\s*([^)]+)\)/g, 'GoContext.WithTimeout($1, $2)');

    // Transform time durations: e.g. 10 * time.Millisecond -> 10, 1 * time.Second -> 1000
    code = code.replace(/time\.Millisecond/g, '1');
    code = code.replace(/time\.Second/g, '1000');
    code = code.replace(/time\.Sleep\(([^)]+)\)/g, 'await __time_sleep($1)');
    code = code.replace(/time\.After\(([^)]+)\)/g, '__time_after($1)');

    // Transform Channel receive in assignment:
    // val, ok := <-ch
    code = code.replace(/([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*:=\s*<-\s*([A-Za-z0-9_]+)/g, 'const { value: $1, ok: $2 } = await $3.receive()');
    // val := <-ch
    code = code.replace(/([A-Za-z0-9_]+)\s*:=\s*<-\s*([A-Za-z0-9_]+)/g, 'const $1 = (await $3.receive()).value');
    // <-ctx.Done()
    code = code.replace(/<-\s*([A-Za-z0-9_]+)\.Done\(\)/g, 'await $1.done().receive()');

    // Transform Channel send: ch <- val
    // We match: identifier <- expression;
    code = code.replace(/([A-Za-z0-9_]+)\s*<-\s*([^;\n]+)/g, 'await $1.send($2)');

    // Transform for val := range ch { ... }
    code = code.replace(/for\s+([A-Za-z0-9_]+)\s*:=\s*range\s+([A-Za-z0-9_]+)\s*\{/g, 'for await (const $1 of $2.iterate()) {');

    // Transform for i, v := range slice { ... }
    code = code.replace(/for\s+([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*:=\s*range\s+([A-Za-z0-9_]+)\s*\{/g, 'for (const [$1, $2] of $3.entries()) {');

    // Transform for i := 0; i < n; i++ { ... }
    code = code.replace(/for\s+([A-Za-z0-9_]+)\s*:=\s*([^;]+);\s*([^;]+);\s*([^{]+)\s*\{/g, 'for (let $1 = $2; $3; $4) {');

    // Transform while-style loop: for condition { ... }
    code = code.replace(/for\s+([^{;]+)\s*\{/g, (match, cond) => {
      const trimmed = cond.trim();
      if (trimmed.startsWith('await') || trimmed.includes('of') || trimmed.includes('let') || trimmed.includes('const')) {
        return match;
      }
      return `while (${trimmed}) {`;
    });

    // Transform infinite loop: for { ... }
    code = code.replace(/for\s*\{/g, 'while (true) {');

    // Transform fmt calls
    code = code.replace(/fmt\.Println\(([\s\S]*?)\)/g, '__fmt_println($1)');
    code = code.replace(/fmt\.Printf\(([\s\S]*?)\)/g, '__fmt_printf($1)');
    code = code.replace(/fmt\.Sprintf\(([\s\S]*?)\)/g, '__fmt_sprintf($1)');

    // Transform short variable declarations: foo := bar
    code = code.replace(/([A-Za-z0-9_]+)\s*:=\s*/g, 'let $1 = ');

    // Transform slice literals: []int{1, 2, 3} -> [1, 2, 3]
    code = code.replace(/\[\](?:int|string|float64|bool|interface\{\})\s*\{([^}]*)\}/g, '[$1]');

    // Transform function signatures
    // func worker(...) or func (s *Struct) method(...) or func TestXxx(t *testing.T)
    code = this.transformFunctions(code);

    // Transform goroutines: go func(...) { ... }(...) or go fn(...)
    code = code.replace(/\bgo\s+func\s*\((.*?)\)\s*\{([\s\S]*?)\}\s*\((.*?)\)/g, (_m, params, body, args) => {
      return `__scheduler.go(async () => { (async (${params}) => { ${body} })(${args}); })`;
    });

    code = code.replace(/\bgo\s+([A-Za-z0-9_]+)\s*\((.*?)\)/g, (_m, fnName, args) => {
      // Don't replace if it's already __scheduler.go
      if (fnName === '__scheduler') return _m;
      // Handle pointers like &wg by stripping &
      const cleanedArgs = args.replace(/&([A-Za-z0-9_]+)/g, '$1');
      return `__scheduler.go(async () => { await ${fnName}(${cleanedArgs}); })`;
    });

    // Strip address-of operator & on variables in calls: &wg -> wg
    code = code.replace(/&([A-Za-z0-9_]+)/g, '$1');

    return code;
  }

  private transformFunctions(code: string): string {
    // Regex for Go function definitions:
    // func (recv *Type) Name(params) [returnType] { ... }
    // func Name(params) [returnType] { ... }
    const lines = code.split('\n');
    const transformed: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Check func definition
      const funcMatch = line.match(/^(\s*)func\s+(?:(?:\(([^)]+)\)\s+)?([A-Za-z0-9_]+))\s*\((.*?)\)(?:\s+([^{]+))?\s*\{/);
      if (funcMatch) {
        const [, indent, receiver, name, params] = funcMatch;

        // Clean params: (id int, jobs <-chan int, wg *sync.WaitGroup)
        const paramNames = this.extractParamNames(params);

        if (receiver) {
          // Method: Receiver.prototype.Name = async function(params) {
          const recNameMatch = receiver.trim().match(/([A-Za-z0-9_]+)\s+\*?([A-Za-z0-9_]+)/);
          if (recNameMatch) {
            const [, recVar, recType] = recNameMatch;
            line = `${indent}${recType}.prototype.${name} = async function(${paramNames.join(', ')}) { const ${recVar} = this; const __defers = []; try {`;
          }
        } else {
          // Normal function
          line = `${indent}async function ${name}(${paramNames.join(', ')}) { const __defers = []; try {`;
        }
      }

      // Handle defer inside function: defer foo()
      const deferMatch = line.match(/^(\s*)defer\s+(.+)$/);
      if (deferMatch) {
        const [, indent, deferExpr] = deferMatch;
        const cleanedExpr = deferExpr.replace(/;$/, '').trim();
        line = `${indent}__defers.push(async () => { await ${cleanedExpr}; });`;
      }

      // Handle function closing brace with defer execution
      if (/^\s*\}\s*$/.test(line)) {
        // Close the try block and execute defers
        line = `  } finally {\n    while (__defers && __defers.length > 0) {\n      const __fn = __defers.pop();\n      await __fn();\n    }\n  }\n}`;
      }

      transformed.push(line);
    }

    return transformed.join('\n');
  }

  private extractParamNames(paramsStr: string): string[] {
    if (!paramsStr.trim()) return [];
    const parts = paramsStr.split(',');
    const names: string[] = [];

    for (const part of parts) {
      const words = part.trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        // First word is variable name
        names.push(words[0]);
      }
    }
    return names;
  }
}
