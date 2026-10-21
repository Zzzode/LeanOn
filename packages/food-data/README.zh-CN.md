# @zzzode/food-data

[English](README.md) · 简体中文

LeanOn 离线双语食物库，提供纯同步搜索及克数份量换算；离线记录不依赖相机或网络。
`searchFoods(database, query, locale, limit?)` 优先匹配当前语言名称，回退另一语言。
`portion(item, grams)` 换算每 100 g 营养；热量取整，宏量营养保留一位小数。

## 条码商品

`normalizeProductBarcode` 校验零售 GTIN-8/12/13/14，并将 UPC-A 及其前导零 EAN-13 使用同一标识。
`createFoodFromBarcode` 将公开 Open Food Facts 数据转换为本地食物模型。
采用规范化 kcal/100 g，或 kJ/100 g 除以 4.184；钠克数转为毫克，质量份量保持已规范化的克数。
明确按体积计算的商品抛出 `OffNutritionError`，原因为 `volume-basis`；克数记录不能假定液体密度。
只有原生查询向 OFF 发送条码；这些纯函数不联网、不上传健康记录。
参见 [RFC 0033](../../rfcs/0033-barcode-recovery-and-product-units.zh-CN.md)、[OFF 营养单位](https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product_nutrition/)及[规范化份量](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/lib/ProductOpener/Units.pm)。

## 数据来源及许可

基础食材来自 [USDA FoodData Central](https://fdc.nal.usda.gov/)，其数据以 [CC0](https://creativecommons.org/publicdomain/zero/1.0/) 发布。
`curated` 中式菜肴为合理估计，并非实验室检测结果。
Open Food Facts 商品数据 © 其贡献者，采用 [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)。
代码采用 Apache-2.0；USDA 数据仍为公共领域数据。
