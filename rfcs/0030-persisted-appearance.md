- Start Date: 2026-10-06
- RFC Type: feature
- Status: Proposed
- Related: 0005, 0009, 0028, 0029

# Persisted appearance across Lynx and native hosts

[简体中文](0030-persisted-appearance.zh-CN.md)

## Summary

Provide system, light and dark appearance with one persisted native preference and one effective theme shared by every page, native surface and keyboard.

## Motivation

CSS-only dark mode leaves native navigation, inputs and startup backgrounds inconsistent.
An asynchronous preference fetch also renders the wrong first frame.

## Guide-level explanation

Settings defaults to following the system and offers explicit light and dark choices.
A successful choice survives relaunch without changing records or locale.
System appearance changes affect pages only while the preference is system.
Keep the approved native bottom-bar geometry and motion, adapting its material and contrast as needed.

## Reference-level explanation

The native host owns preference `system | light | dark` and resolution `light | dark`.
Before mounting a Lynx bundle, it injects `appearancePreference` and `appearance` beside locale and host data.
`app.getAppearance` returns `{ preference, resolved }`.
`app.setAppearance` accepts `{ preference }`, validates before mutation, persists, updates chrome and resolves `{ success: true, preference, resolved }`.
`app.appearanceChanged` broadcasts the same state to all mounted containers after a preference or effective system change.
Pages validate incoming state, use centralized palette roles for CSS and SVG, and keep a pending/error state while changing preference.
Forced preference and resolved appearance must agree.
The Lynx transport passes a request slot and callback for every RPC, including void requests; native exported method signatures must match both arguments.
Native integration exposed missing inline CSS variable colors, so the build materializes literal theme selectors from the shared palette and SVG content uses explicit fill colors.

iOS restores isolated QA or production defaults before mounting the window and updates container, navigation, tab and native input appearance on the main thread.
Returning to system must read underlying device appearance rather than a trait already overridden by the window.
Android restores preference before rendering, coordinates application night mode, native chrome and configuration changes, and preserves routes and open drafts.
QA preference and record stores remain isolated from the normal app.

## Drawbacks

Native and Lynx surfaces need coordinated updates and lifecycle handling.
The iOS OS-owned launch screen follows system appearance and cannot directly read a persisted app-specific override; its transition remains a separately tested boundary.

## Rationale and alternatives

Native ownership matches existing locale and capability boundaries and avoids duplicating preference persistence inside pages.
A CSS media query alone cannot style native keyboards or restore app-specific preference before rendering.

## Unresolved questions

Native screenshot and interaction checks must establish keyboard, Back, modal and relaunch behavior on both platforms.
Large type and assistive technology require separate coverage beyond palette contrast checks.

## Implementation plan

Complete light/dark static designs first, then extend typed bridge contracts, page tokens, Settings and both hosts.
Run workspace typecheck, build and Rstest plus native unit/build and isolated supported UI checks.
Publish static proposals and actual runtime evidence as distinct Library artifacts without committing or pushing.
