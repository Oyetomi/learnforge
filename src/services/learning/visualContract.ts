export const ILLUSTRATION_INSTRUCTIONS = `ILLUSTRATIONS AND PICTOGRAMS — shared by lessons and side questions:
For requests to draw, sketch, or explain appearance/geometry, emit a fenced svg block with one self-contained <svg viewBox="0 0 420 260"><title>Short title</title><desc>Plain-language text equivalent</desc>...</svg>. Use clear shapes, high-contrast colors, readable labels and whitespace. Supported elements: svg, g, defs, title, desc, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, linearGradient, radialGradient, stop, clipPath. Use presentation attributes, not style/CSS. No scripts, event handlers, foreignObject, animation, images, links, external resources or embedded HTML. Gradients and clips may use local ids. A drawing is an illustration, not an interactive model. Do not use ASCII art where an SVG fits. Add a short text explanation outside the graphic so a failed render does not remove the teaching point.
For a palette, quadrant or labeled diagram whose labels can be explored, emit a fenced pictogram JSON block {"kind":"palette|quadrant|hotspots","title":"Plain title","summary":"Text equivalent","xAxis":"Optional axis","yAxis":"Optional axis","items":[{"id":"one","label":"Visible label","detail":"One useful explanation","color":"#e5aa72"},{"id":"two","label":"Another label","detail":"Explain the relationship"}]}. Use 2–8 unique ids and concise labels; colors must be hex or numeric rgb/hsl values. For hotspots, an optional svg field may use the same inert SVG contract and x/y positions are percentages. Do not call label selection a simulation. Reserve an interactive model for supported controls that change a meaningful outcome. Preserve the actual subject; never encode the correct choice or answer to a pending check in a helpful illustration.`;

export const MATH_INSTRUCTIONS = String.raw`MATHEMATICAL EXPLANATIONS
Use LaTeX math when notation actually clarifies the learner's current subject. Use $...$ inline and $$...$$ for display equations. KaTeX supports mathematical notation, not full LaTeX documents or TikZ: never emit documentclass, usepackage, tikzpicture, executable code or external resources as an illustration.
For worked mathematical transformations, emit a fenced ladder block with title:, initial:, and 1–12 steps separated by ---; each step has rule:, why:, optional eval:, and state:. End with result: if useful. Wrap initial/state/eval/result expressions in $...$. The app reveals one before/after transformation at a time. Each rule names ONE operation; why explains why it is valid in plain language. Preserve equality/units and explicitly state relevant conditions such as a nonzero divisor. Do not skip the operation the learner is struggling with. Use \textcolor{#8fc9bb}{...} or \underbrace{...}_{\text{short label}} sparingly to identify the changed term, with the same meaning across steps. Color alone is never the explanation. Use an analogous example rather than revealing a pending assessment's solution. Mathematical polish is not proof that the reasoning is correct; verify the derivation yourself and state uncertainty if needed.
Protocol (fill with the CURRENT subject and an analogous example, not a fixed demo):
${"```ladder"}
title: <A short description of this transformation>
initial: $<Starting expression>$
---
rule: <One valid operation>
why: <Why the operation works, explained simply>
eval: $<Optional intermediate calculation>$
state: $<Expression after that one operation>$
result: $<Final expression, if useful>$
${"```"}
Do not force mathematical notation or this example onto non-mathematical subjects. For a generated lesson JSON field, escape LaTeX backslashes as valid JSON. Static diagrams remain governed by the separate SVG contract.`;
