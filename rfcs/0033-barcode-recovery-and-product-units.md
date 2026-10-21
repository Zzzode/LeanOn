- Start Date: 2026-10-07
- RFC Type: feature
- Status: Proposed
- Related: 0016, 0031, 0032

# Barcode recovery and product units

English · [简体中文](0033-barcode-recovery-and-product-units.zh-CN.md)

## Decision

Complete the existing barcode feature without a new service, account or dependency.
The user's explicit implementation request authorizes the working-tree implementation; this document remains Proposed until normal repository review.
Preserve camera scanning as the main path and offer clearly labeled manual barcode entry when hardware or permission prevents it.

## Contracts and behavior

Add a read-only `scanner.getStatus` RPC reporting camera and host availability and `not-determined`, `authorized`, `denied` or `restricted` permission.
It never opens a camera or requests permission.
Only explicit camera scan actions request permission; automated QA does not trigger permission dialogs without separate user approval.
Native decoders accept checked retail EAN/UPC, normalize UPC-E to UPC-A and resolve once while releasing their camera resources.
Shared code validates GTIN-8/12/13/14 and normalizes UPC-A to its equivalent leading-zero EAN-13 before lookup and storage.
Cancellation preserves the meal draft; loading, retry, missing product, malformed service response, permission and storage errors remain distinct.
Public OFF lookup sends only the product barcode.
It never uploads health records, camera frames or photos.

Use OFF's normalized `_100g` values, kcal or kJ divided by 4.184, and sodium grams converted to milligrams.
OFF uses the same suffix for 100 ml of liquids, so known volume-based products cannot be imported into LeanOn's grams-only food model without a density.
Explain this limitation and offer manual per-100 g creation rather than inventing a conversion.
Only known mass servings become a default gram portion.
Historical records and already imported foods remain untouched.

## Tradeoffs and validation

Manual entry validates recovery and lookup but is not evidence that camera recognition works.
Simulator bridge, queries, portion/date/meal saving and isolated restart persistence can be verified without permissions.
Physical camera recognition and real permission dialogs remain separate acceptance requiring a real device and explicit approval.
Android public APIs cannot perfectly distinguish a denial by older hosts without a stored request marker.
Report that boundary instead of using hidden APIs.
Partner accounts, pairing/sync services, medical diet restrictions and new export privacy flows require separate design decisions.

## References

- [GS1 check digit](https://www.gs1.org/services/check-digit-calculator).
- [OFF normalized nutrition schema](https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product_nutrition/).
