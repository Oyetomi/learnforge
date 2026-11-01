# Settings control sizing and dropdown affordance

1 November 2026.

Settings text/password fields and selectors now use a 46px minimum height, 14px text, 11px vertical padding and 14px horizontal padding. Field labels use 12px text. The settings dialog can expand to 680px, with a viewport-safe maximum width. Model rows stack below 600px instead of squeezing two fields side by side.

Native select semantics are retained. The browser-drawn arrow is replaced with a restrained 17px chevron inset 14px from the right, with a 46px text gutter. The chevron is a background image, so it does not intercept clicks. Hover, disabled and keyboard-focus states remain distinct; forced-colors mode restores the platform arrow. The curriculum starting-point selector shares the chevron and control sizing. Chat composition is unchanged, following the user's clarification.

Browser verification with the production settings components and authored, credential-free fixtures confirmed 46px controls, 14px text, the arrow inset/text gutter, working selection and typing, and a visible 2px focus outline when tabbing into a selector. At a 390px viewport the 358px dialog has no horizontal content overflow; narration fields and model rows stack. Temporary viewport overrides were reset. Production web/macOS builds pass. This CSS-only change does not add behavioral tests that duplicate its declarations.

[Settings](form-controls/settings-desktop.png), [AI connection](form-controls/ai-connection.png) and [narrow layout](form-controls/settings-narrow.png) previews contain authored test data.
