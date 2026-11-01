# Typeset teaching figures

LearnForge’s default explanatory figure should read like a clear textbook figure: restrained strokes, serif prose labels, genuine typeset mathematical notation, and a small set of useful actions. Interaction changes the concept’s state; it does not introduce a second application inside the lesson.

Figures default to a muted dark paper palette. **Light paper** toggles a warm light palette and remembers the choice locally across figures and restarts. Existing declarative state models use the paper renderer even without a presentation tag. Saved custom canvases still require redraw. The visual step has no duplicate floating return bar; return navigation remains above the figure, and any post-answer Continue button follows content normally.

Step-by-step derivations use the same palette and appearance preference. Mathematical derivations retain Before/After, reasoning, optional calculations and bounded Back/Next controls; future steps stay hidden until requested. Narrow views stack equations vertically. Nonmathematical ladders retain their authored states, with serif annotations, code typography, fine connectors and restrained highlights. The remaining Continue action follows content rather than floating over it.

## Rendering contract

Use the existing language-neutral `kind: "state-model"` visual with:

```json
"presentation": { "style": "scientific", "layout": "lanes" }
```

`lanes` shows the current state. `comparison` places the initial state beside the current state and stacks them when space is limited. The app owns the arrangement, SVG connectors, typography, captions, controls, history, and text alternative. Model output supplies entities, snapshots, relations, transitions, and explanations; it does not supply HTML, CSS, or drawing scripts.

Each state may contain relations between declared entities:

```json
{ "id": "transfer", "from": "source", "to": "destination", "kind": "value", "label": "$x=4$" }
```

Relation kinds are `value`, `reference`, or `flow`. A relation and its label must describe the current state, rather than imply that a historical transfer is still happening. Entity order remains stable while the learner acts. Author only meaningful states and choices; do not pad a simple explanation with decorative nodes.

Inline math uses `$...$` and code uses backticks. KaTeX handles supported TeX mathematical notation; its HTML/MathML output and actual math fonts provide the mathematical typography. Code keeps the app’s code font. Font assets must remain available in both the host and isolated sandbox. [KaTeX options](https://katex.org/docs/options), [KaTeX font documentation](https://katex.org/docs/font).

Keep an equation together as one mathematical expression. Splitting its operands and equality sign into disconnected graph nodes obscures the relationship. The renderer gives mathematical values more prominence while keeping captions and controls quiet.

### Code inside paper figures

Code-valued snapshots may declare `format: "code"` and their actual `language`, with the indented source in `value`. Code values are bounded to 2,000 characters and 40 lines; ordinary text keeps its 160-character limit. `format: "text"` explicitly retains prose rendering. No particular programming language is assumed.

Code values use the shared read-only code component: Google Sans Code, syntax highlighting where a grammar is available, line numbers, Copy, preserved whitespace and horizontal scrolling within the snippet. The figure inherits its related source language or the lesson language; individual code values and fenced snippets may specify their own language. Unknown languages remain escaped monospace text. Figure prose and mathematical notation retain their paper typography.

Saved figures without this metadata conservatively recognize standalone declarations, method-signature lists and complete fenced code. Short inline identifiers/numbers stay inline, and prose and math do not become code blocks. Code-heavy figures stack their entities in compact panels instead of squeezing source into narrow centered columns. This changes presentation, not the source's meaning: invalid generated syntax still needs correction or regeneration. New generation instructions request valid, indented code rather than flattened declarations.

Custom sandboxes now embed the installed KaTeX WOFF2 fonts in their offline CSS, including standalone exports. They no longer strip font faces or substitute system fonts for mathematical alphabets.

## Learning behavior and accessibility

- Actions reveal a concrete change and its explanation; there is no automatic progression into another lesson or answer.
- Back, Forward, and Reset let the learner inspect previous states. A new branch replaces the abandoned forward history.
- Captions announce state changes. The text alternative lists current entity values, relations, explanations, and optional related source.
- The figure describes an authored model, not a measured execution trace. Programming illustrations must distinguish defined language semantics from possible scheduling, races, and version-specific behavior.

The QA binding example deliberately uses an explicitly declared outer variable and ordinary ordered calls. It makes no claim about goroutine scheduling or old range-variable reuse. In Go, arguments are evaluated before a `go` call launches; closures can share surrounding variables. Go 1.22 changed loop-variable behavior in applicable packages, so an old closure-loop example cannot be generalized to every modern Go program. [Go statements](https://go.dev/ref/spec#Go_statements), [Function literals](https://go.dev/ref/spec#Function_literals), [Go loop-variable change](https://go.dev/blog/loopvar-preview).

## Limits and verification

This renderer does **not** compile a LaTeX document or TikZ diagram. Genuine TikZ rendering requires a separate TeX compilation pipeline; TikZJax, for example, runs a TeX engine through WebAssembly and converts its output to SVG. That is a different feature with additional assets, resource limits, and output handling. [TikZJax](https://tikzjax.com/).

Arbitrary saved canvas pixels cannot acquire this style through a host CSS change. Those visuals need conversion or regeneration into the owned contract. Quantitative plots and spatial simulations should keep their appropriate specialized renderers.

Use **More options → Redraw as a figure** on a saved canvas. This sends its concept and explanation to the configured tutor and saves a new visual without deleting the original. An explicit figure request accepts a scientific state model or an owned quantitative plot; it rejects custom HTML/canvas responses and state models whose actions only change prose or unused tones. Invalid output produces a retry message. Generated explanations still require factual review.

The isolated development page at `/.lazyweb/paper-figure-qa/index.html` mounts the real `VisualExample` component with three authored fixtures: copied/shared values, algebra with LaTeX, and a branching library loan. It offers available width, 720px, and 390px without loading learner data or credentials. Schema validation is separate from visual QA and does not prove the correctness of future model-generated content or improved learning outcomes.

The bundled equivalent at `/.lazyweb/paper-figure-preview/index.htm` avoids the Vite development module graph for browser verification. Proof images in `docs/design/typeset-figures/` show authored QA fixtures using the production renderer, rather than promising a particular future AI response.
