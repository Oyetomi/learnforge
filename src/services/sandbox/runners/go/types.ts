/**
 * Go Runtime and Interpreter Types for LearnForge
 */

export interface IGoChannel<T = unknown> {
  readonly capacity: number;
  readonly isClosed: boolean;
  length(): number;
  send(val: T): Promise<void>;
  receive(): Promise<{ value: T; ok: boolean }>;
  close(): void;
  iterate(): AsyncIterable<T>;
}

export interface IGoWaitGroup {
  add(delta: number): void;
  done(): void;
  wait(): Promise<void>;
}

export interface IGoMutex {
  lock(): Promise<void>;
  unlock(): void;
}

export interface IGoRWMutex extends IGoMutex {
  rlock(): Promise<void>;
  runlock(): void;
}

export interface IGoContext {
  readonly isDone: boolean;
  done(): IGoChannel<null>;
  err(): Error | null;
  cancel(): void;
}

export interface IGoTestingT {
  readonly name: string;
  readonly failed: boolean;
  Errorf(format: string, ...args: unknown[]): void;
  Fatalf(format: string, ...args: unknown[]): void;
  Logf(format: string, ...args: unknown[]): void;
  Run(name: string, subtest: (t: IGoTestingT) => void | Promise<void>): Promise<boolean>;
}

export interface GoAnalyzedStructures {
  hasMain: boolean;
  hasGoroutines: boolean;
  hasChannels: boolean;
  hasWaitGroups: boolean;
  hasMutexes: boolean;
  hasSelect: boolean;
  hasContext: boolean;
  testFunctions: string[];
  importedPackages: string[];
}

export interface ExternalGoRunner {
  canExecute(code: string): boolean;
  execute(code: string, tests?: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
