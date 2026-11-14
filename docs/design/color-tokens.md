# Colour tokens

Tokens live in `src/styles/foundation.css` on `:root`.

## Text scale

Six steps, darkest to lightest:

| Token | Value | Use |
| --- | --- | --- |
| `--c-text-disabled` | `#7f8ea2` | Disabled controls only (exempt from contrast rules) |
| `--c-text-quiet` | `#9ca7b5` | Metadata, hints, captions |
| `--c-text-secondary` | `#b8c0cc` | Supporting text, labels |
| `--c-text-body` | `#c7d2df` | Body copy |
| `--c-text-strong` | `#dfe7f0` | Emphasis, titles in lists |
| `--c-text-heading` | `#edf0f4` | Headings |

Every step except disabled meets WCAG AA (4.5:1) on all six surface colours, from `--c-bg-deep` to `--c-surface-3`. The older names (`--c-text-muted`, `--c-text-faint`, `--c-text-subtle`, `--c-text-bright` and the `-cool` variants) are aliases of these steps. Prefer the six names in new CSS.

`src/styles/__tests__/textColorScale.test.ts` fails when a `color:` declaration hard-codes a neutral grey that a scale step already covers. Tinted text, such as success green, warm accents and purple, is allowed.

## Light theme

Not planned: LearnForge is dark-only by decision (November 2026). If that changes, the path is below.

The text scale is ready: a light theme redefines six values. The remaining work is surfaces, lines and accents. About 780 hard-coded hex colours and 185 `rgba()` values are still spread across the stylesheets. Most are backgrounds, borders and translucent white washes (`#ffffff06`), which have no meaning on a light background. Convert them to surface and line tokens, then add the light values under `:root[data-theme="light"]` and `prefers-color-scheme: light`. Doing this partially leaves dark patches on light screens, so ship the theme only after the conversion is complete.

## Interface font

The interface keeps JetBrains Mono as a deliberate identity. Reading surfaces (lesson prose, questions, choices, feedback and the learner's writing) use the proportional `--font-reading`. See the comment at the top of `foundation.css`.
