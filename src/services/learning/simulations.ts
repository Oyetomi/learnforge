/** Small, explicit teaching models. They do not execute generated code. */
export interface ChannelState {
  capacity: number;
  queue: number[];
  pendingSend: number | null;
  receiverWaiting: boolean;
  received: number | null;
  nextValue: number;
  message: string;
}
export const newChannel = (capacity = 0): ChannelState => ({
  capacity,
  queue: [],
  pendingSend: null,
  receiverWaiting: false,
  received: null,
  nextValue: 7,
  message: "Try sending a value. Will the sender be able to continue?",
});
export function channelAction(
  state: ChannelState,
  action: "send" | "receive"
): ChannelState {
  const s = { ...state, queue: [...state.queue] };
  if (action === "send") {
    if (s.pendingSend !== null)
      return {
        ...s,
        message: "This sender is already waiting. Let the receiver run.",
      };
    const value = s.nextValue;
    s.nextValue++;
    if (s.receiverWaiting)
      return {
        ...s,
        receiverWaiting: false,
        received: value,
        message: `The waiting receiver takes ${value}. Both goroutines can continue.`,
      };
    if (s.queue.length < s.capacity)
      return {
        ...s,
        queue: [...s.queue, value],
        message: `${value} occupies a buffer slot. The sender can continue without a receiver.`,
      };
    return {
      ...s,
      pendingSend: value,
      message:
        s.capacity === 0
          ? `No buffer: the sender waits with ${value} until a receiver is ready.`
          : `The buffer is full. The sender waits with ${value}; no value is discarded.`,
    };
  }
  if (s.queue.length) {
    const received = s.queue.shift()!;
    const waiting = s.pendingSend;
    if (waiting !== null) {
      s.queue.push(waiting);
      s.pendingSend = null;
    }
    return {
      ...s,
      received,
      message:
        waiting !== null
          ? `The receiver takes ${received}, freeing a slot. The waiting send of ${waiting} can now complete.`
          : `The receiver takes ${received}, the oldest buffered value.`,
    };
  }
  if (s.pendingSend !== null)
    return {
      ...s,
      received: s.pendingSend,
      pendingSend: null,
      message: `The receiver takes ${s.pendingSend} directly from the waiting sender. Both can continue.`,
    };
  return {
    ...s,
    receiverWaiting: true,
    message:
      "No value is available. The receiver waits until a sender provides one.",
  };
}
export interface HttpResponseState {
  status: 200 | 404 | null;
  body: string;
  calls: string[];
  message: string;
}
export const newHttpResponse = (): HttpResponseState => ({
  status: null,
  body: "",
  calls: [],
  message:
    "Try the two operations in either order. Watch when the status becomes fixed.",
});
export function httpResponseAction(
  state: HttpResponseState,
  action: "status" | "body"
): HttpResponseState {
  const call =
    action === "status" ? "w.WriteHeader(404)" : 'w.Write([]byte("Hello"))';
  const calls = [...state.calls, call].slice(-6);
  if (action === "status")
    return state.status === null
      ? {
          ...state,
          status: 404,
          calls,
          message:
            "404 is now the final status. Writing a body later will keep this status.",
        }
      : {
          ...state,
          calls,
          message: `The final status is already ${state.status}. A later WriteHeader(404) cannot change it.`,
        };
  return {
    ...state,
    status: state.status ?? 200,
    body: (state.body + "Hello").slice(-120),
    calls,
    message:
      state.status === null
        ? "The first body write implicitly commits status 200. A later error status would be too late."
        : "The body is appended. The previously committed status stays the same.",
  };
}

export interface SliceState {
  a: number[];
  b: number[] | null;
  sStart: number;
  sLength: number;
  t: {
    array: "A" | "B";
    start: number;
    length: number;
    capacity: number;
  } | null;
  nextValue: number;
  message: string;
}
export const newSlices = (): SliceState => ({
  a: [10, 20, 30, 40],
  b: null,
  sStart: 0,
  sLength: 2,
  t: null,
  nextValue: 50,
  message:
    "Drag the slice bounds or edit an array value. Watch which cells s can see.",
});
const cloneSlices = (state: SliceState): SliceState => ({
  ...state,
  a: [...state.a],
  b: state.b ? [...state.b] : null,
  t: state.t ? { ...state.t } : null,
});
export function editSliceValue(
  state: SliceState,
  array: "A" | "B",
  index: number,
  value: number
): SliceState {
  if (
    !Number.isInteger(value) ||
    Math.abs(value) > 999 ||
    index < 0 ||
    index >= (array === "A" ? state.a.length : state.b?.length || 0)
  )
    return state;
  const s = cloneSlices(state);
  (array === "A" ? s.a : s.b!)[index] = value;
  return {
    ...s,
    message: `Array ${array}[${index}] is now ${value}. Every slice whose highlighted range includes this cell sees the same value.`,
  };
}
export function sliceAction(
  state: SliceState,
  action: "copy" | "mutate" | "append" | "start" | "length",
  value?: number
): SliceState {
  const s = cloneSlices(state);
  if (action === "start" || action === "length") {
    if (!Number.isInteger(value)) return state;
    if (action === "start") {
      s.sStart = Math.max(0, Math.min(3, value!));
      s.sLength = Math.min(s.sLength, 4 - s.sStart);
    } else s.sLength = Math.max(0, Math.min(4 - s.sStart, value!));
    return {
      ...s,
      message: `s now views a[${s.sStart}:${s.sStart + s.sLength}]: length ${
        s.sLength
      }, capacity ${4 - s.sStart}.${
        s.t
          ? " t keeps its own header unchanged."
          : " The array values did not move."
      }`,
    };
  }
  if (action === "copy")
    return s.t
      ? s
      : {
          ...s,
          t: {
            array: "A",
            start: s.sStart,
            length: s.sLength,
            capacity: 4 - s.sStart,
          },
          message:
            "t has its own header, but shares the same array. Edit a shared cell and compare the two views.",
        };
  if (!s.t) return s;
  if (action === "mutate") {
    if (!s.t.length)
      return {
        ...s,
        message:
          "t has length zero, so t[0] is out of bounds. Append an element first.",
      };
    const array = s.t.array === "A" ? s.a : s.b!,
      index = s.t.start;
    array[index] = array[index] === 99 ? 10 : 99;
    return {
      ...s,
      message: `t[0] updates array ${s.t.array}[${index}] to ${array[index]}. Only slice views covering that cell see this change.`,
    };
  }
  if (s.t.length >= 8)
    return {
      ...s,
      message: "Reset the experiment to explore another sequence.",
    };
  if (s.t.length < s.t.capacity) {
    const array = s.t.array === "A" ? s.a : s.b!;
    array[s.t.start + s.t.length] = s.nextValue;
    s.t.length++;
    return {
      ...s,
      nextValue: s.nextValue + 10,
      message: `There is spare capacity. t grows to length ${s.t.length} in array ${s.t.array}; s keeps length ${s.sLength}.`,
    };
  }
  const values = (s.t.array === "A" ? s.a : s.b!).slice(
    s.t.start,
    s.t.start + s.t.length
  );
  s.b = [...values, s.nextValue, ...Array(8 - values.length - 1).fill(0)];
  s.t = { array: "B", start: 0, length: values.length + 1, capacity: 8 };
  return {
    ...s,
    nextValue: s.nextValue + 10,
    message:
      "The old array is full. append copies t’s elements to a larger array B. t now points to B; s still points to A. Capacity 8 is illustrative, not a guaranteed growth rule.",
  };
}
