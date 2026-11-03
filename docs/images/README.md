# README image sources

Updated 3 November 2026 for LearnForge 0.2.4.

| File | Source |
| --- | --- |
| `icon.png` | Current `public/app-icon@2x.png`; copied without modification. |
| `start-screen.jpg` | Current production App in a disposable browser workspace. An everyday percentage goal was typed into the new entry form. |
| `hero-session.jpg` | Current production App with an authored jacket-price question. A choice is selected, but not submitted. |
| `question-review.jpg` | Authored post-answer tutoring in the same production App, showing the changing-base comparison table. Sidebar collapsed and the reading area scrolled to the explanation. |
| `learning-goal.jpg` | Current New topic modal, with the goal transferred from the start screen. No goal was submitted for generation. |
| `paper-math.jpg` | Production derivation component with authored algebra data. Cropped to the figure boundary; no UI styling overrides. |
| `elevenlabs-plugin.jpg` | Production settings component with an authored native bridge. No live credentials are shown; the saved-key status is fixture data. |

Screenshots use the normal 1280 × 720 browser viewport, with no CSS or typography overrides. Responsive QA separately used a temporary 390 × 844 viewport and then reset it. No existing user learning records were changed and no live provider calls were made.

The question and tutoring data come from [the reproducible screenshot fixture](../../scripts/screenshots/readme.tsx), which mounts the actual App and blocks external model requests. The visible `authored-demo` model label identifies the demonstration. It refuses to replace existing sessions on an unmarked origin. Run `npm run dev`, then use a **fresh, disposable localhost origin** to open `/scripts/screenshots/readme.html?view=question` or `?view=feedback`. These screenshots show supported interface capabilities, not model output or evidence that someone learned.

The start-screen and goal-form screenshots come from the normal `/` app route before loading that fixture. Editable examples fill a draft; they do not install starter topics or create lessons.

The screenshot API returns JPEG bytes; filenames use `.jpg`. The icon is PNG. Older README screenshots of the previous interface were removed rather than retained as current product examples.
