# OpenClaw 部署指南（watch-summary skill）

本文档用于把本项目部署为一个可被 OpenClaw 调用的云端 skill 后端。

## 1. 目标能力

部署完成后，OpenClaw 可以通过 HTTP 调用：

- 健康检查：`GET /health`
- 技能调用：`POST /api/skills/watch-summary`

并使用 Bearer API Key 鉴权。

---

## 2. 前置条件

- 一台可联网服务器（Linux/Windows 均可）
- Node.js 18+
- npm
- 已能访问项目代码
- 你已准备好一个强随机密钥作为 `WATCH_API_KEY`

---

## 3. 服务端部署步骤

## 3.1 获取代码并安装依赖

```bash
npm install
```

## 3.2 配置 API Key（必须）

Linux/macOS：

```bash
export WATCH_API_KEY="替换成你的强随机密钥"
```

Windows PowerShell：

```powershell
$env:WATCH_API_KEY="替换成你的强随机密钥"
```

> 说明：服务端在 [src/Application.ts:37](../src/Application.ts#L37) 读取该环境变量，并在 [src/api/server.ts:70](../src/api/server.ts#L70) 对 `/api` 路由启用鉴权中间件。

## 3.3 启动服务

开发启动：

```bash
npm run dev
```

生产推荐：

```bash
npm run build
node dist/index.js
```

默认监听：`0.0.0.0:3000`（见 [src/Application.ts:35-37](../src/Application.ts#L35-L37)）。

---

## 4. 部署后自检（必须先做）

## 4.1 健康检查

```bash
curl http://<你的域名或IP>:3000/health
```

期望：

```json
{ "ok": true }
```

## 4.2 技能接口鉴权检查

```bash
curl -X POST http://<你的域名或IP>:3000/api/skills/watch-summary \
  -H "Authorization: Bearer <你的WATCH_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "symbols": ["BTC/USDT", "ETH/USDT"],
      "intervals": ["1h", "4h"]
    }
  }'
```

期望响应结构（关键字段）：

```json
{
  "ok": true,
  "skill": "watch-summary",
  "input": { "symbols": ["..."], "intervals": ["..."] },
  "output": {
    "summary": {},
    "agentSummary": {}
  }
}
```

---

## 5. OpenClaw 侧配置

项目已提供草案配置文件：

- [src/config/openclaw-watch-summary.skill.json](../src/config/openclaw-watch-summary.skill.json)

你只需要改这几个值：

1. `baseUrl` 改为你的真实线上地址（不要带末尾 `/`）
2. Bearer 密钥改为服务端一致的 `WATCH_API_KEY`
3. endpoint 保持：`/api/skills/watch-summary`

---

## 6. 如果你用 create-skill 生成模板

若 OpenClaw 侧先执行了 `create-skill`，按下面映射填值即可：

- 调用路径（endpoint）→ `POST /api/skills/watch-summary`
- 鉴权类型 → `Bearer`
- Header 名 → `Authorization`
- 鉴权值 → `Bearer <WATCH_API_KEY>`
- 请求体 →

```json
{
  "input": {
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "intervals": ["1h", "4h"]
  }
}
```

响应提取建议：

- `output.summary`
- `output.agentSummary`

---

## 7. 常见问题

## 7.1 返回 401 Unauthorized

排查顺序：

1. `WATCH_API_KEY` 是否已在服务进程环境中生效
2. 请求头是否为 `Authorization: Bearer <key>`
3. `<key>` 是否与服务端完全一致

## 7.2 OpenClaw 触发成功但无结果

1. 先独立 curl 验证接口（第 4 节）
2. 检查是否传了不存在或不在交易时段的 `symbols`
3. 直接看 `output.summary.errors` 和 `output.agentSummary.counts.errors`

## 7.3 symbols/intervals 不生效

接口支持两种请求体：

- 推荐：`{"input": {"symbols":[], "intervals":[]}}`
- 兼容：`{"symbols":[], "intervals":[]}`

实现见 [src/api/server.ts:169-171](../src/api/server.ts#L169-L171)。

---

## 8. 生产建议（最小版）

- 用进程守护（如 systemd / PM2）保持常驻
- 在反向代理层（Nginx/Caddy）启用 HTTPS
- 不要在日志中打印完整 API Key
- 只开放必要端口

---

## 9. 快速验收清单

- [ ] `/health` 返回 `{ok:true}`
- [ ] skill 接口带 Bearer 可返回 `ok:true`
- [ ] skill 接口不带 Bearer 返回 401
- [ ] OpenClaw 已填入正确 `baseUrl` 与 API Key
- [ ] OpenClaw 能读取 `output.agentSummary` 做下一步决策
