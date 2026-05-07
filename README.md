# ChallengeRelay SDK 示例

这是一个使用已打包 ChallengeRelay SDK 的公开 workflow 示例。

示例会打开：

```text
https://accounts.hcaptcha.com/demo
```

它会通过 Chrome DevTools Protocol endpoint 连接到浏览器，找到外层可见的
hCaptcha iframe 区域，创建 workflow session，推送该区域的投射流，并接收
platform 转发的鼠标输入。

## 内容

- `src/` 包含示例 workflow 代码。
- `config/example.json` 启动配置示例。
- `vendor/projection.tgz` 是本示例使用的已编译 projection SDK 包。
- `vendor/challenge.tgz` 是本示例使用的已编译 challenge adapter SDK 包。

SDK 包只暴露构建后的 `dist/` 文件和声明文件。本仓库不包含 SDK 源码。

## 安装

```bash
npm install
```

## 启动浏览器

启动一个启用了远程调试的 Chromium 系浏览器：

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/challenge-relay-cdp
```

如果你的浏览器使用不同的 endpoint，请更新启动配置里的
`config.browser.endpoint`。

## 配置

将示例配置复制为本地配置文件：

```bash
cp config/example.json config/local.json
```

编辑：

- `config.platform.url`：ChallengeRelay platform URL。
- `config.browser.endpoint`：CDP endpoint，例如 `http://localhost:9222`。

`config/local.json` 已被 git 忽略。

## 运行

```bash
npm run start -- --config config/local.json
```

## 类型检查

```bash
npm run typecheck
```

## SDK 文档

- [Workflow lifecycle hooks](docs/lifecycle-hooks.md)

## 启动 Payload 结构

```json
{
  "config": {
    "workflow": {
      "id": "wf_demo_01",
      "kind": "demo"
    },
    "platform": {
      "url": "http://127.0.0.1:3000"
    },
    "browser": {
      "endpoint": "http://localhost:9222"
    },
    "target": {
      "url": "https://accounts.hcaptcha.com/demo",
      "pageMatch": "accounts.hcaptcha.com/demo"
    },
    "stream": {
      "intervalMs": 66,
      "jpegQuality": 70,
      "tileSize": 10,
      "keyframeIntervalMs": 2000
    }
  },
  "data": {
    "text": "demo test",
    "submit": false
  }
}
```

`data.text` 可选，用于填写示例文本输入框。
`data.submit` 可选，用于点击示例提交按钮。

## 边界

本示例只检测并投射外层可见的 hCaptcha 区域。它不会读取 challenge 提示、答案或
内部 iframe 内容，也不会尝试自动解题。
