# Static Bundle Delivery

English · [简体中文](README.zh-CN.md)

Reference layout for serving dynamic Lynx bundles. The backend is intentionally static: any CDN
or static host (GitHub Pages, S3 + CloudFront, etc.) can serve it. See RFC 0007.

## Layout

```
manifest.json                 # current artifact list (see manifest.example.json)
bundles/
  home@7.lynx                 # immutable, content-addressed by version
  card-today@3.lynx
```

## Cache headers

- `manifest.json`: short cache or revalidation (`Cache-Control: no-cache`), so updates are seen
  promptly. ETag/If-None-Match is supported.
- `bundles/*`: `Cache-Control: public, max-age=31536000, immutable`; URLs include the version,
  so artifacts never change in place.

## Signing

- Every bundle is signed with a private key held in the release pipeline; the corresponding public
  key is embedded in the apps.
- The manifest records each artifact's SHA-256 and detached signature. Clients verify both before
  atomically moving a download into the cache.
- The signing tool and key rotation procedure are tracked in RFC 0007 unresolved questions.

## Release flow (target)

1. Build bundles with Rspeedy.
2. Compute SHA-256 and sign each artifact.
3. Upload the immutable bundles and regenerate/publish `manifest.json`.
4. Set `rolloutPercentage` low, raise it as confidence grows, or set `yanked: true` to withdraw.
