# 免费 LLM API 接入 Kumo（本地开发）

Kumo 已有服务端 `OpenAICompatibleModel`、`/api/agent/decision` 和 Action Policy，无需重新开发模型客户端。下面的流程只在 Node 端保存 API Key，浏览器只能拿到经校验的单步决策。

## Groq：推荐先试

官方支持 OpenAI-compatible Chat Completions，免费开发额度包含 `openai/gpt-oss-20b`，但有模型相关的请求数和 token 速率限制。每一轮 Agent 可能消耗一次模型请求，实际限制以 [Groq 限流表](https://console.groq.com/docs/rate-limits) 和账号控制台为准。

1. 在 [Groq Console](https://console.groq.com/keys) 创建**专用于 Kumo** 的 API Key；不要在聊天、PR、Issue、截图、日志里发 Key。
2. 在仓库根目录运行 `Copy-Item .env.example .env.local`（Windows PowerShell）；macOS/Linux 使用 `cp .env.example .env.local`。
3. **只在本机**打开 `.env.local`，把真实密钥填写在 `KUMO_LLM_API_KEY=` 后面。`.gitignore` 已排除 `.env.*`，提交前仍检查暂存文件。
4. 使用 Node 22+，依次运行 `npm install`、`npm run dev:llm`。`dev:llm` 编译应用，然后使用 Node 的 `--env-file=.env.local` 在本地服务端加载环境变量。
5. 访问 `http://localhost:4173`，在右上角「详情」的 Planner 选项切换到 **LLM · 本地模型**，先测试区域切换等无敏感数据的任务。

```dotenv
KUMO_LLM_ENDPOINT=https://api.groq.com/openai/v1/chat/completions
KUMO_LLM_MODEL=openai/gpt-oss-20b
KUMO_LLM_API_KEY=
```

## Google Gemini：备选免费层

在 [Google AI Studio](https://aistudio.google.com/apikey) 创建专用 Key，在 `.env.local` 中改用以下配置：

```dotenv
KUMO_LLM_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
KUMO_LLM_MODEL=gemini-3.8-flash
KUMO_LLM_API_KEY=
```

Gemini 官方提供 [OpenAI-compatible 端点](https://ai.google.dev/gemini-api/docs/openai)，定价页显示该模型有[免费层](https://ai.google.dev/gemini-api/docs/pricing)。**其免费层输入和输出可能用于改进 Google 的产品**；仅用于公开或合成测试数据。可用区域、调用配额以账号为准。

## 密钥保护不等于数据保护

- **不要把 Key 发给聊天助手。** 如果已泄露，立刻在提供商控制台撤销并重新创建。
- `.env.local` 留在本地机器；不要提交到 Git、记录在脚本参数、放进浏览器代码或托管在公开日志里。
- 本地 Node Bridge 只监听 `127.0.0.1`，API Key 只在 Node → 提供商 HTTPS 请求中使用，不会作为浏览器响应返回。不要把它开放到公网。
- Kumo 会把 **任务、页面 Snapshot 和近期执行历史** 送到模型提供商；不要给免费 API 传客户信息、内部资源、令牌或生产网页内容。
- Action Policy、Ref 校验和审批是开发期防护措施，无法完全防御恶意网页或提示注入。
- 模型配置无效时检查 `.env.local` 是否放在项目根目录、进程是否重启。`llm_http_401` 常表示 API Key 无效；`llm_http_429` 表示可能触发额度限制。

## 官方链接与验证范围

- [Groq OpenAI 兼容性](https://console.groq.com/docs/openai)、[免费限流](https://console.groq.com/docs/rate-limits)、[数据处理](https://console.groq.com/docs/your-data)
- [Gemini 免费层](https://ai.google.dev/gemini-api/docs/pricing)、[兼容端点](https://ai.google.dev/gemini-api/docs/openai)

以上提供商的端点、模型与免费层信息已查证，但没有任何真实 API Key，因此**尚未执行真实模型调用**。现有 CI 的 LLM E2E 使用模拟模型验证交互流程。
