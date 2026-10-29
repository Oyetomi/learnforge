import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  evaluateMathExpression,
  validateParameterSim,
} from "../parameterSim";
import { validateVisualExample } from "../visuals";
import { VisualExample as VisualCard } from "../../../components/learning/VisualExample";

describe("Declarative ParameterExplorer and safe math evaluator", () => {
  it("evaluates arithmetic, exponents, functions, and returns null on division by zero or unknown identifiers", () => {
    expect(evaluateMathExpression("2 + 3 * 4", {})).toBe(14);
    expect(evaluateMathExpression("2 ^ 3 ^ 2", {})).toBe(512);
    expect(evaluateMathExpression("-alpha * (grad + 2)", { alpha: 0.5, grad: 6 })).toBe(-4);
    expect(
      evaluateMathExpression("clamp(round(sqrt(16) * 3), 0, 10)", {})
    ).toBe(10);
    expect(evaluateMathExpression("1 / (x - 2)", { x: 2 })).toBeNull();
    expect(evaluateMathExpression("window.alert(1)", {})).toBeNull();
    expect(evaluateMathExpression("undeclared + 1", { alpha: 1 })).toBeNull();
  });

  it("validates kind='explorer' visuals, drops arbitrary HTML, and renders accessible controls + SVG curve", () => {
    const raw = {
      kind: "explorer",
      html: "<script>evil()</script>",
      title: "Learning rate vs. quadratic loss",
      summary: "Sweep step size alpha to compare smooth descent against overshoot.",
      explorer: {
        prompt: "Increase step size above 1.0 to see the update overshoot the minimum.",
        parameters: [
          {
            id: "alpha",
            label: "Learning rate",
            min: 0.1,
            max: 1.5,
            step: 0.1,
            initial: 0.4,
          },
        ],
        outputs: [
          {
            id: "next_x",
            label: "Position after 1 step",
            expression: "1 - 2 * alpha",
            precision: 2,
          },
          {
            id: "next_loss",
            label: "Loss after 1 step",
            expression: "(1 - 2 * alpha) ^ 2",
            precision: 3,
          },
        ],
        curve: {
          xLabel: "w",
          yLabel: "Loss(w)",
          xMin: -1.5,
          xMax: 1.5,
          expression: "x ^ 2",
          markerXExpression: "1 - 2 * alpha",
        },
      },
      items: [
        {
          id: "small",
          label: "0 < α < 0.5",
          description: "Monotonic decrease toward the minimum at w = 0.",
        },
        {
          id: "overshoot",
          label: "α > 1.0",
          description: "Each step jumps farther away on the opposite wall.",
        },
      ],
      takeaway: "Optimal step size scales inversely with curvature.",
    };

    const validated = validateVisualExample(raw);
    expect(validated).not.toBeNull();
    expect(validated).not.toHaveProperty("html");

    const html = renderToStaticMarkup(
      <VisualCard visual={validated!} visualId="sim-1" />
    );
    expect(html).toContain("Interactive instrument");
    expect(html).toContain('type="range"');
    expect(html).toContain("Position after 1 step");
    expect(html).toContain("0.2"); // 1 - 2 * 0.4 = 0.2
    expect(html).toContain("0.04"); // (0.2)^2 = 0.04
    expect(html).toContain("parameter-plot-curve");
    expect(html).toContain("parameter-plot-marker");
    expect(html).toContain("Read as text");
  });

  it("rejects broken explorer specs referencing undeclared variables or invalid bounds", () => {
    expect(
      validateParameterSim({
        parameters: [
          { id: "x", label: "Reserved x", min: 0, max: 1, step: 0.1, initial: 0.5 },
        ],
        outputs: [{ id: "o1", label: "Out", expression: "x * 2" }],
      })
    ).toBeNull();

    expect(
      validateParameterSim({
        parameters: [
          { id: "k", label: "Gain", min: 5, max: 1, step: 0.5, initial: 2 },
        ],
        outputs: [{ id: "o1", label: "Out", expression: "k * 2" }],
      })
    ).toBeNull();

    expect(
      validateParameterSim({
        parameters: [
          { id: "k", label: "Gain", min: 0, max: 5, step: 0.5, initial: 2 },
        ],
        outputs: [{ id: "o1", label: "Out", expression: "k * missing_var" }],
      })
    ).toBeNull();
  });
});
