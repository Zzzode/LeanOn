- Start Date: 2026-10-05
- RFC Type: architecture
- Status: Proposed
- Related: 0005, 0027, 0028

# Native form and content reliability

English · [简体中文](0029-native-form-and-content-reliability.zh-CN.md)

## Summary

Register official Lynx XElement input and SVG components in both hosts and coordinate shared-page modal lifetime with the native shell.

## Motivation

Native screenshots reproduce missing input text and charts, horizontal rows falling into columns, and the floating tab bar intercepting form actions.
The user authorized a local redesign and fixes while preserving the approved tab bar's appearance and motion.

## Guide-level explanation

Content uses warm paper, graphite and restrained blue; Today exposes recording on its first viewport.
Forms temporarily hide native tab interaction, avoid the keyboard, and restore the same tab on close.
Unimplemented account and partner actions are explicitly unavailable; Diary shows the persisted daily aggregate without fabricated meal entries.

## Reference-level explanation

Pin XElement to the existing Lynx 3.9 engine and include input and SVG dependencies without upgrading the engine.
Add typed app.setModalActive to the existing bridge and release it on sheet close or page teardown.
Create and install the iOS global configuration before registrations, and use Lynx's lexical NativeModules and event globals in the transport.
Persist app.setLocale in each host and broadcast app.localeChanged to mounted pages; localize native chrome through UIKit item titles and Android's per-app locale support without changing the approved tab appearance or motion.
Hosts own keyboard insets; shared pages own scrollable forms and explicit flex rows.
Use viewport updates that trigger layout when the iOS keyboard changes the available height.
Debug simulator record-path/initial-route hooks and an opt-in Android .uiqa application suffix isolate regression data.
Use capability checks for unavailable native actions and preserve the record schema.
Complete iOS local intake aggregation and exercise create/update/delete through the existing bridge contracts, matching Android's JSON structure.
Return success and emit records.changed only after the atomic disk write succeeds; isolate native regression tests with temporary record URLs.
Charts position observations by elapsed date and display ticks from the actual domain, with neutral change colors.

## Drawbacks

Native dependencies increase build size and need host updates alongside the bundle.
Tab visibility changes temporarily during forms; its normal appearance and motion remain intact.
Aggregates cannot reconstruct meal entries or portions; that needs a future data-model RFC.

## Rationale and alternatives

Official elements retain native editing and vector rendering.
Faking inputs or redrawing screens in a browser does not resolve keyboard or accessibility behavior.
New accounts or invented meal records exceed this repair's scope.

## Unresolved questions

Verify XElement 3.9 packaging, native registration, keyboard behavior and enlarged text on both hosts.
Real paired accounts and food-entry editing remain future capabilities.

## Implementation plan

Implement runtime registration and modal coordination, then Today and forms, then remaining content.
Run repository checks, native builds and isolated simulator regression checks with screenshots.
Keep changes local without commits or pushes; this RFC remains Proposed until reviewed and merged.
