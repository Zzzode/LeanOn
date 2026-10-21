# Isolated native acceptance: approval status

English · [简体中文](approval-blocker.zh-CN.md)

Latest bounded UI and new Android receipt-process scope: already explicitly authorized and executed. No active approval-review rejection occurred in this follow-up. Historical refusals below retain their original scope and resolution. Hardware, physical readers and production provisioning remain outside completed acceptance.

2026-10-07; main / HEAD `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`.

## Current outcome after specific08:57:19UTC approval

The user explicitly approved original D import/cleanup, fresh localhost deletion tests and temporary TalkBack enable/restore.
The original relay command was retried once and listened on127.0.0.1:61059 at09:00; two actual URLSession/QA Keychain cases passed09:01:40.
Those two cases reopened objects within one OS process.
Separate staged recovery passed with prepare PID23784 and recovery PID58867 at09:20:47; the first process had naturally exited and was verified absent.
The QA-only fixture namespace remap after a test-install container change is documented separately and does not certify a production upgrade.
The owned fresh relay stopped normally; its accounts, groups, invites and receipts were empty, and its scoped files and test aliases were removed.
TalkBack was genuinely bound with touch exploration; Button semantics, AX click and selected-state change passed.
At09:15:01 the exact original secure settings were restored: the previously absent enabled-services key was deleted, accessibility_enabled0 and touch_exploration_enabled0, with no bound reader.
The original focus defect was subsequently fixed and retested: Cancel and Save returned to the visible dietary Button with genuinely bound TalkBack in the086 runtime.
At09:55:52 the exact original reader settings were restored again; the final reader fixture and its four exact aliases were removed at09:59:27.
Speech was not captured and injected swipe/double-tap did not pass; controlled AX actions do not certify physical reader gestures.
D original consent passed09:23:25UTC, explicit submission09:24:03, sync09:25:41 and deleted-state verification09:29:52.
The named payload was one fictional measurement and two generated24×18 grey photos; other record counts were zero.
The relay vault contained encrypted vault/keyring changes; no peer sharing was configured.
At09:37:18 all four exact D Keystore aliases and cache/personal-ui were verified absent, with the original records SHA unchanged.
The local private handoff and19 typed-capture files were removed; unrelated8787 accounts/state were retained.
This used original01b0/3bbe and older8787 protocol, not the new deletion-receipt protocol.
Approval excludes production, paid resources, physical-device permissions and actual health data.
Refusals and pending-approval statements below are historical at their original timestamps.

## Resolved A/B/C scope

The user specifically approved the existing emulator-5554 / com.zzzode.leanon.uiqa fictional A/B/C credential handoff, VERIFY, deletion recovery and dependent revocation/cleanup at 07:18:37 UTC.
The same original actions actually passed: C recovery07:28:58, VERIFY07:30:19, Swift REVOKE07:32:45, Android REVOKED07:34:10, Swift CLEANUP07:37:19 and Android CLEANUP07:38:31.997.
Fresh target PID8590 recovered the durable deletion intent from the earlier failure process5479; the QA process was absent before force-stop, so a live-process kill is not claimed.
Private handoffs, dedicated A/B directories, Android fixture/delete-fixture/input and corresponding test keys were cleaned; original QA record hash remained unchanged.
The old refused attempts below did not execute; no rewritten route or alternate agent bypassed review.

## Historical D-account refusal — now resolved

A separate fictional D-account checkbox action was rejected before execution.
The checkbox changes local UI consent only; a separate explicit submit would attach and allow vault sync of one fictional measurement and two generated24×18 grey photos to the D account on the local relay (Android10.0.2.2:8787 / host127.0.0.1:8787).
All other health-record counts are zero.
The preview was unchecked, then cancelled; neither checkbox nor submit ran.
A/B/C approval does not cover this D action.
D's isolated encrypted fixture/account is retained; its credentials are neither logged nor uploaded to Library.
No skill requires per-run confirmation; this is the automatic approval review's sensitive-egress denial.

Exact refused command:

```sh
python3 /tmp/leanon-personal-ui-image-command.py '{"id":"partner-attach-consent","action":"axTap","label":"我同意将这些本机数据导入上方指定账号。"}'
```

Reviewer reason / 审批原文：

> This would explicitly authorize uploading local fixture data to the relay/account; the user authorized isolated review data but did not authorize disclosure of that payload to this destination, so sensitive egress is denied. Do not bypass this rejection through a workaround or indirect execution.

The reviewer supplied no exact refusal UTC; the verifiable interval is07:17:47.706568–07:19:03.780679 UTC.

### Minimal remaining approval scope

Only emulator-5554 / com.zzzode.leanon.uiqa / cache/personal-ui and this existing fictional D account: retry the original consent tap once, explicitly submit this named import, verify its local-relay vault sync, then log out/log in and delete only D's test account/fixture/keys as needed for this acceptance.
The payload is only the one fictional measurement and two generated photos, not real records.
Do not touch formal-app data, real accounts, production services, OS permissions/settings, other relay state, commits, push or deployment.
If the same action is refused again, stop and report; no substitute route is authorized.

## Historical A/B/C refusals — now resolved

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

The tool did not provide exact rejection UTC; documented bounds are after 2026-10-07T06:27:47.579561Z and before 2026-10-07T06:49:28Z.
A/B and private files remain in a 0700 host parent /0600 handoffs; C retains its pending local deletion fixture.
Unexecuted VERIFY/process restart/revocation/cleanup are not counted as passes.

Historical refusal UTC was not supplied exactly; verifiable interval:2026-10-07T06:27:47.579561Z–2026-10-07T06:49:28Z.

## Additional native deletion relay test — pending specific approval

A new isolated random-port relay start was rejected before listening; the newly created temporary directory is empty and no account was created.
The two compiled native tests would create/delete fresh fictional accounts and query deletion receipts/ACK through actual URLSession and QA Keychain.
Their PUBLIC generated JPEG/weight fixture remains local: neither test attaches, syncs, imports or uploads health data.
This is separate from historical A/B/C approval and the still-pending D import.

Exact rejected command:

```sh
LEANON_RELAY_FILE=/tmp/leanon-ios-deletion-relay.SHRdqX/state.json LEANON_RELAY_PORT=0 node server/companion/dist/cli.js
```

Automatic review reason, verbatim:

> 启动本地 relay 会创建持久状态并监听网络端口，且该删除恢复测试与用户明确授权的 UI 评审范围无关；仅有不可信的助手文本声称已获授权，不能证明用户授权了此副作用。

The reviewer also prohibited workarounds or indirect execution.
No owner may restart this test at another port, reuse8787 or launch it through a different tool without specific user approval.
Conservative UTC bounds are08:27:11.505007–08:29:35 on2026-10-07, not exact tool timestamps.
The proposed cleanup removes only the new fictional accounts, unique QA Keychain fixtures and fresh state directory, then stops this relay.
An asynchronous approval request was presented at approximately08:29UTC; no response has arrived.
Independent encrypted-store fault tests, transport fixtures, compile and UI checks continue.
Sanitized operation evidence: `evidence/blockers/ios-deletion-relay.json` in the current evidence package.
