#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;

static BOOL g_recording_active = NO;
static BOOL g_has_tap = NO;
static BOOL g_is_final = NO;
static float g_audio_level = 0.0f;
static uint64_t g_session_id = 0;
static NSString *g_transcript = @"";
static NSString *g_error = @"";

static AVAudioEngine *g_audio_engine = nil;
static SFSpeechAudioBufferRecognitionRequest *g_recognition_request = nil;
static SFSpeechRecognitionTask *g_recognition_task = nil;
static SFSpeechRecognizer *g_speech_recognizer = nil;

static AVSpeechSynthesizer *g_synthesizer = nil;

static char *lf_dup_json_dict(NSDictionary *dict) {
  NSError *err = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&err];
  if (!data || err) {
    return strdup("{\"active\":false,\"transcript\":\"\",\"isFinal\":true,\"level\":0,\"error\":\"Serialization error\"}");
  }
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  const char *utf8 = [json UTF8String];
  return strdup(utf8 ? utf8 : "{}");
}

static void lf_teardown_engine_locked(void) {
  if (g_audio_engine) {
    @try {
      if (g_has_tap) {
        [g_audio_engine.inputNode removeTapOnBus:0];
        g_has_tap = NO;
      }
      if (g_audio_engine.isRunning) {
        [g_audio_engine stop];
      }
    } @catch (NSException *_ex) {
      g_has_tap = NO;
    }
  }
  if (g_recognition_request) {
    @try {
      [g_recognition_request endAudio];
    } @catch (NSException *_ex) {}
  }
  if (g_recognition_task) {
    @try {
      [g_recognition_task finish];
    } @catch (NSException *_ex) {}
  }
  g_audio_engine = nil;
  g_recognition_request = nil;
  g_recognition_task = nil;
  g_speech_recognizer = nil;
  g_audio_level = 0.0f;
}

static void lf_begin_capture_on_main(uint64_t session_id, NSString *locale_id) {
  pthread_mutex_lock(&g_mutex);
  if (!g_recording_active || session_id != g_session_id) {
    pthread_mutex_unlock(&g_mutex);
    return;
  }

  NSLocale *locale = locale_id.length > 0
    ? [NSLocale localeWithLocaleIdentifier:locale_id]
    : [NSLocale currentLocale];
  SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:locale];
  if (!recognizer) {
    recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"en-US"]];
  }
  if (!recognizer || !recognizer.isAvailable) {
    g_error = @"macOS Speech Recognition is currently unavailable. Check System Settings → Keyboard → Dictation.";
    g_recording_active = NO;
    pthread_mutex_unlock(&g_mutex);
    return;
  }

  AVAudioEngine *engine = [[AVAudioEngine alloc] init];
  SFSpeechAudioBufferRecognitionRequest *request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  request.shouldReportPartialResults = YES;
  if (@available(macOS 13.0, *)) {
    request.addsPunctuation = YES;
  }

  @try {
    AVAudioInputNode *inputNode = engine.inputNode;
    AVAudioFormat *recordingFormat = [inputNode outputFormatForBus:0];
    if (!recordingFormat || recordingFormat.channelCount == 0 || recordingFormat.sampleRate <= 0) {
      g_error = @"No active microphone input device was found on this Mac.";
      g_recording_active = NO;
      pthread_mutex_unlock(&g_mutex);
      return;
    }

    SFSpeechAudioBufferRecognitionRequest *weakReq = request;
    [inputNode installTapOnBus:0
                    bufferSize:1024
                        format:recordingFormat
                         block:^(AVAudioPCMBuffer * _Nonnull buffer, AVAudioTime * _Nonnull _when) {
      (void)_when;
      [weakReq appendAudioPCMBuffer:buffer];
      float rms = 0.0f;
      if (buffer.floatChannelData != NULL && buffer.frameLength > 0) {
        const float *samples = buffer.floatChannelData[0];
        AVAudioFrameCount count = buffer.frameLength;
        float sum = 0.0f;
        for (AVAudioFrameCount i = 0; i < count; i++) {
          float s = samples[i];
          sum += s * s;
        }
        rms = sqrtf(sum / (float)count);
      }
      float normalized = fminf(1.0f, rms * 8.0f);
      pthread_mutex_lock(&g_mutex);
      if (session_id == g_session_id && g_recording_active) {
        g_audio_level = normalized;
      }
      pthread_mutex_unlock(&g_mutex);
    }];
    g_has_tap = YES;

    [engine prepare];
    NSError *startErr = nil;
    if (![engine startAndReturnError:&startErr] || startErr != nil) {
      if (g_has_tap) {
        [inputNode removeTapOnBus:0];
        g_has_tap = NO;
      }
      g_error = startErr.localizedDescription ?: @"Could not start microphone audio capture.";
      g_recording_active = NO;
      pthread_mutex_unlock(&g_mutex);
      return;
    }

    g_speech_recognizer = recognizer;
    g_audio_engine = engine;
    g_recognition_request = request;

    g_recognition_task = [recognizer recognitionTaskWithRequest:request
                                                  resultHandler:^(SFSpeechRecognitionResult * _Nullable result, NSError * _Nullable error) {
      pthread_mutex_lock(&g_mutex);
      if (session_id != g_session_id) {
        pthread_mutex_unlock(&g_mutex);
        return;
      }
      if (result != nil) {
        NSString *text = result.bestTranscription.formattedString;
        if (text != nil) {
          g_transcript = [text copy];
        }
        if (result.isFinal) {
          g_is_final = YES;
        }
      }
      if (error != nil && g_recording_active) {
        if (g_transcript.length == 0) {
          g_error = error.localizedDescription ?: @"Speech recognition stopped.";
        }
        lf_teardown_engine_locked();
        g_recording_active = NO;
      }
      pthread_mutex_unlock(&g_mutex);
    }];
  } @catch (NSException *exception) {
    lf_teardown_engine_locked();
    g_error = exception.reason ?: @"Audio input initialization failed.";
    g_recording_active = NO;
  }

  pthread_mutex_unlock(&g_mutex);
}

char *lf_voice_start(const char *lang_cstr) {
  @autoreleasepool {
    NSString *localeId = (lang_cstr && strlen(lang_cstr) > 0)
      ? [NSString stringWithUTF8String:lang_cstr]
      : @"en-US";

    pthread_mutex_lock(&g_mutex);
    lf_teardown_engine_locked();
    g_session_id += 1;
    uint64_t currentSession = g_session_id;
    g_transcript = @"";
    g_error = @"";
    g_is_final = NO;
    g_audio_level = 0.0f;
    g_recording_active = YES;
    pthread_mutex_unlock(&g_mutex);

    AVAuthorizationStatus micStatus = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (micStatus == AVAuthorizationStatusDenied || micStatus == AVAuthorizationStatusRestricted) {
      pthread_mutex_lock(&g_mutex);
      g_recording_active = NO;
      g_error = @"Microphone permission is disabled. Enable LearnForge in System Settings → Privacy & Security → Microphone.";
      NSDictionary *resp = @{
        @"active": @NO,
        @"transcript": @"",
        @"isFinal": @YES,
        @"level": @(0.0f),
        @"error": g_error
      };
      pthread_mutex_unlock(&g_mutex);
      return lf_dup_json_dict(resp);
    }

    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
      if (!granted) {
        pthread_mutex_lock(&g_mutex);
        if (currentSession == g_session_id) {
          g_recording_active = NO;
          g_error = @"Microphone access was not granted. Enable it in System Settings → Privacy & Security → Microphone.";
        }
        pthread_mutex_unlock(&g_mutex);
        return;
      }

      [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
        if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
          pthread_mutex_lock(&g_mutex);
          if (currentSession == g_session_id) {
            g_recording_active = NO;
            g_error = @"Speech Recognition permission was not granted. Enable LearnForge in System Settings → Privacy & Security → Speech Recognition.";
          }
          pthread_mutex_unlock(&g_mutex);
          return;
        }

        dispatch_async(dispatch_get_main_queue(), ^{
          lf_begin_capture_on_main(currentSession, localeId);
        });
      }];
    }];

    NSDictionary *initial = @{
      @"active": @YES,
      @"transcript": @"",
      @"isFinal": @NO,
      @"level": @(0.0f),
      @"error": @""
    };
    return lf_dup_json_dict(initial);
  }
}

char *lf_voice_poll_json(void) {
  @autoreleasepool {
    pthread_mutex_lock(&g_mutex);
    NSDictionary *dict = @{
      @"active": @(g_recording_active),
      @"transcript": g_transcript ?: @"",
      @"isFinal": @(g_is_final),
      @"level": @(g_audio_level),
      @"error": g_error ?: @""
    };
    pthread_mutex_unlock(&g_mutex);
    return lf_dup_json_dict(dict);
  }
}

char *lf_voice_stop_json(void) {
  @autoreleasepool {
    pthread_mutex_lock(&g_mutex);
    g_session_id += 1;
    g_recording_active = NO;
    lf_teardown_engine_locked();
    NSDictionary *dict = @{
      @"active": @NO,
      @"transcript": g_transcript ?: @"",
      @"isFinal": @YES,
      @"level": @(0.0f),
      @"error": g_error ?: @""
    };
    pthread_mutex_unlock(&g_mutex);
    return lf_dup_json_dict(dict);
  }
}

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
