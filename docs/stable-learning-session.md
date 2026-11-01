# Stable learning session

The main activity follows: understand an idea, answer a question, read the tutoring, then explicitly continue. Opening help does not create or advance an activity.

## Help stays beside the activity

Hint, Walkthrough and Visual open a separate help panel. Desktop layouts retain the current question beside it. Below a 900px workspace width, help occupies the activity area temporarily; Back to activity and Escape return to the mounted activity. Keyboard focus returns to the invoking control. Loading, errors, retries and regenerated explanations stay inside help. Closing cancels an unfinished help request; completed help is reused when reopened.

Help requests use a separate API path and never append messages to the main session timeline. The prompt receives the current activity and visible question, not its hidden answer key. After submission it may receive committed answer feedback. Help cannot issue an assessment, repair the roadmap or replace a question. Displayed help marks an unanswered question as supported practice; requesting help that never arrives does not.

Completed help is stored under the lesson, activity, question or reply part, submitted attempt and help kind. Different activities cannot reuse one another's help. Visuals remain illustrative models, not execution evidence or proof of competence.

## Meaningful reading units

Headings define learning ideas. An idea's paragraphs, example, calculation and explanation stay together rather than creating a new slide for every paragraph. Decorative separators and invisible metadata do not become activities. Mathematical walkthroughs retain their own Back/Next controls inside the help panel.

## Restoration

The session stores its activity, explanation part, question identity, scroll position and open help kind. Existing question and composer drafts remain in their dedicated stores. Cached walkthroughs restore their transformation index, overview setting and help-panel scroll. Restoration checks the current question/reply identity, falling back safely when content has changed. Help loading never invokes the main activity's scroll reset.

Local storage is best effort: quota failures leave the current activity usable, but an uncached explanation may need regeneration after reopening. Old conversation history is preserved; previous help replies are not deleted or rewritten.

## Verification

Automated tests cover activity grouping, scoped caches, safe question context, restoration and stale-content rejection. The isolated QA page at `/.lazyweb/stable-session-preview/index.htm` uses the production session and a deterministic mock tutor. It checks selection preservation during help generation, no progression request, closing/reopening help, reload restoration and narrow/desktop layouts. These checks verify interaction behavior, not the factual quality of future tutor output.

Paper-style derivation states, annotations and evaluations now explicitly inherit the active palette, including light paper, so old ladder colors cannot wash out text.
