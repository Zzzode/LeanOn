# Licenses

## Project license

LeanOn is licensed under the **Apache License, Version 2.0**. A copy is available in
[`LICENSE`](../LICENSE), and the copyright notice in [`NOTICE`](../NOTICE).

## Third-party dependencies

Runtime and build dependencies remain the property of their respective authors and are
licensed under their own terms. A consolidated third-party license report can be generated
locally:

```bash
# Full dependency tree with license metadata
pnpm dlx license-checker --development --summary

# Generate a disclaimer document
pnpm dlx pnpm-licenses generate-disclaimer --output docs/third-party-notices.md
```

When adding a dependency, please make sure its license is compatible with Apache-2.0
(permissive licenses such as MIT / BSD / Apache-2.0 are fine; GPL/AGPL dependencies
require review before merging).
