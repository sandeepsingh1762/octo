import * as child_process from "child_process";
import { registerTool } from "./registry.js";

const SAFE_PREFIXES = [
  "ls", "cat", "head", "tail", "wc", "pwd", "echo", "printf", "date",
  "which", "type", "env", "printenv", "uname", "whoami", "id",
  "git log", "git status", "git diff", "git show", "git branch",
  "git remote", "git stash list", "git tag",
  "find ", "grep ", "rg ", "ag ", "fd ",
  "python ", "python3 ", "node ", "ruby ", "perl ",
  "pip show", "pip list", "npm list", "cargo metadata",
  "df ", "du ", "free ", "top -bn", "ps ",
  "curl -I", "curl --head",
];

export function isSafeBash(cmd: string): boolean {
  const c = cmd.trim();
  return SAFE_PREFIXES.some((p) => c.startsWith(p));
}

function runBash(command: string, timeout = 30) {
  return new Promise<string>((resolve) => {
    const proc = child_process.exec(command, { timeout: timeout * 1000 }, (error, stdout, stderr) => {
      let out = stdout || "";
      if (stderr) out += (out ? "\n" : "") + "[stderr]\n" + stderr;
      if (error && error.message?.includes("TIMEOUT")) {
        resolve(`Error: timed out after ${timeout}s`);
        return;
      }
      resolve(out.trim() || "(no output)");
    });
    // Ensure we don't hang forever
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill();
      }
    }, (timeout + 5) * 1000);
  });
}

export function registerShellTools() {
  registerTool({
    name: "Bash",
    description: "Execute a shell command. Returns stdout+stderr. Stateless (no cd persistence).",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout: { type: "integer", description: "Seconds before timeout (default 30)" },
      },
      required: ["command"],
    },
    func: (p) => runBash(String(p.command), (p.timeout as number) || 30),
    read_only: false,
    concurrent_safe: false,
  });
}
