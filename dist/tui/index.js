import { jsx as _jsx } from "react/jsx-runtime";
import { render } from "ink";
import { App } from "./app.js";
import { loadConfig } from "../config/index.js";
import { registerAllTools } from "../tools/index.js";
import { initializeKeyManager } from "../ai/registry.js";
async function main() {
    registerAllTools();
    await initializeKeyManager();
    const config = await loadConfig();
    const initialPrompt = process.argv.slice(2).join(" ");
    render(_jsx(App, { config: config, initialPrompt: initialPrompt || undefined }));
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=index.js.map