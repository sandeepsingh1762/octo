import * as fs from "fs/promises";
import * as path from "path";
const USER_DIR = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".octopus", "memory");
function projectDir() {
    return path.join(process.cwd(), ".octopus", "memory");
}
function slugify(name) {
    return name.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 60);
}
export function saveMemory(entry, scope = "user") {
    const dir = scope === "project" ? projectDir() : USER_DIR;
    fs.mkdir(dir, { recursive: true }).catch(() => { });
    const fp = path.join(dir, `${slugify(entry.name)}.md`);
    const text = `---\nname: ${entry.name}\ndescription: ${entry.description}\ntype: ${entry.type}\ncreated: ${new Date().toISOString().split("T")[0]}\n---\n${entry.content}\n`;
    fs.writeFile(fp, text, "utf-8").catch(() => { });
}
export async function deleteMemory(name, scope = "user") {
    const dir = scope === "project" ? projectDir() : USER_DIR;
    const fp = path.join(dir, `${slugify(name)}.md`);
    fs.unlink(fp).catch(() => { });
}
export async function loadEntries(scope = "all") {
    const entries = [];
    async function scan(dir, scopeLabel) {
        const files = await fs.readdir(dir).catch(() => []);
        for (const f of files) {
            if (!f.endsWith(".md"))
                continue;
            const text = await fs.readFile(path.join(dir, f), "utf-8").catch(() => "");
            const metaMatch = text.match(/---\n([\s\S]*?)\n---/);
            if (!metaMatch)
                continue;
            const meta = metaMatch[1].split("\n").reduce((acc, line) => {
                const [k, ...rest] = line.split(":");
                if (k)
                    acc[k.trim()] = rest.join(":").trim();
                return acc;
            }, {});
            entries.push({
                name: meta.name || f.slice(0, -3),
                description: meta.description || "",
                type: meta.type || "user",
                content: text.split("---\n").slice(2).join("---\n").trim(),
                created: meta.created || "",
                scope: scopeLabel,
                file_path: path.join(dir, f),
            });
        }
    }
    if (scope === "all" || scope === "user")
        await scan(USER_DIR, "user");
    if (scope === "all" || scope === "project")
        await scan(projectDir(), "project");
    return entries;
}
export async function searchMemory(query, scope = "all") {
    const q = query.toLowerCase();
    const entries = await loadEntries(scope);
    return entries.filter((e) => `${e.name} ${e.description} ${e.content}`.toLowerCase().includes(q));
}
export async function getMemoryContext() {
    const entries = await loadEntries("all");
    if (!entries.length)
        return "";
    return entries
        .map((e) => `- [${e.scope}] ${e.name}: ${e.description}`)
        .join("\n");
}
//# sourceMappingURL=store.js.map