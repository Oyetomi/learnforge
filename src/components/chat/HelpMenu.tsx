import { useEffect, useRef } from "react";
import { ChevronDown, Eye, Lightbulb, ListTree, type LucideIcon } from "lucide-react";
import type { HelpKind } from "../../services/learning/sessionHelp";
import "./help-menu.css";

const KINDS: [HelpKind, LucideIcon, string, string][] = [
  ["hint", Lightbulb, "Hint", "A nudge without the answer"],
  ["walkthrough", ListTree, "Walkthrough", "Step by step, beside this activity"],
  ["visual", Eye, "Visual", "A picture or model of the idea"],
];

export interface HelpMenuExtra {
  key: string;
  icon: LucideIcon;
  label: string;
  detail: string;
  onSelect: () => void;
}

/**
 * One Help entry point used by lessons and the reading companion, so hints,
 * walkthroughs and visuals have the same names and place everywhere. Choosing
 * an item returns focus to the menu button, which help panels restore on close.
 */
export function HelpMenu({
  busy,
  activeKind,
  onPick,
  extra = [],
  opensDown = false,
  align = "end",
}: {
  opensDown?: boolean;
  /** Which edge of the button the panel lines up with; "start" when the button sits at the left. */
  align?: "start" | "end";
  busy: boolean;
  activeKind?: HelpKind | null;
  onPick: (kind: HelpKind) => void;
  extra?: HelpMenuExtra[];
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector("summary")?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details
      className={`help-menu${opensDown ? " opens-down" : ""}${align === "start" ? " align-start" : ""}`}
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <summary
        className="help-menu-trigger"
        aria-label="Get help with this step"
        aria-disabled={busy || undefined}
        data-help-kind={activeKind || undefined}
        onClick={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <Lightbulb size={13} aria-hidden="true" />
        <span>Help</span>
        <ChevronDown size={12} className="help-menu-chevron" aria-hidden="true" />
      </summary>
      <div className="help-menu-panel" role="group" aria-label="Help options">
        {KINDS.map(([kind, Icon, label, detail]) => (
          <button
            key={kind}
            type="button"
            disabled={busy}
            className="help-menu-item"
            aria-pressed={activeKind === kind}
            onClick={() => {
              close();
              onPick(kind);
            }}
          >
            <Icon size={14} aria-hidden="true" />
            <span className="help-menu-text">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
        {extra.map(({ key, icon: Icon, label, detail, onSelect }) => (
          <button
            key={key}
            type="button"
            className="help-menu-item"
            disabled={busy}
            onClick={() => {
              close();
              onSelect();
            }}
          >
            <Icon size={14} aria-hidden="true" />
            <span className="help-menu-text">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}
