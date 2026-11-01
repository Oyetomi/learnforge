# On-demand lesson narration

1 November 2026.

LearnForge can read the displayed lesson, reply, post-answer tutoring part or help explanation aloud. Listen changes to a preparing/Stop control while audio is generated, then Stop audio during playback. Stopping, changing the displayed explanation or unmounting its reader stops that narration. Starting another reader ends the previous one. Audio never advances an activity, generates another assessment or supplies competency evidence.

## Provider and credentials

Settings → Plugins → ElevenLabs lets each user enter their own key, enable or disable the integration, and choose a voice and speech model. Disabling selects device narration and keeps the saved Keychain credential for later. Existing Automatic preferences remain compatible; a saved key enables ElevenLabs. Device voice explicitly avoids cloud narration. An ElevenLabs failure is shown rather than silently sending the text to another cloud provider.

The ElevenLabs credential is stored as a macOS Keychain generic password under the LearnForge narration service. JavaScript can save a replacement and ask whether a key exists, but cannot retrieve it. Only provider, voice ID and model ID enter localStorage. The native backend reads the key, attaches the authentication header and calls the fixed ElevenLabs API hostname with redirects disabled. Keys are absent from lesson messages, exports, source files, the packaged app and narration preference JSON. The new HTTP calls do not require widening the frontend HTTP permission allowlist.

This follows ElevenLabs' [authentication contract](https://elevenlabs.io/docs/api-reference/authentication) and Apple's [generic-password Keychain API](https://developer.apple.com/documentation/security/ksecclassgenericpassword). Composio CLI discovery found the ElevenLabs toolkit without a connected account; the installed app uses the direct native integration rather than sending this credential through a separate integration service.

## Playback and credits

The native bridge uses [text-to-speech conversion](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) and optional [voice discovery](https://elevenlabs.io/docs/api-reference/voices/search). The default voice is George, with Flash v2.5; Multilingual v2 and another known voice ID can be selected. Voice discovery needs its own permission. A key that cannot list voices can still synthesize with a permitted known voice ID.

Generation starts only on Listen. Long prose is split at sentence/word boundaries into bounded chunks and played in order. The next chunk is requested after the current one ends. A 16 MB/12-clip memory cache reuses recent audio for the same text, voice and model, including identical chunks within one reading. Evicted clips, changed settings and app restarts can require new generation. Nothing is generated in the background merely by rendering a lesson or opening Settings.

Stop cancels the active native HTTP future, audio playback and remaining chunk requests. It does not guarantee that ElevenLabs refunds work already accepted. Requests have a 30-second timeout, bounded response size and sanitized errors; there is no automatic cloud retry. Narration exposes no autoplay or session-completion shortcut.

The formatter omits fenced code and hidden assessment blocks and simplifies common Markdown and math constructs. It is not a complete mathematical speech engine, does not describe every visual detail, and does not evaluate pronunciation. Device/cloud voices and supported spoken languages can differ. Listening to a lesson explanation while a question is pending marks it as supported practice once playback starts; failed preparation adds no audio-support record.

## Verification

- 400 frontend tests pass, including chunk completeness/Unicode, sequential playback, exact replay reuse, voice changes, cancellation during generation, no automatic rendering-time generation, supported credential separation and no fallback cloud request after an ElevenLabs failure.
- Two Rust tests pass; TypeScript and production web/macOS builds pass. Native checks cover constrained voice identifiers and sanitized provider errors.
- One live 30-character sample synthesized successfully with the supplied key using the default voice/model. The returned MP3 was validated as 44.1 kHz audio, about 2.04 seconds. Voice-list access returned HTTP 401; the integration retains the working default voice and explains the separate permission requirement. No automatic retry was made.
- The production reader/settings components were exercised with a mocked native bridge and real, muted sample playback. Preparing/Stop, natural completion, replay with no additional generation, stopping preparation without support credit, no lesson advancement and persistence of nonsecret provider settings were observed. [Reader preview](design/narration/read-aloud.png) and [settings preview](design/narration/settings.png) use authored test content and no live credentials.
- The ad-hoc-signed Mac build is installed at `/Applications/LearnForge.app`, with a backup. The narration key is saved in Keychain with application-scoped access. The current learning session stays open; reopening LearnForge loads the updated controls. The live API check and browser playback checks do not establish an end-to-end native playback observation in the existing running session.
