- Start Date: 2026-10-07
- RFC Type: feature
- Status: Proposed
- Related: 0016, 0031, 0032

# 条码恢复与商品营养单位

[English](0033-barcode-recovery-and-product-units.md) · 简体中文

## 决策

补齐既有条码功能，不引入新服务、账号或依赖。
用户已明确授权工作区实现；本文仍为 Proposed，等待正常仓库评审。
保留相机扫描主路径，在硬件或权限阻止扫描时提供明确标注的手动条码输入。

## 契约与行为

新增只读 `scanner.getStatus`，返回相机和宿主可用性以及 `not-determined`、`authorized`、`denied`、`restricted` 权限状态。
该接口不打开相机、不请求权限。
只有用户主动扫描动作才请求权限；自动 QA 未获单独批准不得触发权限弹窗。
原生解码只接受校验通过的零售 EAN/UPC，UPC-E 展开为 UPC-A，单次完成后释放相机资源。
共享逻辑校验 GTIN-8/12/13/14，查询和保存前将 UPC-A 规范为等价的前导零 EAN-13。
取消保留餐食草稿；加载、重试、商品未收录、服务响应损坏、权限及保存错误分别表达。
公开 OFF 查询只发送商品条码，不上传健康记录、相机画面或照片。

采用 OFF 规范化 `_100g` 数据，kcal 优先，kJ 除以 4.184；钠克数转换为毫克。
OFF 对液体每 100 ml 也使用同一后缀，因此明确按体积计的商品不能在未知密度时导入 LeanOn 的克数食物模型。
解释这一限制并提供自建每 100 g 食物，不能凭空换算。
只有明确的质量份量才作为默认克数。
不修改历史记录或既有导入食物。

## 取舍与验证

手动输入可验证恢复和查询，但不代表相机识别通过。
模拟器可无权限验证桥接、查询、份量/日期/餐次保存及隔离重启持久化。
真机识别和真实权限弹窗须真实设备及明确批准后单独验收。
Android 公开接口无法完美区分旧宿主未记录请求标记时的永久拒绝，应明确边界而不使用隐藏 API。
Partner 账号、配对/同步服务、医疗饮食限制及新的导出隐私流程须另行设计。

## 依据

- [GS1 校验位](https://www.gs1.org/services/check-digit-calculator)。
- [OFF 规范化营养结构](https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product_nutrition/)。
