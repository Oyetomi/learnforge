#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <string.h>

// Generic-password items for provider credentials (AI connection, Exa).
// One Keychain service; the account names the credential.
static NSMutableDictionary *lf_secret_query(const char *account) {
  NSString *name = [NSString stringWithUTF8String:account];
  if (!name) return nil;
  return [@{(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: @"com.oyetomi.learnforge.secrets",
            (__bridge id)kSecAttrAccount: name} mutableCopy];
}

int lf_secret_save(const char *account, const char *value) {
  @autoreleasepool {
    NSMutableDictionary *query = lf_secret_query(account);
    NSData *data = [[NSString stringWithUTF8String:value] dataUsingEncoding:NSUTF8StringEncoding];
    if (!query || !data) return -1;
    OSStatus result = SecItemUpdate((__bridge CFDictionaryRef)query,
      (__bridge CFDictionaryRef)@{(__bridge id)kSecValueData: data});
    if (result == errSecItemNotFound) {
      query[(__bridge id)kSecValueData] = data;
      query[(__bridge id)kSecAttrLabel] = @"LearnForge — provider credential";
      query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;
      result = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
    }
    return (int)result;
  }
}

int lf_secret_delete(const char *account) {
  @autoreleasepool {
    NSMutableDictionary *query = lf_secret_query(account);
    if (!query) return -1;
    OSStatus result = SecItemDelete((__bridge CFDictionaryRef)query);
    return result == errSecItemNotFound ? 0 : (int)result;
  }
}

// Returns a strdup'd value (caller frees), or NULL. *status is 0 when found,
// 1 when no item exists, and -1 on any other Keychain failure.
char *lf_secret_load(const char *account, int *status) {
  @autoreleasepool {
    *status = -1;
    NSMutableDictionary *query = lf_secret_query(account);
    if (!query) return NULL;
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef result = NULL;
    OSStatus found = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    if (found == errSecItemNotFound) { *status = 1; return NULL; }
    if (found != errSecSuccess) return NULL;
    NSData *data = CFBridgingRelease(result);
    NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (!value) return NULL;
    *status = 0;
    return strdup(value.UTF8String);
  }
}
