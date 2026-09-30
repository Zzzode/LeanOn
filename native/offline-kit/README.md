# offline-kit

Lynx 动态化的宿主侧资源通道，即 `LynxResourceProvider` 的实现。

## 规划职责

- Manifest（版本清单）拉取与本地比对
- Bundle 全量 / 差量下载
- 签名校验、落盘缓存与清理
- 加载顺序：已验签最新缓存 → App 内置兜底包
- 灰度、回滚与 `minNativeVersion` 协商

详见后续 RFC 0005。
