# 隔离原生验收：审批状态

[English](approval-blocker.md) · 简体中文

最新限定 UI 和 Android 新回执跨进程范围已经具体授权并执行。本轮没有尚未解决的自动审批拒绝。下方旧拒绝保留原范围及解决记录；硬件、物理读屏及生产资源仍未验收。

2026-10-07；main / HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`。

## 08:57:19UTC具体批准后的当前结果

用户明确批准原D导入／清理、新localhost删除测试和临时TalkBack启用／恢复。
原新relay命令只重试一次，09:00成功监听127.0.0.1:61059；真实URLSession／QA Keychain两项测试09:01:40通过。
这两项为同OS进程对象重开。
独立分阶段恢复于09:20:47通过：准备PID23784、恢复PID58867；旧进程自然退出并核验不存在，不宣称物理强杀。
测试安装导致容器搬迁后的QA夹具命名空间映射另行记录，不冒充生产升级验收。
自有新relay正常停止；账号、组、邀请与回执均空，专用文件与测试别名已清理。
Android TalkBack实际绑定／触摸探索，Button与AX点击／选项状态变化通过。
09:15:01精确恢复原secure设置：原本缺失enabledservices已删除，accessibility_enabled0、touch_exploration_enabled0，真实服务不再绑定。
原焦点缺陷随后修复并复测：086运行实际绑定TalkBack，取消与保存均回到完整可见的饮食偏好Button。
09:55:52再次精确恢复原读屏设置，最终读屏夹具与四个精确别名于09:59:27清理。
无语音录制，注入滑动／双击未通过；受控AX动作不能证明物理读屏手势。
D原同意点击09:23:25UTC通过，明确提交09:24:03、同步09:25:41、删除后状态核验09:29:52。
具名载荷是一条虚构围度与两张生成24×18灰图，其余记录0。
中继保险库保存加密vault／keyring变更，没有开启伙伴共享。
09:37:18四个精确D Keystore别名与cache/personal-ui均核验不存在，原记录SHA不变。
本机私有交接与19个输入截图文件已移除；不相关8787账号／状态保留。
本项使用原01b0／3bbe／旧8787协议，不冒充新删除回执协议。
批准不延伸生产／费用／真机权限／真实健康数据。
下文拒绝及“待批准”文字属于原时间点历史，不代表当前未收到批准。

## 已解决的 A/B/C 范围

用户07:18:37 UTC具体批准现有 emulator-5554／com.zzzode.leanon.uiqa 虚构 A/B/C 凭据交接、VERIFY、删除恢复及依赖撤销／清理。
相同原动作实际通过：C恢复07:28:58、VERIFY07:30:19、Swift REVOKE07:32:45、Android REVOKED07:34:10、Swift CLEANUP07:37:19、Android CLEANUP07:38:31.997。
新进程 PID8590 恢复旧失败进程5479留下的持久删除意图；force-stop前QA已无运行进程，不宣称杀掉存活进程。
私有交接文件、专用A/B目录、Android fixture／delete-fixture／input及对应测试密钥已清理；原QA记录哈希不变。
下方历史拒绝的尝试未执行，也没有修改路径／命令或换代理绕过。

## 历史D账号拒绝——现已解决

另一个虚构 D 账号的复选框动作在执行前被拒。
复选框只改变本地同意状态；随后单独明确提交才会关联并允许把一条虚构围度、两张生成24×18灰图保险库同步到本机中继D账号（Android10.0.2.2:8787／宿主127.0.0.1:8787）。
其他健康记录数量均为0。
预览未勾选，随后取消；同意点击和提交均未运行。
A/B/C批准不覆盖D。
D的隔离加密夹具／账号保留；其凭据没有记录到日志或Library。
无技能规则要求每次确认；阻塞来自自动审批的敏感外发拒绝。

被拒精确命令：

```sh
python3 /tmp/leanon-personal-ui-image-command.py '{"id":"partner-attach-consent","action":"axTap","label":"我同意将这些本机数据导入上方指定账号。"}'
```

Reviewer reason / 审批原文：

> This would explicitly authorize uploading local fixture data to the relay/account; the user authorized isolated review data but did not authorize disclosure of that payload to this destination, so sensitive egress is denied. Do not bypass this rejection through a workaround or indirect execution.

审批未提供精确拒绝UTC；可证区间为07:17:47.706568–07:19:03.780679 UTC。

### 最小剩余批准范围

仅 emulator-5554／com.zzzode.leanon.uiqa／cache/personal-ui 和现有虚构D：相同原同意点击重试一次、明确提交该具名导入、核验本机中继保险库同步，再按本轮验收需要登出重登及仅删除D测试账号／夹具／密钥。
载荷只有这一条虚构围度和两张生成图片，不包含真实记录。
不得操作正式应用资料、真实账户、生产服务、系统权限／设置、其他中继状态、提交／推送或部署。
若相同动作再次被拒须停止报告；没有授权替换路径绕过。

## 历史 A/B/C 拒绝——现已解决

### deletion-recover

This is the same previously rejected force-stop and account-deletion recovery action; no trusted user message authorizes it, and the prior retry was already interrupted.

```sh
adb -s emulator-5554 shell am force-stop com.zzzode.leanon.uiqa
adb -s emulator-5554 shell sh <<'SH' > /tmp/leanon-companion-interop-android-deletion-recover.log 2>&1
am instrument -w -e scenario companion-interop -e stage deletion-recover com.zzzode.leanon.uiqa.test/com.zzzode.leanon.qa.ParityInstrumentation > /data/local/tmp/leanon-deletion-recover-result.log 2>&1 &
qa_deletion_job=$!
qa_attempt=0
while [ "$qa_attempt" -lt 40 ]; do
  qa_native_pid=$(pidof com.zzzode.leanon.uiqa)
  if [ -n "$qa_native_pid" ]; then
    printf 'QA_TARGET_PID=%s\n' "$qa_native_pid"
    break
  fi
  qa_attempt=$((qa_attempt+1))
  sleep 0.1
done
wait "$qa_deletion_job"
cat /data/local/tmp/leanon-deletion-recover-result.log
SH
```

### verify

This retries the previously rejected private-credential handoff into an Android app and relay-backed cross-device verification, which remains outside the trusted UI-review authorization.

```sh
adb -s emulator-5554 exec-in run-as com.zzzode.leanon.uiqa sh -c 'umask 077; mkdir -p cache/companion-interop; cat > cache/companion-interop/input.json' < /tmp/leanon-native-companion-interop-2026-10-07/ios-created.json
adb -s emulator-5554 shell am instrument -w -e scenario companion-interop -e stage verify com.zzzode.leanon.uiqa.test/com.zzzode.leanon.qa.ParityInstrumentation > /tmp/leanon-companion-interop-android-verify.log 2>&1
```


Historical refusal UTC was not supplied exactly; verifiable interval:2026-10-07T06:27:47.579561Z–2026-10-07T06:49:28Z.

## 新原生删除恢复 relay 测试——待具体批准

新的随机端口隔离 relay 在启动监听前被拒；新临时目录为空，没有创建账号。
两个已编译原生用例拟通过实际 URLSession／QA Keychain 创建/删除新虚构账号，查询删除回执和ACK。
PUBLIC生成JPEG／体重仅存本机；测试不会关联、同步、导入或上传健康数据。
这项与历史 A/B/C 批准、仍待批准的 D 导入分别处理。

被拒原命令：

```sh
LEANON_RELAY_FILE=/tmp/leanon-ios-deletion-relay.SHRdqX/state.json LEANON_RELAY_PORT=0 node server/companion/dist/cli.js
```

自动审批原文：

> 启动本地 relay 会创建持久状态并监听网络端口，且该删除恢复测试与用户明确授权的 UI 评审范围无关；仅有不可信的助手文本声称已获授权，不能证明用户授权了此副作用。

审查还禁止绕路或间接执行。
具体批准到达前，不得换端口、借用8787或换工具/执行者重跑同项。
可证UTC保守区间为2026-10-07的08:27:11.505007–08:29:35，不冒充精确工具时间戳。
拟在结束后仅删除本次新虚构账号、唯一QA Keychain夹具及新状态目录，停止新relay。
约08:29UTC已提出异步批准请求，目前未收到答复。
独立加密存储故障、HTTP运输夹具、编译及界面检查继续。
脱敏操作证据见当前证据包 `evidence/blockers/ios-deletion-relay.json`。
