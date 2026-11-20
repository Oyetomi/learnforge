/**
 * Language profiles, shared with the native runner (src-tauri/src/languages.rs).
 * Commands live only on the native side; the frontend uses names, file rules
 * and the guides given to the tutor.
 */
import builtIn from "./profiles.json";

export interface LanguageProfile {
  id: string;
  name: string;
  monaco: string;
  binaries: Record<string, string[]>;
  scaffold: { path: string; content: string }[];
  sourcePattern: string;
  testPattern: string;
  testFile: string;
  testNamePrefix: boolean;
  entry: string;
  run: string[][];
  test: string[][];
  /** Compile-only check of a step's tests (empty: nothing to compile). */
  check?: string[][];
  lsp: string[][];
  lspInstall: string;
  sourceGuide: string;
  testGuide: string;
  custom?: boolean;
}

/** Native status of a profile on this Mac. */
export interface LanguageStatus extends LanguageProfile {
  runnable: boolean;
  missing: string[];
  lspProgram?: string | null;
}

let extra: LanguageProfile[] = [];
export const BUILT_IN_PROFILES = builtIn as unknown as LanguageProfile[];

export const allProfiles = (): LanguageProfile[] => [...BUILT_IN_PROFILES, ...extra];

export function profileFor(id: string | null | undefined): LanguageProfile | undefined {
  return id ? allProfiles().find((p) => p.id === id) : undefined;
}

const matches = (pattern: string, value: string) => {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
};

/** Same rule as the native side: relative, ≤4 segments, no dot segments. */
export function safeRelativePath(path: string): boolean {
  const parts = path.split("/");
  return (
    !!path &&
    path.length <= 160 &&
    parts.length <= 4 &&
    parts.every((p) => !!p && !p.startsWith(".") && /^[A-Za-z0-9_.-]+$/.test(p))
  );
}

export const isTestPath = (profile: LanguageProfile, path: string) =>
  safeRelativePath(path) && matches(profile.testPattern, path);
export const isSourcePath = (profile: LanguageProfile, path: string) =>
  safeRelativePath(path) && matches(profile.sourcePattern, path) && !matches(profile.testPattern, path);

export function stageTestFile(profile: LanguageProfile, number: number, title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24)
      .replace(/_+$/, "") || "step";
  return profile.testFile.replace("{nn}", String(number).padStart(2, "0")).replace("{slug}", slug);
}

/** Starter files the learner edits (config files such as go.mod are written natively). */
export const starterSources = (profile: LanguageProfile) =>
  profile.scaffold.filter((f) => isSourcePath(profile, f.path));

const fill = (text: string, nn: string) => text.replace(/\{nn\}/g, nn);
export const testGuideFor = (profile: LanguageProfile, number: number) =>
  fill(profile.testGuide, String(number).padStart(2, "0"));

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let statusRequest: Promise<LanguageStatus[] | null> | null = null;
/**
 * Installed-toolchain status from the Mac app, or null in the browser build
 * (where only the online runners exist). Custom profiles from languages.json
 * become available to the rest of the app after this resolves.
 */
export function loadLanguageStatus(refresh = false): Promise<LanguageStatus[] | null> {
  if (!isTauri()) return Promise.resolve(null);
  if (!statusRequest || refresh)
    statusRequest = import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<LanguageStatus[]>("language_profiles"))
      .then((list) => {
        extra = list.filter((p) => p.custom);
        return list;
      })
      .catch(() => null);
  return statusRequest;
}

/**
 * Complete a typed file name the way the language expects: add the entry
 * file's extension and folder when they are missing (replication -> src/replication.rs).
 */
export function suggestPath(profile: LanguageProfile, name: string): string {
  let path = name.trim();
  const slash = profile.entry.lastIndexOf("/");
  const dot = profile.entry.lastIndexOf(".");
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (!base.includes(".") && dot > slash) path += profile.entry.slice(dot);
  if (slash > 0 && !path.includes("/")) path = `${profile.entry.slice(0, slash)}/${path}`;
  return path;
}

/** Project mode needs a profile with step tests. */
export const supportsProjectMode = (id: string | null | undefined) => !!profileFor(id)?.test.length;
