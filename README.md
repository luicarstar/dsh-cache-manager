# dsh-cache-manager

Request statistics, prompt-cache TTL countdown, and optional **cache keepalive** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

请求统计、缓存过期倒计时，以及可选的**缓存续期保活**。

The interesting part is the third one. Every other cache plugin in the ecosystem *shows* you cache numbers. This one can *act* on them: when a provider's prompt cache is about to expire, it sends one minimal request that refreshes the cache, so your next real turn still hits it instead of rebuilding the whole context at full input price.

这个插件的重点在第三项。生态里其他缓存插件都是**看**缓存的——告诉你命中率、告诉你还有多久过期。这个是**动**缓存的：快过期时替你续一次，让下一轮真实对话还能吃到缓存，而不是按全价把整个上下文重算一遍。

## 为什么值得装

长会话的成本大头不是输出，是每一轮重新送进去的上下文。服务商的提示词缓存有有效期（各家不同，常见 5 分钟到 1 小时），一旦超过，下一次请求就是**冷启动**：整个上下文按新输入计价。

你可以手动每隔几分钟发一句「继续」来保活，但那是真的在消耗轮次，而且会污染对话。这个插件做的是同一件事，但：

- 请求**不写入会话日志**、不进模型上下文、不产生轮次；
- 收到第一个输出块就中止，不浪费输出 token；
- 走的是正常 `llm.stream` 通道，所以限速、代理、路由插件全部照常生效；
- **默认关闭**，只为你想保活的那条「渠道::模型」开启。

## 主要能力

### 1. 请求统计丸 & 详情面板

输入框下方实时显示当前轮次与会话累计发起的上游请求数。口径以宿主 `requestStats` 会话投影为准，**不重算、不伪造上游用量**。

- 已自动剔除自动失败重试和图片卸载重发，不重复计次；
- 点击弹出详情：总请求、重试次数、工具调用、子代理调度、峰值/平均 RPM；
- 每轮回答底部显示耗时与模型号徽章。

### 2. 缓存 TTL 倒计时

按你为每条「渠道::模型」设置的缓存有效期，显示剩余倒计时，提醒当前上下文缓存是否即将过期。

### 3. 可选自动续期（Cache Keepalive）

**默认关闭。** 为某条规则开启后：

1. 一轮由**真人**发起的对话正常答完（`completed` / `max-tokens`），会话转为空闲；
2. 在「最近一次请求完成时间 + TTL − 提前量（默认 30 秒）」发一次保活请求；
3. 保活请求携带会话现有上下文（`deriveMessages` / `toolHistory` / 当前 request header 的 config + tools），末尾追加一条极短的保活 user 消息；
4. 收到首个输出块即中止；
5. 若设置了自动续期 N 次，以续期完成时间为新基准再排下一次。

以下情况**立即取消**待执行的续期：会话再次开始运行（新消息 / 重试 / 编辑）、会话销毁、规则关闭。

**费用提示**：每次自动续期都是一次真实上游请求，会消耗配额。输入按缓存读计价时仍然产生费用。请按需开启，并设置次数上限。

## 安装

### 从 GitHub 安装

在 DSH 桌面端的「插件 → 添加插件」里填仓库地址：

```
https://github.com/luicarstar/dsh-cache-manager
```

### 手动安装

1. 把本仓库放进你的插件目录（或 clone 到任意位置后做 junction / symlink 到 profile 的 `node_modules`）；
2. profile 的 `package.json` 里加依赖：
   ```json
   "dsh-cache-manager": "link:<本仓库绝对路径>"
   ```
3. `dsh.profile.bundles` 数组里加 `"dsh-cache-manager"`；
4. 重启 DSH 桌面端。

> 本包自带 `cordis.patch.yml`，安装后由 bundle 层自动插入 `cache-manager` 行，不需要手动改 `cordis.patch.yml`。

## 使用

- **界面入口**：输入框下方统计丸 / TTL 倒计时丸；**设置 → 缓存 TTL & 续期**。
- **后端接口**：`/dsh-cache-manager/cache-keepalive`
  - `GET ?sessionId=<id>` — 读配置与该会话的续期状态
  - `GET ?sessionId=<id>&catalog=1` — 额外返回可选的「渠道::模型」目录
  - `POST {op:"save", config}` — 保存规则
  - `POST {op:"pause"|"resume", sessionId}` — 暂停 / 恢复该会话的续期
- **配置文件**：`$DSH_HOME/ui-tweak-cache-keepalive.json`

> 配置文件路径和 `dsh-ui-tweak:` 事件前缀保留旧名，是为了让从 UI TWEAK 拆分前就在用的配置能直接沿用，不因升级丢失已设好的规则。

### 配置结构

```json
{
  "version": 1,
  "leadSeconds": 30,
  "rules": {
    "my-provider::my-model": {
      "enabled": true,
      "maxRenewals": 3,
      "ttlMinutes": 5
    }
  }
}
```

| 字段 | 范围 | 默认 | 说明 |
|---|---|---|---|
| `leadSeconds` | 5–3600 | 30 | 提前多少秒发保活 |
| `rules[key].enabled` | 布尔 | false | 该规则是否开启 |
| `rules[key].maxRenewals` | 1–100 | 1 | 最多自动续期几次 |
| `rules[key].ttlMinutes` | 1–525600 | 5 | 该模型的服务商缓存有效期 |

`key` 格式为 `渠道::模型`。同一模型挂在不同渠道下互不影响。

## 兼容性

- 面向 DSH **0.2.2** 系列（`@deepseek-ai/dsh-desktop-runtime` 0.2.2-rc.3 上验证）。
- Node.js ≥ 22。
- 零运行时第三方依赖，`@deepseek-ai/cordis` 为可选 peer（宿主已提供）。
- 不改宿主源码，不接管会话存储。

## 构建与测试

```sh
node build-client.mjs    # 改过 client/request-stats.js 后重建 client.js
npm test                 # cache-keepalive.test.mjs + split.test.mjs
```

`client.js` 是 `client/request-stats.js` 经 `build-client.mjs` 生成的产物，**不要直接改 `client.js`**。

## 设计说明

- **统计口径**：`agent-loop` 对上游 LLM 的每一次 HTTP 请求在会话日志里恰好落一条事件——成功/带内容中断结算为 `assistant/message`，失败/无内容中断结算为 `assistant/attempt`。自动失败重试的重发不计入：`dsh-llm-retry` 退避后重发前必落 `llm/retry-started`，图片卸载重发前必落 `image/offload`，紧跟其后的请求事件即同一逻辑请求的重发。跳过标记顺序消费（一次标记只吞一次请求），并在 step/turn 边界防御性清零。
- **续期语义**：只有含 `source.kind === "user"` 的 user/message 才算「人工发起」，子代理会话、工具触发的轮次不会被续期。
- **失败处理**：上游错误会被记录并终止该条续期链，不会无限重试。
- **配置写入**：临时文件同目录写入 + fsync + rename，写入失败不更新内存；损坏 JSON 不会静默清空。

## License

MIT
