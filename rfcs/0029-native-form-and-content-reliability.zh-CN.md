- Start Date: 2026-10-05
- RFC Type: architecture
- Status: Proposed
- Related: 0005, 0027, 0028

# 原生表单与内容可靠性

[English](0029-native-form-and-content-reliability.md) · 简体中文

## 摘要与动机

注册官方Lynx XElement输入和SVG组件，协调共享页弹层与原生底栏生命周期。
实际截图复现输入和图表空白、横排退化、底栏截走表单操作。
用户授权本地重新设计和修复，保留认可底栏外观和动效。

## 方案

内容采用暖白、石墨灰和克制蓝色，Today首屏提供记录。
弹层期间暂时隐藏底栏交互，由宿主管键盘安全区，关闭后恢复同一Tab。
XElement与现有Lynx 3.9版本一致，加入输入和SVG所需组件，不升级引擎。
现有typed bridge增加app.setModalActive，关闭或卸载均释放。
先创建安装iOS全局配置再注册；桥接读取Lynx词法NativeModules与事件全局对象。
app.setLocale由宿主持久化，app.localeChanged广播到已挂载页面；UIKit标题和Android应用语言同步原生标签，不改认可底栏形态动效。
键盘改变iOS可用高度时用viewport更新显式触发布局。
Debug记录路径/初始路由钩子及Android可选.uiqa应用后缀隔离回归数据。
共享页明确flex行和可滚动表单；图表按日期定位，刻度对应显示域，体重变化中性呈现。
按capability诚实呈现不可用功能；不改记录schema、不伪造餐次或伙伴送达。
补齐现有bridge contract中的iOS本地饮食日汇总和运动新增/编辑/删除，与Android的JSON结构一致。
只有原子写入成功后才返回成功并广播records.changed；原生回归测试使用临时记录URL。

## 代价与替代方案

依赖增加包体且需宿主随bundle更新；表单期间底栏暂时不可见，正常形态动效保留。
日汇总不能还原餐次和份量，未来条目能力需独立RFC。
模拟输入、网页重绘不能解决原生问题，新账号服务超出范围。

## 未决问题与实施

核验3.9依赖注册、两端键盘和大字。
顺序为宿主、Today表单、其他内容，再工程检查及隔离模拟器截图回归。
保持本地不提交推送，此RFC在审查合并前保持Proposed。
