import React from "react";
import { render } from "ink";
import { App } from "./src/tui/app.js";
import { loadConfig } from "./src/config/index.js";
import { registerAllTools } from "./src/tools/index.js";

registerAllTools();
const config = await loadConfig();

// Just verify import and JSX compilation works
console.log("✅ TUI App component imported successfully");
console.log("✅ React version:", React.version);
console.log("✅ Config for TUI:", config.model);

// Don't actually render in smoke test (would need real terminal)
console.log("🐙 TUI smoke test passed!");
