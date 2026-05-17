import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSourcePath = path.resolve(__dirname, "..", "claude-standard-dev-team");

function getText(result) {
  if (!result?.content) {
    return "";
  }

  return result.content
    .map((item) => (item.type === "text" ? item.text : JSON.stringify(item)))
    .join("\n");
}

function summarize(text, limit = 360) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n...[truncated]`;
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
  cwd: process.cwd(),
  stderr: "pipe",
  env: {
    ...process.env,
    TEAM_SOURCE_PATH: process.env.TEAM_SOURCE_PATH || defaultSourcePath,
  },
});

if (transport.stderr) {
  transport.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });
}

const client = new Client(
  {
    name: "claude-standard-dev-team-smoke-test",
    version: "0.1.0",
  },
  {
    capabilities: {},
  },
);

try {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("TOOLS");
  console.log(tools.tools.map((tool) => tool.name).join(", "));
  console.log("");

  const health = await client.callTool({
    name: "health_check",
    arguments: {},
  });
  console.log("HEALTH_CHECK");
  console.log(getText(health));
  console.log("");

  const fallbackAgent = await client.callTool({
    name: "run_agent",
    arguments: {
      agentName: "product-manager",
      task: "为一个本地 MCP 多 agent 封装方案列出 3 条 MVP 范围建议",
      outputLanguage: "中文",
    },
  });
  console.log("RUN_AGENT");
  console.log(summarize(getText(fallbackAgent)));
} finally {
  await client.close();
}
