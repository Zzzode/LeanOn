// LynxBase 3.9.0's CocoaPods archive omits this required GN-generated header.
// This host builds only iOS; use SDK platform detection for its FML branches.
#ifndef LEANON_LYNX_BUILD_CONFIG_H_
#define LEANON_LYNX_BUILD_CONFIG_H_

#include <TargetConditionals.h>

#if !defined(__APPLE__) || !TARGET_OS_IPHONE
#error "LeanOn's LynxBase compatibility configuration supports iOS only."
#endif

#ifndef OS_IOS
#define OS_IOS 1
#endif
#ifndef OS_POSIX
#define OS_POSIX 1
#endif
// FML uses the historical Chromium OS_MACOSX name for Apple's dispatch APIs,
// including iOS (semaphore.cc), rather than for desktop-only behavior.
#ifndef OS_MACOSX
#define OS_MACOSX 1
#endif

#endif  // LEANON_LYNX_BUILD_CONFIG_H_
