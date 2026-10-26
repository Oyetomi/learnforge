/**
 * LearnForge Go Concurrency Runtime
 * Full in-browser simulation of Go concurrency primitives:
 * Goroutines, Channels (buffered & unbuffered), WaitGroups, Mutexes, Context, and Select.
 */

import { IGoChannel, IGoContext, IGoMutex, IGoRWMutex, IGoTestingT, IGoWaitGroup } from './types';

export class GoChannel<T = unknown> implements IGoChannel<T> {
  readonly capacity: number;
  private buffer: T[] = [];
  private _isClosed = false;

  private sendQueue: Array<{
    value: T;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  private recvQueue: Array<{
    resolve: (res: { value: T; ok: boolean }) => void;
  }> = [];

  constructor(capacity = 0) {
    this.capacity = Math.max(0, capacity);
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  length(): number {
    return this.buffer.length;
  }

  send(val: T): Promise<void> {
    if (this._isClosed) {
      throw new Error('panic: send on closed channel');
    }

    // 1. If unbuffered (capacity === 0)
    if (this.capacity === 0) {
      if (this.recvQueue.length > 0) {
        const receiver = this.recvQueue.shift()!;
        receiver.resolve({ value: val, ok: true });
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        this.sendQueue.push({ value: val, resolve, reject });
      });
    }

    // 2. If buffered (capacity > 0)
    // If receiver is already waiting, channel buffer must be empty
    if (this.recvQueue.length > 0) {
      const receiver = this.recvQueue.shift()!;
      receiver.resolve({ value: val, ok: true });
      return Promise.resolve();
    }

    // If buffer has space, push immediately
    if (this.buffer.length < this.capacity) {
      this.buffer.push(val);
      return Promise.resolve();
    }

    // Buffer is full: block until space is available
    return new Promise<void>((resolve, reject) => {
      this.sendQueue.push({ value: val, resolve, reject });
    });
  }

  receive(): Promise<{ value: T; ok: boolean }> {
    // 1. If buffer has items, return first item
    if (this.buffer.length > 0) {
      const val = this.buffer.shift()!;

      // If senders are waiting for space, drain one into buffer and resume sender
      if (this.sendQueue.length > 0) {
        const sender = this.sendQueue.shift()!;
        this.buffer.push(sender.value);
        sender.resolve();
      }

      return Promise.resolve({ value: val, ok: true });
    }

    // 2. If channel is closed and buffer is empty
    if (this._isClosed) {
      return Promise.resolve({ value: undefined as unknown as T, ok: false });
    }

    // 3. For unbuffered channel: if sender is waiting, take value directly
    if (this.capacity === 0 && this.sendQueue.length > 0) {
      const sender = this.sendQueue.shift()!;
      sender.resolve();
      return Promise.resolve({ value: sender.value, ok: true });
    }

    // 4. Otherwise block until value is sent or channel closes
    return new Promise<{ value: T; ok: boolean }>((resolve) => {
      this.recvQueue.push({ resolve });
    });
  }

  close(): void {
    if (this._isClosed) {
      throw new Error('panic: close of closed channel');
    }
    this._isClosed = true;

    // Wake up all pending receivers with ok = false
    while (this.recvQueue.length > 0) {
      const receiver = this.recvQueue.shift()!;
      receiver.resolve({ value: undefined as unknown as T, ok: false });
    }

    // Reject any waiting senders (sending on closed channel)
    while (this.sendQueue.length > 0) {
      const sender = this.sendQueue.shift()!;
      sender.reject(new Error('panic: send on closed channel'));
    }
  }

  async *iterate(): AsyncIterable<T> {
    while (true) {
      const result = await this.receive();
      if (!result.ok) break;
      yield result.value;
    }
  }

  // Non-blocking inspection for select
  canReceiveImmediately(): boolean {
    return this.buffer.length > 0 || (this.capacity === 0 && this.sendQueue.length > 0) || this._isClosed;
  }

  canSendImmediately(): boolean {
    if (this._isClosed) return true; // Will panic, but ready
    if (this.capacity === 0) return this.recvQueue.length > 0;
    return this.buffer.length < this.capacity;
  }
}

export class GoWaitGroup implements IGoWaitGroup {
  private counter = 0;
  private waiters: Array<() => void> = [];

  add(delta: number): void {
    this.counter += delta;
    if (this.counter < 0) {
      throw new Error('panic: sync: negative WaitGroup counter');
    }
    if (this.counter === 0) {
      const waiting = [...this.waiters];
      this.waiters = [];
      for (const w of waiting) w();
    }
  }

  done(): void {
    this.add(-1);
  }

  wait(): Promise<void> {
    if (this.counter === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

export class GoMutex implements IGoMutex {
  private locked = false;
  private waiters: Array<() => void> = [];

  lock(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.locked = true;
        resolve();
      });
    });
  }

  unlock(): void {
    if (!this.locked) {
      throw new Error('panic: sync: unlock of unlocked mutex');
    }
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

export class GoRWMutex extends GoMutex implements IGoRWMutex {
  private readers = 0;
  private rwaiters: Array<() => void> = [];

  async rlock(): Promise<void> {
    this.readers++;
    return Promise.resolve();
  }

  runlock(): void {
    if (this.readers > 0) {
      this.readers--;
    }
  }
}

export class GoContext implements IGoContext {
  private _isDone = false;
  private _doneCh: GoChannel<null> = new GoChannel<null>(0);
  private _err: Error | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(parent?: GoContext) {
    if (parent) {
      if (parent.isDone) {
        this.cancel(parent.err() || new Error('context canceled'));
      } else {
        parent.done().receive().then(() => {
          if (!this._isDone) {
            this.cancel(parent.err() || new Error('context canceled'));
          }
        });
      }
    }
  }

  get isDone(): boolean {
    return this._isDone;
  }

  done(): IGoChannel<null> {
    return this._doneCh;
  }

  err(): Error | null {
    return this._err;
  }

  cancel(errorReason?: Error): void {
    if (this._isDone) return;
    this._isDone = true;
    this._err = errorReason || new Error('context canceled');
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    try {
      this._doneCh.close();
    } catch {
      // Ignore if already closed
    }
  }

  static Background(): GoContext {
    return new GoContext();
  }

  static WithCancel(parent: GoContext): [GoContext, () => void] {
    const ctx = new GoContext(parent);
    return [ctx, () => ctx.cancel(new Error('context canceled'))];
  }

  static WithTimeout(parent: GoContext, durationMs: number): [GoContext, () => void] {
    const ctx = new GoContext(parent);
    ctx.timerId = setTimeout(() => {
      ctx.cancel(new Error('context deadline exceeded'));
    }, durationMs);
    return [ctx, () => ctx.cancel(new Error('context canceled'))];
  }
}

export class GoTestingT implements IGoTestingT {
  readonly name: string;
  private _failed = false;
  readonly logs: string[] = [];
  readonly errors: string[] = [];
  private onSubtest?: (sub: GoTestingT) => void;

  constructor(name = 'Test', onSubtest?: (sub: GoTestingT) => void) {
    this.name = name;
    this.onSubtest = onSubtest;
  }

  get failed(): boolean {
    return this._failed;
  }

  Errorf(format: string, ...args: unknown[]): void {
    this._failed = true;
    const msg = formatGoPrintf(format, ...args);
    this.errors.push(msg);
  }

  Fatalf(format: string, ...args: unknown[]): void {
    this._failed = true;
    const msg = formatGoPrintf(format, ...args);
    this.errors.push(msg);
    throw new Error(`Fatal test failure in ${this.name}: ${msg}`);
  }

  Logf(format: string, ...args: unknown[]): void {
    this.logs.push(formatGoPrintf(format, ...args));
  }

  async Run(subName: string, subtest: (t: IGoTestingT) => void | Promise<void>): Promise<boolean> {
    const childT = new GoTestingT(`${this.name}/${subName}`, this.onSubtest);
    try {
      await subtest(childT);
    } catch (err: unknown) {
      childT._failed = true;
      childT.errors.push(err instanceof Error ? err.message : String(err));
    }
    if (childT.failed) {
      this._failed = true;
    }
    if (this.onSubtest) {
      this.onSubtest(childT);
    }
    return !childT.failed;
  }
}

/**
 * Go fmt.Printf / Sprintf formatting helper
 * Supports %v, %+v, %T, %t, %d, %s, %f, %%
 */
export function formatGoPrintf(format: string, ...args: unknown[]): string {
  let argIdx = 0;
  return format.replace(/%([%+vTtsdfq%])/g, (match, specifier) => {
    if (specifier === '%') return '%';
    if (argIdx >= args.length) return match;

    const val = args[argIdx++];
    switch (specifier) {
      case 'v':
      case '+v':
        if (typeof val === 'object' && val !== null) {
          if (Array.isArray(val)) return `[${val.join(' ')}]`;
          return JSON.stringify(val);
        }
        return String(val);
      case 'T':
        if (val === null) return '<nil>';
        if (Array.isArray(val)) return '[]interface{}';
        return typeof val;
      case 't':
        return Boolean(val) ? 'true' : 'false';
      case 'd':
        return String(parseInt(String(val), 10) || 0);
      case 's':
        return String(val);
      case 'q':
        return `"${val}"`;
      case 'f':
        return typeof val === 'number' ? val.toFixed(6) : String(val);
      default:
        return String(val);
    }
  });
}

/**
 * Go Runtime Scheduler & Concurrency Coordinator
 */
export class GoScheduler {
  private activeGoroutines = 0;
  private pendingGoroutines: Array<Promise<void>> = [];

  go(fn: () => Promise<void>): void {
    this.activeGoroutines++;
    const promise = (async () => {
      try {
        await fn();
      } finally {
        this.activeGoroutines--;
      }
    })();
    this.pendingGoroutines.push(promise);
  }

  async waitAll(): Promise<void> {
    await Promise.all(this.pendingGoroutines);
  }

  getActiveGoroutines(): number {
    return this.activeGoroutines;
  }
}
