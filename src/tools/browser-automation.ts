import { registerTool } from "./registry.js";
import { fetch } from "undici";

// Browser session management (lightweight implementation without Playwright dependency)
// For full Playwright support, install: npm install playwright

interface BrowserSession {
  id: string;
  currentUrl: string;
  title: string;
  cookies: Map<string, string>;
  history: string[];
  localStorage: Map<string, string>;
  lastSnapshot?: PageSnapshot;
}

interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; href: string; ref: string }>;
  forms: Array<{ action: string; method: string; inputs: Array<{ name: string; type: string }> }>;
  headings: Array<{ level: number; text: string }>;
  images: Array<{ alt: string; src: string }>;
  timestamp: Date;
}

// Active sessions
const sessions: Map<string, BrowserSession> = new Map();
let currentSessionId: string | null = null;

function generateId(): string {
  return `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateRef(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Parse HTML to extract structured data
function parseHtml(html: string, url: string): PageSnapshot {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Extract links with refs
  const links: PageSnapshot['links'] = [];
  const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis);
  for (const match of linkMatches) {
    let href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    
    // Resolve relative URLs
    if (href.startsWith('/')) {
      const urlObj = new URL(url);
      href = `${urlObj.origin}${href}`;
    } else if (!href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
      const urlObj = new URL(url);
      href = `${urlObj.origin}/${href}`;
    }
    
    if (href.startsWith('http') && text && links.length < 100) {
      links.push({ text, href, ref: generateRef() });
    }
  }

  // Extract forms
  const forms: PageSnapshot['forms'] = [];
  const formMatches = html.matchAll(/<form[^>]*(?:action=["']([^"']*)["'])?[^>]*(?:method=["']([^"']*)["'])?[^>]*>(.*?)<\/form>/gis);
  for (const match of formMatches) {
    const action = match[1] || '';
    const method = match[2]?.toUpperCase() || 'GET';
    const formHtml = match[3];
    
    const inputs: Array<{ name: string; type: string }> = [];
    const inputMatches = formHtml.matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*(?:type=["']([^"']*)["'])?/gi);
    for (const inputMatch of inputMatches) {
      inputs.push({ name: inputMatch[1], type: inputMatch[2] || 'text' });
    }
    
    if (forms.length < 10) {
      forms.push({ action, method, inputs });
    }
  }

  // Extract headings
  const headings: PageSnapshot['headings'] = [];
  const headingMatches = html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis);
  for (const match of headingMatches) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (text && headings.length < 50) {
      headings.push({ level, text });
    }
  }

  // Extract images
  const images: PageSnapshot['images'] = [];
  const imgMatches = html.matchAll(/<img[^>]*(?:alt=["']([^"']*)["'])?[^>]*src=["']([^"']+)["']/gi);
  for (const match of imgMatches) {
    if (images.length < 20) {
      images.push({ alt: match[1] || '', src: match[2] });
    }
  }

  // Clean text content
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15000);

  return {
    url,
    title,
    text: textContent,
    links,
    forms,
    headings,
    images,
    timestamp: new Date(),
  };
}

// Fetch page and create snapshot
async function fetchPage(url: string, session?: BrowserSession): Promise<PageSnapshot> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  // Add cookies if session exists
  if (session && session.cookies.size > 0) {
    const cookieStr = Array.from(session.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headers['Cookie'] = cookieStr;
  }

  const response = await fetch(url, {
    headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Store cookies from response
  if (session) {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const cookies = setCookie.split(',').map(c => c.trim());
      for (const cookie of cookies) {
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
          session.cookies.set(name.trim(), value.trim());
        }
      }
    }
  }

  const html = await response.text();
  return parseHtml(html, url);
}

// Format snapshot for display (token-efficient)
function formatSnapshot(snapshot: PageSnapshot, options: { includeLinks?: boolean; includeForms?: boolean; includeText?: boolean } = {}): string {
  const lines: string[] = [
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
  ];

  if (snapshot.headings.length > 0) {
    lines.push('\nHeadings:');
    for (const h of snapshot.headings.slice(0, 20)) {
      lines.push(`  ${'#'.repeat(h.level)} ${h.text}`);
    }
  }

  if (options.includeLinks !== false && snapshot.links.length > 0) {
    lines.push(`\nLinks (${snapshot.links.length}):`);
    for (const link of snapshot.links.slice(0, 30)) {
      lines.push(`  [${link.ref}] ${link.text.slice(0, 50)} → ${link.href.slice(0, 80)}`);
    }
    if (snapshot.links.length > 30) {
      lines.push(`  ... and ${snapshot.links.length - 30} more links`);
    }
  }

  if (options.includeForms !== false && snapshot.forms.length > 0) {
    lines.push('\nForms:');
    for (const form of snapshot.forms) {
      lines.push(`  ${form.method} ${form.action || '(current page)'}`);
      for (const input of form.inputs.slice(0, 10)) {
        lines.push(`    - ${input.name} (${input.type})`);
      }
    }
  }

  if (options.includeText) {
    lines.push(`\nContent:\n${snapshot.text.slice(0, 5000)}`);
    if (snapshot.text.length > 5000) {
      lines.push('... (truncated)');
    }
  }

  return lines.join('\n');
}

// Register browser automation tools
export function registerBrowserAutomationTools() {
  registerTool({
    name: 'BrowserLaunch',
    description: 'Start a new browser session. Returns session ID for subsequent operations.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to open immediately' },
      },
    },
    func: async (p) => {
      try {
        const session: BrowserSession = {
          id: generateId(),
          currentUrl: '',
          title: '',
          cookies: new Map(),
          history: [],
          localStorage: new Map(),
        };
        
        sessions.set(session.id, session);
        currentSessionId = session.id;

        if (p.url) {
          const snapshot = await fetchPage(String(p.url), session);
          session.currentUrl = snapshot.url;
          session.title = snapshot.title;
          session.history.push(snapshot.url);
          session.lastSnapshot = snapshot;
          
          return `Browser session started: ${session.id}\n\n${formatSnapshot(snapshot)}`;
        }

        return `Browser session started: ${session.id}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: 'BrowserNavigate',
    description: 'Navigate to a URL in the current browser session',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        sessionId: { type: 'string', description: 'Session ID (uses current if not specified)' },
      },
      required: ['url'],
    },
    func: async (p) => {
      try {
        const sessionId = (p.sessionId as string) || currentSessionId;
        if (!sessionId) return 'Error: No active browser session. Use BrowserLaunch first.';
        
        const session = sessions.get(sessionId);
        if (!session) return `Error: Session ${sessionId} not found`;

        const snapshot = await fetchPage(String(p.url), session);
        session.currentUrl = snapshot.url;
        session.title = snapshot.title;
        session.history.push(snapshot.url);
        session.lastSnapshot = snapshot;

        return formatSnapshot(snapshot);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'BrowserSnapshot',
    description: 'Get the current page snapshot including links, forms, and headings (token-efficient accessibility tree)',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID (uses current if not specified)' },
        includeText: { type: 'boolean', description: 'Include page text content (default: false)' },
      },
    },
    func: async (p) => {
      try {
        const sessionId = (p.sessionId as string) || currentSessionId;
        if (!sessionId) return 'Error: No active browser session';
        
        const session = sessions.get(sessionId);
        if (!session) return `Error: Session ${sessionId} not found`;

        if (!session.lastSnapshot) {
          return 'Error: No page loaded. Use BrowserNavigate first.';
        }

        // Refresh snapshot
        const snapshot = await fetchPage(session.currentUrl, session);
        session.lastSnapshot = snapshot;

        return formatSnapshot(snapshot, { includeText: Boolean(p.includeText) });
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'BrowserClick',
    description: 'Click a link by its ref ID or by matching link text',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Link ref ID from snapshot' },
        linkText: { type: 'string', description: 'Text to match in link (alternative to ref)' },
        sessionId: { type: 'string', description: 'Session ID' },
      },
    },
    func: async (p) => {
      try {
        const sessionId = (p.sessionId as string) || currentSessionId;
        if (!sessionId) return 'Error: No active browser session';
        
        const session = sessions.get(sessionId);
        if (!session || !session.lastSnapshot) return 'Error: No page loaded';

        let targetUrl: string | null = null;

        if (p.ref) {
          const link = session.lastSnapshot.links.find(l => l.ref === p.ref);
          if (link) targetUrl = link.href;
        } else if (p.linkText) {
          const searchText = String(p.linkText).toLowerCase();
          const link = session.lastSnapshot.links.find(l => 
            l.text.toLowerCase().includes(searchText) || 
            l.href.toLowerCase().includes(searchText)
          );
          if (link) targetUrl = link.href;
        }

        if (!targetUrl) {
          return `Error: Link not found. Available links:\n${session.lastSnapshot.links.slice(0, 10).map(l => `  [${l.ref}] ${l.text}`).join('\n')}`;
        }

        const snapshot = await fetchPage(targetUrl, session);
        session.currentUrl = snapshot.url;
        session.title = snapshot.title;
        session.history.push(snapshot.url);
        session.lastSnapshot = snapshot;

        return `Navigated to: ${snapshot.url}\n\n${formatSnapshot(snapshot)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'BrowserExtract',
    description: 'Extract specific data from the current page using CSS-like selectors or patterns',
    input_schema: {
      type: 'object',
      properties: {
        type: { 
          type: 'string', 
          enum: ['links', 'headings', 'forms', 'images', 'text', 'all'],
          description: 'Type of content to extract' 
        },
        pattern: { type: 'string', description: 'Optional filter pattern (text match)' },
        sessionId: { type: 'string' },
      },
      required: ['type'],
    },
    func: async (p) => {
      try {
        const sessionId = (p.sessionId as string) || currentSessionId;
        if (!sessionId) return 'Error: No active browser session';
        
        const session = sessions.get(sessionId);
        if (!session || !session.lastSnapshot) return 'Error: No page loaded';

        const snapshot = session.lastSnapshot;
        const pattern = p.pattern ? String(p.pattern).toLowerCase() : null;

        switch (p.type) {
          case 'links': {
            let links = snapshot.links;
            if (pattern) {
              links = links.filter(l => 
                l.text.toLowerCase().includes(pattern) || 
                l.href.toLowerCase().includes(pattern)
              );
            }
            return links.map(l => `${l.text}: ${l.href}`).join('\n') || 'No links found';
          }
          
          case 'headings': {
            let headings = snapshot.headings;
            if (pattern) {
              headings = headings.filter(h => h.text.toLowerCase().includes(pattern));
            }
            return headings.map(h => `${'#'.repeat(h.level)} ${h.text}`).join('\n') || 'No headings found';
          }
          
          case 'forms': {
            return snapshot.forms.map(f => {
              const inputs = f.inputs.map(i => `${i.name}:${i.type}`).join(', ');
              return `${f.method} ${f.action || '/'} [${inputs}]`;
            }).join('\n') || 'No forms found';
          }
          
          case 'images': {
            let images = snapshot.images;
            if (pattern) {
              images = images.filter(i => 
                i.alt.toLowerCase().includes(pattern) || 
                i.src.toLowerCase().includes(pattern)
              );
            }
            return images.map(i => `${i.alt || '(no alt)'}: ${i.src}`).join('\n') || 'No images found';
          }
          
          case 'text': {
            let text = snapshot.text;
            if (pattern) {
              const lines = text.split(/[.!?]+/).filter(s => s.toLowerCase().includes(pattern));
              return lines.join('. ') || 'No matching text found';
            }
            return text;
          }
          
          case 'all':
            return formatSnapshot(snapshot, { includeLinks: true, includeForms: true, includeText: true });
          
          default:
            return `Unknown type: ${p.type}`;
        }
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'BrowserBack',
    description: 'Go back to the previous page in history',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
    func: async (p) => {
      try {
        const sessionId = (p.sessionId as string) || currentSessionId;
        if (!sessionId) return 'Error: No active browser session';
        
        const session = sessions.get(sessionId);
        if (!session) return `Error: Session ${sessionId} not found`;

        if (session.history.length < 2) {
          return 'Error: No previous page in history';
        }

        // Remove current page and get previous
        session.history.pop();
        const prevUrl = session.history[session.history.length - 1];

        const snapshot = await fetchPage(prevUrl, session);
        session.currentUrl = snapshot.url;
        session.title = snapshot.title;
        session.lastSnapshot = snapshot;

        return `Went back to: ${snapshot.url}\n\n${formatSnapshot(snapshot)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'BrowserClose',
    description: 'Close a browser session',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session to close (closes current if not specified)' },
      },
    },
    func: async (p) => {
      const sessionId = (p.sessionId as string) || currentSessionId;
      if (!sessionId) return 'No active session to close';

      const session = sessions.get(sessionId);
      if (!session) return `Session ${sessionId} not found`;

      sessions.delete(sessionId);
      if (currentSessionId === sessionId) {
        currentSessionId = sessions.size > 0 ? (sessions.keys().next().value ?? null) : null;
      }

      return `Closed browser session: ${sessionId}`;
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: 'BrowserSessions',
    description: 'List all active browser sessions',
    input_schema: {
      type: 'object',
      properties: {},
    },
    func: async () => {
      if (sessions.size === 0) {
        return 'No active browser sessions';
      }

      const lines: string[] = [];
      for (const [id, session] of sessions) {
        const isCurrent = id === currentSessionId ? ' (current)' : '';
        lines.push(`[${id}]${isCurrent}`);
        lines.push(`  URL: ${session.currentUrl || '(none)'}`);
        lines.push(`  Title: ${session.title || '(none)'}`);
        lines.push(`  History: ${session.history.length} pages`);
        lines.push(`  Cookies: ${session.cookies.size}`);
      }
      return lines.join('\n');
    },
    read_only: true,
    concurrent_safe: true,
  });
}
