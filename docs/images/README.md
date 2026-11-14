# README image sources

Updated 14 November 2026.

| File | Source |
| --- | --- |
| `icon.png` | Current `public/app-icon@2x.png`; copied without modification. |
| `start-screen.jpg` | Current production App in a disposable browser workspace. An everyday percentage goal was typed into the new entry form. |
| `hero-session.jpg` | Current production App with an authored jacket-price question. A choice is selected, but not submitted. |
| `question-review.jpg` | Authored post-answer tutoring in the same production App, showing the changing-base comparison table. Sidebar collapsed and the reading area scrolled to the explanation. |
| `pdf-reading.jpg` | Current production App on a disposable origin, reading PDF pages 25–27 of an authored 94-page test book (“Practical Statistics”, generated locally; no real book). Scrolled so the page heading and the pinned **Check what I read** bar are visible. |
| `learning-goal.jpg` | Earlier New topic modal (3 November). Not used in the README; the start screen now passes its goal straight to scoping. |
| `paper-math.jpg` | Production derivation component with authored algebra data. Cropped to the figure boundary; no UI styling overrides. |
| `elevenlabs-plugin.jpg` | Production settings component with an authored native bridge. No live credentials are shown; the saved-key status is fixture data. |

`start-screen.jpg`, `hero-session.jpg`, `question-review.jpg` and `pdf-reading.jpg` were recaptured on 14 November 2026 after the interface update. Screenshots use the normal 1280 × 720 browser viewport, with no CSS or typography overrides. Responsive QA separately used a temporary 390 × 844 viewport and then reset it. No existing user learning records were changed and no live provider calls were made.

The question and tutoring data come from [the reproducible screenshot fixture](../../scripts/screenshots/readme.tsx), which mounts the actual App and blocks external model requests. The visible `authored-demo` model label identifies the demonstration. It refuses to replace existing sessions on an unmarked origin. Run `npm run dev`, then use a **fresh, disposable localhost origin** to open `/scripts/screenshots/readme.html?view=question` or `?view=feedback`. These screenshots show supported interface capabilities, not model output or evidence that someone learned.

The start-screen and goal-form screenshots come from the normal `/` app route before loading that fixture. Editable examples fill a draft; they do not install starter topics or create lessons.

The screenshot API returns JPEG bytes; filenames use `.jpg`. The icon is PNG. Older README screenshots of the previous interface were removed rather than retained as current product examples.
