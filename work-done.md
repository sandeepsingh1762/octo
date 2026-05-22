# OCTOPUS - Work Done

## Phase 1: Core Foundation Complete

### Architecture
- **TypeScript monorepo-style** single-package structure for rapid iteration
- **3-layer architecture**: Core (agent+AI+tools), TUI (Ink React terminal), CLI entry
- Inspired by PI coding agent (earendil-works/pi), clawspring, and codebuff-reference

### AI Provider System (`src/ai/`)
- **Multi-provider abstraction**: OpenAI, Anthropic, Google Gemini, DeepSeek, Ollama, LMStudio, Custom
- **Unified streaming API**: All providers yield `TextChunk | ThinkingChunk | ToolCallChunk | TurnDone`
- **Auto-detection**: Detect provider from model string prefix (e.g., `claude-*`, `gpt-*`, `gemini-*`)
- **Message format normalization**: Internal neutral format converts to Anthropic/OpenAI/Google formats
- **Cost tracking**: Per-model token cost estimates

### Tool System (`src/tools/`)
- **20+ powerful tools** organized in categories:

#### File & Shell
- `Read` — Read files with line numbers, offset/limit support
- `Write` — Create/overwrite files with diff output
- `Edit` — Exact string replacement with unified diff
- `Glob` — Pattern-based file discovery
- `Bash` — Shell execution with safety classification

#### Search & Navigation
- `Grep` — Regex search via ripgrep/grep fallback
- `CodebaseSearch` — Multi-strategy codebase search (exact + regex)
- `RegexExtract` / `RegexReplace` — Pattern extraction and manipulation

#### Web & Browser
- `WebFetch` — URL content extraction (HTML stripped)
- `WebSearch` — DuckDuckGo search with result parsing
- `BrowserOpen` — Page title/links/content extraction
- `BrowserClick` — Link navigation simulation

#### Code Quality
- `GetDiagnostics` — LSP-style diagnostics (Python flake8/py_compile, JS/TS eslint/tsc, shellcheck)

#### Memory & Tasks
- `MemorySave` / `MemoryDelete` / `MemorySearch` / `MemoryList`
- `TaskCreate` / `TaskUpdate` / `TaskList`

#### Interaction
- `AskUserQuestion` — Interactive user question bridge

### Agent Loop (`src/agent/`)
- **Streaming multi-turn loop**: User → LLM → Tools → LLM → ... → Response
- **Permission system**: `auto` | `accept-all` | `manual` modes
- **Context compaction**: Two-layer compression (snip old tool results → LLM summary)
- **Token estimation**: Char-based estimation with provider limits
- **Tool execution**: Async dispatch with output truncation (32K default)

### System Prompts (`src/agent/system.ts`)
- Dynamic prompt builder with:
  - Date, platform, working directory
  - Git branch/status/recent commits auto-injection
  - Project `OCTOPUS.md` context discovery
  - Persistent memory context injection
  - Full tool guidelines and capabilities

### Configuration (`src/config/`)
- JSON-based config in `~/.octopus/config.json`
- Defaults: model, max_tokens, permission_mode, verbose, thinking, etc.

### Memory System (`src/memory/`)
- Markdown-based persistent storage
- User scope: `~/.octopus/memory/*.md` (YAML frontmatter)
- Project scope: `.octopus/memory/*.md` (relative to cwd)
- Search by keyword across name/description/content

### Task System (`src/tasks/`)
- In-memory task tracking with lifecycle: pending → in_progress → completed/cancelled/deleted
- Tool-integrated task management

### TUI Terminal (`src/tui/`)
- **Ink + React** terminal UI (clean, minimal, rich)
- Components:
  - `App` — Main layout with header, messages scrollbox, input bar, status bar
  - `Messages` — Renders user/assistant/thinking/tool/error messages with color coding
  - `ChatInput` — Interactive input with border, cursor, and Enter to submit
  - `StatusBar` — Real-time status, model name, token counts
- Keyboard: Enter to send, Esc to exit
- Streaming text rendered in real-time

### CLI Entry Points
- `octopus <prompt>` — Headless CLI mode (streaming output to stdout)
- `octopus-tui` — Rich terminal UI mode
- `npm run dev` / `npm run dev:tui` — Development with tsx

### Build System
- TypeScript 5.8 with NodeNext module resolution
- JSX support for React TUI components
- `tsc` compilation to `dist/`
- `tsx` for development hot-run

## Next Steps
- Add sub-agent / multi-agent system with worktree isolation
- Add MCP (Model Context Protocol) support
- Add skills system (reusable prompt templates)
- Add session save/load/cloud sync
- Add voice input support
- Add proactive/polling sentinel mode
- Add browser automation via Playwright
- Add more diagnostic tools (mypy, pyright, biome, etc.)
- Add image/vision support
- Add code map / AST-based codebase understanding
