import type { LearningCheck, LearningCheckSpec, Milestone } from "../../types";

export function validateLearningCheck(
  value: unknown
): LearningCheckSpec | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.kind === "free-response") {
    if (typeof data.question !== "string" || !data.question.trim() || data.question.length > 2400 ||
      typeof data.explanation !== "string" || !data.explanation.trim() ||
      typeof data.expectedAnswer !== "string" || !data.expectedAnswer.trim() || data.expectedAnswer.length > 4000 ||
      !Array.isArray(data.rubric) || data.rubric.length < 1 || data.rubric.length > 5) return null;
    const rubric: NonNullable<LearningCheckSpec["rubric"]> = [];
    for (const raw of data.rubric) {
      if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !/^[\w-]{1,48}$/.test(raw.id) ||
        typeof raw.criterion !== "string" || !raw.criterion.trim() || raw.criterion.length > 500 || rubric.some((r) => r.id === raw.id)) return null;
      rubric.push({ id: raw.id, criterion: raw.criterion.trim() });
    }
    return { kind: "free-response", question: data.question.trim(), context: typeof data.context === "string" ? data.context.trim() : undefined,
      explanation: data.explanation.trim(), expectedAnswer: data.expectedAnswer.trim(), rubric, options: [], correctOptionIds: [], multiple: false };
  }
  if (data.kind !== undefined && data.kind !== "choice") return null;
  if (
    typeof data.question !== "string" ||
    !data.question.trim() ||
    typeof data.explanation !== "string" ||
    !data.explanation.trim() ||
    !Array.isArray(data.options) ||
    data.options.length < 2 ||
    data.options.length > 6
  )
    return null;
  const options: LearningCheckSpec["options"] = [];
  for (const option of data.options) {
    if (
      !option ||
      typeof option !== "object" ||
      typeof option.id !== "string" ||
      !option.id.trim() ||
      typeof option.label !== "string" ||
      !option.label.trim()
    )
      return null;
    if (
      options.some(
        (existing) =>
          existing.id === option.id.trim() ||
          existing.label.toLowerCase() === option.label.trim().toLowerCase()
      )
    )
      return null;
    options.push({ id: option.id.trim(), label: option.label.trim() });
  }
  if (
    !Array.isArray(data.correctOptionIds) ||
    !data.correctOptionIds.length ||
    data.correctOptionIds.some(
      (id) =>
        typeof id !== "string" || !options.some((option) => option.id === id)
    )
  )
    return null;
  const correctOptionIds = [...new Set(data.correctOptionIds as string[])];
  const multiple = data.multiple === true;
  if (!multiple && correctOptionIds.length !== 1) return null;
  return {
    question: data.question.trim(),
    explanation: data.explanation.trim(),
    context: typeof data.context === "string" ? data.context.trim() : undefined,
    hint:
      typeof data.hint === "string" && data.hint.trim()
        ? data.hint.trim()
        : undefined,
    options,
    correctOptionIds,
    multiple,
  };
}

/** Hide both complete and partially streamed answer keys from conversational UI. */
export function hideLearningCheckBlocks(content: string): string {
  return (
    content
      // A model may echo conversation metadata instead of using the structured protocol.
      // Hide at the marker immediately, including while its JSON is still streaming.
      .replace(
        /(?:Knowledge check presented in lesson UI|Recorded attempt|Readiness review|Roadmap adaptation):[\s\S]*$/i,
        ""
      )
      .replace(
        /^[ \t]*```forge-(?:check|assessment|repair|visual)[^\r\n]*(?:\r?\n[\s\S]*?(?:^[ \t]*```[ \t]*$|$(?![\s\S]))|$)/gim,
        ""
      )
      .trim()
  );
}

export function extractLearningCheck(content: string): {
  check: LearningCheckSpec | null;
  text: string;
  hasBlock: boolean;
} {
  const block =
    /^[ \t]*```forge-check[^\r\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/im.exec(
      content
    );
  if (!block)
    return {
      check: null,
      text: hideLearningCheckBlocks(content),
      hasBlock: false,
    };
  let check: LearningCheckSpec | null = null;
  try {
    check = validateLearningCheck(JSON.parse(block[1]));
  } catch {}
  return { check, text: hideLearningCheckBlocks(content), hasBlock: true };
}

/** Grade stable option ids, never their shuffled display positions. */
export function gradeLearningCheck(
  check: LearningCheckSpec,
  selectedIds: string[],
  dontKnow = false
): boolean {
  if (
    check.kind === "free-response" ||
    dontKnow ||
    selectedIds.some((id) => !check.options.some((option) => option.id === id))
  )
    return false;
  const selected = new Set(selectedIds);
  return (
    selected.size === check.correctOptionIds.length &&
    check.correctOptionIds.every((id) => selected.has(id))
  );
}

export function orderedCheckOptions(check: LearningCheck) {
  let seed = 2166136261;
  for (const char of check.id)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const result = [...check.options];
  for (let index = result.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const starterChecks: Record<string, LearningCheckSpec> = {
  "go-concurrency": {
    context:
      "An unbuffered channel has no storage. A send waits for a receiver, and a receive waits for a sender. While blocked, that goroutine cannot make progress on its next statement.",
    question:
      "One goroutine sends a value to an unbuffered channel, then plans to receive it on the next line. What happens?",
    options: [
      {
        id: "blocked",
        label: "It blocks at the send because no concurrent receiver is ready.",
      },
      {
        id: "stored",
        label:
          "It stores the value in the channel and receives it on the next line.",
      },
      {
        id: "dropped",
        label: "It drops the value and receives the channel’s zero value.",
      },
      {
        id: "receiver",
        label: "It creates a receiver goroutine automatically.",
      },
    ],
    correctOptionIds: ["blocked"],
    explanation:
      "The send must finish before the same goroutine can reach its receive statement. With no other receiver, the send cannot finish. A separate goroutine or an appropriate buffered design breaks that dependency.",
    multiple: false,
  },
  "rust-ownership": {
    context:
      "Passing an owned String by value transfers ownership. A borrowed string slice (&str) lets a function read the text without taking ownership of the String.",
    question:
      "A function only measures a String, and its caller needs to keep using that String. Which parameter type fits?",
    options: [
      { id: "borrow", label: "A borrowed string slice: &str" },
      { id: "owned", label: "An owned string: String" },
      { id: "mutable", label: "An owned mutable string: mut String" },
      {
        id: "static",
        label: "A reference restricted to static text: &'static str",
      },
    ],
    correctOptionIds: ["borrow"],
    explanation:
      "&str borrows the text for the call without moving the String. Taking String by value moves it, mut does not prevent that move, and a static lifetime unnecessarily excludes ordinary local strings.",
    multiple: false,
  },
  "distributed-systems-raft": {
    context:
      "A Raft follower starts an election when its election timer expires without a valid heartbeat. Election terms distinguish successive election attempts, and a node grants at most one vote in each term.",
    question:
      "A follower’s election timer expires. Which local state update begins its new election?",
    options: [
      {
        id: "candidate",
        label: "Become a candidate, increment the term, and vote for itself.",
      },
      {
        id: "leader",
        label: "Become a leader, keep the term, and start accepting writes.",
      },
      {
        id: "same",
        label:
          "Become a candidate, keep the term, and reuse the previous vote.",
      },
      {
        id: "wait",
        label:
          "Stay a follower, increment the term, and wait for another leader.",
      },
    ],
    correctOptionIds: ["candidate"],
    explanation:
      "Starting an election means entering the candidate state in a new term and recording a self-vote. Leadership requires winning a majority; a timeout alone does not grant it.",
    multiple: false,
  },
  "python-asyncio-internals": {
    context:
      "A generator keeps its local execution state when it yields. A scheduler can resume it later, which provides a building block for cooperative coroutines.",
    question:
      "When a generator yields control to a scheduler, what happens to the generator’s execution state?",
    options: [
      {
        id: "paused",
        label: "It is suspended and retained until the generator is resumed.",
      },
      {
        id: "restarted",
        label: "It is discarded and execution restarts at the first line.",
      },
      {
        id: "thread",
        label: "It is moved into a newly created operating-system thread.",
      },
      {
        id: "finished",
        label: "It is finalized as if the function had returned normally.",
      },
    ],
    correctOptionIds: ["paused"],
    explanation:
      "Yield suspends the generator’s frame, including local variables and its execution position. Resuming it continues from that position; yielding does not create a thread or perform a normal final return.",
    multiple: false,
  },
};

export function starterLearningCheck(
  trackId: string,
  milestone: Milestone,
  milestoneIndex: number
): LearningCheck | null {
  let spec = milestone.check;
  if (!spec && milestoneIndex === 0) spec = starterChecks[trackId];
  if (!spec) return null;
  if (
    !milestone.check &&
    trackId === "go-concurrency" &&
    /worker pool/i.test(milestone.title)
  ) {
    spec = {
      ...spec,
      context:
        "A worker pool reads jobs, computes results, and sends each result back. When jobs and results channels are unbuffered, each send requires a receiver to be ready.",
      question:
        "The main goroutine sends every job before it starts reading results. Workers send results before taking another job. Why can this stall?",
      options: [
        {
          id: "cycle",
          label:
            "Workers wait for result receivers while main waits for workers to accept more jobs.",
        },
        {
          id: "capacity",
          label: "Unbuffered channels discard jobs when all workers are busy.",
        },
        {
          id: "waitgroup",
          label:
            "WaitGroup.Wait receives the pending results on main’s behalf.",
        },
        {
          id: "serial",
          label:
            "The scheduler runs each goroutine to completion before starting another.",
        },
      ],
      correctOptionIds: ["cycle"],
      explanation:
        "This creates a circular wait: workers cannot accept another job until their result is received, while main will not receive results until it has sent all jobs. Sending jobs concurrently with draining results avoids that dependency.",
    };
  }
  return {
    ...spec,
    id: `${milestone.id}:intro-check-v1`,
    milestoneId: milestone.id,
  };
}

/** Activity completion is not mastery. Require distinct, unassisted applications. */
export function learningEvidence(
  messages: import("../../types").ChatMessage[],
  milestoneId: string
) {
  const attempts = messages.flatMap((message) =>
    message.check_attempt?.milestoneId === milestoneId
      ? [message.check_attempt]
      : []
  );
  const distinct = [
    ...new Map(attempts.map((attempt) => [attempt.checkId, attempt])).values(),
  ];
  const independent = distinct.filter(
    (attempt) =>
      attempt.correct && !attempt.assisted && attempt.confidence !== "unsure" &&
      attempt.grading?.status !== "uncertain" && !attempt.grading?.reviewRequested
  );
  return {
    attempts: distinct.length,
    independentCorrect: independent.length,
    readyToAdvance:
      independent.length >= 2 &&
      distinct[distinct.length - 1]?.correct === true,
  };
}
