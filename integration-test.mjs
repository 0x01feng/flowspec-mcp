import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.join(__dirname, "reports");
const fullWorkflowDir = path.join(reportsDir, "full-workflow-demo");
const defaultSourcePath = path.resolve(__dirname, "..", "claude-standard-dev-team");

const REQUIRED_FILES = [
  "docs/EXECUTION_PLAN.md",
  "docs/PRD.md",
  "docs/TECH_SPEC.md",
  "docs/API_CONTRACT.md",
  "docs/DB_SCHEMA.md",
  "docs/DESIGN_SYSTEM.md",
  "project-tasks/backend-tasklist.md",
  "project-tasks/frontend-tasklist.md",
  "backend/migrations/001_init.sql",
  "backend/src/server.js",
  "frontend/src/App.tsx",
  "docs/QA_REPORT.md",
  "docs/SECURITY_REPORT.md",
  "docs/REVIEW_REPORT.md",
  "docs/ACCEPTANCE_REPORT.md",
  "docs/API_DOC.md",
  "README.md",
  "docker-compose.yml",
];

function txt(result) {
  return (result?.content || []).map((item) => item.type === "text" ? item.text : JSON.stringify(item)).join("\n");
}

function json(result) {
  return JSON.parse(txt(result));
}

function pick(prompt, label, fallback = "") {
  const match = prompt.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : fallback;
}

function md(title, lines = []) {
  return `# ${title}\n\n${lines.join("\n")}\n`;
}

function file(pathValue, kind, description, content) {
  return { path: pathValue, kind, description, content };
}

function phaseArtifacts(agent, phase, projectName) {
  const map = {
    "orchestrator|Phase 0": [
      file("docs/EXECUTION_PLAN.md", "doc", "Execution plan", md("Execution Plan", [`Project: ${projectName}`, "- Phase 0 -> Phase 11"])),
    ],
    "product-manager|Phase 1": [
      file("docs/PRD.md", "doc", "PRD", md("PRD", ["- Create task", "- List tasks", "- Toggle completed"])),
    ],
    "software-architect|Phase 2": [
      file("docs/TECH_SPEC.md", "doc", "Tech spec", md("Tech Spec", ["- React + Vite", "- Express"])),
      file("docs/API_CONTRACT.md", "doc", "API contract", md("API Contract", ["- GET /api/v1/tasks", "- POST /api/v1/tasks", "- PATCH /api/v1/tasks/:id"])),
      file("docs/DB_SCHEMA.md", "doc", "DB schema", md("DB Schema", ["- tasks(id,title,completed,created_at)"])),
      file("docs/DYNAMIC_CONTENT_MAP.md", "doc", "Dynamic map", md("Dynamic Content Map", ["- title -> data[].title"])),
    ],
    "ui-designer|Phase 2.5": [
      file("docs/DESIGN_SYSTEM.md", "doc", "Design system", md("Design System", ["- Primary color", "- Spacing scale"])),
      file("frontend/src/styles/variables.css", "style", "CSS variables", ":root {\n  --color-primary: #2563eb;\n  --space-4: 16px;\n}\n"),
    ],
    "orchestrator|Phase 3": [
      file("project-tasks/backend-tasklist.md", "tasklist", "Backend tasks", md("Backend Tasks", ["- Build API", "- Add validation"])),
      file("project-tasks/frontend-tasklist.md", "tasklist", "Frontend tasks", md("Frontend Tasks", ["- Build page", "- Bind API"])),
    ],
    "database-optimizer|Phase 4": [
      file("backend/migrations/001_init.sql", "migration", "Init migration", "CREATE TABLE tasks (id INTEGER PRIMARY KEY, title VARCHAR(255), completed BOOLEAN, created_at DATETIME);\n"),
      file("backend/src/models/task.model.js", "code", "Task model", "export const createTaskRecord = (id, title) => ({ id, title, completed: false });\n"),
      file("backend/scripts/migrate.js", "script", "Migrate", "console.log('migrate');\n"),
      file("backend/scripts/start.js", "script", "Start", "console.log('start');\n"),
    ],
    "backend-architect|Phase 5": [
      file("backend/package.json", "config", "Backend package", '{"name":"todo-lite-backend","type":"module","scripts":{"start":"node src/server.js"}}'),
      file("backend/src/store.js", "code", "Store", "export const tasks = [];\n"),
      file("backend/src/routes/tasks.js", "code", "Routes", "export const tasksRouter = {};\n"),
      file("backend/src/server.js", "code", "Server", "console.log('backend server');\n"),
    ],
    "testing-evidence-collector|Phase 5 QA": [
      file("docs/QA_REPORT.md", "report", "QA report", md("QA Report", ["- Backend PASS", "- Frontend pending"])),
    ],
    "frontend-developer|Phase 6": [
      file("frontend/package.json", "config", "Frontend package", '{"name":"todo-lite-frontend","type":"module","scripts":{"dev":"vite","build":"vite build"}}'),
      file("frontend/src/services/api.ts", "code", "API layer", "const API_BASE = import.meta.env.VITE_API_BASE ?? '';\nexport async function fetchTasks() { return []; }\n"),
      file("frontend/src/components/TaskForm.tsx", "code", "Task form", "export function TaskForm() { return null; }\n"),
      file("frontend/src/components/TaskList.tsx", "code", "Task list", "export function TaskList() { return null; }\n"),
      file("frontend/src/App.tsx", "code", "App", "export default function App() { return null; }\n"),
      file("frontend/src/main.tsx", "code", "Main", "console.log('frontend main');\n"),
    ],
    "testing-evidence-collector|Phase 6 QA": [
      file("docs/QA_REPORT.md", "report", "QA report", md("QA Report", ["- Backend PASS", "- Frontend PASS", "- Result PASS"])),
    ],
    "security-engineer|Phase 7": [
      file("docs/SECURITY_REPORT.md", "report", "Security report", md("Security Report", ["- Validation present", "- Risk low"])),
    ],
    "code-reviewer|Phase 8": [
      file("docs/REVIEW_REPORT.md", "report", "Review report", md("Review Report", ["- No blockers"])),
    ],
    "devops-automator|Phase 9": [
      file("Dockerfile", "config", "Dockerfile", "FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"backend/src/server.js\"]\n"),
      file("docker-compose.yml", "config", "Compose", "version: '3.9'\nservices:\n  backend:\n    image: node:20-alpine\n"),
      file(".env.example", "config", "Env", "PORT=3000\nVITE_API_BASE=\nVITE_BASE_URL=/\n"),
      file("frontend/.env.production", "config", "Frontend env", "VITE_API_BASE=/todo-lite\nVITE_BASE_URL=/todo-lite/\n"),
    ],
    "reality-checker|Phase 10": [
      file("docs/ACCEPTANCE_REPORT.md", "report", "Acceptance report", md("Acceptance Report", ["- READY"])),
    ],
    "technical-writer|Phase 11": [
      file("README.md", "doc", "Project README", md("Todo Lite", ["- backend: npm start", "- frontend: npm run dev"])),
      file("docs/API_DOC.md", "doc", "API doc", md("API Doc", ["- GET /api/v1/tasks", "- POST /api/v1/tasks", "- PATCH /api/v1/tasks/:id"])),
    ],
  };
  return map[`${agent}|${phase}`] || [file(`docs/${phase.replace(/\s+/g, "_")}.md`, "doc", "Default doc", md(phase, [agent]))];
}

function fullPayload(agent, phase, artifactType, projectName) {
  return {
    agent,
    phase,
    artifactType,
    summary: `${agent} completed ${phase}`,
    status: "ok",
    decision: phase === "Phase 10" ? "READY" : "PASS",
    handoffTo: [],
    notes: [],
    compliance: { minimal: false, followsRole: true, notes: [] },
    artifacts: phaseArtifacts(agent, phase, projectName),
  };
}

function minimalPayload(agent, phase, artifactType) {
  return {
    agent,
    phase,
    artifactType,
    summary: `${agent} minimal output`,
    outputs: [artifactType],
    status: "ok",
    decision: "PASS",
    handoffTo: [],
    compliance: { minimal: true, followsRole: true, notes: [] },
  };
}

async function samplingCallback(params) {
  const first = params.messages?.[0]?.content;
  const prompt = first?.type === "text" ? first.text : Array.isArray(first) ? first.filter((x) => x.type === "text").map((x) => x.text).join("\n") : "";
  const agent = pick(prompt, "Agent Name", "unknown-agent");
  const phase = pick(prompt, "Phase", "Unknown Phase");
  const artifactType = pick(prompt, "Artifact Type", "general");
  const projectName = pick(prompt, "Project Name", "unnamed-project");
  const responseMode = pick(prompt, "Response Mode", "plain");
  const payload = responseMode === "full-artifact-json" ? fullPayload(agent, phase, artifactType, projectName) : responseMode === "minimal-json" ? minimalPayload(agent, phase, artifactType) : { text: `${agent} handled ${phase}` };
  return { model: "mock-mcp-host", role: "assistant", content: { type: "text", text: JSON.stringify(payload, null, 2) } };
}

async function exists(baseDir, relativePath) {
  try {
    await fs.access(path.join(baseDir, ...relativePath.split("/")));
    return true;
  } catch {
    return false;
  }
}
async function main() {
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.rm(fullWorkflowDir, { recursive: true, force: true });
  await fs.mkdir(fullWorkflowDir, { recursive: true });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["server.js"],
    cwd: __dirname,
    stderr: "pipe",
    env: { ...process.env, TEAM_SOURCE_PATH: process.env.TEAM_SOURCE_PATH || defaultSourcePath },
  });
  if (transport.stderr) transport.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const client = new Client({ name: "integration-test", version: "0.3.0" }, { capabilities: { sampling: {} } });
  client.setRequestHandler(CreateMessageRequestSchema, async (request) => samplingCallback(request.params));

  try {
    await client.connect(transport);
    const startedAt = new Date().toISOString();
    const tools = await client.listTools();
    const health = await client.callTool({ name: "health_check", arguments: {} });
    const orchestratorResult = await client.callTool({ name: "run_orchestrator", arguments: { projectName: "todo-lite-full-demo", userRequest: "Build Todo Lite app", responseMode: "full-artifact-json", outputLanguage: "English", targetDir: fullWorkflowDir } });
    const workflowResult = await client.callTool({ name: "run_full_workflow", arguments: { projectName: "todo-lite-full-demo", userRequest: "Build Todo Lite app", targetDir: fullWorkflowDir, outputLanguage: "English", includeInfrastructure: false } });

    const orchestratorJson = json(orchestratorResult);
    const workflowJson = json(workflowResult);
    const missingFiles = [];
    for (const item of REQUIRED_FILES) {
      if (!(await exists(fullWorkflowDir, item))) missingFiles.push(item);
    }

    const validations = {
      toolDiscovery: tools.tools.length >= 9,
      orchestratorExecution: orchestratorJson.execution === "sampling" && orchestratorJson.compliant === true,
      workflowCompleted: workflowJson.overallStatus === "ok" && workflowJson.completedSteps === workflowJson.plannedSteps,
      fullPhaseCoverage: workflowJson.plannedSteps === 15 && workflowJson.completedSteps === 15,
      filesWritten: workflowJson.writtenFileCount >= REQUIRED_FILES.length,
      requiredFilesExist: missingFiles.length === 0,
      finalReady: workflowJson.results.some((item) => item.agentName === "reality-checker" && item.result?.decision === "READY"),
      fullModeUsed: workflowJson.results.every((item) => item.execution === "sampling" && item.compliant === true && item.result?.compliance?.minimal === false),
    };

    const passed = Object.values(validations).every(Boolean);
    const report = {
      meta: { startedAt, finishedAt: new Date().toISOString(), nodeVersion: process.version, workflowDir: path.relative(__dirname, fullWorkflowDir) },
      validations,
      passed,
      tools: tools.tools.map((tool) => tool.name),
      health: txt(health),
      missingFiles,
    };

    const markdown = [
      "# Full Workflow Integration Report",
      `- result: ${passed ? "PASS" : "FAIL"}`,
      `- workflowDir: ${path.relative(__dirname, fullWorkflowDir)}`,
      "## Validations",
      ...Object.entries(validations).map(([key, value]) => `- ${key}: ${value ? "PASS" : "FAIL"}`),
      "## Files",
      ...REQUIRED_FILES.map((name) => `- ${name}: ${missingFiles.includes(name) ? "MISSING" : "OK"}`),
    ].join("\n");

    await fs.writeFile(path.join(reportsDir, "integration-report.json"), JSON.stringify(report, null, 2), "utf8");
    await fs.writeFile(path.join(reportsDir, "integration-report.md"), markdown, "utf8");

    console.log("FULL_INTEGRATION_TEST");
    console.log(`passed=${passed}`);
    console.log(`tools=${tools.tools.length}`);
    console.log(`workflow=${workflowJson.completedSteps}/${workflowJson.plannedSteps}`);
    console.log(`writtenFiles=${workflowJson.writtenFileCount}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("FULL_INTEGRATION_TEST_ERROR", error);
  process.exit(1);
});
