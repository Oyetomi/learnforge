import React, { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import type { LearningReference } from "../../types";
import { recordVisualSupport } from "../../services/learning/preferences";
import "./reference-shelf.css";

export const ReferenceShelf: React.FC<{
  references?: LearningReference[];
  pendingCheckId?: string;
}> = ({ references, pendingCheckId }) => {
  const shelf = useRef<HTMLDetailsElement>(null);
  const markVisibleNotes = () => {
    if (
      pendingCheckId &&
      shelf.current?.open &&
      shelf.current.querySelector(".reference-document[open]")
    )
      recordVisualSupport(pendingCheckId, "help:source-notes");
  };
  useEffect(markVisibleNotes, [pendingCheckId]);
  if (!references?.length) return null;
  return (
    <details
      className="reference-shelf"
      ref={shelf}
      onToggle={markVisibleNotes}
    >
      <summary>
        <span>Saved source{references.length > 1 ? "s" : ""}</span>
        <small>
          {references.length} {references.length === 1 ? "file" : "files"}
        </small>
      </summary>
      <p>
        Saved with this topic. Relevant excerpts are sent to your selected AI
        provider during teaching. Opening notes during a question counts as
        supported practice.
      </p>
      {references.map((source) => {
        const lines = source.content.split("\n");
        return (
          <details
            className="reference-document"
            key={source.id}
            onToggle={markVisibleNotes}
          >
            <summary>
              <span className="reference-doc-title">
                {source.pluginId === "exa" && (
                  <em className="reference-plugin-badge">Exa</em>
                )}
                <span>{source.name}</span>
              </span>
              <small>{lines.length} lines</small>
            </summary>
            <p className="reference-identifier">
              Reference: {source.id}
              {source.url && (
                <>
                  {" · "}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="reference-external-link"
                  >
                    Open source <ExternalLink size={10} />
                  </a>
                </>
              )}
            </p>
            {source.truncated && (
              <p>
                Only an excerpt was saved. The rest of the original file isn’t
                available in this topic.
              </p>
            )}
            <ol
              tabIndex={0}
              role="region"
              aria-label={`Source text: ${source.name}`}
            >
              {lines.map((line, index) => (
                <li key={index} value={index + 1}>
                  <span>{line || " "}</span>
                </li>
              ))}
            </ol>
          </details>
        );
      })}
    </details>
  );
};
