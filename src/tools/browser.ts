import { fetch } from "undici";
import { registerTool } from "./registry.js";

interface PageInfo {
  url: string;
  title: string;
  links: string[];
  text: string;
}

async function browserOpen(url: string): Promise<PageInfo> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OCTOPUS/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const links: string[] = [];
  const linkMatches = html.matchAll(/<a[^>]*href="([^"]+)"/gi);
  for (const m of linkMatches) {
    const href = m[1]!;
    if (href.startsWith("http") && !links.includes(href)) links.push(href);
  }
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
  return { url, title, links: links.slice(0, 20), text };
}

async function browserClick(url: string, link_text: string) {
  const page = await browserOpen(url);
  // Simple heuristic: find link matching text
  const target = page.links.find((l) => l.includes(link_text)) || page.links[0];
  if (!target) return `No matching link found on ${url}`;
  const next = await browserOpen(target);
  return `Navigated to: ${next.url}\nTitle: ${next.title}\n\nContent:\n${next.text.slice(0, 8000)}`;
}

export function registerBrowserTools() {
  registerTool({
    name: "BrowserOpen",
    description: "Open a URL in the browser agent and return the page title, text content, and clickable links.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
    func: async (p) => {
      const page = await browserOpen(String(p.url));
      return `URL: ${page.url}\nTitle: ${page.title}\n\nLinks: ${page.links.join(", ")}\n\nText:\n${page.text}`;
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: "BrowserClick",
    description: "Click a link on a page by URL or link text and navigate to it.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Current page URL" },
        link_text: { type: "string", description: "Text or URL fragment of the link to click" },
      },
      required: ["url", "link_text"],
    },
    func: (p) => browserClick(String(p.url), String(p.link_text)),
    read_only: true,
    concurrent_safe: true,
  });
}
