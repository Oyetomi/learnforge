import React from "react";
import type { LearningReference } from "../../types";
import { recordVisualSupport } from "../../services/learning/preferences";

export const ReferenceShelf: React.FC<{ references?: LearningReference[]; pendingCheckId?: string }> = ({ references, pendingCheckId }) => {
  if (!references?.length) return null;
  return <details className="reference-shelf" onToggle={(event) => {
    if (event.currentTarget.open && pendingCheckId)
      recordVisualSupport(pendingCheckId, "help:source-notes");
  }}>
    <summary>Your source{references.length > 1 ? "s" : ""} · {references.map((r) => r.name).join(", ")}</summary>
    <p>Saved with this topic. Relevant excerpts are sent to your selected AI provider during teaching. Opening notes during a question counts as supported practice.</p>
    {references.map((source) => <section key={source.id} aria-label={source.name}>
      <h4>{source.name} <small>{source.id}</small></h4>
      {source.truncated && <p>Excerpt saved: the first 16,000 characters. The rest of the original file isn’t available in this topic.</p>}
      <ol>{source.content.split("\n").map((line, index) => <li key={index} value={index + 1}><span>{line || " "}</span></li>)}</ol>
    </section>)}
  </details>;
};
