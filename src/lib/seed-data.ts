import type { IntegrationType, IntegrationUpdateContext } from "@/types/integrations";

export interface SeedIntegration {
  name: string;
  slug: string;
  type: IntegrationType;
  repo: string;
  health: "needs_audit";
  update_context: IntegrationUpdateContext;
}

export const SEED_INTEGRATIONS: SeedIntegration[] = [
  // ─── Official SDKs ───────────────────────────────────────────────
  {
    name: "exa-py",
    slug: "exa-py",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "Official Python SDK. This is the source of truth — when this changes, all Python-based integrations need checking.",
      key_files: ["exa_py/api.py", "exa_py/types.py", "pyproject.toml"],
      build_cmd: "poetry build",
      test_cmd: "poetry run pytest",
      publish_cmd: "poetry publish",
    },
  },
  {
    name: "exa-js",
    slug: "exa-js",
    type: "typescript",
    repo: "exa-labs/exa-js",
    health: "needs_audit",
    update_context: {
      notes:
        "Official TypeScript SDK. Source of truth for JS-based integrations. Published to npm.",
      key_files: ["src/index.ts", "src/types.ts", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "npm test",
      publish_cmd: "npm publish",
    },
  },

  // ─── Framework Integrations (Python) ─────────────────────────────
  {
    name: "LangChain (Python)",
    slug: "langchain-python",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "LangChain partner package lives in their monorepo under libs/partners/exa/. Uses poetry. Must PR to langchain-ai/langchain. Exa is a retriever + tool provider.",
      key_files: [
        "libs/partners/exa/langchain_exa/retrievers.py",
        "libs/partners/exa/langchain_exa/tools.py",
        "libs/partners/exa/pyproject.toml",
      ],
      build_cmd: "cd libs/partners/exa && poetry build",
      test_cmd: "cd libs/partners/exa && poetry run pytest",
      publish_cmd: "cd libs/partners/exa && poetry publish",
      external_repo: "langchain-ai/langchain",
      external_repo_path: "libs/partners/exa/",
    },
  },
  {
    name: "LangChain (JS)",
    slug: "langchain-js",
    type: "typescript",
    repo: "exa-labs/exa-js",
    health: "needs_audit",
    update_context: {
      notes:
        "LangChain JS integration. Lives in langchain-ai/langchainjs monorepo. Uses yarn workspaces.",
      key_files: [
        "libs/langchain-exa/src/retrievers.ts",
        "libs/langchain-exa/src/tools.ts",
        "libs/langchain-exa/package.json",
      ],
      build_cmd: "yarn build",
      test_cmd: "yarn test",
      publish_cmd: "yarn publish",
      external_repo: "langchain-ai/langchainjs",
      external_repo_path: "libs/langchain-exa/",
    },
  },
  {
    name: "LlamaIndex",
    slug: "llamaindex",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "LlamaIndex integration lives in run-llama/llama_index monorepo under llama-index-integrations/tools/llama-index-tools-exa/. Uses poetry.",
      key_files: [
        "llama-index-integrations/tools/llama-index-tools-exa/llama_index/tools/exa/base.py",
        "llama-index-integrations/tools/llama-index-tools-exa/pyproject.toml",
      ],
      build_cmd: "poetry build",
      test_cmd: "poetry run pytest",
      publish_cmd: "poetry publish",
      external_repo: "run-llama/llama_index",
      external_repo_path:
        "llama-index-integrations/tools/llama-index-tools-exa/",
    },
  },
  {
    name: "CrewAI",
    slug: "crewai",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "CrewAI tool integration. Exa is used as a tool via crewai-tools package. Check if the Exa tool wrapper in crewai-tools is using latest exa-py API surface.",
      key_files: [
        "crewai_tools/tools/exa_search_tool/exa_search_tool.py",
        "pyproject.toml",
      ],
      build_cmd: "poetry build",
      test_cmd: "poetry run pytest",
      publish_cmd: "poetry publish",
      external_repo: "crewAIInc/crewAI-tools",
      external_repo_path: "crewai_tools/tools/exa_search_tool/",
    },
  },
  {
    name: "Haystack",
    slug: "haystack",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "Haystack integration has TWO components: (1) exa-haystack PyPi package maintained by Exa, (2) PR to deepset-ai/haystack-core-integrations. Both must be updated together. The Haystack integration is a Retriever component.",
      key_files: [
        "integrations/exa/src/haystack_integrations/components/retrievers/exa/retriever.py",
        "integrations/exa/pyproject.toml",
      ],
      build_cmd: "cd integrations/exa && hatch build",
      test_cmd: "cd integrations/exa && hatch run test",
      publish_cmd: "hatch publish",
      external_repo: "deepset-ai/haystack-core-integrations",
      external_repo_path: "integrations/exa/",
    },
  },
  {
    name: "AutoGen",
    slug: "autogen",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "Microsoft AutoGen integration. Exa can be used as a tool in AutoGen agents. Check microsoft/autogen for Exa-related examples and tool wrappers.",
      key_files: ["autogen/tools/", "pyproject.toml"],
      build_cmd: "pip install -e .",
      test_cmd: "pytest",
      publish_cmd: "",
      external_repo: "microsoft/autogen",
    },
  },
  {
    name: "Google ADK",
    slug: "google-adk",
    type: "python",
    repo: "exa-labs/exa-py",
    health: "needs_audit",
    update_context: {
      notes:
        "Google Agent Development Kit integration. Exa is listed as a supported tool in the ADK ecosystem. Check docs.exa.ai/integrations for the latest guide.",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
      external_repo: "google/adk-python",
    },
  },

  // ─── No-Code / Low-Code Platforms ───────────────────────────────
  {
    name: "n8n",
    slug: "n8n",
    type: "typescript",
    repo: "exa-labs/n8n-integration",
    health: "needs_audit",
    update_context: {
      notes:
        "n8n community node. Uses TypeScript with n8n's declarative routing DSL. Does NOT use exa-js SDK — makes raw HTTP requests to the Exa API. Published to npm as n8n-nodes-exa-official. When Exa API changes, the node's operation descriptions and HTTP request logic must be updated.",
      key_files: [
        "nodes/Exa/Exa.node.ts",
        "credentials/ExaApi.credentials.ts",
        "package.json",
      ],
      build_cmd: "npm run build",
      test_cmd: "npm run lint",
      publish_cmd: "npm publish",
    },
  },
  {
    name: "Zapier",
    slug: "zapier",
    type: "other",
    repo: "",
    health: "needs_audit",
    update_context: {
      notes:
        "Zapier integration is managed via the Zapier Developer Platform (cloud config, not a git repo). Actions and triggers are configured in the Zapier web UI. When Exa API endpoints change, update the Zapier app definition.",
      key_files: [],
      build_cmd: "",
      test_cmd: "zapier test",
      publish_cmd: "zapier push",
    },
  },
  {
    name: "Make.com",
    slug: "make",
    type: "other",
    repo: "",
    health: "needs_audit",
    update_context: {
      notes:
        "Make.com (formerly Integromat) integration. Cloud-managed via Make's developer platform. Modules define Exa API operations. Update module definitions when API changes.",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
    },
  },

  // ─── Google Sheets ──────────────────────────────────────────────
  {
    name: "Exa for Sheets",
    slug: "exa-for-sheets",
    type: "sheets",
    repo: "exa-labs/exa-for-sheets",
    health: "needs_audit",
    update_context: {
      notes:
        "Google Sheets add-on using Google Apps Script. Does NOT use exa-py or exa-js — uses raw UrlFetchApp.fetch() to call Exa API directly. When API endpoints or params change, update Code.gs. Deployed via clasp.",
      key_files: ["Code.gs", "Sidebar.html", "appsscript.json"],
      build_cmd: "",
      test_cmd: "npm test",
      publish_cmd: "npm run push && npm run deploy",
    },
  },

  // ─── MCP Servers ────────────────────────────────────────────────
  {
    name: "Exa MCP Server",
    slug: "exa-mcp-server",
    type: "typescript",
    repo: "exa-labs/exa-mcp-server",
    health: "needs_audit",
    update_context: {
      notes:
        "MCP server for Claude Desktop, Cursor, VS Code, etc. Uses exa-js SDK. When exa-js adds new methods/params, the MCP tools should be updated to expose them.",
      key_files: ["src/index.ts", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "npm test",
      publish_cmd: "npm publish",
    },
  },
  {
    name: "Exa MCP Hosted",
    slug: "exa-mcp-hosted",
    type: "typescript",
    repo: "exa-labs/exa-mcp-hosted",
    health: "needs_audit",
    update_context: {
      notes:
        "Hosted variant of Exa MCP for remote/SSE connections. Should stay in sync with exa-mcp-server features.",
      key_files: ["src/index.ts", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "",
      publish_cmd: "",
    },
  },
  {
    name: "Exa Code MCP",
    slug: "exa-code-mcp",
    type: "typescript",
    repo: "exa-labs/exa-code-mcp",
    health: "needs_audit",
    update_context: {
      notes:
        "MCP server specifically for code search / coding agents. Uses Exa's code search endpoint.",
      key_files: ["src/index.ts", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "",
      publish_cmd: "npm publish",
    },
  },
  {
    name: "Zed MCP Extension",
    slug: "zed-exa-mcp",
    type: "other",
    repo: "exa-labs/zed-exa-mcp-extension",
    health: "needs_audit",
    update_context: {
      notes:
        "Zed editor extension wrapping Exa MCP. Written in Rust. Should track exa-mcp-server feature parity.",
      key_files: ["src/lib.rs", "Cargo.toml"],
      build_cmd: "cargo build",
      test_cmd: "cargo test",
      publish_cmd: "",
    },
  },

  // ─── OpenAI-Compatible Endpoint ─────────────────────────────────
  {
    name: "OpenRouter",
    slug: "openrouter",
    type: "other",
    repo: "",
    health: "needs_audit",
    update_context: {
      notes:
        "Exa is available as a provider on OpenRouter. Cloud-managed integration. When new models or capabilities are added (e.g., exa-research-pro), update the OpenRouter provider config.",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
    },
  },

  // ─── Data Platforms ─────────────────────────────────────────────
  {
    name: "Snowflake",
    slug: "snowflake",
    type: "other",
    repo: "",
    health: "needs_audit",
    update_context: {
      notes:
        "Snowflake integration (external function / Cortex). Allows calling Exa API from within Snowflake SQL. Check docs for latest setup guide.",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
    },
  },

  // ─── Voice / Multimodal ─────────────────────────────────────────
  {
    name: "ElevenLabs",
    slug: "elevenlabs",
    type: "other",
    repo: "",
    health: "needs_audit",
    update_context: {
      notes:
        "ElevenLabs voice agent integration. Gives ElevenLabs agents real-time web search via Exa. Cloud-configured.",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
    },
  },

  // ─── Browser Automation ─────────────────────────────────────────
  {
    name: "Browserbase",
    slug: "browserbase",
    type: "other",
    repo: "",
    health: "needs_audit",
    update_context: {
      notes:
        "Browserbase x Exa template for automated job applications. Example integration combining Exa search with browser automation.",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
    },
  },

  // ─── Demo / Showcase Apps ───────────────────────────────────────
  {
    name: "Exa Chatbot Demo",
    slug: "exa-chatbot-demo",
    type: "typescript",
    repo: "exa-labs/exa-chatbot-demo",
    health: "needs_audit",
    update_context: {
      notes:
        "chat.exa.ai — official demo chat app. Uses exa-js. Should showcase latest API features.",
      key_files: ["src/", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "",
      publish_cmd: "",
    },
  },
  {
    name: "Hallucination Detector",
    slug: "hallucination-detector",
    type: "typescript",
    repo: "exa-labs/exa-hallucination-detector",
    health: "needs_audit",
    update_context: {
      notes:
        "Open-source hallucination detection tool using Exa search to verify claims. Should use latest exa-js SDK.",
      key_files: ["src/", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "",
      publish_cmd: "",
    },
  },
  {
    name: "Company Researcher",
    slug: "company-researcher",
    type: "typescript",
    repo: "exa-labs/company-researcher",
    health: "needs_audit",
    update_context: {
      notes:
        "Company research tool using Exa API. Should use latest exa-js SDK features.",
      key_files: ["src/", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "",
      publish_cmd: "",
    },
  },
  {
    name: "Exa DeepSeek Chat",
    slug: "exa-deepseek-chat",
    type: "typescript",
    repo: "exa-labs/exa-deepseek-chat",
    health: "needs_audit",
    update_context: {
      notes:
        "Open-source chat app using Exa + DeepSeek R1. Should use latest exa-js SDK.",
      key_files: ["src/", "package.json"],
      build_cmd: "npm run build",
      test_cmd: "",
      publish_cmd: "",
    },
  },
];
