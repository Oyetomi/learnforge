import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MasteryMeter, masteryStatus } from "../MasteryMeter";

describe("mastery meter", () => {
  it("counts down independent correct answers before review", () => {
    expect(masteryStatus({ independentCorrect: 0, readyToAdvance: false, approved: false })).toBe("2 more correct answers");
    expect(masteryStatus({ independentCorrect: 1, readyToAdvance: false, approved: false })).toBe("1 more correct answer");
    expect(masteryStatus({ independentCorrect: 2, readyToAdvance: true, approved: false })).toBe("Ready for review");
    expect(masteryStatus({ independentCorrect: 2, readyToAdvance: false, approved: false })).toBe("One more correct answer");
    expect(masteryStatus({ independentCorrect: 3, readyToAdvance: true, approved: true })).toBe("Lesson mastered");
  });
  it("fills one mark per independent correct answer and the review mark on approval", () => {
    const html = renderToStaticMarkup(
      <MasteryMeter milestoneId="m1" independentCorrect={1} readyToAdvance={false} approved={false} />
    );
    expect(html.match(/is-on/g)?.length).toBe(1);
    const done = renderToStaticMarkup(
      <MasteryMeter milestoneId="m1" independentCorrect={2} readyToAdvance approved />
    );
    expect(done.match(/is-on/g)?.length).toBe(3);
    expect(done).toContain("is-mastered");
  });
});
