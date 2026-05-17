# FlowSpec MCP

`FlowSpec MCP` 是一个面向本地部署的多 Agent MCP 服务实现。它把 `claude-standard-dev-team` 中的 Agent 定义、阶段化协作规则和交付流程封装成标准 `stdio MCP server`，让你可以在不同的 MCP 宿主中，以更统一、更可控的方式运行完整的软件交付流程。

这个项目的核心理念不是“直接让模型开始写代码”，而是：

- 先把需求整理成标准化 `PRD`
- 再产出 `TECH_SPEC`、`API_CONTRACT`、`DB_SCHEMA`
- 然后进入多 Agent 分工执行
- 最后通过 QA、安全审查、代码评审与验收进行闭环

## Why FlowSpec

很多多 Agent 工具的问题，不是“Agent 不够多”，而是缺少统一规范。`FlowSpec MCP` 关注的是三个核心点：

- 规范先行：优先沉淀 `PRD`、技术契约和任务清单
- 流程闭环：从规划到交付走完整阶段，而不是只做一次性生成
- 模型解耦：不绑定单一模型或单一平台，适配支持 MCP 的宿主

## 核心能力

- 标准 `stdio MCP server`
- `1` 个主 Agent + 多个子 Agent 的阶段化编排
- 支持 `plain`、`minimal-json`、`full-artifact-json` 三种输出模式
- 支持完整 `Phase 0 -> Phase 11` 工作流
- 支持把阶段产物直接写入目标目录
- 支持烟雾测试与完整流程集成测试
- 支持在不依赖 `claude` CLI 的前提下本地运行

## 适用场景

- 想把多 Agent 工作流本地化，而不是依赖单一闭源环境
- 想把需求、架构、开发、验证过程标准化
- 想把 MCP 作为统一接入层，对接不同模型或不同宿主
- 想先建立“规范驱动开发”的流程，再逐步增强自动执行能力

## 推荐使用方式

建议按下面的方式使用本项目：

1. 先生成标准化 `PRD`
2. 再生成 `TECH_SPEC`、`API_CONTRACT`、`DB_SCHEMA`
3. 让主 Agent 按阶段调度子 Agent
4. 在 `Phase 1` 和 `Phase 2` 设人工检查点
5. 通过 QA、安全与验收报告决定是否继续推进

一句话总结：

> 先把规范写清楚，再让多 Agent 执行。

## 模型建议

不同模型在指令遵循、结构化输出、代码生成和长流程稳定性上差异明显。建议优先使用更稳定的模型执行完整工作流。

推荐优先级：

- `Claude`
- `GPT`
- `DeepSeek V4 Pro`
- `MiniMax`

建议：

- 若宿主支持 `sampling`，优先接入上述强模型自动执行完整流程
- 若宿主不支持 `sampling`，可先让 `FlowSpec MCP` 输出 prompt package，再交给目标模型执行

## 架构说明

默认工作方式为：

- `orchestrator` 负责总流程调度
- `product-manager` 负责 `PRD`
- `software-architect` 负责技术契约
- `ui-designer` 负责设计系统
- `database-optimizer` 负责数据库实现
- `backend-architect` 负责后端实现
- `frontend-developer` 负责前端实现
- `testing-evidence-collector` 负责 QA 证据
- `security-engineer` 负责安全检查
- `code-reviewer` 负责代码评审
- `reality-checker` 负责最终验收
- `technical-writer` 负责交付文档

## 工具列表

当前提供的 MCP tools：

- `health_check`
- `list_agents`
- `get_agent_prompt`
- `get_workflow_summary`
- `build_execution_plan`
- `run_agent`
- `run_orchestrator`
- `run_governed_workflow`
- `run_full_workflow`

## 输出模式

### `plain`

- 返回可读文本
- 适合人工调试和 prompt 检查

### `minimal-json`

- 返回最小化结构化 JSON
- 适合流程约束、规则验证和轻量自动化

### `full-artifact-json`

- 返回完整结构化 JSON
- `artifacts` 中包含完整文件内容
- 适合直接落盘完整阶段产物

## 环境要求

- Node.js `>= 20`
- 本地可访问 `claude-standard-dev-team` 源仓库

默认会优先读取：

- 环境变量 `TEAM_SOURCE_PATH`
- 若未设置，则尝试读取 `../claude-standard-dev-team`

## 安装

```powershell
cd <PATH_TO_FLOWSPEC_MCP>
npm install
```

## 启动

```powershell
cd <PATH_TO_FLOWSPEC_MCP>
npm start
```

说明：

- 服务启动后会阻塞等待 MCP 宿主连接，这是正常行为
- 更推荐由 Claude Desktop、Cursor 或自定义 MCP Client 自动拉起

## MCP 配置

通用样例见 [mcp.config.sample.json](./mcp.config.sample.json)。

```json
{
  "mcpServers": {
    "flowspec-mcp": {
      "command": "node",
      "args": [
        "C:\\path\\to\\flowspec-mcp\\server.js"
      ],
      "env": {
        "TEAM_SOURCE_PATH": "C:\\path\\to\\claude-standard-dev-team"
      }
    }
  }
}
```

### Claude Desktop

- 配置文件通常位于 `%APPDATA%\\Claude\\claude_desktop_config.json`
- 可直接参考 [claude_desktop_config.sample.json](./claude_desktop_config.sample.json)

### Cursor

- 配置文件通常位于 `%USERPROFILE%\\.cursor\\mcp.json`
- 配置结构与通用 MCP 配置相同

## 完整流程

默认完整流程包括：

- `Phase 0` `orchestrator`
- `Phase 1` `product-manager`
- `Phase 2` `software-architect`
- `Phase 2.5` `ui-designer`
- `Phase 3` `orchestrator`
- `Phase 4` `database-optimizer`
- `Phase 5` `backend-architect`
- `Phase 5 QA` `testing-evidence-collector`
- `Phase 6` `frontend-developer`
- `Phase 6 QA` `testing-evidence-collector`
- `Phase 7` `security-engineer`
- `Phase 8` `code-reviewer`
- `Phase 9` `devops-automator`
- `Phase 10` `reality-checker`
- `Phase 11` `technical-writer`

## 使用示例

### 1. 只生成执行计划

```text
build_execution_plan(userRequest="开发一个 Todo Lite 应用", mode="full-workflow")
```

### 2. 只运行一个 Agent

```text
run_agent(
  agentName="product-manager",
  phase="Phase 1",
  artifactType="PRD",
  projectName="todo-lite",
  responseMode="full-artifact-json",
  targetDir="C:\\output\\todo-lite",
  task="输出完整 PRD"
)
```

### 3. 跑完整流程

```text
run_full_workflow(
  projectName="todo-lite",
  userRequest="开发一个完整的极简 Todo Lite 应用，覆盖新增、列表展示、完成切换，并交付完整文档、代码骨架与部署配置。",
  targetDir="C:\\output\\todo-lite"
)
```

## 测试

```powershell
npm test
npm run smoke
npm run test:integration
```

完整流程测试会：

- 启动本地 MCP 服务
- 使用 mock sampling host 连接
- 验证工具发现
- 验证主 Agent 与完整流程执行
- 将产物写入 `reports/` 目录
- 生成测试报告

## 发布前建议

发布到 GitHub 前建议：

- 保持样例配置为占位符路径
- 不提交 `reports/` 等本地生成物
- 不提交包含本机用户名或绝对路径的文档
- 增加 `LICENSE`
- 增加 `CHANGELOG`
- 增加 release tag 和截图说明

## 当前限制

- 该项目是对上游 Agent 规则的本地 MCP 封装，不是上游官方 MCP Server
- 若宿主不支持 `sampling`，自动执行会退化为 prompt package 输出
- 当前验证重点是协议接入、编排、约束和完整阶段闭环，不等同于所有模型上的真实工程效果

## Roadmap

后续可以继续增强：

- 阶段失败重试与状态持久化
- 断点恢复
- 更强的产物校验
- 对接更多模型网关
- 对接真实业务仓库做回归测试
