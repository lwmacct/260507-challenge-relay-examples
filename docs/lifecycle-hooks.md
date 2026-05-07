# Relay Lifecycle

`@challenge-relay/projection` 默认不会把 workflow 生命周期写到 stdout。业务侧如果需要感知
人工接力状态，应使用 relay lifecycle hooks。

Relay lifecycle 只暴露业务语义，不暴露 SDK 内部 session / projection / socket 细节。

## 状态机

```text
idle
  -> relay.required
  -> relay.assigned
  -> relay.projecting
  -> relay.completed | relay.cancelled | relay.failed
```

## 基本用法

```ts
import { defineWorkflow } from "@challenge-relay/projection/workflow";

const workflowApp = defineWorkflow({
  // defaults / inspectState / actions ...

  relay: {
    onRequired(event) {
      console.log("relay required", event.session.id, event.snapshot.region?.activePart?.part);
    },

    onProjecting(event) {
      console.log("relay projecting", event.projection.id, event.projection.part);
    },

    onCompleted(event) {
      console.log("relay completed", event.session.id, event.reason);
    },

    onCancelled(event) {
      console.log("relay cancelled", event.reason);
    },

    onFailed(event) {
      console.error("relay failed", event.scope, event.error);
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
      console.log(event.session.id, event.reason);
    }
  },
});
```

`relay` 适合业务代码直接接具体阶段；`lifecycle(event)` 适合统一记录、统计或转发。

## 什么时候进入人工接力

监听 `relay.required`。

SDK 在目标页检测到可见人工区域时触发该事件。内部判断条件是：

- 找到目标页面。
- 区域存在。
- 有可见 `activeRegion`。
- 有 `activePart.part`。
- `verified !== true`。

此时 SDK 已判断“适合进入人工接力”，但 operator 端未必已经接管。

## 什么时候可以操作投影

监听 `relay.projecting`。

该事件表示第一条可用 projection 已经生成，payload 内会带：

```ts
event.projection.id
event.projection.part
event.projection.region
event.projection.imageSize
```

operator UI 应以 `relay.projecting` 作为“画面已可操作”的信号。

## 人工接力完成

监听 `relay.completed`：

```ts
relay: {
  onCompleted(event) {
    // event.type === "relay.completed"
  }
}
```

触发条件：

- relay 之前已经进入 `required` / `assigned` / `projecting`。
- 后续检测到该 session 不再需要人工接力，或 workflow action 明确完成。

事件字段：

```ts
type RelayCompletedEvent = {
  type: "relay.completed";
  state: "completed";
  workflow: {
    id: string;
    kind: string;
    nodeId: string;
  };
  session: {
    id: string;
  };
  at: string;
  reason: "verified" | "region_gone" | "task_released" | "session_closed" | "session_revoked" | "workflow_disconnected" | "workflow_completed" | "unknown";
  previousSnapshot: unknown | null;
  snapshot: unknown | null;
  projection: {
    id: string;
    part: string;
    region: { x: number; y: number; width: number; height: number };
    imageSize: { width: number; height: number };
  } | null;
  activePartBefore: string | null;
};
```

`reason` 含义：

- `verified`：最新页面状态显示外层区域已验证。
- `region_gone`：外层可见人工区域消失。
- `workflow_completed`：workflow action 明确要求完成 session。
- `unknown`：SDK 能确认不再需要人工接力，但无法归类原因。

外部释放、关闭、撤销或断开不属于 completed，会触发 `relay.cancelled`。

## 事件列表

| 事件类型 | Hook | 说明 |
| --- | --- | --- |
| `relay.required` | `relay.onRequired` | 可见人工区域出现，SDK 判断需要接力。 |
| `relay.assigned` | `relay.onAssigned` | platform 已分配接力任务，SDK 开始跟踪该 session。 |
| `relay.projecting` | `relay.onProjecting` | 第一帧投影已可用，operator 可以操作。 |
| `relay.input` | `relay.onInput` | 鼠标输入已被 SDK 接收并进入派发队列。 |
| `relay.completed` | `relay.onCompleted` | 人工接力正常结束。 |
| `relay.cancelled` | `relay.onCancelled` | 接力被外部取消或 workflow 断开。 |
| `relay.failed` | `relay.onFailed` | SDK runtime 捕获到错误。 |

## 取消原因

`relay.cancelled` 的 `reason` 可能是：

- `task_released`：platform 释放 session task。
- `session_closed`：session 被关闭。
- `session_revoked`：session 被撤销。
- `workflow_disconnected`：workflow socket 断开。
- `unknown`：无法归类。

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

业务状态请优先使用 relay lifecycle hooks，不要依赖 stdout 文本。
