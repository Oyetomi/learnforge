#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// Only snapshot data is protected by this mutex. Audio-engine operations stay
// on the main queue and never hold a lock needed by the realtime input tap.
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static BOOL g_recording_active = NO, g_has_tap = NO, g_is_final = NO;
static float g_audio_level = 0;
static uint64_t g_session_id = 0;
static NSString *g_transcript = @"", *g_error = @"", *g_phase = @"idle";
static AVAudioEngine *g_audio_engine = nil;
static SFSpeechAudioBufferRecognitionRequest *g_recognition_request = nil;
static SFSpeechRecognitionTask *g_recognition_task = nil;
static SFSpeechRecognizer *g_speech_recognizer = nil;
static AVSpeechSynthesizer *g_synthesizer = nil;

static char *lf_dup_json_dict(NSDictionary *dict) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:dict options:0 error:NULL];
  NSString *json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"{}";
  return strdup(json.UTF8String ?: "{}");
}
static char *lf_snapshot(void) {
  pthread_mutex_lock(&g_mutex);
  NSDictionary *dict = @{@"active": @(g_recording_active), @"transcript": g_transcript,
    @"isFinal": @(g_is_final), @"level": @(g_audio_level), @"error": g_error, @"phase": g_phase};
  pthread_mutex_unlock(&g_mutex);
  return lf_dup_json_dict(dict);
}
static BOOL lf_session_active(uint64_t session) {
  pthread_mutex_lock(&g_mutex);
  BOOL active = session == g_session_id && g_recording_active;
  pthread_mutex_unlock(&g_mutex);
  return active;
}
static void lf_stop_input_on_main(void) {
  @try {
    if (g_audio_engine.isRunning) [g_audio_engine stop];
    if (g_has_tap) { [g_audio_engine.inputNode removeTapOnBus:0]; g_has_tap = NO; }
  } @catch (NSException *_ex) { g_has_tap = NO; }
}
static void lf_release_capture_on_main(void) {
  lf_stop_input_on_main();
  [g_recognition_request endAudio];
  [g_recognition_task cancel];
  g_audio_engine = nil; g_recognition_request = nil;
  g_recognition_task = nil; g_speech_recognizer = nil;
}
static void lf_complete_on_main(uint64_t session, NSString *text, NSString *error) {
  pthread_mutex_lock(&g_mutex);
  if (session != g_session_id || !g_recording_active) { pthread_mutex_unlock(&g_mutex); return; }
  if (text.length) g_transcript = [text copy];
  g_error = error ?: @"";
  g_recording_active = NO; g_is_final = YES; g_phase = @"idle"; g_audio_level = 0;
  pthread_mutex_unlock(&g_mutex);
  lf_release_capture_on_main();
}
static void lf_finish_on_main(uint64_t session) {
  if (!lf_session_active(session)) return;
  pthread_mutex_lock(&g_mutex);
  g_phase = @"finishing"; g_audio_level = 0;
  pthread_mutex_unlock(&g_mutex);
  lf_stop_input_on_main();
  [g_recognition_request endAudio];
  [g_recognition_task finish];
  // Keep the session identity and task alive until its final result arrives.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 6 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if (lf_session_active(session)) {
      pthread_mutex_lock(&g_mutex);
      BOOL empty = g_transcript.length == 0;
      pthread_mutex_unlock(&g_mutex);
      lf_complete_on_main(session, nil, empty ? @"No speech was recognized. Check your microphone input and try again." : nil);
    }
  });
}
static void lf_begin_capture_on_main(uint64_t session, NSString *localeId) {
  if (!lf_session_active(session)) return;
  SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:localeId]];
  if (!recognizer || !recognizer.isAvailable) {
    lf_complete_on_main(session, nil, @"Speech recognition is unavailable for your current language. Check System Settings → Keyboard → Dictation."); return;
  }
  if (!recognizer.supportsOnDeviceRecognition) {
    lf_complete_on_main(session, nil, @"On-device speech recognition is unavailable for this language. Add its Dictation language in System Settings → Keyboard, or use keyboard dictation in the text field."); return;
  }
  recognizer.queue = [NSOperationQueue mainQueue];
  AVAudioEngine *engine = [[AVAudioEngine alloc] init];
  SFSpeechAudioBufferRecognitionRequest *request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  request.shouldReportPartialResults = YES;
  request.requiresOnDeviceRecognition = YES;
  if (@available(macOS 13.0, *)) request.addsPunctuation = YES;
  g_audio_engine = engine; g_recognition_request = request; g_speech_recognizer = recognizer;
  @try {
    AVAudioInputNode *input = engine.inputNode;
    AVAudioFormat *format = [input outputFormatForBus:0];
    if (!format || format.channelCount == 0 || format.sampleRate <= 0) {
      lf_complete_on_main(session, nil, @"No active microphone input was found. Check System Settings → Sound → Input."); return;
    }
    [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
      (void)when;
      [request appendAudioPCMBuffer:buffer];
      float sum = 0;
      if (buffer.floatChannelData && buffer.frameLength) {
        const float *samples = buffer.floatChannelData[0];
        for (AVAudioFrameCount i=0; i<buffer.frameLength; i++) sum += samples[i]*samples[i];
      }
      float level = buffer.frameLength ? fminf(1, sqrtf(sum/buffer.frameLength)*8) : 0;
      if (pthread_mutex_trylock(&g_mutex) == 0) {
        if (session == g_session_id && g_recording_active) g_audio_level = level;
        pthread_mutex_unlock(&g_mutex);
      }
    }];
    g_has_tap = YES;
    g_recognition_task = [recognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
      if (!lf_session_active(session)) return;
      if (result) {
        pthread_mutex_lock(&g_mutex);
        if (session == g_session_id && g_recording_active)
          g_transcript = [result.bestTranscription.formattedString copy] ?: @"";
        pthread_mutex_unlock(&g_mutex);
      }
      if (result.isFinal || error) {
        pthread_mutex_lock(&g_mutex);
        BOOL empty = g_transcript.length == 0;
        pthread_mutex_unlock(&g_mutex);
        lf_complete_on_main(session, nil, empty ? (error.localizedDescription ?: @"No speech was recognized. Check your microphone input and try again.") : nil);
      }
    }];
    [engine prepare];
    NSError *error = nil;
    if (![engine startAndReturnError:&error]) {
      lf_complete_on_main(session, nil, error.localizedDescription ?: @"Could not start microphone capture."); return;
    }
    pthread_mutex_lock(&g_mutex);
    if (session == g_session_id && g_recording_active) g_phase = @"listening";
    pthread_mutex_unlock(&g_mutex);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
      if (lf_session_active(session)) lf_finish_on_main(session);
    });
  } @catch (NSException *exception) {
    lf_complete_on_main(session, nil, exception.reason ?: @"Microphone initialization failed.");
  }
}
char *lf_voice_start(const char *lang) {
  @autoreleasepool {
    NSString *localeId = lang && strlen(lang) ? [NSString stringWithUTF8String:lang] : @"en-US";
    pthread_mutex_lock(&g_mutex);
    uint64_t session = ++g_session_id;
    g_transcript = @""; g_error = @""; g_phase = @"starting";
    g_is_final = NO; g_audio_level = 0; g_recording_active = YES;
    pthread_mutex_unlock(&g_mutex);
    dispatch_async(dispatch_get_main_queue(), ^{
      lf_release_capture_on_main();
      if (!lf_session_active(session)) return;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 45 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        pthread_mutex_lock(&g_mutex);
        BOOL waiting = session == g_session_id && g_recording_active && [g_phase isEqualToString:@"starting"];
        pthread_mutex_unlock(&g_mutex);
        if (waiting) lf_complete_on_main(session, nil, @"Microphone setup timed out. Check microphone and Speech Recognition permissions in System Settings → Privacy & Security, then try again.");
      });
      [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (!lf_session_active(session)) return;
          if (!granted) { lf_complete_on_main(session, nil, @"Microphone access is disabled. Enable LearnForge in System Settings → Privacy & Security → Microphone."); return; }
          [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
            dispatch_async(dispatch_get_main_queue(), ^{
              if (!lf_session_active(session)) return;
              if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
                lf_complete_on_main(session, nil, @"Speech Recognition access is disabled. Enable LearnForge in System Settings → Privacy & Security → Speech Recognition."); return;
              }
              lf_begin_capture_on_main(session, localeId);
            });
          }];
        });
      }];
    });
    return lf_snapshot();
  }
}
char *lf_voice_poll_json(void) { @autoreleasepool { return lf_snapshot(); } }
char *lf_voice_stop_json(void) {
  @autoreleasepool {
    pthread_mutex_lock(&g_mutex);
    uint64_t session = g_session_id;
    BOOL active = g_recording_active, starting = [g_phase isEqualToString:@"starting"];
    if (active) g_phase = @"finishing";
    pthread_mutex_unlock(&g_mutex);
    if (active) dispatch_async(dispatch_get_main_queue(), ^{
      if (starting) lf_complete_on_main(session, nil, nil);
      else lf_finish_on_main(session);
    });
    return lf_snapshot();
  }
}

#ifdef LF_SPEECH_TESTING
// No microphone, permissions or speech provider is involved in lifecycle tests.
void lf_voice_test_start(void) {
  pthread_mutex_lock(&g_mutex);
  ++g_session_id; g_recording_active = YES; g_is_final = NO;
  g_phase = @"listening"; g_transcript = @""; g_error = @"";
  pthread_mutex_unlock(&g_mutex);
}
void lf_voice_test_result(const char *text) {
  lf_complete_on_main(g_session_id, [NSString stringWithUTF8String:text], nil);
}
#endif

static BOOL lf_is_novelty_voice_name(NSString *name) {
  if (!name) return YES;
  NSString *lower = [name lowercaseString];
  NSArray<NSString *> *blocked = @[
    @"albert", @"bad news", @"bahh", @"bells", @"boing", @"bubbles",
    @"cellos", @"deranged", @"fred", @"good news", @"hysterical",
    @"jester", @"junior", @"organ", @"pipe organ", @"princess", @"ralph",
    @"superstar", @"trinoids", @"whisper", @"wobble", @"zarvox",
    @"eddy", @"flo", @"grandma", @"grandpa", @"reed", @"rocko",
    @"sandy", @"shelley"
  ];
  for (NSString *b in blocked) {
    if ([lower isEqualToString:b] || [lower hasPrefix:[b stringByAppendingString:@" "]]) {
      return YES;
    }
  }
  return NO;
}

static AVSpeechSynthesisVoice *lf_select_natural_voice(NSString *requestedLang) {
  NSString *lang = requestedLang.length >= 2 ? requestedLang : @"en-US";
  NSString *langPrefix = [[lang substringToIndex:2] lowercaseString];

  AVSpeechSynthesisVoice *bestVoice = nil;
  NSInteger bestScore = -1000;

  for (AVSpeechSynthesisVoice *voice in [AVSpeechSynthesisVoice speechVoices]) {
    NSString *vLang = [voice.language lowercaseString];
    if (![vLang hasPrefix:langPrefix]) continue;

    if (@available(macOS 14.0, *)) {
      if ((voice.voiceTraits & AVSpeechSynthesisVoiceTraitIsNoveltyVoice) != 0) {
        continue;
      }
    }
    if (lf_is_novelty_voice_name(voice.name)) {
      continue;
    }

    NSInteger score = 0;
    if (@available(macOS 13.0, *)) {
      if (voice.quality == AVSpeechSynthesisVoiceQualityPremium) {
        score += 350;
      }
    }
    if (voice.quality == AVSpeechSynthesisVoiceQualityEnhanced) {
      score += 220;
    }

    NSString *lowerName = [voice.name lowercaseString];
    if ([lowerName containsString:@"ava"]) score += 110;
    else if ([lowerName containsString:@"zoe"] || [lowerName containsString:@"zoë"]) score += 105;
    else if ([lowerName containsString:@"allison"]) score += 100;
    else if ([lowerName containsString:@"samantha"]) score += 95;
    else if ([lowerName containsString:@"serena"]) score += 90;
    else if ([lowerName containsString:@"daniel"]) score += 88;
    else if ([lowerName containsString:@"evan"] || [lowerName containsString:@"nathan"]) score += 85;
    else if ([lowerName containsString:@"karen"] || [lowerName containsString:@"moira"]) score += 80;

    if ([vLang isEqualToString:[lang lowercaseString]]) {
      score += 30;
    } else if ([vLang isEqualToString:@"en-us"] || [vLang isEqualToString:@"en-gb"]) {
      score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  }

  if (!bestVoice) {
    bestVoice = [AVSpeechSynthesisVoice voiceWithLanguage:lang];
  }
  return bestVoice;
}

void lf_tts_speak(const char *text_cstr, const char *lang_cstr) {
  if (!text_cstr || strlen(text_cstr) == 0) return;
  NSString *text = [NSString stringWithUTF8String:text_cstr];
  NSString *lang = (lang_cstr && strlen(lang_cstr) > 0)
    ? [NSString stringWithUTF8String:lang_cstr]
    : @"en-US";
  if (!text || text.length == 0) return;

  dispatch_async(dispatch_get_main_queue(), ^{
    if (!g_synthesizer) {
      g_synthesizer = [[AVSpeechSynthesizer alloc] init];
    }
    if (g_synthesizer.isSpeaking) {
      [g_synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }
    AVSpeechUtterance *utterance = [[AVSpeechUtterance alloc] initWithString:text];
    AVSpeechSynthesisVoice *voice = lf_select_natural_voice(lang);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.49f;
    utterance.pitchMultiplier = 1.0f;
    utterance.volume = 1.0f;
    [g_synthesizer speakUtterance:utterance];
  });
}

void lf_tts_stop(void) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (g_synthesizer && g_synthesizer.isSpeaking) {
      [g_synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }
  });
}

int lf_tts_is_speaking(void) {
  __block BOOL speaking = NO;
  if ([NSThread isMainThread]) {
    speaking = (g_synthesizer != nil && g_synthesizer.isSpeaking);
  } else {
    dispatch_sync(dispatch_get_main_queue(), ^{
      speaking = (g_synthesizer != nil && g_synthesizer.isSpeaking);
    });
  }
  return speaking ? 1 : 0;
}

void lf_free_cstring(char *ptr) {
  if (ptr) {
    free(ptr);
  }
}
