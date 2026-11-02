// Run on macOS with:
// clang -fobjc-arc -DLF_SPEECH_TESTING -Wno-deprecated-declarations \
//   -framework Foundation -framework AVFoundation -framework Speech \
//   src-tauri/tests/dictation_lifecycle.m -o /tmp/learnforge-dictation-test
#import "../src/macos_speech.m"
#include <assert.h>
static NSDictionary *snapshot(char *json) {
  NSData *data = [[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding];
  free(json);
  return [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
}
int main(void) {
  @autoreleasepool {
    lf_voice_test_start();
    NSDictionary *stopping = snapshot(lf_voice_stop_json());
    assert([stopping[@"active"] boolValue]);
    assert(![stopping[@"isFinal"] boolValue]);
    assert([stopping[@"phase"] isEqualToString:@"finishing"]);
    lf_finish_on_main(g_session_id);
    lf_voice_test_result("Final words after Finish");
    NSDictionary *finished = snapshot(lf_voice_poll_json());
    assert(![finished[@"active"] boolValue]);
    assert([finished[@"isFinal"] boolValue]);
    assert([finished[@"transcript"] isEqualToString:@"Final words after Finish"]);
    // Repeated finish preserves the final result; no new session erases it.
    assert([snapshot(lf_voice_stop_json())[@"transcript"] isEqualToString:@"Final words after Finish"]);
    uint64_t old_session = g_session_id;
    lf_voice_test_start();
    lf_complete_on_main(old_session, @"Stale words from an earlier answer", nil);
    assert([snapshot(lf_voice_poll_json())[@"active"] boolValue]);
    assert([snapshot(lf_voice_poll_json())[@"transcript"] length] == 0);
    lf_voice_test_result("A fresh answer");
    assert([snapshot(lf_voice_poll_json())[@"transcript"] isEqualToString:@"A fresh answer"]);
    puts("Native dictation lifecycle passed (no microphone used)");
  }
}
