# Dictation recovery and clarity — 2 November 2026

Dictate captures speech for a text field. Finish adds the recognized text to that field; it does not submit an answer or message.

## Findings and changes

- Native Stop incremented the recognition session ID before the final callback and immediately released the recognizer. Final words could therefore be discarded. Stop now ends audio input, keeps the recognition task/session alive, and polls until completion. This follows Apple's distinction between [ending audio input](https://developer.apple.com/documentation/speech/sfspeechaudiobufferrecognitionrequest/endaudio()) and [finishing processing accepted audio](https://developer.apple.com/documentation/speech/sfspeechrecognitiontask/finish()).
- Audio-engine shutdown previously held a mutex also used by the realtime microphone tap. Engine operations now run on the main queue outside that mutex; the tap uses a nonblocking meter update.
- Permission/setup, listening and finalization have distinct states and bounded waits. An empty recording reports an actionable error rather than silently returning nothing. Partial words are retained if finalization times out.
- Only one native dictation field owns the microphone at a time. A late result from a disposed or superseded frontend session cannot insert into a new answer.
- “Stop & insert” is now “Finish.” Transcript preview, microphone level and instructions appear inline instead of in a floating popover. Errors remain visible until retry. Finishing is disabled while the final result is collected.
- Native recognition explicitly requires on-device processing. If the current language's local recognition is unavailable, the app explains how to check Dictation language support or use keyboard dictation; it does not silently upload microphone audio. Apple documents that [on-device support must be available for this requirement](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition).
- Browser Web Speech Finish also waits for its final/end event, with a bounded fallback. Recorded-audio fallback now reports empty/too-short recordings and avoids inserting into an unmounted field.

## Validation

- **423 tests passed across 60 frontend test files.** New coverage includes late final words, corrected final text, stale polls during finishing, partial-result timeout, empty capture, cancelling setup, bridge failure, navigation away, field ownership and permission errors.
- **2 Rust tests passed.** The macOS native bridge compiled successfully.
- A native Objective-C lifecycle test passed without microphone access. It verifies that Stop remains unfinished until a final result is delivered, preserves final words, resets a new capture, and rejects an old session's completion. Run the command documented in `src-tauri/tests/dictation_lifecycle.m`.
- Browser verification used the production control and controller with an authored fake speech bridge. Final words were appended once to an existing draft; empty and permission-error states were visible and retryable. A 390px window had no horizontal overflow.
- The production Mac build passed, was ad-hoc signed, and was installed at `/Applications/LearnForge.app`. Signature and all four installed file hashes were verified. The preceding app is backed up in `.lazyweb/install-backups/before-typeset-figures-ea850e9bbf/`. The running app was not quit; reopen it to load the fix.

No real microphone, permission prompt, external speech provider, or learner answer was used in verification. Physical microphone capture, language assets and transcription accuracy on the user's Mac still require a live try after reopening. These checks establish lifecycle and UI behaviour, not actual microphone performance.

## Screenshots

All screenshots show authored simulated recognition, not a live microphone test.

- [Text added once to an existing draft](design/dictation-2026-11-02/inserted.jpg)
- [Visible no-speech error](design/dictation-2026-11-02/no-speech.jpg)
- [Narrow-window listening state](design/dictation-2026-11-02/listening-narrow.jpg)
