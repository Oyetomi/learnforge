# Motion and visual-help recovery

## Design intent

Motion should acknowledge an action, explain a state change, or maintain context. Apple’s [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) and [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) guidance informed the restrained timing and immediate control feedback. The app uses shared CSS rather than adding an animation dependency.

| Interaction | Treatment |
| --- | --- |
| Buttons, fields, selections | 120 ms color/border feedback; primary and contextual actions compress to 98.5% while pressed |
| Dialogs and popovers | 180–220 ms fade with a small scale/position change; backdrop fades with the dialog |
| Learning steps, answer feedback, settings sections | 220 ms entrance on the existing component/state boundary; no automatic advancement |
| Help panels | Short lateral entrance; width transition for deliberate adjustments, disabled while dragging the divider |
| Paper figures | Current-state panel fades after a real authored transition; figure geometry and controls remain app-owned |
| Waiting for help | Labeled indeterminate progress, including a distinct rebuild message; no fabricated completion percentage |
| Knowledge/practice and editor surfaces | Brief entrance; consistent controls and disclosures |

Respect `prefers-reduced-motion: reduce`: remove app animations and transitions, disable smooth scrolling, and render the indeterminate indicator statically. This follows [W3C C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) and the intent of [Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions). No celebratory or continuously decorative motion was added. Existing embedded third-party documents are outside the host CSS boundary.

## Visual preparation reliability

The exact provider reply behind the reported error was unavailable. An authored reproduction of the same general interface/method concept succeeded even before the fix; this is not evidence that the screenshot’s exact failure was reproduced.

Source inspection identified a request mismatch: the paper view accepted scientific state models and owned graphs/explorers, while its prompt also described incompatible custom-runtime formats. Visual help now requests only supported paper formats through a compact JSON contract. Complete legacy `forge-visual` replies remain readable, including source containing literal nested fences. Missing presentation metadata can receive the host’s paper appearance; domain states, values, actions, relationships and code are never invented to make a figure pass.

Invalid or cut-off visual content gets one rebuild attempt. Provider compatibility/model fallback still follows the shared AI connection service. Refusals and cancelled requests do not trigger a figure rebuild. A 45-second panel deadline prevents indefinite loading.

Regeneration preserves the current figure and its explored state until a replacement succeeds. Failure moves focus to an actionable message, with regeneration and walkthrough choices; the activity and selected answer remain in place. Old text-only caches are not accepted as successful visuals. Strict model validation still rejects incomplete snapshots, missing identities, unreachable transitions and static figures masquerading as interaction.

## Verification

- 462 tests across 65 files passed. Eight new visual-help regressions cover response formats, nested source fences, host appearance policy, invalid models, bounded rebuilding, cancellation/refusal handling, and cache validity.
- TypeScript passed after correcting the new test’s optional visual assertion.
- A live request through the default local AI proxy returned a supported scientific state model on its first attempt using generic authored context, without learner records or uploaded files.
- Browser QA used the production App on an isolated origin with authored material and simulated AI. Verified automatic recovery, existing-figure retention after two invalid regeneration replies, preserved selection and explored state, focused errors, and the walkthrough fallback.
- Browser computed styles confirmed dialog, help-panel, figure-state, settings-section, selected-answer and feedback animation names. Desktop split view and the 390 px interest dialog had no document horizontal overflow. The portal-based topic picker was checked separately because it renders outside the app root. The reduced-motion stylesheet was inspected; the OS preference itself was not changed during QA.
- Screenshot: [retained figure and recovery choices](design/motion-visual-recovery-2026-11-02/retained-figure.jpg).

These changes do not establish comparative learning effectiveness or resolve every possible provider-generation failure. The tutoring API was mocked for motion QA; a full real tutoring session was not part of this check.

## Component material pass and Mac installation

The follow-up component pass adds shared surface, border, shadow and control tokens in `src/components/layout/component-materials.css`. Floating menus use a CSS frosted-glass treatment with solid fallbacks; this is not the native AppKit Liquid Glass renderer. Dialog frames, 46px settings fields, shared buttons, and the composer now use consistent geometry. Paper figures remain opaque. Composer DOM order matches its visual order, and its model/usage controls share the lower rail on wide layouts. At 1440×1000 it measured 124px total height and left the authored answer action visible; at 390px the rails stacked with no horizontal document overflow.

Research and before/after references are in the local-only HTML design report at `.lazyweb/design-improve/shared-components-2026-11-02/report.html` (excluded from Git). The report was opened and all seven reference/QA images loaded successfully. Automatic approval review blocked screenshot upload to Lazyweb and live Gemini browser access because these could transfer local UI images or expose signed-in content. Local screenshots, the supplied image, downloaded public design-library captures, and public documentation were used instead. No screenshot upload or signed-in competitor browsing occurred.

Final verification: 462 tests in 65 files passed; TypeScript and the production Tauri build passed. The built app was ad-hoc signed and installed at `/Applications/LearnForge.app`; deep/strict signature verification and all four installed file hashes passed. Backup: `.lazyweb/install-backups/before-typeset-figures-473ef8ee3e/LearnForge.app`. The running app was left open; reopening loads the update. No GitHub release asset was changed by this work.

- [Updated menu and composer](design/component-materials-2026-11-02/menu-and-composer.jpg)
- [Updated settings](design/component-materials-2026-11-02/settings.jpg)
- [Narrow composer](design/component-materials-2026-11-02/narrow-composer.jpg)
