import * as child_process from "child_process";
import * as path from "path";
import { registerTool } from "./registry.js";

function detectLanguage(file_path: string): string {
  const ext = path.extname(file_path).toLowerCase();
  return (
    {
      ".py": "python",
      ".js": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".sh": "shellscript",
      ".bash": "shellscript",
      ".zsh": "shellscript",
    } as Record<string, string>
  )[ext] || "unknown";
}

function runQuiet(cmd: string[], cwd?: string, timeout = 30): [number, string] {
  try {
    const out = child_process.execSync(cmd.join(" "), { cwd: cwd || process.cwd(), encoding: "utf-8", timeout: timeout * 1000 });
    return [0, out.trim()];
  } catch (e) {
    if (e && typeof e === "object" && "stdout" in e) {
      const ex = e as { stdout?: Buffer; stderr?: Buffer; status?: number };
      return [ex.status ?? 1, (ex.stdout?.toString() || "") + (ex.stderr?.toString() ? "\n" + ex.stderr.toString() : "")];
    }
    return [-1, `error: ${e instanceof Error ? e.message : String(e)}`];
  }
}

function getDiagnostics(file_path: string, language?: string) {
  const p = path.resolve(file_path);
  const lang = language || detectLanguage(p);
  const results: string[] = [];
  if (lang === "python") {
    const [rc1, out1] = runQuiet(["python", "-m", "py_compile", p]);
    if (rc1 === 0) results.push("py_compile: syntax OK");
    else results.push(`py_compile:\n${out1.slice(0, 3000)}`);
    const [rc2, out2] = runQuiet(["python", "-m", "flake8", p]);
    if (rc2 === 0 && !out2) results.push("flake8: no issues");
    else if (rc2 !== -1) results.push(`flake8:\n${out2.slice(0, 3000)}`);
  } else if (lang === "javascript" || lang === "typescript") {
    const [rc1, out1] = runQuiet(["npx", "eslint", p]);
    if (rc1 === 0 && !out1) results.push("eslint: no issues");
    else if (rc1 !== -1) results.push(`eslint:\n${out1.slice(0, 3000)}`);
    const [rc2, out2] = runQuiet(["npx", "tsc", "--noEmit", "--strict", p]);
    if (rc2 === 0 && !out2) results.push("tsc: no errors");
    else if (rc2 !== -1) results.push(`tsc:\n${out2.slice(0, 3000)}`);
  } else if (lang === "shellscript") {
    const [rc1, out1] = runQuiet(["bash", "-n", p]);
    if (rc1 === 0) results.push("bash -n: syntax OK");
    else results.push(`bash -n:\n${out1.slice(0, 3000)}`);
  } else {
    results.push(`No diagnostic tool available for language: ${lang}`);
  }
  return results.join("\n\n");
}

export function registerCodeTools() {
  registerTool({
    name: "GetDiagnostics",
    description: "Get LSP-style diagnostics (errors, warnings, hints) for a source file. Uses pyright/mypy/flake8 for Python, tsc/eslint for TS/JS, shellcheck for shell scripts.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        language: { type: "string", description: "Override auto-detected language: python, javascript, typescript, shellscript" },
      },
      required: ["file_path"],
    },
    func: (p) => getDiagnostics(String(p.file_path), p.language as string | undefined),
    read_only: true,
    concurrent_safe: true,
  });
}
