# Stable-session verification

The images use the production session components with authored questions and a deterministic mock tutor. They verify interaction behavior, not the factual quality of future model output.

- `help-beside-question.png`: the question and selected answer remain beside a walkthrough; the mock's main-progression counter remains zero.
- `narrow-help.png`: help temporarily occupies a 720px workspace. Closing returns to the same selected answer and restores focus to Walkthrough.
- `light-paper-contrast.png`: corrected states, annotations and evaluations on light paper. Measured foreground/background contrast was 10.7:1 for state/evaluation text, 13.6:1 for step headings, and 6.9:1 for the highlighted phrase in this fixture.

Reloading restored the question selection, open help panel, walkthrough step 2 of 2, and cached explanation. Opening, closing and switching paper appearance did not create a main learning request. The regression suite passed 355 tests across 54 files; production web and macOS builds passed.

The signed Mac build was installed with matching file hashes and a retained backup. The running app session was left open; reopening applies the update.
