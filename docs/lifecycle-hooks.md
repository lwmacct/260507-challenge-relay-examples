# Workflow Lifecycle Hooks

`@challenge-relay/projection` 默认不会把 workflow 生命周期写到 stdout。业务侧如果需要感知
session、projection 或人工接力状态，应使用 lifecycle hooks。

## 基本用法

```ts
import { defineWorkflow } from "@challenge-relay/projection/workflow";

const workflowApp = defineWorkflow({
  // defaults / inspectState / actions ...

  hooks: {
    onHumanRelayStarted(event) {
      console.log("relay started", event.sessionId, event.activePart);
    },

    onHumanRelayCompleted(event) {
      console.log("relay completed", {
        sessionId: event.sessionId,
        reason: event.reason,
        lastProjectionId: event.lastProjectionId,
      });
    },

    onProjectionReplaced(event) {
      console.log("projection replaced", event.projectionId, event.part);
    },
  },
});
```

也可以使用统一事件入口：

```ts
const workflowApp = defineWorkflow({
  // ...

  lifecycle(event) {
    if (event.type === "relay.completed") {
      console.log(event.sessionId, event.reason);
    }
  },
});
```

`hooks.lifecycle` 和顶层 `lifecycle` 二选一即可；如果同时提供，顶层 `lifecycle` 优先。

## 人工接力完成

人工接力完成事件是：

```ts
hooks: {
  onHumanRelayCompleted(event) {
    // event.type === "relay.completed"
  }
}
```

触发条件：

- 之前已经进入人工接力状态。
- SDK 已经开始或收到过投影。
- 后续检测到该 session 不再需要人工接力，或 session 被释放/关闭/撤销。

事件字段：

```ts
type RelayCompletedEvent = {
  type: "relay.completed";
  workflowId: string;
  workflowKind: string;
  workflowNodeId: string;
  sessionId: string;
  at: string;
  reason: "verified" | "region_gone" | "session_released" | "workflow_completed" | "unknown";
  previousSnapshot: unknown | null;
  snapshot: unknown | null;
  lastProjectionId: string | null;
  activePartBefore: string | null;
};
```

`reason` 含义：

- `verified`：最新页面状态显示外层区域已验证。
- `region_gone`：外层可见人工区域消失。
- `session_released`：platform 释放、关闭、撤销 session，或 workflow 断开。
- `workflow_completed`：workflow action 明确要求完成 session。
- `unknown`：SDK 能确认不再需要人工接力，但无法归类原因。

## 事件列表

| 事件类型 | 快捷 hook | 说明 |
| --- | --- | --- |
| `workflow.connected` | `onWorkflowConnected` | workflow socket 已连接 platform。 |
| `workflow.registered` | `onWorkflowRegistered` | workflow node 已注册。 |
| `workflow.disconnected` | `onWorkflowDisconnected` | workflow socket 断开。 |
| `workflow.error` | `onWorkflowError` | SDK runtime 捕获到错误。 |
| `session.created` | `onSessionCreated` | SDK 检测到人工区域并创建 session。 |
| `session.assigned` | `onSessionAssigned` | platform 将 session 分配给该 workflow。 |
| `session.snapshot` | `onSessionSnapshot` | session 页面状态快照同步。 |
| `session.updated` | `onSessionUpdated` | session phase / requiresHuman 更新。 |
| `session.released` | `onSessionReleased` | platform 释放 session task。 |
| `session.closed` | `onSessionClosed` | session 被关闭。 |
| `session.revoked` | `onSessionRevoked` | session 被撤销。 |
| `relay.started` | `onHumanRelayStarted` | session 进入人工接力状态。 |
| `relay.completed` | `onHumanRelayCompleted` | 人工接力结束。 |
| `projection.started` | `onProjectionStarted` | SDK 开始推送投影流。 |
| `projection.replaced` | `onProjectionReplaced` | 投影 keyframe / region 被替换。 |
| `projection.stopped` | `onProjectionStopped` | 投影流停止。 |
| `input.accepted` | `onInputAccepted` | 鼠标输入被 SDK 接收并进入派发队列。 |
| `input.dropped` | `onInputDropped` | 鼠标输入被丢弃。 |

## 输入丢弃原因

`input.dropped` 的 `reason` 可能是：

- `not_assigned`：输入不属于当前分配的 session。
- `human_not_required`：session 当前不需要人工接力。
- `stale_projection`：输入来自旧 projectionId。

## Hook 错误处理

默认情况下，hook 抛错不会中断 workflow 主流程。SDK 会将 hook 错误写入 SDK logger 的
`error` 级别。

如果希望 hook 抛错时直接让当前流程失败，可以配置：

```ts
defineWorkflow({
  // ...
  strictHooks: true,
});
```

一般不建议在生产接力流程开启 `strictHooks`，除非 hook 是必须成功的业务事务。

## 日志与生命周期事件

SDK 默认日志级别是 `error`，不会输出正常生命周期流水。

需要调试 SDK 内部状态时，可以显式打开 debug 日志：

```ts
defineWorkflow({
  // ...
  logging: {
    level: "debug",
  },
});
```

业务状态请优先使用 lifecycle hooks，不要依赖 stdout 文本。
