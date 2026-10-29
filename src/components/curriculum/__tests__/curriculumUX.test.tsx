import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CurriculumApproval } from "../CurriculumApproval";
import { CurriculumWorkspace } from "../CurriculumWorkspace";
import { PlanApproval } from "../PlanApproval";
import { trackFromOutline } from "../../../services/ai/curriculumOutline";
import type { Milestone } from "../../../types";

const makeTrack = () =>
  trackFromOutline(
    {
      title: "Everyday communication",
      destination: "Handle a familiar exchange",
      practice_mode: "general",
      language: null,
      exclusions: ["Specialist analysis"],
      modules: [
        {
          title: "Recognize the situation",
          outcome: "Identify an exchange’s purpose",
          units: [
            {
              id: "a",
              title: "Notice the opening",
              outcome: "Identify the purpose of a familiar opening",
              assessment: "Identify a new opening’s purpose",
              prerequisite_ids: [],
            },
          ],
        },
        {
          title: "Choose a response",
          outcome: "Respond to the situation",
          units: [
            {
              id: "b",
              title: "Reply to an opening",
              outcome: "Choose an appropriate reply to a familiar opening",
              assessment: "Explain a reply in a new situation",
              prerequisite_ids: ["a"],
            },
          ],
        },
      ],
    },
    {
      topic: "Everyday communication",
      destination: "Handle an exchange",
      startingPoint: "Beginning",
    }
  );

const runtimeUnits = (track: ReturnType<typeof makeTrack>): Milestone[] =>
  track.milestones.map((m, index) => ({
    ...m,
    id: `runtime-${index}`,
    session_id: "session",
    created_at: 0,
    curriculum_unit_id: m.id,
    curriculum_module_id: track.curriculum!.modules[index].id,
    content_status: "outline",
    status: "active",
  }));

describe("curriculum surface contracts", () => {
  it("labels approval as approval rather than promising to start a lesson from an overview action", () => {
    const html = renderToStaticMarkup(
      <CurriculumApproval
        track={makeTrack()}
        onApprove={vi.fn()}
        onRevise={vi.fn()}
      />
    );
    expect(html).toContain("Approve curriculum");
    expect(html).not.toContain("Approve curriculum &amp; start");
    expect(html).toContain("curriculum-disclosure-icon");
  });
  it("does not keep recommending the first placement unit when a later unit is current", () => {
    const track = makeTrack();
    track.placement = {
      attempts: [],
      deferredMilestoneIds: [],
      startMilestoneId: track.milestones[0].id,
      reason: "Start with Notice the opening, the original first step.",
      approvedAt: 0,
    };
    const milestones = runtimeUnits(track);
    const html = renderToStaticMarkup(
      <CurriculumWorkspace
        track={track}
        milestones={milestones}
        messages={[]}
        active={milestones[1]}
        onSelect={vi.fn()}
        onResume={vi.fn()}
        onDiagnostic={vi.fn()}
      />
    );
    expect(html).toContain("Reply to an opening");
    expect(html).not.toContain(track.placement.reason);
    expect(html).toContain(
      "Preview module 2: Choose a response. 0 of 1 outcomes demonstrated. Current module."
    );
  });
  it("does not call missing runtime lesson content available", () => {
    const html = renderToStaticMarkup(
      <CurriculumWorkspace
        track={makeTrack()}
        milestones={[]}
        messages={[]}
        active={null}
        onSelect={vi.fn()}
        onResume={vi.fn()}
        onDiagnostic={vi.fn()}
      />
    );
    expect(html).toContain("lesson not prepared");
    expect(html).not.toContain("lesson available");
  });
  it("does not offer an unavailable placement check for a one-lesson free-response plan", () => {
    const track = {
      ...makeTrack(),
      curriculum: undefined,
      milestones: [makeTrack().milestones[0]],
    };
    const html = renderToStaticMarkup(
      <PlanApproval track={track} onApprove={vi.fn()} onRevise={vi.fn()} />
    );
    expect(html).toContain(
      "One focused lesson, followed by fresh practice and feedback."
    );
    expect(html).not.toContain("Optional starting-point check");
    expect(html).not.toContain("Keep for later");
  });
});
