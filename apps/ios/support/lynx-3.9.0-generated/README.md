# Lynx 3.9.0 generated-source compatibility

The CocoaPods source archive omits error-code files referenced by its native and Darwin sources.
These unmodified files were generated from the [official 3.9.0 source](https://github.com/lynx-family/lynx/tree/3.9.0/tools/error_code) with `python3 tools/error_code/gen_error_code.py --lang cpp oc`.
The upstream Apache 2.0 license is included.
The Podfile restores missing files before CocoaPods enumerates compilation inputs; no network or Python dependency is needed during installation.
Revisit this compatibility directory when upgrading Lynx.

Chinese translation follow-up: this build support note currently has no translated variant.
