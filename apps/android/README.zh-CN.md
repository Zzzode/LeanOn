# Android 宿主（Kotlin）

[English](README.md) · 简体中文

Android 原生壳与 Lynx 运行时容器。

## 职责

- App 壳：启动、单 Activity 导航、生命周期
- Lynx 容器：`LynxView` 创建/复用、通过注入的资源 provider 加载 bundle、路由与模块安全
- 桥服务端：每个能力域的原生模块（见 `@zzzode/bridge` 与 RFC 0005）
- 原生能力：Health Connect、后台任务（`WorkManager`）、通知、相机、蓝牙
- 系统目标：App Widget / Quick Settings Tile、独立 Wear OS 应用

## 目录结构

```
app/src/main/java/com/zzzode/leanon/
├── LeanOnApplication.kt        # 进程初始化、宿主单例
├── MainActivity.kt             # 单 Activity 壳
├── container/                  # LynxContainer 与 BundleResourceProvider
├── bridge/                     # CapabilityRegistry、GlobalEventDispatcher、鉴权、引导
└── modules/                    # Health、Scale、Storage、Resource、App、Notification 模块
```

## 构建

需要 Android SDK（compile/target SDK 35，min SDK 26）与 JDK 17。

```bash
./gradlew :app:assembleDebug
```

Lynx 工件（`org.lynxsdk.lynx:*`）版本在 `gradle/libs.versions.toml` 中固定。

## 外观与隔离界面检查

外观默认跟随系统，与健康记录分开持久化。
`app.getAppearance`、`app.setAppearance` 和 `app.appearanceChanged` 向 Lynx 同步偏好与实际模式。
宿主在 bundle 渲染前注入两项值，处理 `uiMode` 变化时保留当前页面与弹层草稿。
Android 12 及以上持久化平台应用夜间模式，使启动背景匹配；更早版本使用 AppCompat。
已认可底栏的形状和动效保留，仅使用夜间资源调整材质与标签颜色。
键盘外观由已安装输入法及其系统设置控制。

用 `./gradlew :app:assembleDebug -PleanonUiQa=true` 构建一次性隔离环境。
只有该 debug `.uiqa` 应用接受启动参数 `leanon_qa_route`（`today`、`diary`、`progress`、`partner`、`me`、`settings`）、`leanon_qa_appearance`（`system`、`light`、`dark`）及 `leanon_qa_now`（带时区偏移的 ISO8601，或 `system`）。
正常应用忽略这些参数。
参数只改变 QA 导航、外观和内存中的演示时钟，不修改健康记录。
普通应用按真实本地时钟衍生日期、小时和打卡连续天数，seed 元数据不是当前时间依据。
QA 时钟不跨进程重启持久化。
例如，通过现有 Android Activity 命令启动真实深色设置页：

```bash
adb shell am start -W --activity-single-top \
  -n com.zzzode.leanon.uiqa/com.zzzode.leanon.MainActivity \
  --es leanon_qa_route settings --es leanon_qa_appearance dark
```

用 `adb exec-out screencap -p` 采集设备实际像素。
这些截图验证渲染，不能替代受支持的手动键盘、取消、保存或返回检查。

显式演示时钟为 `--es leanon_qa_now '2026-10-01T19:00:00+08:00'`；用 `--es leanon_qa_now system` 恢复真实时钟。
官方仅 cache 临时文件的原生对齐 instrumentation 无需额外测试依赖：

```bash
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest -PleanonUiQa=true
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -r com.zzzode.leanon.uiqa.test/com.zzzode.leanon.qa.ParityInstrumentation
adb shell run-as com.zzzode.leanon.uiqa cat cache/parity-qa-report.json
```

Runner 拒绝其他应用 ID，仅在 cache 写临时记录／设置／导出版本，比较应用记录文件前后 hash。
此前设置／导出可靠性版本通过 119 个 JVM 测试和 15 项隔离设备检查；这不代表真实健康平台、通知或 UI 保存按钮验收。
原生临时文件检查是持久化证据，不是保存按钮验收。
Accessibility 操作逐项记录；节点不存在或操作失败不能当成 UI 交互通过。
代码证据与覆盖边界见[对齐审查](parity-audit-2026-10-06.zh-CN.md)。

## 日记事务

正式应用首次安装从空的 schema-2 日记开始，没有个人资料或复制的演示记录。
`records.getSnapshot` 和 `records.mutate` 负责资料设置及历史体重、饮水、运动、餐食明细。
每次事务原子保存版本、无数量淘汰的操作回执和完整删除快照；相同重试返回当前日记，过期草稿和恢复目标占用返回 `conflict`。
显式指定的外部健康镜像保持只读。
旧版汇总摄入保持可识别，不能被编造成餐食；读取迁移不会改写文件。
损坏或不支持的文件保持原样并明确失败。
此 RPC 使用私有 JSON 请求封装，保留 Lynx 原生 Map 转换会丢失的显式空值；原生校验仍区分字段缺失与 null。
前台分钟刷新及日期、时间、时区广播更新派生本地日期，草稿选定日期保持固定。

调试版 `.uiqa` 的 Instrumentation runner 可用 `-e scenario daily-interactive -e reset true` 安装一次性缓存日记。
官方手势后保存真实设备截图与可访问性树；Lynx 未暴露按钮节点时，使用已实际查看截图的坐标。
此仓库替换同时受调试构建及 `.uiqa` 应用 ID 限制，不提供产品 RPC。
强制停止 QA 进程后可用 `reset false` 重开同一缓存日记，验证重启持久化。
原生单元与一致性测试不等于实际按钮验收。

最终每日记录原生版本通过 154 个 JVM 测试和 release Kotlin 编译。
跨平台 worked fixture 覆盖十次成功操作和三个预期失败，与官方 UI 会话分开记录。
最终包真实 UI 证据及设备、时钟、进程和数据命名空间边界见[对等审查](parity-audit-2026-10-06.zh-CN.md)。

## 私密个人数据、备份与伴侣同步

`personal.*` 负责版本化饮食偏好、身体围度、去除元数据的 JPEG 照片及持久操作回执。
记录、个人集合、照片字节、伴侣凭证和导出版本采用 AES-GCM 文档，Android Keystore 包装随机数据密钥。
旧明文日记及导出账本仅兼容读取，下一次明确成功修改才加密。
照片预览缓存有数量和大小界限，后台、关闭及撤销授权时清理，回前台使用新的 URI 代际重建。
用户主动选择照片／文档的系统选择器不申请广泛媒体或相机权限。

加密备份使用原样 UTF-8 密码、600,000 次 PBKDF2-HMAC-SHA256 及认证 AES-256-GCM。
导入预览只读且五分钟失效；明确恢复核对两份存储版本，并通过可恢复的私有事务日志提交。
伴侣账号、设备授权、邀请确认、分项共享、密文同步与鼓励持久确认通过用户配置的 HTTPS relay 实现。
登录不会附加本机健康数据：另行具名账号同意并核对两份版本，才允许导出。
仅调试 `.uiqa` 接受隔离验收用的本机 HTTP relay。
删除本机数据会取消旧健康同步、关闭自动 Health Connect 导入并清理本地导出元数据，不删除系统健康记录。

原生 Lynx 容器采用 Android 字号缩放，更新时保留当前草稿。
官方 Instrumentation 分开记录生成图片／原生检查、实际 UI 动作与真实本机 relay 互通。
系统选择器、相机、平台权限、硬件及完整 TalkBack 验收需要单独明确的设备验证。
当前检查点和限制见[私密数据验收记录](full-product-acceptance-2026-10-07.zh-CN.md)。

## 状态

原生宿主可用 Android Studio 或 Gradle 构建，项目 Linux CI 尚未编译原生宿主。
本地记录、扫码、提醒、Health Connect 和标准 BLE 已有实现路径，各自设备验收边界分开记录。
提醒和 Health Connect 偏好使用原子私有 `settings.json` 快照；首次成功写入导入旧 SharedPreferences，保留旧文件。
损坏或写入失败明确报告；启动／前台／Worker 保留原文件。
提醒更新等待 WorkManager 确认，调度失败时尽力恢复旧偏好与任务。
Health Connect 启用要求完整权限及首次同步成功。
导出前在 `health-connect-export-versions.json` 持久预留内容版本：初始为 2，相同重试不变，编辑递增。
平台调用串行执行；失败同步不确认新的完成时间戳。
提醒／连接设置仍是原子私有偏好；健康集合及派生导出元数据已加密。
通用资源下发（RFC 0007）及独立的通用 `storage.*` RPC 仍不可用，能力声明不广告支持。

## 相关 RFC

- RFC 0005 桥协议
- RFC 0006 原生宿主与 Lynx 容器
- RFC 0007 动态化下发
- RFC 0008 数据模型、加密存储与同步
