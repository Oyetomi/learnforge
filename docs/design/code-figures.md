# Figure code and sidebar readability

1 November 2026. Addresses source code appearing as centered serif text in the visual help panel and a sidebar lesson mixing a completion checkmark with a current-activity label.

The scientific figure now separates code from its serif annotations. Code snapshots use the existing read-only code renderer and inherit the actual lesson language, including through the help panel. Source indentation, tabs and newlines remain intact. Narrow code figures stack vertically; individual long code lines scroll horizontally. Both paper themes supply their own token colors. Conservative fallback recognition also improves saved declarations that were never marked as code. The [rendering contract](../typeset-figures.md#code-inside-paper-figures) describes bounds and compatibility.

Sidebar lesson numbers and status occupy a compact metadata row above the full-width title. Current selection uses a quiet surface and border; the gradient, heavy left stripe and glow have been removed. A selected completed lesson is labeled **Reviewing** and uses the ordinal marker, separating navigation from completion. The compact sidebar omits decorative connectors; the full roadmap retains its actual dependency graph. Existing prerequisite gates remain authoritative.

Source tests cover legacy declarations, exact whitespace preservation, explicit language overrides, unknown-language escaping, prose/math separation, code bounds, and current/completed sidebar semantics. Test discovery is restricted to `src`, keeping installer staging shortcuts from collecting tests in unrelated installed applications.

The isolated development fixture at `.lazyweb/code-figure-qa/` mounts the production help panel, figure renderer and milestone sidebar with authored examples. It has formatted, legacy-unmarked and Python code cases and panel-width controls. It does not establish correctness of future generated code or learning outcomes.

Verification for v0.2.3: 377 tests in 56 files pass; TypeScript, production web and the macOS app build pass. Browser checks confirmed Google Sans Code at 13px, syntax-token colors in both paper themes, exact tabs/newlines, no horizontal help-panel overflow at 420px, legacy-code recognition, Python highlighting, Copy feedback, and distinct Current/Reviewing sidebar states. [Dark preview](code-figures/dark.png) and [light preview](code-figures/light.png) use authored test data.
