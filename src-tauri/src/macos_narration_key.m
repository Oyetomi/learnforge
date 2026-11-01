#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <string.h>

static NSMutableDictionary *lf_key_query(void) {
  return [@{(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: @"com.oyetomi.learnforge.narration",
            (__bridge id)kSecAttrAccount: @"elevenlabs"} mutableCopy];
}

int lf_narration_key_status(void) {
  @autoreleasepool {
    NSMutableDictionary *query = lf_key_query();
    query[(__bridge id)kSecReturnAttributes] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    query[(__bridge id)kSecUseAuthenticationUI] = (__bridge id)kSecUseAuthenticationUIFail;
    CFTypeRef item = NULL;
    OSStatus result = SecItemCopyMatching((__bridge CFDictionaryRef)query, &item);
    if (item) CFRelease(item);
    return result == errSecSuccess || result == errSecInteractionNotAllowed ? 1 : result == errSecItemNotFound ? 0 : -1;
  }
}

int lf_narration_key_save(const char *key) {
  @autoreleasepool {
    NSData *data = [[NSString stringWithUTF8String:key] dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return -1;
    NSMutableDictionary *query = lf_key_query();
    OSStatus result = SecItemUpdate((__bridge CFDictionaryRef)query,
      (__bridge CFDictionaryRef)@{(__bridge id)kSecValueData: data});
    if (result == errSecItemNotFound) {
      query[(__bridge id)kSecValueData] = data;
      query[(__bridge id)kSecAttrLabel] = @"LearnForge — ElevenLabs narration";
      result = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
    }
    return (int)result;
  }
}

// The key never crosses the Tauri IPC boundary into JavaScript.
char *lf_narration_key_load(void) {
  @autoreleasepool {
    NSMutableDictionary *query = lf_key_query();
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef result = NULL;
    if (SecItemCopyMatching((__bridge CFDictionaryRef)query, &result) != errSecSuccess) return NULL;
    NSData *data = CFBridgingRelease(result);
    NSString *key = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return key ? strdup(key.UTF8String) : NULL;
  }
}
