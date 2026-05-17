import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_NAME = "claude-standard-dev-team-local";
const SERVER_VERSION = "0.3.0";
const SOURCE_REPO_PATH = path.resolve(
  process.env.TEAM_SOURCE_PATH || path.join(__dirname, "..", "claude-standard-dev-team"),
);
const AGENTS_DIR = path.join(SOURCE_REPO_PATH, "agents");
const WORKFLOW_FILE = path.join(SOURCE_REPO_PATH, "WORKFLOW.md");
const README_FILE = path.join(SOURCE_REPO_PATH, "README.md");

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

const minimalResultSchema = z.object({
  agent: z.string().min(1),
  phase: z.string().min(1),
  artifactType: z.string().min(1),
  summary: z.string().min(1),
  outputs: z.array(z.string()).max(8).default([]),
  status: z.enum(["ok", "needs_input", "blocked"]),
  decision: z.string().optional(),
  handoffTo: z.array(z.string()).max(8).optional().default([]),
  compliance: z.object({
    minimal: z.boolean(),
    followsRole: z.boolean(),
    notes: z.array(z.string()).max(8).default([]),
  }),
});

const artifactSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["doc", "code", "config", "report", "tasklist", "style", "migration", "script"]),
  description: z.string().min(1),
  content: z.string(),
});

const fullWorkflowResultSchema = z.object({
  agent: z.string().min(1),
  phase: z.string().min(1),
  artifactType: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["ok", "needs_input", "blocked"]),
  decision: z.string().optional(),
  handoffTo: z.array(z.string()).max(8).optional().default([]),
  notes: z.array(z.string()).max(12).optional().default([]),
  compliance: z.object({
    minimal: z.boolean(),
    followsRole: z.boolean(),
    notes: z.array(z.string()).max(8).default([]),
  }),
  artifacts: z.array(artifactSchema).min(1),
});

let agentCache = null;
let workflowCache = null;

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

function stripCodeFences(text) {
  return text.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/\n?```$/, "").trim();
}

function truncate(text, limit = 1200) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n... [truncated]`;
}

function normalizeTools(tools) {
  if (!tools) {
    return [];
  }

  if (Array.isArray(tools)) {
    return tools;
  }

  return String(tools)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadAgents() {
  if (agentCache) {
    return agentCache;
  }

  const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  const agents = [];

  for (const fileName of files) {
    const filePath = path.join(AGENTS_DIR, fileName);
    const raw = await readTextFile(filePath);
    const parsed = matter(raw);
    agents.push({
      id: path.basename(fileName, ".md"),
      fileName,
      filePath,
      name: parsed.data.name || path.basename(fileName, ".md"),
      description: parsed.data.description || "",
      model: parsed.data.model || "unspecified",
      tools: normalizeTools(parsed.data.tools),
      promptBody: parsed.content.trim(),
      frontmatter: parsed.data,
    });
  }

  agentCache = agents;
  return agents;
}

async function findAgent(agentName) {
  const agents = await loadAgents();
  const key = agentName.trim().toLowerCase();
  return (
    agents.find((agent) => agent.id.toLowerCase() === key) ||
    agents.find((agent) => agent.name.toLowerCase() === key)
  );
}

function parsePhases(orchestratorPrompt) {
  const phases = [];
  const lines = orchestratorPrompt.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    const phaseMatch = line.match(/^##\s+►\s+(.*)$/);
    if (phaseMatch) {
      if (current) {
        current.summary = current.summary.join("\n").trim();
        phases.push(current);
      }

      current = {
        title: phaseMatch[1].trim(),
        summary: [],
      };
      continue;
    }

    if (current) {
      current.summary.push(line);
    }
  }

  if (current) {
    current.summary = current.summary.join("\n").trim();
    phases.push(current);
  }

  return phases;
}

async function loadWorkflow() {
  if (workflowCache) {
    return workflowCache;
  }

  const orchestrator = await findAgent("orchestrator");
  const workflowMarkdown = (await pathExists(WORKFLOW_FILE)) ? await readTextFile(WORKFLOW_FILE) : "";
  const readmeMarkdown = (await pathExists(README_FILE)) ? await readTextFile(README_FILE) : "";

  workflowCache = {
    workflowMarkdown,
    readmeMarkdown,
    phases: orchestrator ? parsePhases(orchestrator.promptBody) : [],
  };

  return workflowCache;
}

function asText(text) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

function jsonText(data) {
  return asText(JSON.stringify(data, null, 2));
}

function formatAgentSummary(agent, includePromptBody = false) {
  const parts = [
    `Agent: ${agent.name}`,
    `File: ${agent.fileName}`,
    `Model hint: ${agent.model}`,
    `Tools hint: ${agent.tools.length ? agent.tools.join(", ") : "(none)"}`,
    `Description: ${agent.description || "(none)"}`,
  ];

  if (includePromptBody) {
    parts.push("", "Prompt:", agent.promptBody);
  }

  return parts.join("\n");
}

function formatPlan(userRequest, phases, options) {
  const lines = [
    `目标需求: ${userRequest}`,
    `模式: ${options.mode}`,
    `是否包含可选基建层: ${options.includeInfrastructure ? "是" : "否"}`,
    "",
    "推荐执行顺序:",
  ];

  phases.forEach((phase, index) => {
    lines.push(`${index + 1}. ${phase.title}`);
  });

  lines.push("", "人工检查点:");
  lines.push("1. Phase 1 后确认 PRD");
  lines.push("2. Phase 2 后确认 API_CONTRACT / DB_SCHEMA / TECH_SPEC");
  lines.push("3. 任意阶段重试超限时人工介入");

  if (options.includeInfrastructure) {
    lines.push("", "补充说明:");
    lines.push("- 可以追加 infra-bootstrap-agent / app-deploy-agent 的部署闭环");
  }

  lines.push("", "说明:");
  lines.push("- 该计划来自原始 orchestrator 规则的本地化映射");
  lines.push("- full-workflow 模式会尝试生成完整阶段产物并写入目标目录");

  return lines.join("\n");
}

async function runSamplingPrompt(prompt, maxTokens = 4000) {
  const response = await server.server.createMessage({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: prompt,
        },
      },
    ],
    maxTokens,
  });

  if (!response?.content) {
    return "";
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map((item) => {
        if (item.type === "text") {
          return item.text;
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  if (response.content.type === "text") {
    return response.content.text;
  }

  return JSON.stringify(response.content, null, 2);
}

function buildOutputRules({ responseMode, outputLanguage }) {
  if (responseMode === "minimal-json") {
    return [
      `- 输出语言: ${outputLanguage}`,
      "- 只返回一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释",
      "- summary 控制在 60 字以内",
      "- outputs 最多 6 条，每条尽量简短",
      "- compliance.minimal 和 compliance.followsRole 必须如实填写",
      "- 若信息不足，status 使用 needs_input",
      "- 若存在阻塞，status 使用 blocked",
      "- JSON 结构必须严格符合 minimal-json schema",
    ];
  }

  if (responseMode === "full-artifact-json") {
    return [
      `- 输出语言: ${outputLanguage}`,
      "- 只返回一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释",
      "- artifacts 中必须提供完整文件内容",
      "- artifacts.path 必须是相对路径，不得使用绝对路径",
      "- 每个 artifact.content 必须是可直接落盘的完整内容，不要省略号，不要‘同上’",
      "- summary 保持简洁，但 artifacts 必须完整",
      "- status 仅可使用 ok、needs_input、blocked",
      "- compliance.minimal 应为 false，表示这是完整产物模式；compliance.followsRole 必须如实填写",
      "- JSON 结构必须严格符合 full-artifact-json schema",
    ];
  }

  return [
    `- 输出语言: ${outputLanguage}`,
    "- 直接给出可执行结果，不要解释你不是该 agent",
    "- 如果输入不足，先列出缺失信息与合理假设",
  ];
}

function buildAgentExecutionPrompt({
  agent,
  task,
  context,
  outputLanguage,
  responseMode = "plain",
  phase = "Ad-hoc",
  artifactType = "general",
  projectName = "unnamed-project",
  targetDir = "",
}) {
  const sections = [
    "你将扮演一个专业子代理。严格遵守以下角色说明完成任务。",
    "",
    `Agent Name: ${agent.name}`,
    `Phase: ${phase}`,
    `Artifact Type: ${artifactType}`,
    `Project Name: ${projectName}`,
    `Response Mode: ${responseMode}`,
    `Target Directory: ${targetDir || "(none)"}`,
    `Suggested Model: ${agent.model}`,
    `Allowed Tools Hint: ${agent.tools.join(", ") || "(none)"}`,
    `Description: ${agent.description}`,
    "",
    "Agent Prompt:",
    agent.promptBody,
    "",
    "当前任务:",
    task.trim(),
  ];

  if (context && context.trim()) {
    sections.push("", "补充上下文:", context.trim());
  }

  sections.push("", "输出约束:", ...buildOutputRules({ responseMode, outputLanguage }));

  return sections.join("\n");
}

function buildFallbackExecutionPackage({
  agent,
  task,
  context,
  outputLanguage,
  responseMode,
  phase,
  artifactType,
  projectName,
  targetDir,
}) {
  const prompt = buildAgentExecutionPrompt({
    agent,
    task,
    context,
    outputLanguage,
    responseMode,
    phase,
    artifactType,
    projectName,
    targetDir,
  });

  return [
    "当前宿主未开放 MCP sampling，无法由本地 MCP 直接让模型执行该 agent。",
    "你仍然可以把下面这段提示词直接交给任意支持长上下文的模型执行。",
    "",
    "----- BEGIN AGENT TASK PACKAGE -----",
    prompt,
    "----- END AGENT TASK PACKAGE -----",
  ].join("\n");
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function extractJsonObject(text) {
  const cleaned = stripCodeFences(text).trim();
  const directTry = tryParseJson(cleaned);
  if (directTry.ok) {
    return directTry.value;
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("未找到可解析的 JSON 对象");
  }

  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  const parsed = tryParseJson(candidate);
  if (!parsed.ok) {
    throw parsed.error;
  }

  return parsed.value;
}

function sanitizeRelativeArtifactPath(relativePath) {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (!normalized || normalized === ".") {
    throw new Error(`非法 artifact 路径: ${relativePath}`);
  }

  if (normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
    throw new Error(`artifact 路径必须位于目标目录内: ${relativePath}`);
  }

  return normalized;
}

async function writeArtifacts(targetDir, artifacts) {
  const writtenFiles = [];

  for (const artifact of artifacts) {
    const relativePath = sanitizeRelativeArtifactPath(artifact.path);
    const outputPath = path.join(targetDir, ...relativePath.split("/"));
    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, artifact.content, "utf8");
    writtenFiles.push(outputPath);
  }

  return writtenFiles;
}

function summarizePriorResults(results) {
  if (!results.length) {
    return "暂无前置阶段结果。";
  }

  return results
    .map((entry) => {
      const summary = entry.result?.summary || entry.rawText || entry.execution;
      return `- ${entry.phase} / ${entry.agentName}: ${truncate(String(summary), 100)}`;
    })
    .join("\n");
}

async function executeAgent({
  agentName,
  task,
  context = "",
  outputLanguage = "中文",
  responseMode = "plain",
  maxTokens = 4000,
  phase = "Ad-hoc",
  artifactType = "general",
  projectName = "unnamed-project",
  targetDir = "",
}) {
  const agent = await findAgent(agentName);

  if (!agent) {
    return {
      agentName,
      phase,
      artifactType,
      execution: "error",
      compliant: false,
      error: `未找到 agent: ${agentName}`,
    };
  }

  const prompt = buildAgentExecutionPrompt({
    agent,
    task,
    context,
    outputLanguage,
    responseMode,
    phase,
    artifactType,
    projectName,
    targetDir,
  });

  try {
    const rawText = await runSamplingPrompt(prompt, maxTokens);

    if (responseMode === "minimal-json") {
      const parsed = minimalResultSchema.parse(extractJsonObject(rawText));
      return {
        agentName: agent.name,
        phase,
        artifactType,
        execution: "sampling",
        compliant: true,
        rawText,
        result: parsed,
      };
    }

    if (responseMode === "full-artifact-json") {
      const parsed = fullWorkflowResultSchema.parse(extractJsonObject(rawText));
      return {
        agentName: agent.name,
        phase,
        artifactType,
        execution: "sampling",
        compliant: true,
        rawText,
        result: parsed,
      };
    }

    return {
      agentName: agent.name,
      phase,
      artifactType,
      execution: "sampling",
      compliant: true,
      rawText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      agentName: agent.name,
      phase,
      artifactType,
      execution: "fallback",
      compliant: false,
      error: message,
      rawText: buildFallbackExecutionPackage({
        agent,
        task,
        context,
        outputLanguage,
        responseMode,
        phase,
        artifactType,
        projectName,
        targetDir,
      }),
    };
  }
}

function getGovernedWorkflowSteps(includeInfrastructure = false) {
  const steps = [
    {
      id: "phase-0",
      phase: "Phase 0",
      agentName: "orchestrator",
      artifactType: "execution-plan",
      task: (input) => `为项目“${input.projectName}”输出极简阶段计划、关键人工检查点与子Agent交接顺序。`,
    },
    {
      id: "phase-1",
      phase: "Phase 1",
      agentName: "product-manager",
      artifactType: "PRD",
      task: (input) => `基于需求输出极简 MVP PRD，只保留核心功能、排除项与验收标准。需求：${input.userRequest}`,
    },
    {
      id: "phase-2",
      phase: "Phase 2",
      agentName: "software-architect",
      artifactType: "TECH_SPEC/API_CONTRACT/DB_SCHEMA",
      task: () => "输出极简技术契约，覆盖技术栈、最小 API、数据库表和部署变量。",
    },
    {
      id: "phase-2-5",
      phase: "Phase 2.5",
      agentName: "ui-designer",
      artifactType: "DESIGN_SYSTEM",
      task: () => "输出极简设计规范，覆盖颜色、字号、间距与核心组件约束。",
    },
    {
      id: "phase-4",
      phase: "Phase 4",
      agentName: "database-optimizer",
      artifactType: "migration-plan",
      task: () => "输出极简数据库迁移与索引方案，仅覆盖最小业务表。",
    },
    {
      id: "phase-5",
      phase: "Phase 5",
      agentName: "backend-architect",
      artifactType: "backend-implementation",
      task: () => "输出极简后端实现摘要，限定为最小接口、错误处理和契约遵循点。",
    },
    {
      id: "phase-5-qa",
      phase: "Phase 5 QA",
      agentName: "testing-evidence-collector",
      artifactType: "backend-qa",
      task: () => "以最小证据格式验证后端实现是否符合接口契约。",
    },
    {
      id: "phase-6",
      phase: "Phase 6",
      agentName: "frontend-developer",
      artifactType: "frontend-implementation",
      task: () => "输出极简前端实现摘要，限定页面、组件、API 绑定与变量使用。",
    },
    {
      id: "phase-6-qa",
      phase: "Phase 6 QA",
      agentName: "testing-evidence-collector",
      artifactType: "frontend-qa",
      task: () => "以最小证据格式验证前端实现是否符合契约和设计系统。",
    },
    {
      id: "phase-7",
      phase: "Phase 7",
      agentName: "security-engineer",
      artifactType: "security-report",
      task: () => "输出极简安全审查结论，覆盖鉴权、输入校验和敏感信息风险。",
    },
    {
      id: "phase-8",
      phase: "Phase 8",
      agentName: "code-reviewer",
      artifactType: "review-report",
      task: () => "输出极简代码审查结论，只保留 blocker、建议和结论。",
    },
    {
      id: "phase-9",
      phase: "Phase 9",
      agentName: "devops-automator",
      artifactType: "deployment-checklist",
      task: () => "输出极简部署清单，覆盖本地运行、环境变量和 MCP 接入要求。",
    },
    {
      id: "phase-10",
      phase: "Phase 10",
      agentName: "reality-checker",
      artifactType: "acceptance-report",
      task: () => "给出 READY 或 NEEDS WORK 的最小验收结论，并说明原因。",
    },
    {
      id: "phase-11",
      phase: "Phase 11",
      agentName: "technical-writer",
      artifactType: "delivery-docs",
      task: () => "输出极简交付文档摘要，覆盖 README、API 文档和启动方式。",
    },
  ];

  if (includeInfrastructure) {
    steps.push(
      {
        id: "phase-12",
        phase: "Phase 12",
        agentName: "infra-bootstrap-agent",
        artifactType: "infra-bootstrap",
        task: () => "输出极简基础设施初始化说明。",
      },
      {
        id: "phase-13",
        phase: "Phase 13",
        agentName: "app-deploy-agent",
        artifactType: "app-deploy",
        task: () => "输出极简应用部署步骤与 deploy.yaml 约束。",
      },
    );
  }

  return steps;
}

function getFullWorkflowSteps(includeInfrastructure = false) {
  const steps = [
    {
      id: "phase-0",
      phase: "Phase 0",
      agentName: "orchestrator",
      artifactType: "execution-plan",
      task: (input) => `为项目“${input.projectName}”生成完整执行计划、阶段说明、人工检查点和主子 Agent 调度顺序，并写成可落盘文档。`,
    },
    {
      id: "phase-1",
      phase: "Phase 1",
      agentName: "product-manager",
      artifactType: "PRD",
      task: (input) => `基于需求输出完整 PRD，要求包含项目概述、目标用户、MVP 范围、排除项、用户故事、验收标准、非功能需求与假设。需求：${input.userRequest}`,
    },
    {
      id: "phase-2",
      phase: "Phase 2",
      agentName: "software-architect",
      artifactType: "TECH_SPEC/API_CONTRACT/DB_SCHEMA/DYNAMIC_CONTENT_MAP",
      task: () => "输出完整技术契约，至少生成 TECH_SPEC、API_CONTRACT、DB_SCHEMA、DYNAMIC_CONTENT_MAP 四个文件。",
    },
    {
      id: "phase-2-5",
      phase: "Phase 2.5",
      agentName: "ui-designer",
      artifactType: "DESIGN_SYSTEM/variables.css",
      task: () => "输出完整设计系统文档和可直接使用的 CSS 变量文件。",
    },
    {
      id: "phase-3",
      phase: "Phase 3",
      agentName: "orchestrator",
      artifactType: "tasklists",
      task: () => "基于契约拆分完整后端任务清单和前端任务清单，分别输出到 project-tasks 目录。",
    },
    {
      id: "phase-4",
      phase: "Phase 4",
      agentName: "database-optimizer",
      artifactType: "database-implementation",
      task: () => "输出数据库迁移、模型定义和迁移运行脚本，要求可直接落盘。",
    },
    {
      id: "phase-5",
      phase: "Phase 5",
      agentName: "backend-architect",
      artifactType: "backend-implementation",
      task: () => "输出完整后端代码骨架和关键接口实现文件，必须匹配 API_CONTRACT。",
    },
    {
      id: "phase-5-qa",
      phase: "Phase 5 QA",
      agentName: "testing-evidence-collector",
      artifactType: "backend-qa-report",
      task: () => "输出完整后端 QA 报告，包含验证项、证据摘要和 PASS/FAIL 结论。",
    },
    {
      id: "phase-6",
      phase: "Phase 6",
      agentName: "frontend-developer",
      artifactType: "frontend-implementation",
      task: () => "输出完整前端页面、组件、API 调用层与入口文件，必须遵循设计系统和接口契约。",
    },
    {
      id: "phase-6-qa",
      phase: "Phase 6 QA",
      agentName: "testing-evidence-collector",
      artifactType: "frontend-qa-report",
      task: () => "输出完整前后端累计 QA 报告，覆盖前端渲染、契约字段和变量使用检查。",
    },
    {
      id: "phase-7",
      phase: "Phase 7",
      agentName: "security-engineer",
      artifactType: "security-report",
      task: () => "输出完整安全审查报告，覆盖威胁点、风险等级、结论与建议。",
    },
    {
      id: "phase-8",
      phase: "Phase 8",
      agentName: "code-reviewer",
      artifactType: "review-report",
      task: () => "输出完整代码评审报告，覆盖正确性、可维护性和风险项。",
    },
    {
      id: "phase-9",
      phase: "Phase 9",
      agentName: "devops-automator",
      artifactType: "deployment-files",
      task: () => "输出完整部署配置，包括 Dockerfile、docker-compose.yml、环境变量模板和部署说明。",
    },
    {
      id: "phase-10",
      phase: "Phase 10",
      agentName: "reality-checker",
      artifactType: "acceptance-report",
      task: () => "输出完整验收报告，必须给出 READY 或 NEEDS WORK 结论与理由。",
    },
    {
      id: "phase-11",
      phase: "Phase 11",
      agentName: "technical-writer",
      artifactType: "delivery-docs",
      task: () => "输出完整交付文档，包括项目 README 和 API_DOC。",
    },
  ];

  if (includeInfrastructure) {
    steps.push(
      {
        id: "phase-12",
        phase: "Phase 12",
        agentName: "infra-bootstrap-agent",
        artifactType: "infra-bootstrap",
        task: () => "输出完整基础设施初始化文档和必要配置。",
      },
      {
        id: "phase-13",
        phase: "Phase 13",
        agentName: "app-deploy-agent",
        artifactType: "app-deploy",
        task: () => "输出完整应用部署文档与 deploy.yaml。",
      },
    );
  }

  return steps;
}

async function runWorkflowGeneric({
  projectName,
  userRequest,
  outputLanguage = "中文",
  responseMode,
  includeInfrastructure = false,
  maxTokens = 3000,
  targetDir = "",
  steps,
  writeArtifactsToDisk = false,
}) {
  const results = [];
  let overallStatus = "ok";
  const allWrittenFiles = [];

  if (targetDir && writeArtifactsToDisk) {
    await ensureDir(targetDir);
  }

  for (const step of steps) {
    const context = [
      `项目名: ${projectName}`,
      `原始需求: ${userRequest}`,
      `目标目录: ${targetDir || "(none)"}`,
      "前置阶段摘要:",
      summarizePriorResults(results),
    ].join("\n");

    const execution = await executeAgent({
      agentName: step.agentName,
      task: step.task({ projectName, userRequest, results, targetDir }),
      context,
      outputLanguage,
      responseMode,
      maxTokens,
      phase: step.phase,
      artifactType: step.artifactType,
      projectName,
      targetDir,
    });

    const record = {
      id: step.id,
      ...execution,
      writtenFiles: [],
    };

    if (!execution.compliant) {
      overallStatus = execution.execution === "fallback" ? "fallback" : "needs_review";
      results.push(record);
      break;
    }

    if (writeArtifactsToDisk && targetDir && execution.result?.artifacts?.length) {
      const writtenFiles = await writeArtifacts(targetDir, execution.result.artifacts);
      record.writtenFiles = writtenFiles;
      allWrittenFiles.push(...writtenFiles);
    }

    results.push(record);

    if (execution.result?.status && execution.result.status !== "ok") {
      overallStatus = execution.result.status;
      break;
    }
  }

  return {
    projectName,
    userRequest,
    responseMode,
    overallStatus,
    completedSteps: results.length,
    plannedSteps: steps.length,
    includeInfrastructure,
    targetDir,
    checkpoints: [
      "Phase 1 后确认 PRD",
      "Phase 2 后确认 API_CONTRACT / DB_SCHEMA / TECH_SPEC",
      "任意超限重试时人工介入",
    ],
    writtenFileCount: allWrittenFiles.length,
    writtenFiles: allWrittenFiles,
    results,
  };
}

server.registerTool(
  "health_check",
  {
    description: "检查本地 MCP 服务和源仓库是否就绪。",
    inputSchema: {},
  },
  async () => {
    const sourceExists = await pathExists(SOURCE_REPO_PATH);
    const agentsExist = await pathExists(AGENTS_DIR);
    const workflowExists = await pathExists(WORKFLOW_FILE);
    const agents = agentsExist ? await loadAgents() : [];

    return asText(
      [
        `server: ${SERVER_NAME}@${SERVER_VERSION}`,
        `sourceRepo: ${SOURCE_REPO_PATH}`,
        `sourceRepoExists: ${sourceExists}`,
        `agentsDirExists: ${agentsExist}`,
        `workflowFileExists: ${workflowExists}`,
        `agentCount: ${agents.length}`,
        "executionMode: prompt-registry + governed-workflow + full-workflow",
      ].join("\n"),
    );
  },
);

server.registerTool(
  "list_agents",
  {
    description: "列出标准团队中的所有 agent 及其元数据。",
    inputSchema: {
      includePromptBody: z.boolean().optional().default(false).describe("是否附带完整 prompt 正文"),
    },
  },
  async ({ includePromptBody = false }) => {
    const agents = await loadAgents();
    const text = agents
      .map((agent) => formatAgentSummary(agent, includePromptBody))
      .join("\n\n---\n\n");
    return asText(text);
  },
);

server.registerTool(
  "get_agent_prompt",
  {
    description: "获取指定 agent 的完整 prompt、模型建议和职责说明。",
    inputSchema: {
      agentName: z.string().describe("agent 名称，如 orchestrator、product-manager"),
    },
  },
  async ({ agentName }) => {
    const agent = await findAgent(agentName);

    if (!agent) {
      return asText(`未找到 agent: ${agentName}`);
    }

    return asText(formatAgentSummary(agent, true));
  },
);

server.registerTool(
  "get_workflow_summary",
  {
    description: "读取标准团队工作流摘要，返回阶段与人工检查点说明。",
    inputSchema: {
      includePhaseDetails: z.boolean().optional().default(true).describe("是否输出每个阶段的摘要"),
    },
  },
  async ({ includePhaseDetails = true }) => {
    const workflow = await loadWorkflow();
    const lines = [
      "标准团队工作流摘要",
      `sourceRepo: ${SOURCE_REPO_PATH}`,
      `phaseCount: ${workflow.phases.length}`,
    ];

    if (includePhaseDetails) {
      lines.push("");
      workflow.phases.forEach((phase, index) => {
        lines.push(`${index + 1}. ${phase.title}`);
        lines.push(truncate(stripCodeFences(phase.summary), 600));
        lines.push("");
      });
    }

    if (workflow.workflowMarkdown) {
      lines.push("WORKFLOW.md 摘要:");
      lines.push(truncate(workflow.workflowMarkdown, 1500));
    }

    return asText(lines.join("\n"));
  },
);

server.registerTool(
  "build_execution_plan",
  {
    description: "根据用户需求生成标准团队的推荐执行计划。",
    inputSchema: {
      userRequest: z.string().describe("用户的原始需求"),
      includeInfrastructure: z.boolean().optional().default(false).describe("是否纳入可选基建层 agent"),
      mode: z
        .enum(["prompt-only", "sampling-first", "governed-workflow", "full-workflow"])
        .optional()
        .default("full-workflow")
        .describe("full-workflow 表示完整流程产物模式"),
    },
  },
  async ({ userRequest, includeInfrastructure = false, mode = "full-workflow" }) => {
    const workflow = await loadWorkflow();
    return asText(
      formatPlan(userRequest, workflow.phases, {
        includeInfrastructure,
        mode,
      }),
    );
  },
);

server.registerTool(
  "run_agent",
  {
    description:
      "运行单个 agent。若宿主支持 MCP sampling，则由本地 MCP 发起模型调用；否则返回可直接复用的 agent task package。",
    inputSchema: {
      agentName: z.string().describe("agent 名称"),
      task: z.string().describe("交给该 agent 的具体任务"),
      context: z.string().optional().describe("补充上下文，如项目背景、已有文档摘要"),
      outputLanguage: z.string().optional().default("中文").describe("期望输出语言"),
      responseMode: z.enum(["plain", "minimal-json", "full-artifact-json"]).optional().default("plain").describe("输出模式"),
      projectName: z.string().optional().default("ad-hoc-project").describe("项目名"),
      phase: z.string().optional().default("Ad-hoc").describe("阶段名"),
      artifactType: z.string().optional().default("general").describe("产物类型"),
      targetDir: z.string().optional().default("").describe("目标目录"),
      maxTokens: z.number().int().positive().optional().default(4000).describe("sampling 模式下的最大输出 token"),
    },
  },
  async ({
    agentName,
    task,
    context = "",
    outputLanguage = "中文",
    responseMode = "plain",
    projectName = "ad-hoc-project",
    phase = "Ad-hoc",
    artifactType = "general",
    targetDir = "",
    maxTokens = 4000,
  }) => {
    const execution = await executeAgent({
      agentName,
      task,
      context,
      outputLanguage,
      responseMode,
      projectName,
      phase,
      artifactType,
      targetDir,
      maxTokens,
    });

    if (execution.execution === "fallback") {
      return asText(
        [
          `agent: ${execution.agentName}`,
          `phase: ${phase}`,
          "execution: fallback",
          "",
          execution.rawText,
          "",
          `samplingError: ${execution.error}`,
        ].join("\n"),
      );
    }

    if (responseMode === "minimal-json" || responseMode === "full-artifact-json") {
      return jsonText({
        execution: execution.execution,
        compliant: execution.compliant,
        result: execution.result,
      });
    }

    return asText(
      [
        `agent: ${execution.agentName}`,
        `phase: ${phase}`,
        `execution: ${execution.execution}`,
        "",
        execution.rawText || "模型未返回文本内容。",
      ].join("\n"),
    );
  },
);

server.registerTool(
  "run_orchestrator",
  {
    description:
      "使用 orchestrator 生成项目推进建议。若宿主支持 sampling，则直接产出总指挥视角的计划；否则返回完整 orchestrator task package。",
    inputSchema: {
      userRequest: z.string().describe("用户原始需求"),
      context: z.string().optional().describe("附加项目上下文"),
      outputLanguage: z.string().optional().default("中文").describe("输出语言"),
      responseMode: z.enum(["plain", "minimal-json", "full-artifact-json"]).optional().default("minimal-json").describe("输出模式"),
      projectName: z.string().optional().default("workflow-project").describe("项目名"),
      targetDir: z.string().optional().default("").describe("目标目录"),
      maxTokens: z.number().int().positive().optional().default(5000).describe("sampling 模式下最大输出 token"),
    },
  },
  async ({
    userRequest,
    context = "",
    outputLanguage = "中文",
    responseMode = "minimal-json",
    projectName = "workflow-project",
    targetDir = "",
    maxTokens = 5000,
  }) => {
    const task = [
      "基于标准团队流程处理以下需求。",
      "如果信息不足，先列出关键假设。",
      "输出应优先包含：推荐执行阶段、人工检查点、风险项、对子 Agent 的交接。",
      "",
      userRequest,
    ].join("\n");

    const execution = await executeAgent({
      agentName: "orchestrator",
      task,
      context,
      outputLanguage,
      responseMode,
      projectName,
      phase: "Phase 0",
      artifactType: "execution-plan",
      targetDir,
      maxTokens,
    });

    if (execution.execution === "fallback") {
      return asText(
        [
          "agent: orchestrator",
          "execution: fallback",
          "",
          execution.rawText,
          "",
          `samplingError: ${execution.error}`,
        ].join("\n"),
      );
    }

    if (responseMode === "minimal-json" || responseMode === "full-artifact-json") {
      return jsonText({
        execution: execution.execution,
        compliant: execution.compliant,
        result: execution.result,
      });
    }

    return asText(
      [
        "agent: orchestrator",
        `execution: ${execution.execution}`,
        "",
        execution.rawText || "模型未返回文本内容。",
      ].join("\n"),
    );
  },
);

server.registerTool(
  "run_governed_workflow",
  {
    description:
      "以受控模式运行一个最小化多 Agent 工作流，由主 Agent 先规划，再顺序调度各子 Agent，并校验最小化 JSON 输出。",
    inputSchema: {
      projectName: z.string().describe("项目名"),
      userRequest: z.string().describe("业务需求"),
      outputLanguage: z.string().optional().default("中文").describe("输出语言"),
      responseMode: z.enum(["minimal-json"]).optional().default("minimal-json").describe("当前仅支持 minimal-json"),
      includeInfrastructure: z.boolean().optional().default(false).describe("是否纳入可选基建层 agent"),
      maxTokens: z.number().int().positive().optional().default(3000).describe("单步 sampling 最大 token"),
    },
  },
  async ({
    projectName,
    userRequest,
    outputLanguage = "中文",
    responseMode = "minimal-json",
    includeInfrastructure = false,
    maxTokens = 3000,
  }) => {
    const result = await runWorkflowGeneric({
      projectName,
      userRequest,
      outputLanguage,
      responseMode,
      includeInfrastructure,
      maxTokens,
      steps: getGovernedWorkflowSteps(includeInfrastructure),
      writeArtifactsToDisk: false,
    });

    return jsonText(result);
  },
);

server.registerTool(
  "run_full_workflow",
  {
    description:
      "运行完整 Phase 0 到 Phase 11 的多 Agent 工作流，并把阶段产物写入目标目录。宿主需支持 sampling，才能真正自动执行。",
    inputSchema: {
      projectName: z.string().describe("项目名"),
      userRequest: z.string().describe("业务需求"),
      targetDir: z.string().describe("完整流程产物落盘目录"),
      outputLanguage: z.string().optional().default("中文").describe("输出语言"),
      includeInfrastructure: z.boolean().optional().default(false).describe("是否纳入可选基建层 agent"),
      maxTokens: z.number().int().positive().optional().default(5000).describe("单步 sampling 最大 token"),
    },
  },
  async ({
    projectName,
    userRequest,
    targetDir,
    outputLanguage = "中文",
    includeInfrastructure = false,
    maxTokens = 5000,
  }) => {
    const resolvedTargetDir = path.resolve(targetDir);
    const result = await runWorkflowGeneric({
      projectName,
      userRequest,
      outputLanguage,
      responseMode: "full-artifact-json",
      includeInfrastructure,
      maxTokens,
      targetDir: resolvedTargetDir,
      steps: getFullWorkflowSteps(includeInfrastructure),
      writeArtifactsToDisk: true,
    });

    return jsonText(result);
  },
);

async function main() {
  if (!(await pathExists(SOURCE_REPO_PATH))) {
    throw new Error(`Source repo not found: ${SOURCE_REPO_PATH}`);
  }

  if (!(await pathExists(AGENTS_DIR))) {
    throw new Error(`Agents directory not found: ${AGENTS_DIR}`);
  }

  await ensureDir(path.join(__dirname, "reports"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal error:`, error);
  process.exit(1);
});
