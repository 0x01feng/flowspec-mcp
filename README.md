# FlowSpec MCP

English | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js >=20](https://img.shields.io/badge/Node.js-%3E%3D20-339933)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-blue)](https://modelcontextprotocol.io/)

`FlowSpec MCP` is a PRD-first multi-agent MCP server for standardized software delivery workflows. It wraps the agent definitions, collaboration rules, and staged delivery process from `claude-standard-dev-team` into a local `stdio` MCP service that can run across different MCP hosts.

## Why FlowSpec

Many multi-agent tools fail not because they lack agents, but because they lack structure. `FlowSpec MCP` focuses on three ideas:

- `Spec first`: create `PRD`, contracts, and task lists before execution
- `Workflow closed-loop`: move from planning to delivery through explicit phases
- `Model-agnostic`: work with MCP-compatible hosts instead of tying the workflow to one model vendor

In short:

> Write the spec first, then let the agents execute.

## Highlights

- Standard `stdio MCP server`
- `1` orchestrator plus multiple specialist agents
- Supports `plain`, `minimal-json`, and `full-artifact-json`
- Supports full `Phase 0 -> Phase 11` workflow execution
- Writes generated artifacts to a target directory
- Includes smoke tests and full integration tests
- Runs without the `claude` CLI

## Recommended Workflow

Recommended order of use:

1. Generate a standardized `PRD`
2. Generate `TECH_SPEC`, `API_CONTRACT`, and `DB_SCHEMA`
3. Let the orchestrator dispatch specialist agents by phase
4. Add human checkpoints after `Phase 1` and `Phase 2`
5. Use QA, security, review, and acceptance reports as release gates

## Model Recommendations

Model quality varies a lot across structured output, code generation, and long-running workflows. For best results, prefer stronger models for end-to-end execution.

Recommended priority:

- `Claude`
- `GPT`
- `DeepSeek V4 Pro`
- `MiniMax`

Guidance:

- If your host supports `sampling`, connect a stronger model and run the full workflow automatically
- If your host does not support `sampling`, let `FlowSpec MCP` produce prompt packages and pass them to your preferred model manually

## Architecture

Default workflow roles:

- `orchestrator` for global coordination
- `product-manager` for `PRD`
- `software-architect` for contracts and technical specs
- `ui-designer` for design system output
- `database-optimizer` for database implementation
- `backend-architect` for backend implementation
- `frontend-developer` for frontend implementation
- `testing-evidence-collector` for QA evidence
- `security-engineer` for security review
- `code-reviewer` for code review
- `reality-checker` for final acceptance
- `technical-writer` for delivery documentation

## Available Tools

- `health_check`
- `list_agents`
- `get_agent_prompt`
- `get_workflow_summary`
- `build_execution_plan`
- `run_agent`
- `run_orchestrator`
- `run_governed_workflow`
- `run_full_workflow`

## Output Modes

### `plain`

- Human-readable text
- Best for manual prompt inspection

### `minimal-json`

- Minimal structured JSON
- Best for rule enforcement and lightweight orchestration

### `full-artifact-json`

- Full structured JSON
- Includes complete artifact contents in `artifacts`
- Best for writing staged deliverables to disk

## Requirements

- Node.js `>= 20`
- Local access to the `claude-standard-dev-team` source repository

Source resolution order:

- `TEAM_SOURCE_PATH`
- `../claude-standard-dev-team` if the env var is not set

## Install

```powershell
cd <PATH_TO_FLOWSPEC_MCP>
npm install
```

## Start

```powershell
cd <PATH_TO_FLOWSPEC_MCP>
npm start
```

Notes:

- The process stays attached to stdio and waits for an MCP host to connect
- In practice, it is better to let Claude Desktop, Cursor, or a custom MCP client launch it

## MCP Configuration

See [mcp.config.sample.json](./mcp.config.sample.json) for a generic example.

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

- Config file usually lives at `%APPDATA%\\Claude\\claude_desktop_config.json`
- See [claude_desktop_config.sample.json](./claude_desktop_config.sample.json)

### Cursor

- Config file usually lives at `%USERPROFILE%\\.cursor\\mcp.json`
- Uses the same structure as the generic MCP config

## Full Workflow

Default full workflow phases:

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

## Examples

### Generate only the execution plan

```text
build_execution_plan(userRequest="Build a Todo Lite app", mode="full-workflow")
```

### Run a single agent

```text
run_agent(
  agentName="product-manager",
  phase="Phase 1",
  artifactType="PRD",
  projectName="todo-lite",
  responseMode="full-artifact-json",
  targetDir="C:\\output\\todo-lite",
  task="Generate a complete PRD"
)
```

### Run the full workflow

```text
run_full_workflow(
  projectName="todo-lite",
  userRequest="Build a minimal Todo Lite app with create, list, toggle, docs, code skeleton, and deployment files.",
  targetDir="C:\\output\\todo-lite"
)
```

## Testing

```powershell
npm test
npm run smoke
npm run test:integration
```

The full integration test:

- starts the local MCP server
- connects a mock sampling host
- verifies tool discovery
- verifies orchestrator and full workflow execution
- writes artifacts into `reports/`
- generates test reports

## Publishing Notes

- Keep sample configs path-neutral
- Do not commit local generated outputs such as `reports/`
- Do not publish machine-specific usernames or absolute paths
- Include `LICENSE`, `CHANGELOG`, release tags, and screenshots for a cleaner project page

## Limitations

- This project is a local MCP adaptation of the upstream agent rules, not the official upstream MCP server
- If the host does not support `sampling`, execution falls back to prompt packages
- The current validation focuses on protocol integration, orchestration, constraints, and staged workflow closure, not on universal model quality guarantees

## Roadmap

- Retry logic and persisted workflow state
- Resume from checkpoints
- Stronger artifact validation
- More model gateway integrations
- Regression testing against real project repositories

## Source And Thanks

This project is inspired by and built with reference to the upstream project `xuanbingbingo/claude-standard-dev-team`.

Thanks to the original authors and contributors for publishing the agent definitions, workflow ideas, and engineering conventions that made this local MCP adaptation possible.

## License

Released under the [MIT License](./LICENSE).
