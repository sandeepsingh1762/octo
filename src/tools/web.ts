import { fetch } from "undici";
import { registerTool } from "./registry.js";

async function webFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OCTOPUS-Agent/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return `Error: HTTP ${res.status}`;
    const ct = res.headers.get("content-type") || "";
    let text = await res.text();
    if (ct.includes("html")) {
      text = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return text.slice(0, 25000);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function webSearch(query: string) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OCTOPUS/1.0)" },
    });
    const html = await res.text();
    const titles: Array<{ url: string; title: string }> = [];
    const titleMatches = html.matchAll(/class="result__title"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs);
    for (const m of titleMatches) {
      titles.push({ url: m[1]!, title: m[2]!.replace(/<[^>]+>/g, "").trim() });
    }
    const snippets: string[] = [];
    const snippetMatches = html.matchAll(/class="result__snippet"[^>]*>(.*?)<\/div>/gs);
    for (const m of snippetMatches) {
      snippets.push(m[1]!.replace(/<[^>]+>/g, "").trim());
    }
    const results: string[] = [];
    for (let i = 0; i < Math.min(titles.length, 8); i++) {
      const t = titles[i]!;
      const s = snippets[i] || "";
      results.push(`**${t.title}**\n${t.url}\n${s}`);
    }
    return results.join("\n\n") || "No results found";
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function registerWebTools() {
  registerTool({
    name: "WebFetch",
    description: "Fetch a URL and return its text content (HTML stripped).",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
    func: (p) => webFetch(String(p.url)),
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: "WebSearch",
    description: "Search the web via DuckDuckGo and return top results.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
    func: (p) => webSearch(String(p.query)),
    read_only: true,
    concurrent_safe: true,
  });
}
