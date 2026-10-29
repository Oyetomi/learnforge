import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X, Settings2 } from "lucide-react";
import type { SupportedLanguage } from "../../types";
import { LanguageLogo, languageName } from "../common/LanguageLogo";

interface TrackPickerProps {
  tracks: { id: string; title: string; language: SupportedLanguage | null }[];
  currentTrackId: string;
  onSelectTrack: (id: string) => void;
  onManageTopics: () => void;
}

export const TrackPicker: React.FC<TrackPickerProps> = ({
  tracks,
  currentTrackId,
  onSelectTrack,
  onManageTopics,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [position, setPosition] = useState({
    left: 12,
    top: 68,
    width: 440,
    maxHeight: 460,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-options`;
  const filtered = useMemo(
    () =>
      tracks.filter((track) =>
        `${track.title} ${
          track.language ? languageName(track.language) : "Learning"
        }`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      ),
    [tracks, query]
  );
  const activeIndex = Math.min(highlight, filtered.length - 1);
  const title =
    tracks.find((track) => track.id === currentTrackId)?.title ||
    "Choose a topic";
  const currentLanguage = tracks.find(
    (track) => track.id === currentTrackId
  )?.language;

  const positionPopup = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(460, window.innerWidth - 24);
    const top = rect.bottom + 10;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top,
      width,
      maxHeight: Math.max(160, Math.min(480, window.innerHeight - top - 16)),
    });
  };
  const show = () => {
    positionPopup();
    setQuery("");
    setHighlight(
      Math.max(
        0,
        tracks.findIndex((track) => track.id === currentTrackId)
      )
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const choose = (trackId: string) => {
    onSelectTrack(trackId);
    close();
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popupRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", positionPopup);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", positionPopup);
    };
  }, [open]);
  useEffect(() => {
    if (open && activeIndex >= 0)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, query, id]);

  return (
    <>
      <div className="header-track">
        <span className="track-picker-label" id={`${id}-label`}>
          Learning track
        </span>
        <button
          ref={triggerRef}
          className="track-picker-trigger"
          aria-label={`Learning track: ${title}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-popup` : undefined}
          onClick={() => (open ? close() : show())}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              show();
            }
          }}
        >
          {currentLanguage && (
            <LanguageLogo language={currentLanguage} size={14} />
          )}
          <span>{title}</span>
          <ChevronDown
            size={14}
            className={open ? "picker-chevron is-open" : "picker-chevron"}
          />
        </button>
      </div>
      {open &&
        createPortal(
          <div
            id={`${id}-popup`}
            ref={popupRef}
            className="track-picker-popover"
            style={position}
            role="dialog"
            aria-label="Choose learning track"
            onBlur={(event) => {
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget as Node)
              )
                setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
              if (event.key === "Tab") {
                const focusable = Array.from(
                  popupRef.current?.querySelectorAll<HTMLElement>(
                    'input, button:not([tabindex="-1"])'
                  ) || []
                );
                const first = focusable[0],
                  last = focusable[focusable.length - 1];
                if (
                  (!event.shiftKey && document.activeElement === last) ||
                  (event.shiftKey && document.activeElement === first)
                ) {
                  event.preventDefault();
                  const pageControls = Array.from(
                    document.querySelectorAll<HTMLElement>(
                      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
                    )
                  ).filter(
                    (element) =>
                      element.tabIndex >= 0 &&
                      !popupRef.current?.contains(element) &&
                      !element.closest("[inert]") &&
                      element.getClientRects().length > 0
                  );
                  const index = pageControls.indexOf(triggerRef.current!);
                  const next = pageControls[index + (event.shiftKey ? -1 : 1)];
                  setOpen(false);
                  (next || triggerRef.current)?.focus();
                }
              }
            }}
          >
            <div className="track-picker-search">
              <Search size={16} />
              <input
                ref={searchRef}
                role="combobox"
                aria-label="Search learning tracks"
                aria-controls={listId}
                aria-expanded={true}
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
                }
                placeholder="Search your tracks…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    if (filtered.length)
                      setHighlight(
                        (activeIndex +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          filtered.length) %
                          filtered.length
                      );
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (filtered[activeIndex]) choose(filtered[activeIndex].id);
                  }
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => {
                    setQuery("");
                    setHighlight(0);
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear track search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div
              id={listId}
              className="track-picker-options"
              role="listbox"
              aria-label="Learning tracks"
            >
              {filtered.length ? (
                filtered.map((track, index) => (
                  <React.Fragment key={track.id}>
                    <button
                      id={`${id}-option-${index}`}
                      role="option"
                      aria-selected={track.id === currentTrackId}
                      tabIndex={-1}
                      className={`track-picker-option ${
                        activeIndex === index ? "is-highlighted" : ""
                      }`}
                      onPointerMove={() => setHighlight(index)}
                      onClick={() => choose(track.id)}
                    >
                      <span className="track-option-title">
                        {track.title}
                        <small>
                          {track.language && (
                            <LanguageLogo language={track.language} size={12} />
                          )}
                          {track.language
                            ? languageName(track.language)
                            : "Learning"}
                        </small>
                      </span>
                      <span className="track-option-check">
                        {track.id === currentTrackId && <Check size={16} />}
                      </span>
                    </button>
                  </React.Fragment>
                ))
              ) : (
                <div className="track-picker-empty">
                  <strong>
                    {tracks.length ? "No matching topics" : "No topics yet"}
                  </strong>
                  <p>
                    {tracks.length
                      ? "Try another topic or language."
                      : "Choose New topic to start with your own learning goal."}
                  </p>
                </div>
              )}
            </div>
            <button
              className="track-picker-manage"
              onClick={() => {
                close();
                onManageTopics();
              }}
            >
              <Settings2 size={14} />
              Manage topics
            </button>
            <div className="track-picker-footer">
              <span>
                {filtered.length} {filtered.length === 1 ? "track" : "tracks"}
              </span>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> to move <span>·</span> <kbd>↵</kbd> to select
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
