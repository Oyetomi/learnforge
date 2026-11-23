import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveReadingDocument, discardUnapprovedReadingDocument } from "../../services/learning/readingStore";
import {
  X,
  ArrowRight,
  Blocks,
  ExternalLink,
  Globe,
  Loader2,
  Compass,
  FileText,
  Search,
  Upload,
} from "lucide-react";
import {
  PLUGINS_CHANGED_EVENT,
  getExaPluginConfig,
  isExaPluginReady,
  type ExaPluginConfig,
} from "../../services/plugins/registry";
import {
  ExaPluginError,
  fetchExaGrounding,
  parseDirectUrls,
  searchExaReferences,
  type ExaGroundedSource,
} from "../../services/plugins/exa";
import { generateCustomTrack } from "../../services/ai/curriculum";
import {
  generateCurriculumOutline,
  proposeLearningScope,
  type ScopeProposal,
} from "../../services/ai/curriculumOutline";
import {
  generateBoundaryProbes,
  summarizeBoundaryProbes,
  type BoundaryProbeQuestion,
  type BoundaryProbeResponse,
} from "../../services/ai/preProbe";
import {
  loadConceptLedger,
  relevantPriorConcepts,
} from "../../services/learning/conceptLedger";
import {
  isLocalhostEndpoint,
  type LearningScope,
  type LocalServiceSpec,
  type ProjectStructure,
} from "../../services/learning/curriculumPlan";
import { extractTextFromFile } from "../../services/learning/fileExtractor";
import { readPdfBook, readSelectedPdfChapters } from "../../services/learning/pdfReader";
import { mainPdfSections, readableFileTitle, selectedPdfSource, selectedPdfSubheadings, type PdfBook } from "../../services/learning/pdfContents";
import { PdfChapterPicker } from "./PdfChapterPicker";
import type { CourseTrack } from "../../services/ai/types";
import type { ConfidenceLevel } from "../../types";
import { VoiceDictationButton } from "../learning/VoiceDictationButton";
import { PlanApproval } from "./PlanApproval";
import { CurriculumApproval } from "./CurriculumApproval";
import "./curriculum.css";
import "./new-topic-layout.css";

import { requestsDiagnosticFirst } from "../../services/learning/diagnosticIntent";
import { supportsProjectMode } from "../../services/learning/project";
import { loadLanguageStatus, profileFor, supportsDependencyFetch, type LanguageStatus } from "../../services/languages";
import { projectRuntime } from "../editor/useProjectWorkspace";
import { loadGoalDraft as savedDraft, saveGoalDraft, GOAL_DRAFT_KEY as draftKey, STARTING_POINTS as startingPoints, STARTING_POINT_LABELS } from "../../services/learning/goalDraft";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTrackCreated: (track: CourseTrack) => void;
  onOpenPlugins?: () => void;
  initialInterest?: string;
  showMaterial?: boolean;
  /** The goal was already written on the start screen: begin scoping immediately. */
  autoScope?: boolean;
}
const PRACTICE_CHOICES = [
  { id: "auto", title: "Questions", detail: "Explanations and checks; code only if your goal needs it." },
  { id: "code", title: "Code exercises", detail: "A short tested exercise per lesson." },
  { id: "project", title: "Build a project", detail: "Build real projects across the course (follows a book’s projects or grows one app)." },
] as const;

const PROJECT_STRUCTURE_CHOICES: { id: ProjectStructure; label: string; detail: string }[] = [
  { id: "auto", label: "Match material", detail: "Follow the book or goal." },
  { id: "single", label: "One project", detail: "Grow one codebase across every unit." },
  { id: "multi", label: "Multiple projects", detail: "Split major parts into focused workspaces." },
];

const LOCAL_SERVICE_PRESETS: LocalServiceSpec[] = [
  { name: "Kafka / Redpanda", endpoint: "localhost:9092" },
  { name: "PostgreSQL", endpoint: "localhost:5432" },
  { name: "Redis", endpoint: "localhost:6379" },
];

/** A programming language named in the goal ("…using Go", "in Rust"), if any. */
function languageInGoal(text: string): string {
  const t = ` ${text.toLowerCase()} `;
  const found: [RegExp, string][] = [
    [/\b(golang|go)\b(?! (to|back|through|over|into|deeper|on)\b)/, "go"],
    [/\bpython\b/, "python"],
    [/\brust\b/, "rust"],
    [/\btypescript\b/, "typescript"],
    [/\bjavascript\b|\bnode(\.js)?\b/, "javascript"],
    [/\bjava\b/, "java"],
    [/\bc\+\+|\bcpp\b/, "cpp"],
    [/\bc#|\bcsharp\b/, "csharp"],
    [/\bruby\b/, "ruby"],
    [/\bswift\b/, "swift"],
  ];
  return found.find(([re]) => re.test(t))?.[1] ?? "";
}

const CODE_LANGUAGES: [string, string][] = [
  ["", "Decide from my goal"],
  ["go", "Go"],
  ["python", "Python"],
  ["rust", "Rust"],
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["java", "Java"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["c", "C"],
  ["ruby", "Ruby"],
  ["swift", "Swift"],
  ["sql", "SQL"],
];

export const NewTopicModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onTrackCreated,
  onOpenPlugins,
  initialInterest,
  showMaterial = false,
  autoScope = false,
}) => {
  const [interest, setInterest] = useState(() => initialInterest ?? savedDraft().interest ?? "");
  const [destination, setDestination] = useState(
    () => savedDraft().destination || ""
  );
  const [startingPoint, setStartingPoint] = useState(
    () =>
      savedDraft().startingPoint ||
      "I’m not sure — help me find my starting point"
  );
  const [diagnosticChoice, setDiagnosticChoice] = useState<boolean | null>(null);
  // How the learner practises. A chosen language makes the plan a coding plan
  // in that language; "project" also builds one codebase across the course.
  const [practice, setPractice] = useState<"auto" | "code" | "project">("auto");
  const [projectStructure, setProjectStructure] = useState<ProjectStructure>("auto");
  const [allowExternalPackages, setAllowExternalPackages] = useState(false);
  const [localServices, setLocalServices] = useState<LocalServiceSpec[]>([]);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServiceEndpoint, setCustomServiceEndpoint] = useState("");
  const [serviceInputError, setServiceInputError] = useState("");
  const [practiceLanguage, setPracticeLanguage] = useState(() => {
    try {
      return localStorage.getItem("learnforge:practice-language") || "";
    } catch {
      return "";
    }
  });
  const chosenLanguage = practiceLanguage || languageInGoal(interest) || "python";
  const codeLanguage = practice === "auto" ? "" : chosenLanguage;
  const buildProject = practice === "project";
  const projectAvailable = supportsProjectMode(codeLanguage);
  const choosePracticeLanguage = (id: string) => {
    setPracticeLanguage(id);
    try {
      localStorage.setItem("learnforge:practice-language", id);
    } catch {
      /* Preference only. */
    }
  };
  const [languageStatus, setLanguageStatus] = useState<LanguageStatus[] | null | undefined>(undefined);
  useEffect(() => {
    if (!codeLanguage) return;
    let cancelled = false;
    void loadLanguageStatus().then((list) => { if (!cancelled) setLanguageStatus(list); });
    return () => { cancelled = true; };
  }, [codeLanguage]);
  const projectRunHelp = (() => {
    if (!projectAvailable) return "Project mode needs a language with step tests. This language gets an exercise per lesson.";
    if (languageStatus === undefined) return "Checking whether this language is installed…";
    const runtime = projectRuntime(codeLanguage, languageStatus);
    const name = profileFor(codeLanguage)?.name ?? codeLanguage;
    const missing = languageStatus?.find((p) => p.id === codeLanguage)?.missing ?? [];
    const where = runtime.local
      ? `Runs on this Mac with your ${name} toolchain.`
      : runtime.available
      ? languageStatus
        ? "Runs on the Go Playground until Go is installed on this Mac."
        : "Runs on the Go Playground here; the Mac app uses your installed Go."
      : languageStatus
      ? `${name} isn’t installed yet (needs ${missing.join(", ") || name}). You can plan the course now and install it before the first step.`
      : `${name} projects run in the Mac app with your installed toolchain.`;
    return `Builds your book’s projects or one cumulative codebase with accumulating tests. ${where}`;
  })();
  const codeLanguages: [string, string][] = [
    ...CODE_LANGUAGES,
    ...(languageStatus || []).filter((p) => p.custom && !CODE_LANGUAGES.some(([id]) => id === p.id)).map((p): [string, string] => [p.id, `${p.name} (custom)`]),
  ];
  const diagnosticFirst = diagnosticChoice ?? requestsDiagnosticFirst(`${interest} ${destination}`);
  const [referenceName, setReferenceName] = useState(""),
    [referenceContent, setReferenceContent] = useState("");
  const [pdfBook, setPdfBook] = useState<PdfBook | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfSections, setPdfSections] = useState<string[]>([]);
  const [usePdfContents, setUsePdfContents] = useState(false);
  const pdfReadController = useRef<AbortController | null>(null);
  const [exaConfig, setExaConfig] = useState<ExaPluginConfig>(() =>
    getExaPluginConfig()
  );
  const exaReady = isExaPluginReady(exaConfig);
  const [autoGroundWithExa, setAutoGroundWithExa] = useState<boolean>(() => {
    const cfg = getExaPluginConfig();
    return isExaPluginReady(cfg) && cfg.autoGroundNewTopics;
  });
  const [exaSources, setExaSources] = useState<ExaGroundedSource[]>([]);
  const [exaQuery, setExaQuery] = useState("");
  const [isFetchingExa, setIsFetchingExa] = useState(false);
  const [proposal, setProposal] = useState<ScopeProposal | null>(null),
    [scope, setScope] = useState<LearningScope>("curriculum");
  const [task, setTask] = useState<
    "idle" | "scoping" | "probing" | "creating"
  >("idle");
  const [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [probeQuestions, setProbeQuestions] = useState<BoundaryProbeQuestion[]>(
    []
  );
  const [probeResponses, setProbeResponses] = useState<
    Record<string, BoundaryProbeResponse>
  >({});

  useEffect(() => { setProbeQuestions([]); setProbeResponses({}); setDiagnosticChoice(null); }, [interest, destination, startingPoint]);

  const ledgerEntries = useMemo(
    () => (isOpen ? loadConceptLedger() : []),
    [isOpen]
  );
  const matchedPrior = useMemo(() => {
    const query = `${interest} ${destination}`.trim();
    if (!query || query.length < 3 || !ledgerEntries.length) return [];
    return relevantPriorConcepts(query, { entries: ledgerEntries, limit: 6 });
  }, [interest, destination, ledgerEntries]);

  const busy = task !== "idle" || isReadingFile || isFetchingExa;
  const [draftTrack, setDraftTrack] = useState<CourseTrack | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    statusRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null),
    headingRef = useRef<HTMLHeadingElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    referenceDetailsRef = useRef<HTMLDetailsElement>(null),
    requestRef = useRef<AbortController | null>(null),
    exaControllerRef = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLDivElement>(null),
    readSequence = useRef(0),
    readingFile = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    const syncPlugins = () => {
      const next = getExaPluginConfig();
      const nextReady = isExaPluginReady(next);
      setExaConfig((prev) => {
        const wasReady = isExaPluginReady(prev);
        if (!wasReady && nextReady) {
          setAutoGroundWithExa(next.autoGroundNewTopics);
        } else if (!nextReady) {
          setAutoGroundWithExa(false);
        }
        return next;
      });
    };
    window.addEventListener(PLUGINS_CHANGED_EVENT, syncPlugins);
    return () => window.removeEventListener(PLUGINS_CHANGED_EVENT, syncPlugins);
  }, []);
  useEffect(() => {
    if (exaSources.length > 0 && referenceDetailsRef.current) {
      referenceDetailsRef.current.open = true;
    }
  }, [exaSources.length]);
  useEffect(() => {
    saveGoalDraft({ interest, destination, startingPoint });
  }, [interest, destination, startingPoint]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    if (isOpen) {
      dialogRef.current?.showModal();
      if (showMaterial && referenceDetailsRef.current) {
        referenceDetailsRef.current.open = true;
        referenceDetailsRef.current.scrollIntoView({ block: "nearest" });
        referenceDetailsRef.current.querySelector("textarea")?.focus({ preventScroll: true });
      } else inputRef.current?.focus();
    }
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
      exaControllerRef.current?.abort();
      pdfReadController.current?.abort();
      readSequence.current += 1;
      readingFile.current = false;
      dialogRef.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);
  useEffect(() => {
    if (proposal) {
      headingRef.current?.focus();
      formRef.current?.scrollTo({ top: 0 });
    }
  }, [proposal]);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => {
    if (draftTrack || !proposal) return;
    headingRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollTo({ top: 0 });
  }, [draftTrack]);
  useEffect(() => {
    if (task === "idle" && !isReadingFile && !isFetchingExa) return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current,
        status = statusRef.current;
      if (!form || !status) return;
      form.scrollTo({
        top: Math.max(
          0,
          form.scrollTop +
            status.getBoundingClientRect().top -
            form.getBoundingClientRect().top -
            30
        ),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [task, isReadingFile, isFetchingExa]);
  useEffect(() => {
    if (!pdfBook) return;
    const frame = requestAnimationFrame(() => {
      const picker = formRef.current?.querySelector<HTMLElement>(".pdf-chapters");
      picker?.focus({ preventScroll: true });
      picker?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pdfBook?.name, pdfBook?.contentsFrom]);
  const close = () => {
    if (savingPdf) return;
    pdfReadController.current?.abort();
    requestRef.current?.abort();
    exaControllerRef.current?.abort();
    onClose();
  };
  const cancel = () => {
    pdfReadController.current?.abort();
    requestRef.current?.abort();
    exaControllerRef.current?.abort();
    readSequence.current += 1;
    readingFile.current = false;
    setIsReadingFile(false);
    setIsFetchingExa(false);
    setNotice(
      "Preparation cancelled. Your goal is still here; continue when you’re ready."
    );
  };

  const resolveGoalText = () =>
    interest.trim() ||
    (exaSources.length > 0
      ? `Teach me the key concepts in ${exaSources[0].title}`
      : referenceContent.trim()
      ? `Teach me the key concepts in ${referenceName ? readableFileTitle(referenceName) : "my reference"}`
      : "");

  const handleFetchExaSources = async (explicitInput?: string) => {
    const rawInput = (explicitInput ?? exaQuery).trim() || interest.trim();
    if (
      task !== "idle" ||
      readingFile.current ||
      isFetchingExa ||
      !rawInput
    ) {
      return;
    }
    const controller = new AbortController();
    exaControllerRef.current = controller;
    setIsFetchingExa(true);
    setError("");
    setNotice("");
    try {
      const { mode, sources } = await fetchExaGrounding(rawInput, {
        config: exaConfig,
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      if (sources.length === 0) {
        setNotice("Exa returned no readable sources for that query. Try more specific keywords or a direct URL.");
        return;
      }
      setExaSources((prev) => {
        const merged = [...prev];
        for (const src of sources) {
          const exists = merged.some(
            (item) => item.url === src.url || item.id === src.id
          );
          if (!exists && merged.length < 6) {
            merged.push(src);
          }
        }
        return merged;
      });
      if (explicitInput === undefined) {
        setExaQuery("");
      }
      setInterest((prev) =>
        prev.trim()
          ? prev
          : `Teach me the key concepts in ${sources[0].title}`
      );
      setNotice(
        mode === "urls"
          ? `Extracted ${sources.length} web ${
              sources.length === 1 ? "source" : "sources"
            } via Exa.`
          : `Attached ${sources.length} live Exa ${
              sources.length === 1 ? "source" : "sources"
            } to ground your learning plan.`
      );
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not fetch sources from Exa."
        );
      }
    } finally {
      if (mounted.current) setIsFetchingExa(false);
      if (exaControllerRef.current === controller) {
        exaControllerRef.current = null;
      }
    }
  };

  const updateProbeResponse = (
    probeId: string,
    patch: Partial<BoundaryProbeResponse>
  ) => {
    setProbeResponses((prev) => {
      const current = prev[probeId] || {
        selectedOptionId: null,
        dontKnow: false,
        confidence: null,
        thinking: "",
      };
      return {
        ...prev,
        [probeId]: { ...current, ...patch },
      };
    });
  };

  const startBoundaryProbe = async () => {
    const goal = resolveGoalText();
    if (
      task !== "idle" ||
      requestRef.current ||
      readingFile.current ||
      isFetchingExa ||
      !goal
    )
      return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTask("probing");
    setError("");
    setNotice("");
    setStatus("Preparing a short starting-point check before teaching…");
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    try {
      const questions = await generateBoundaryProbes({
        goal,
        destination: destination.trim() || goal,
        startingPoint,
        priorConcepts: matchedPrior,
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      setProbeQuestions(questions);
      const initial: Record<string, BoundaryProbeResponse> = {};
      for (const q of questions) {
        initial[q.id] = {
          selectedOptionId: null,
          dontKnow: false,
          confidence: null,
          thinking: "",
        };
      }
      setProbeResponses(initial);
    } catch (e) {
      if (mounted.current && (!controller.signal.aborted || timedOut)) {
        setError(
          timedOut
            ? "Boundary probing took longer than expected. You can turn off the starting-point check to prepare the lesson directly."
            : e instanceof Error
            ? e.message
            : "Could not prepare boundary questions."
        );
      }
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setTask("idle");
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  const run = async () => {
    const goal = resolveGoalText();
    if (
      task !== "idle" ||
      requestRef.current ||
      readingFile.current ||
      isFetchingExa ||
      !goal
    )
      return;
    if (pdfBook && usePdfContents && scope === "curriculum" && (!pdfSections.length || pdfSections.length > 48)) {
      setError("Choose between 1 and 48 PDF sections before preparing the curriculum."); return;
    }
    if (proposal && diagnosticFirst) {
      if (!probeQuestions.length) { await startBoundaryProbe(); return; }
      if (probeQuestions.some(q => !probeResponses[q.id]?.dontKnow && !probeResponses[q.id]?.selectedOptionId)) {
        setError("Answer each starting-point question or choose I don’t know before preparing your lesson."); return;
      }
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setTask(proposal ? "creating" : "scoping");
    setError("");
    setNotice("");
    const updateStatus = (text: string) => {
      if (
        mounted.current &&
        requestRef.current === controller &&
        !controller.signal.aborted
      )
        setStatus(text);
    };
    setStatus(
      proposal
        ? "Preparing the scope and outcomes…"
        : "Understanding the scope of your goal…"
    );
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      proposal ? 240000 : 60000
    );
    try {
      if (!proposal) {
        const proposed = pdfBook && usePdfContents
          ? { scope: "curriculum" as const, reason: "Choose chapters from your PDF, then review the curriculum before starting." }
          : await proposeLearningScope(goal, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setScope(proposed.scope);
        setProposal(proposed);
      } else {
        let activeExaSources = exaSources;
        if (exaReady && autoGroundWithExa && activeExaSources.length === 0) {
          updateStatus("Searching live documentation & sources with Exa…");
          try {
            const fetched = await searchExaReferences(
              `${goal} ${destination}`.trim(),
              { config: exaConfig, signal: controller.signal }
            );
            if (!mounted.current || controller.signal.aborted) return;
            if (fetched.length > 0) {
              activeExaSources = fetched;
              setExaSources(fetched);
            }
          } catch (exaErr) {
            if (controller.signal.aborted) return;
            if (
              exaErr instanceof ExaPluginError &&
              (exaErr.status === 401 || exaErr.status === 403)
            ) {
              throw exaErr;
            }
            if (mounted.current) {
              setNotice(
                `Exa live grounding was unavailable (${
                  exaErr instanceof Error ? exaErr.message : "network error"
                }); preparing plan without web sources.`
              );
            }
          }
          updateStatus("Preparing the scope and outcomes…");
        }

        let preparedPdf = pdfBook;
        if (pdfBook && usePdfContents && scope === "curriculum") {
          updateStatus("Reading selected chapter excerpts…");
          preparedPdf = await readSelectedPdfChapters(pdfBook, pdfSections, { signal: controller.signal,
            onProgress: (page, total) => updateStatus(`Reading selected chapters · PDF page ${page} of ${total}…`) });
          if (!mounted.current || controller.signal.aborted) return;
          setPdfBook(preparedPdf);
        }
        const pdfSelection = preparedPdf && usePdfContents && scope === "curriculum" ? selectedPdfSource(preparedPdf, pdfSections) : null;
        const sectionSubheadings =
          preparedPdf && usePdfContents && scope === "curriculum"
            ? selectedPdfSubheadings(preparedPdf, pdfSections)
            : undefined;
        const projectEnvironment =
          buildProject && projectAvailable
            ? {
                ...(projectStructure !== "auto" ? { structure: projectStructure } : {}),
                ...(allowExternalPackages && supportsDependencyFetch(codeLanguage)
                  ? { allowExternalPackages: true }
                  : {}),
                ...(localServices.length ? { localServices } : {}),
              }
            : undefined;
        const options = {
          topic: goal,
          interest: goal,
          signal: controller.signal,
          ...(codeLanguage ? { language: codeLanguage } : {}),
          references: [...(pdfSelection?.references || []), ...activeExaSources.map(s => s.reference)],
          referenceMaterial: !pdfSelection && referenceContent.trim()
            ? {
                name: referenceName || "Reference notes",
                content: referenceContent,
              }
            : undefined,
        };
        const boundaryEvidence =
          probeQuestions.length > 0
            ? summarizeBoundaryProbes(probeQuestions, probeResponses)
            : undefined;
        const track =
          scope === "curriculum"
            ? await generateCurriculumOutline(
                {
                  ...options,
                  destination: destination.trim() || goal,
                  startingPoint,
                  priorConcepts: matchedPrior,
                  boundaryEvidence,
                  sourceDocument: pdfSelection?.source,
                  sectionSubheadings,
                  project: buildProject && projectAvailable,
                  projectEnvironment,
                },
                updateStatus
              )
            : await generateCustomTrack(
                {
                  ...options,
                  topic: destination.trim() || goal,
                  unitContext: JSON.stringify({
                    scope: "focused",
                    originalGoal: goal,
                    desiredAbility: destination.trim() || goal,
                    startingPoint,
                    boundaryEvidence,
                    instruction:
                      "Prepare exactly one focused lesson, not a full path. Use the supplied diagnostic evidence to choose its starting point and repair observed gaps; do not claim untested skills are mastered.",
                  }),
                },
                updateStatus
              );
        if (!mounted.current || controller.signal.aborted) return;
        setDraftTrack(track);
      }
    } catch (e) {
      if (mounted.current && (!controller.signal.aborted || timedOut))
        setError(
          timedOut
            ? "This is taking longer than expected. Your goal is saved; try again."
            : e instanceof Error
            ? e.message
            : "This could not be prepared. Try again."
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setTask("idle");
      if (requestRef.current === controller) requestRef.current = null;
    }
  };
  // Deferred so a development double-mount schedules (and runs) it only once.
  const autoScoped = useRef(false);
  useEffect(() => {
    if (!isOpen || !autoScope || showMaterial || autoScoped.current || !interest.trim()) return;
    const timer = setTimeout(() => {
      autoScoped.current = true;
      void run();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);
  const processFile = async (file: File) => {
    if (task !== "idle" || readingFile.current) return;
    const sequence = ++readSequence.current;
    readingFile.current = true;
    setIsReadingFile(true);
    setStatus("Reading the PDF’s chapters and text…");
    setError("");
    setNotice("");
    try {
      const controller = new AbortController();
      pdfReadController.current = controller;
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const book = isPdf ? await readPdfBook(file, file.name, { signal: controller.signal, onProgress: (page, total) => {
        if (mounted.current && readSequence.current === sequence && (page % 5 === 0 || page === total)) setStatus(`Reading contents preview · ${page} of ${total} pages…`);
      } }) : null;
      const content = book
        ? `${book.previewOnly ? `Preview of the first ${book.pages.length} of ${book.pageCount} pages.\n\n` : ""}${book.pages
            .map((text, i) => (text.trim() ? `PDF page ${i + 1}\n${text}` : ""))
            .filter(Boolean)
            .join("\n\n")}`.slice(0, 64000)
        : await extractTextFromFile(file);
      if (!mounted.current || readSequence.current !== sequence) return;
      setPdfBook(book);
      setPdfSections(book ? mainPdfSections(book.sections).map(s => s.id) : []);
      setUsePdfContents(!!book?.sections.length);
      setReferenceName(file.name);
      setReferenceContent(content);
      setInterest((prev) =>
        prev.trim() ? prev : `Teach me the key concepts in ${readableFileTitle(file.name)}`
      );
      setProposal(book?.sections.length ? { scope: "curriculum", reason: "Choose chapters from your PDF, then review the curriculum before starting." } : null);
      if (book?.sections.length) setScope("curriculum");
      setProbeQuestions([]);
      setNotice(book?.sections.length ? "" : `Added ${file.name}. Review your goal before continuing.`);
    } catch (e) {
      if (mounted.current && readSequence.current === sequence)
        setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      if (readSequence.current === sequence) {
        readingFile.current = false;
        if (mounted.current) setIsReadingFile(false);
      }
    }
  };
  const approve = async (track: CourseTrack) => {
    let storedPdf = false;
    setSavingPdf(true);
    try {
      if (track.curriculum?.sourceDocument && pdfBook) {
        await saveReadingDocument(track.id, pdfBook);
        storedPdf = true;
        track = {
          ...track,
          curriculum: {
            ...track.curriculum,
            sourceDocument: {
              ...track.curriculum.sourceDocument,
              pageCount: pdfBook.pageCount,
              fingerprint: pdfBook.fingerprint,
            },
          },
        };
      }
      onTrackCreated(track);
    } catch (error) {
      if (storedPdf)
        await discardUnapprovedReadingDocument(track.id).catch(() => {});
      throw error;
    } finally {
      if (mounted.current) setSavingPdf(false);
    }
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    onClose();
  };
  const answeredProbeCount = probeQuestions.filter(q => probeResponses[q.id]?.dontKnow || probeResponses[q.id]?.selectedOptionId).length;
  const waitingForProbeAnswers = diagnosticFirst && answeredProbeCount < probeQuestions.length;
  return (
    <dialog
      ref={dialogRef}
      className={`review-dialog new-topic-dialog ${
        draftTrack?.curriculum ? "curriculum-review-dialog" : ""
      }`}
      aria-labelledby="new-topic-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="review-surface">
        <header className="review-header">
          <div>
            <Compass size={18} />
            <h2 id="new-topic-title" ref={headingRef} tabIndex={-1}>
              {draftTrack
                ? "Review your learning plan"
                : proposal ? "Shape your learning plan"
                : "What would you like to learn?"}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={close}
            disabled={savingPdf}
            aria-label="Close new topic"
          >
            <X size={18} />
          </button>
        </header>
        {draftTrack ? (
          draftTrack.curriculum ? (
            <CurriculumApproval
              track={draftTrack}
              onApprove={approve}
              onRevise={() => setDraftTrack(null)}
            />
          ) : (
            <PlanApproval
              startingPointChecked={probeQuestions.length > 0 && probeQuestions.every(q => probeResponses[q.id]?.dontKnow || probeResponses[q.id]?.selectedOptionId)}
              track={draftTrack}
              onApprove={approve}
              onRevise={() => setDraftTrack(null)}
            />
          )
        ) : (<>
          <form
            id="new-topic-form"
            ref={formRef}
            className="new-topic-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <div className="new-topic-intro">
              <p>
                {proposal
                  ? proposal.reason
                  : "A broad goal becomes a curriculum. A precise question becomes a focused lesson. You can adjust the scope before starting."}
              </p>
            </div>
            <label htmlFor="topic-input">Your learning goal</label>
            {/* Two lines so a whole question stays readable; Enter still submits. */}
            <textarea
              ref={inputRef}
              id="topic-input"
              className="new-topic-goal"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              value={interest}
              onChange={(e) => {
                setInterest(e.target.value);
                setProposal(null);
                setProbeQuestions([]);
                setError("");
              }}
              disabled={busy}
              maxLength={400}
              required={!referenceContent.trim() && exaSources.length === 0}
              autoComplete="off"
              placeholder="e.g. Understand compound interest"
            />
            {exaReady ? (
              <div
                className={`exa-grounding-bar ${
                  autoGroundWithExa || exaSources.length > 0 ? "is-active" : ""
                }`}
              >
                <label className="exa-grounding-toggle">
                  <input
                    type="checkbox"
                    checked={autoGroundWithExa || exaSources.length > 0}
                    disabled={busy || exaSources.length > 0}
                    onChange={(e) => setAutoGroundWithExa(e.target.checked)}
                  />
                  <Globe size={13} aria-hidden="true" />
                  <span>
                    {exaSources.length > 0
                      ? `${exaSources.length} web ${exaSources.length === 1 ? "source" : "sources"} attached`
                      : "Use web sources"}
                  </span>
                </label>
                {interest.trim() && (
                  <button
                    type="button"
                    className="exa-mini-action"
                    disabled={busy}
                    onClick={() =>
                      void handleFetchExaSources(
                        `${interest} ${destination}`.trim()
                      )
                    }
                  >
                    {exaSources.length > 0
                      ? "Fetch more sources"
                      : "Preview sources"}
                  </button>
                )}
              </div>
            ) : (
              onOpenPlugins && (
                <div className="exa-grounding-promo">
                  <span>
                    <Blocks size={13} aria-hidden="true" /> Want to learn from web sources?
                  </span>
                  <button
                    type="button"
                    className="exa-mini-action"
                    disabled={busy}
                    onClick={onOpenPlugins}
                  >
                    Set up web search
                  </button>
                </div>
              )
            )}
            {matchedPrior.length > 0 && (
              <details className="prior-ledger-pill">
                <summary>
                  <Compass size={13} aria-hidden="true" />
                  <span>
                    Prior knowledge recognized:{" "}
                    <strong>
                      {matchedPrior.length}{" "}
                      {matchedPrior.length === 1 ? "concept" : "concepts"}
                    </strong>{" "}
                    from earlier sessions
                  </span>
                </summary>
                <ul>
                  {matchedPrior.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong>
                      <span> · {entry.trackTitle}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {proposal && (
              <section className="curriculum-brief" aria-label="Learning scope">
                <div className="curriculum-scope-options" role="group" aria-label="Plan length">
                  {(["curriculum", "focused"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={value === "curriculum" ? "Full curriculum" : "Focused lesson"}
                      aria-pressed={scope === value}
                      disabled={busy}
                      onClick={() => { setScope(value); if (value === "focused") { setUsePdfContents(false); if (practice === "project") setPractice("code"); } }}
                    >
                      <strong>{value === "curriculum"
                        ? "Full curriculum"
                        : "Focused lesson"}</strong>
                      <span>{value === "curriculum" ? "Build a subject step by step." : "Work through one question or skill."}</span>
                    </button>
                  ))}
                </div>
                <span className="goal-group-label" id="goal-practice-label">How you’ll practise</span>
                <div className="curriculum-scope-options goal-practice-options" role="group" aria-labelledby="goal-practice-label">
                  {PRACTICE_CHOICES.map((choice) => {
                    const unavailable = choice.id === "project" && scope !== "curriculum";
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        aria-pressed={practice === choice.id}
                        disabled={busy || unavailable}
                        title={unavailable ? "Projects span a full curriculum. Choose Full curriculum first." : undefined}
                        onClick={() => {
                          setPractice(choice.id);
                          if (choice.id === "project" && !supportsProjectMode(chosenLanguage)) {
                            const fallback = codeLanguages.find(([value]) => value && supportsProjectMode(value))?.[0] || "go";
                            choosePracticeLanguage(fallback);
                          }
                        }}
                      >
                        <strong>{choice.title}</strong>
                        <span>{unavailable ? "Needs a full curriculum." : choice.detail}</span>
                      </button>
                    );
                  })}
                </div>
                {practice !== "auto" && (
                  <>
                    <label htmlFor="goal-code-language">Language</label>
                    <select
                      id="goal-code-language"
                      value={chosenLanguage}
                      onChange={(e) => choosePracticeLanguage(e.target.value)}
                      disabled={busy}
                      aria-describedby="goal-code-language-help"
                    >
                      {codeLanguages
                        .filter(([value]) => value && (practice !== "project" || supportsProjectMode(value)))
                        .map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                    <small id="goal-code-language-help" className="goal-field-help">
                      {practice === "project"
                        ? projectRunHelp
                        : `Each lesson can include a short ${profileFor(codeLanguage)?.name ?? codeLanguage} exercise with tests.`}
                    </small>
                    {practice === "project" && projectAvailable && (
                      <details className="goal-outcome-details goal-project-options">
                        <summary>
                          Project options{" "}
                          <span>
                            {[
                              projectStructure !== "auto"
                                ? PROJECT_STRUCTURE_CHOICES.find((c) => c.id === projectStructure)?.label
                                : null,
                              allowExternalPackages && supportsDependencyFetch(codeLanguage)
                                ? "External packages"
                                : null,
                              localServices.length
                                ? `${localServices.length} local ${localServices.length === 1 ? "service" : "services"}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Optional"}
                          </span>
                        </summary>
                        <div className="goal-project-options-body">
                          <span className="goal-group-label" id="goal-project-structure-label">
                            Project layout
                          </span>
                          <div
                            className="project-structure-options"
                            role="group"
                            aria-labelledby="goal-project-structure-label"
                          >
                            {PROJECT_STRUCTURE_CHOICES.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                aria-pressed={projectStructure === opt.id}
                                disabled={busy}
                                onClick={() => setProjectStructure(opt.id)}
                              >
                                <strong>{opt.label}</strong>
                                <span>{opt.detail}</span>
                              </button>
                            ))}
                          </div>
                          {supportsDependencyFetch(codeLanguage) && (
                            <label className="diagnostic-first-choice goal-project-toggle">
                              <input
                                type="checkbox"
                                checked={allowExternalPackages}
                                disabled={busy}
                                onChange={(e) => setAllowExternalPackages(e.target.checked)}
                              />
                              <span>
                                <strong>Allow external {profileFor(codeLanguage)?.name ?? codeLanguage} packages</strong>
                                <small>
                                  Permit third-party modules in <code>go.mod</code>. Tests stay offline; use{" "}
                                  <strong>Fetch modules</strong> in the workspace to download dependencies on demand.
                                </small>
                              </span>
                            </label>
                          )}
                          <div className="goal-local-services">
                            <span className="goal-group-label">
                              Local services on <code>localhost</code> (optional)
                            </span>
                            <small className="goal-field-help">
                              The Mac sandbox allows <code>localhost</code> connections. Declare any Docker or local broker/database you plan to run alongside tests.
                            </small>
                            <div className="local-service-chips" role="group" aria-label="Common local services">
                              {LOCAL_SERVICE_PRESETS.map((preset) => {
                                const active = localServices.some((s) => s.endpoint === preset.endpoint);
                                return (
                                  <button
                                    key={preset.endpoint}
                                    type="button"
                                    className="local-service-chip"
                                    aria-pressed={active}
                                    disabled={busy}
                                    onClick={() => {
                                      setServiceInputError("");
                                      setLocalServices((prev) =>
                                        active
                                          ? prev.filter((s) => s.endpoint !== preset.endpoint)
                                          : prev.length < 8
                                          ? [...prev, preset]
                                          : prev
                                      );
                                    }}
                                  >
                                    {active ? "✓ " : "+ "}
                                    {preset.name} <code>{preset.endpoint}</code>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="local-service-custom-row">
                              <input
                                type="text"
                                aria-label="Custom local service name"
                                placeholder="Service name (e.g. Schema Registry)"
                                maxLength={80}
                                disabled={busy || localServices.length >= 8}
                                value={customServiceName}
                                onChange={(e) => {
                                  setCustomServiceName(e.target.value);
                                  setServiceInputError("");
                                }}
                              />
                              <input
                                type="text"
                                aria-label="Custom local service localhost endpoint"
                                placeholder="localhost:8081"
                                maxLength={40}
                                disabled={busy || localServices.length >= 8}
                                value={customServiceEndpoint}
                                onChange={(e) => {
                                  setCustomServiceEndpoint(e.target.value);
                                  setServiceInputError("");
                                }}
                              />
                              <button
                                type="button"
                                className="exa-mini-action"
                                disabled={busy || localServices.length >= 8 || !customServiceName.trim() || !customServiceEndpoint.trim()}
                                onClick={() => {
                                  const name = customServiceName.trim();
                                  const endpoint = customServiceEndpoint.trim();
                                  if (!isLocalhostEndpoint(endpoint)) {
                                    setServiceInputError("Use localhost:<port> or 127.0.0.1:<port> (e.g. localhost:9092).");
                                    return;
                                  }
                                  if (localServices.some((s) => s.endpoint === endpoint)) {
                                    setServiceInputError(`${endpoint} is already added.`);
                                    return;
                                  }
                                  setLocalServices((prev) => [...prev, { name, endpoint }]);
                                  setCustomServiceName("");
                                  setCustomServiceEndpoint("");
                                  setServiceInputError("");
                                }}
                              >
                                Add
                              </button>
                            </div>
                            {serviceInputError && (
                              <small className="local-service-error" role="alert">
                                {serviceInputError}
                              </small>
                            )}
                            {localServices.length > 0 && (
                              <ul className="local-service-list">
                                {localServices.map((svc) => (
                                  <li key={svc.endpoint}>
                                    <span>
                                      <strong>{svc.name}</strong> · <code>{svc.endpoint}</code>
                                    </span>
                                    <button
                                      type="button"
                                      className="new-topic-remove-file"
                                      disabled={busy}
                                      onClick={() =>
                                        setLocalServices((prev) => prev.filter((s) => s.endpoint !== svc.endpoint))
                                      }
                                    >
                                      Remove
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </details>
                    )}
                  </>
                )}
                <details className="goal-outcome-details">
                  <summary>Add a specific outcome <span>Optional</span></summary>
                <label htmlFor="goal-destination">
                  What do you want to be able to do?
                </label>
                <input
                  id="goal-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  maxLength={800}
                  disabled={busy}
                  placeholder="For example, explain an idea clearly in a meeting"
                />
                </details>
                <label htmlFor="goal-starting-point">
                  Your experience with this subject
                </label>
                <select
                  id="goal-starting-point"
                  value={startingPoint}
                  onChange={(e) => setStartingPoint(e.target.value)}
                  disabled={busy}
                >
                  {startingPoints.map((point, index) => (
                    <option key={point} value={point}>{STARTING_POINT_LABELS[index]}</option>
                  ))}
                </select>
                <label className="diagnostic-first-choice">
                  <input type="checkbox" checked={diagnosticFirst} disabled={busy}
                    aria-label="Check my starting point before teaching" aria-describedby="starting-point-check-help"
                    onChange={e => setDiagnosticChoice(e.target.checked)} />
                  <span>
                    <strong>Check my starting point before teaching</strong>
                    <small id="starting-point-check-help">A few questions help choose what to explain first. Optional.</small>
                  </span>
                </label>
                {probeQuestions.length > 0 && (
                  <div
                    className="boundary-probe-panel"
                    role="region"
                    aria-label="Starting-point check"
                  >
                    <div className="boundary-probe-header">
                      <div>
                        <strong>Find your starting point</strong>
                        <small>
                          Your answers help choose what to explain first. This is a starting point, not mastery evidence.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="check-coach-button"
                        disabled={busy}
                        onClick={() => { setProbeQuestions([]); setDiagnosticChoice(false); setError(""); }}
                      >
                        Skip check
                      </button>
                    </div>
                    {probeQuestions.map((q, idx) => {
                      const reply = probeResponses[q.id] || {
                        selectedOptionId: null,
                        dontKnow: false,
                        confidence: null,
                        thinking: "",
                      };
                      return (
                        <fieldset key={q.id} className="boundary-probe-card">
                          <legend>
                            <span className="boundary-probe-tier">
                              {idx + 1}. {q.conceptTested}
                            </span>
                            {q.question}
                          </legend>
                          <div className="boundary-probe-options">
                            {q.options.map((opt) => (
                              <label
                                key={opt.id}
                                className={
                                  reply.selectedOptionId === opt.id &&
                                  !reply.dontKnow
                                    ? "is-selected"
                                    : ""
                                }
                              >
                                <input
                                  type="radio"
                                  name={`boundary-probe-${q.id}`}
                                  checked={
                                    reply.selectedOptionId === opt.id &&
                                    !reply.dontKnow
                                  }
                                  disabled={busy}
                                  onChange={() =>
                                    updateProbeResponse(q.id, {
                                      selectedOptionId: opt.id,
                                      dontKnow: false,
                                    })
                                  }
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                            <label
                              className={reply.dontKnow ? "is-selected" : ""}
                            >
                              <input
                                type="radio"
                                name={`boundary-probe-${q.id}`}
                                checked={reply.dontKnow}
                                disabled={busy}
                                onChange={() =>
                                  updateProbeResponse(q.id, {
                                    selectedOptionId: null,
                                    dontKnow: true,
                                  })
                                }
                              />
                              <span>I’m not sure yet</span>
                            </label>
                          </div>
                          {!reply.dontKnow && reply.selectedOptionId && (
                            <div className="boundary-probe-meta">
                              <div
                                className="boundary-probe-confidence"
                                role="group"
                                aria-label={`Confidence for question ${idx + 1}`}
                              >
                                {(
                                  [
                                    ["unsure", "Guessing"],
                                    ["somewhat", "Fairly sure"],
                                    ["confident", "Certain"],
                                  ] as [ConfidenceLevel, string][]
                                ).map(([val, text]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    aria-pressed={reply.confidence === val}
                                    disabled={busy}
                                    onClick={() =>
                                      updateProbeResponse(q.id, {
                                        confidence:
                                          reply.confidence === val ? null : val,
                                      })
                                    }
                                  >
                                    {text}
                                  </button>
                                ))}
                              </div>
                              <div className="boundary-probe-thinking">
                                <input
                                  type="text"
                                  aria-label={`Optional reasoning for ${q.conceptTested}`}
                                  placeholder="Think out loud (optional, 1 line)…"
                                  maxLength={240}
                                  disabled={busy}
                                  value={reply.thinking}
                                  onChange={(e) =>
                                    updateProbeResponse(q.id, {
                                      thinking: e.target.value,
                                    })
                                  }
                                />
                                <VoiceDictationButton
                                  compact
                                  disabled={busy}
                                  label="Dictate reasoning"
                                  onTranscript={(chunk) =>
                                    updateProbeResponse(q.id, {
                                      thinking: reply.thinking
                                        ? `${reply.thinking.trimEnd()} ${chunk}`.slice(
                                            0,
                                            240
                                          )
                                        : chunk.slice(0, 240),
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </fieldset>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            <details
              ref={referenceDetailsRef}
              open={showMaterial || undefined}
              className={`new-topic-reference ${
                referenceContent.trim() || exaSources.length > 0
                  ? "has-file"
                  : ""
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy && e.dataTransfer.files[0])
                  void processFile(e.dataTransfer.files[0]);
              }}
            >
              <summary>
                <FileText size={14} />{" "}
                {exaReady
                  ? "Add a file, notes, or web links"
                  : "Add a file or notes"}{" "}
                {(exaSources.length > 0 || referenceContent.trim()) && (
                  <em>
                    {[
                      referenceContent.trim() ? referenceName || "Notes" : "",
                      exaSources.length > 0
                        ? `${exaSources.length} web ${exaSources.length === 1 ? "source" : "sources"}`
                        : "",
                    ].filter(Boolean).join(" · ")}
                  </em>
                )}
              </summary>
              <div className="new-topic-reference-body">
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  aria-label="Upload reference file or code"
                  accept=".md,.txt,.pdf,.go,.rs,.py,.ts,.tsx,.js,.jsx,.json,.csv,.html,.sql,.sh,.yaml,.yml,.toml,.c,.cpp,.h,.java"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processFile(file);
                    e.target.value = "";
                  }}
                />
                <div className="new-topic-file-row">
                  <button
                    type="button"
                    className="check-coach-button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={13} /> {referenceName ? "Replace file" : "Choose a file"}
                  </button>
                  {!referenceName && <small>PDF, notes, or code · or drop a file here</small>}
                </div>
                {pdfBook && <PdfChapterPicker book={pdfBook} selected={pdfSections} enabled={usePdfContents} busy={busy}
                  onChange={setPdfBook} onSelected={setPdfSections} onEnabled={enabled => { setUsePdfContents(enabled); if (enabled) setScope("curriculum"); }} />}
                                {!pdfBook && <textarea
                  rows={3}
                  aria-label="Reference notes"
                  value={referenceContent}
                  disabled={busy}
                  onChange={(e) => {
                    setReferenceContent(e.target.value);
                    setPdfBook(null); setUsePdfContents(false); setPdfSections([]);
                    if (!referenceName) setReferenceName("Pasted notes");
                  }}
                  placeholder="Or paste notes to learn from…"
                />}
                {pdfBook && <details className="pdf-manual-contents"><summary>Preview extracted text</summary><textarea rows={3} readOnly aria-label="Extracted PDF text preview" value={referenceContent} /></details>}
                {referenceContent && (
                  <button
                    type="button"
                    className="new-topic-remove-file"
                    disabled={busy}
                    onClick={() => {
                      setReferenceName("");
                      setReferenceContent("");
                      setPdfBook(null); setUsePdfContents(false); setPdfSections([]);
                    }}
                  >
                    <X size={13} aria-hidden="true" /> Remove {pdfBook ? "PDF" : "notes"}
                  </button>
                )}
                {exaReady && (
                  <div className="exa-importer-box">
                    <div className="exa-importer-row">
                      <input
                        type="text"
                        aria-label="Paste a link or search the web"
                        value={exaQuery}
                        disabled={busy}
                        placeholder="Paste a link, or search a topic…"
                        onChange={(e) => setExaQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (exaQuery.trim() || interest.trim()) {
                              void handleFetchExaSources();
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="exa-importer-submit"
                        disabled={busy || (!exaQuery.trim() && !interest.trim())}
                        onClick={() => void handleFetchExaSources()}
                      >
                        {isFetchingExa ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Search size={13} />
                        )}
                        {parseDirectUrls(exaQuery).length > 0
                          ? "Add link"
                          : "Search"}
                      </button>
                    </div>
                    <small className="exa-importer-hint">
                      Add up to five links, or search for articles and
                      documentation about your goal.
                    </small>
                  </div>
                )}

                {exaSources.length > 0 && (
                  <div className="exa-source-list-wrap">
                    <div className="exa-source-list-header">
                      <span>
                        Web sources ({exaSources.length})
                      </span>
                      <button
                        type="button"
                        className="exa-mini-action"
                        disabled={busy}
                        onClick={() => setExaSources([])}
                      >
                        Clear all
                      </button>
                    </div>
                    <ul
                      className="exa-source-list"
                      aria-label="Attached web sources"
                    >
                      {exaSources.map((src) => (
                        <li key={src.id} className="exa-source-card">
                          <div className="exa-source-card-main">
                            <div className="exa-source-card-title">
                                                            <strong>{src.title}</strong>
                              <span className="exa-source-domain">
                                {src.domain}
                              </span>
                              {src.publishedDate && (
                                <span className="exa-source-date">
                                  {src.publishedDate}
                                </span>
                              )}
                            </div>
                            {src.snippet && <p>{src.snippet}</p>}
                          </div>
                          <div className="exa-source-card-actions">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="icon-button"
                              aria-label={`Open ${src.title}`}
                              title={src.url}
                            >
                              <ExternalLink size={13} />
                            </a>
                            <button
                              type="button"
                              className="icon-button"
                              disabled={busy}
                              aria-label={`Remove ${src.title}`}
                              onClick={() =>
                                setExaSources((prev) =>
                                  prev.filter((item) => item.id !== src.id)
                                )
                              }
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </div>
            </details>
            {busy && (
              <div
                ref={statusRef}
                className="topic-generation-status"
                role="status"
              >
                <Loader2 size={15} className="animate-spin" />
                <div>
                  <strong>
                    {isReadingFile
                      ? "Reading your material"
                      : isFetchingExa
                      ? "Finding web sources"
                      : task === "scoping"
                      ? "Finding the right scope"
                      : task === "probing"
                      ? "Preparing boundary questions"
                      : scope === "curriculum"
                      ? "Preparing the curriculum outline"
                      : "Preparing a focused lesson"}
                  </strong>
                  <p>
                    {isReadingFile
                      ? status || "Extracting the text before planning. Your material stays attached to this goal."
                      : isFetchingExa
                      ? "Collecting excerpts and citations for your plan."
                      : status}
                  </p>
                  <small>You can cancel. Your goal stays saved.</small>
                </div>
              </div>
            )}
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                className="topic-error"
                role="alert"
              >
                {error}
              </div>
            )}
            {notice && (
              <p className="curriculum-notice" role="status">
                {notice}
              </p>
            )}
          </form>
            <footer className="new-topic-footer">
              {proposal && <small role="status">{waitingForProbeAnswers
                ? `${answeredProbeCount} of ${probeQuestions.length} answered. “I’m not sure” is fine.`
                : "You’ll review the plan before starting."}</small>}
              <button
                className="dialog-secondary-button"
                type="button"
                onClick={busy ? cancel : close}
                aria-label={busy ? "Cancel preparation" : undefined}
              >
                Cancel
              </button>
              <button
                className="dialog-primary-button"
                type="submit"
                form="new-topic-form"
                disabled={
                  busy ||
                  waitingForProbeAnswers ||
                  (!interest.trim() &&
                    !referenceContent.trim() &&
                    exaSources.length === 0)
                }
              >
                {error
                  ? "Try again"
                  : proposal && diagnosticFirst && !probeQuestions.length
                  ? "Check my starting point"
                  : proposal
                  ? scope === "curriculum"
                    ? "Prepare curriculum"
                    : "Prepare focused lesson"
                  : "Continue"}
                {busy ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}
              </button>
            </footer>
          </>)}
      </div>
    </dialog>
  );
};
