# 静态 Bundle 下发

[English](README.md) · 简体中文

动态 Lynx bundle 的参考托管布局。后端刻意保持静态：任何 CDN 或静态托管（GitHub Pages、
S3 + CloudFront 等）均可。见 RFC 0007。

## 布局

```
manifest.json                 # 当前工件清单（见 manifest.example.json）
bundles/
  home@7.lynx                 # 不可变，按版本寻址
  card-today@3.lynx
```

## 缓存头

- `manifest.json`：短缓存或重新校验（`Cache-Control: no-cache`），以便及时发现更新；支持
  ETag/If-None-Match。
- `bundles/*`：`Cache-Control: public, max-age=31536000, immutable`；URL 含版本，工件绝不
  原地修改。

## 签名

- 每个 bundle 由发布流水线中的私钥签名；对应公钥内置在 App 中。
- 清单记录每个工件的 SHA-256 与分离式签名。客户端在把下载原子移入缓存前校验两者。
- 签名工具与密钥轮换流程记录在 RFC 0007 的未决问题中。

## 发布流程（目标）

1. 用 Rspeedy 构建 bundle。
2. 计算每个工件的 SHA-256 并签名。
3. 上传不可变 bundle，重新生成并发布 `manifest.json`。
4. 先把 `rolloutPercentage` 设低，随信心提升调高；或设 `yanked: true` 撤回。
