# health-adapter

English · [简体中文](README.zh-CN.md)

The cross-platform native adapter layer for health data.

## Planned responsibilities

- Unify iOS HealthKit and Android Health Connect behind one abstraction
- Permission requests and status management
- Incremental sync and background change observers
- Map system data models to domain models (steps, weight, heart rate, HRV, sleep, exercise)

## Open questions

- Organization: implement separately on each platform, or share an abstraction via Kotlin
  Multiplatform — decided in the host-integration RFC (0006).
