# health-adapter

健康数据的跨端原生适配层。

## 规划职责

- 统一封装 iOS HealthKit 与 Android Health Connect
- 权限申请与状态管理
- 增量同步、后台变更观察者
- 系统数据模型 → 领域模型的映射（步数、体重、心率、HRV、睡眠、运动）

## 待定

- 组织形态：双端各自实现，或用 Kotlin Multiplatform 共享抽象层——在宿主接入 RFC（0004）中决定。
