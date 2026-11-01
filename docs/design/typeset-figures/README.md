# Figure verification

The PNGs in this folder were captured from the production `VisualExample` component with authored, isolated QA fixtures. They are not mockups or evidence that every future AI response will be factually correct.

- `binding.png`: source-code values retain Google Sans Code; serif labels and vector relationships compare the initial and current state.
- `algebra.png`: genuine KaTeX expression and fraction, with unchanged initial reference and a transformed current equation.
- `narrow.png`: the branching library example at a 390px outer preview width; no horizontal page overflow.
- `native-generated.png`: a tutor-generated scientific figure in the installed Mac app. Caption, actions, history and explanation are unobstructed; the return button follows the figure rather than overlapping it. This captures layout verification, not a factual endorsement of the generated lesson.

Verified state actions, Back/Forward, replacing a forward history branch, complete numeric math, no KaTeX errors, and the 720px and 390px layouts. Related source uses syntax highlighting and safely escapes unknown-language text. Automated checks cover bounded schemas, invalid relations, routing around intermediate entity text, custom-runtime response rejection, inert state transitions, and offline sandbox fonts.

Validation: 349 tests across 53 files passed after the dark-paper update. Production web and Tauri macOS app builds passed. The existing Vite large-chunk warning remains.

`dark-paper.png` verifies the default dark palette with real KaTeX math. The Light paper toggle was checked in both directions without resetting the current walkthrough. The persisted appearance preference defaults safely to dark when storage is unavailable.

`paper-steps.png` shows the production mathematical and nonmathematical derivation components using authored examples. Verified Back/Next progression, final-result timing, shared light/dark switching without step reset, no math errors, and responsive equation stacking. The installed Mac build includes the same derivation changes.

The final Mac bundle was installed with strict signature verification and matching file hashes, retaining the previous installed bundle as a backup. Existing saved visuals were preserved.
