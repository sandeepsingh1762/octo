import { fetch } from "undici";
import { registerTool } from "./registry.js";

// Search engines that don't require API keys
const SEARCH_ENGINES = {
  duckduckgo: {
    url: 'https://html.duckduckgo.com/html/',
    params: (query: string) => new URLSearchParams({ q: query }),
    parseResults: parseDuckDuckGoResults,
  },
  bing: {
    url: 'https://www.bing.com/search',
    params: (query: string) => new URLSearchParams({ q: query, count: '20' }),
    parseResults: parseBingResults,
  },
  searx: {
    url: 'https://searx.be/search',
    params: (query: string) => new URLSearchParams({ q: query, format: 'json' }),
    parseResults: parseSearxResults,
  },
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface WebContent {
  url: string;
  title: string;
  text: string;
  markdown: string;
  links: Array<{ text: string; href: string }>;
  headings: Array<{ level: number; text: string }>;
  metadata: {
    author?: string;
    date?: string;
    description?: string;
    keywords?: string[];
  };
  fetchedAt: Date;
}

// Parse DuckDuckGo HTML results
function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  
  // Match result blocks
  const resultMatches = html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi);
  
  for (const match of resultMatches) {
    if (results.length >= 15) break;
    
    let url = match[1];
    // DuckDuckGo uses redirect URLs, try to extract actual URL
    const urlMatch = url.match(/uddg=([^&]+)/);
    if (urlMatch) {
      url = decodeURIComponent(urlMatch[1]);
    }
    
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();
    
    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet, source: 'duckduckgo' });
    }
  }
  
  // Fallback: try alternative patterns
  if (results.length === 0) {
    const altMatches = html.matchAll(/<h2[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<span[^>]*>(.*?)<\/span>/gi);
    for (const match of altMatches) {
      if (results.length >= 15) break;
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const url = match[1];
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();
      if (title && url.startsWith('http')) {
        results.push({ title, url, snippet, source: 'duckduckgo' });
      }
    }
  }
  
  return results;
}

// Parse Bing HTML results
function parseBingResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  
  const resultMatches = html.matchAll(/<li[^>]*class="b_algo"[^>]*>[\s\S]*?<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>[\s\S]*?<p[^>]*>(.*?)<\/p>/gi);
  
  for (const match of resultMatches) {
    if (results.length >= 15) break;
    
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();
    
    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet, source: 'bing' });
    }
  }
  
  return results;
}

// Parse Searx JSON results
function parseSearxResults(json: string): SearchResult[] {
  try {
    const data = JSON.parse(json);
    return (data.results || []).slice(0, 15).map((r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || '',
      source: 'searx',
    }));
  } catch {
    return [];
  }
}

// Perform search using specified engine
async function searchEngine(
  engine: keyof typeof SEARCH_ENGINES,
  query: string
): Promise<SearchResult[]> {
  const config = SEARCH_ENGINES[engine];
  const params = config.params(query);
  const url = `${config.url}?${params.toString()}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': engine === 'searx' ? 'application/json' : 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const content = await response.text();
    return config.parseResults(content);
  } catch (e) {
    console.error(`Search failed for ${engine}:`, e);
    return [];
  }
}

// Multi-engine search
async function searchMulti(query: string, engines?: Array<keyof typeof SEARCH_ENGINES>): Promise<SearchResult[]> {
  const useEngines = engines || ['duckduckgo', 'bing'];
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();
  
  // Search engines in parallel
  const promises = useEngines.map(engine => searchEngine(engine as keyof typeof SEARCH_ENGINES, query));
  const results = await Promise.allSettled(promises);
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const r of result.value) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }
  }
  
  return allResults;
}

// HTML to clean text
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// HTML to markdown conversion
function htmlToMarkdown(html: string): string {
  let md = html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n')
    // Links
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Bold
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    // Italic
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    // Code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // Pre/code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    // Paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Horizontal rules
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  return md;
}

// Fetch and parse web content
async function fetchWebContent(url: string): Promise<WebContent> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const html = await response.text();
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? htmlToText(titleMatch[1]) : '';
  
  // Extract metadata
  const metadata: WebContent['metadata'] = {};
  
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  if (authorMatch) metadata.author = authorMatch[1];
  
  const dateMatch = html.match(/<meta[^>]*(?:name|property)=["'](?:date|article:published_time|og:published_time)["'][^>]*content=["']([^"']+)["']/i);
  if (dateMatch) metadata.date = dateMatch[1];
  
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (descMatch) metadata.description = descMatch[1];
  
  const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
  if (keywordsMatch) metadata.keywords = keywordsMatch[1].split(',').map(k => k.trim());
  
  // Extract links
  const links: WebContent['links'] = [];
  const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis);
  for (const match of linkMatches) {
    if (links.length >= 50) break;
    let href = match[1];
    const text = htmlToText(match[2]).slice(0, 100);
    
    // Resolve relative URLs
    if (href.startsWith('/')) {
      const urlObj = new URL(url);
      href = `${urlObj.origin}${href}`;
    }
    
    if (href.startsWith('http') && text) {
      links.push({ text, href });
    }
  }
  
  // Extract headings
  const headings: WebContent['headings'] = [];
  const headingMatches = html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis);
  for (const match of headingMatches) {
    if (headings.length >= 30) break;
    headings.push({
      level: parseInt(match[1]),
      text: htmlToText(match[2]).slice(0, 200),
    });
  }
  
  return {
    url,
    title,
    text: htmlToText(html).slice(0, 50000),
    markdown: htmlToMarkdown(html).slice(0, 50000),
    links,
    headings,
    metadata,
    fetchedAt: new Date(),
  };
}

// Extract structured data (JSON-LD, microdata)
function extractStructuredData(html: string): Record<string, unknown>[] {
  const data: Record<string, unknown>[] = [];
  
  // JSON-LD
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        data.push(...parsed);
      } else {
        data.push(parsed);
      }
    } catch {
      // Invalid JSON-LD
    }
  }
  
  return data;
}

// Format search results for display
function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }
  
  const lines: string[] = [`Found ${results.length} results:\n`];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.snippet) {
      lines.push(`   ${r.snippet.slice(0, 200)}${r.snippet.length > 200 ? '...' : ''}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// Register enhanced web tools
export function registerWebEnhancedTools() {
  registerTool({
    name: 'WebSearchMulti',
    description: 'Search the web using multiple engines (DuckDuckGo, Bing) without requiring API keys',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        engines: { 
          type: 'array', 
          items: { type: 'string', enum: ['duckduckgo', 'bing', 'searx'] },
          description: 'Search engines to use (default: duckduckgo, bing)' 
        },
      },
      required: ['query'],
    },
    func: async (p) => {
      try {
        const results = await searchMulti(
          String(p.query), 
          p.engines as Array<keyof typeof SEARCH_ENGINES> | undefined
        );
        return formatSearchResults(results);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'WebFetchClean',
    description: 'Fetch a URL and return clean, readable text content (strips HTML, ads, navigation)',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        maxLength: { type: 'number', description: 'Maximum text length to return (default: 15000)' },
      },
      required: ['url'],
    },
    func: async (p) => {
      try {
        const content = await fetchWebContent(String(p.url));
        const maxLen = (p.maxLength as number) || 15000;
        
        const lines = [
          `Title: ${content.title}`,
          `URL: ${content.url}`,
        ];
        
        if (content.metadata.author) lines.push(`Author: ${content.metadata.author}`);
        if (content.metadata.date) lines.push(`Date: ${content.metadata.date}`);
        if (content.metadata.description) lines.push(`Description: ${content.metadata.description}`);
        
        lines.push('\n--- Content ---\n');
        lines.push(content.text.slice(0, maxLen));
        
        if (content.text.length > maxLen) {
          lines.push('\n... (truncated)');
        }
        
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'WebFetchMarkdown',
    description: 'Fetch a URL and convert its content to clean Markdown format',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        maxLength: { type: 'number', description: 'Maximum length (default: 20000)' },
      },
      required: ['url'],
    },
    func: async (p) => {
      try {
        const content = await fetchWebContent(String(p.url));
        const maxLen = (p.maxLength as number) || 20000;
        
        const lines = [
          `# ${content.title}`,
          '',
          `*Source: [${content.url}](${content.url})*`,
        ];
        
        if (content.metadata.author) lines.push(`*Author: ${content.metadata.author}*`);
        if (content.metadata.date) lines.push(`*Date: ${content.metadata.date}*`);
        
        lines.push('\n---\n');
        lines.push(content.markdown.slice(0, maxLen));
        
        if (content.markdown.length > maxLen) {
          lines.push('\n*... (truncated)*');
        }
        
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'WebFetchStructured',
    description: 'Fetch a URL and extract structured data (JSON-LD, metadata, links, headings)',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
    func: async (p) => {
      try {
        const response = await fetch(String(p.url), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const content = await fetchWebContent(String(p.url));
        const structuredData = extractStructuredData(html);
        
        const lines = [
          `URL: ${content.url}`,
          `Title: ${content.title}`,
          '',
          '## Metadata',
        ];
        
        if (content.metadata.author) lines.push(`- Author: ${content.metadata.author}`);
        if (content.metadata.date) lines.push(`- Date: ${content.metadata.date}`);
        if (content.metadata.description) lines.push(`- Description: ${content.metadata.description}`);
        if (content.metadata.keywords) lines.push(`- Keywords: ${content.metadata.keywords.join(', ')}`);
        
        if (content.headings.length > 0) {
          lines.push('\n## Headings');
          for (const h of content.headings.slice(0, 20)) {
            lines.push(`${'  '.repeat(h.level - 1)}${h.text}`);
          }
        }
        
        if (content.links.length > 0) {
          lines.push(`\n## Links (${content.links.length} total)`);
          for (const link of content.links.slice(0, 20)) {
            lines.push(`- [${link.text}](${link.href})`);
          }
        }
        
        if (structuredData.length > 0) {
          lines.push('\n## Structured Data (JSON-LD)');
          lines.push('```json');
          lines.push(JSON.stringify(structuredData, null, 2).slice(0, 5000));
          lines.push('```');
        }
        
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'WebCrawl',
    description: 'Crawl a website starting from a URL, following links up to a specified depth',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Starting URL' },
        maxDepth: { type: 'number', description: 'Maximum depth to crawl (default: 1)' },
        maxPages: { type: 'number', description: 'Maximum pages to crawl (default: 10)' },
        sameDomain: { type: 'boolean', description: 'Only follow links on same domain (default: true)' },
      },
      required: ['url'],
    },
    func: async (p) => {
      try {
        const startUrl = String(p.url);
        const maxDepth = (p.maxDepth as number) || 1;
        const maxPages = (p.maxPages as number) || 10;
        const sameDomain = p.sameDomain !== false;
        
        const startDomain = new URL(startUrl).hostname;
        const visited = new Set<string>();
        const toVisit: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
        const results: Array<{ url: string; title: string; headings: number; links: number }> = [];
        
        while (toVisit.length > 0 && results.length < maxPages) {
          const current = toVisit.shift()!;
          
          if (visited.has(current.url) || current.depth > maxDepth) {
            continue;
          }
          
          visited.add(current.url);
          
          try {
            const content = await fetchWebContent(current.url);
            results.push({
              url: content.url,
              title: content.title,
              headings: content.headings.length,
              links: content.links.length,
            });
            
            // Add links to visit
            if (current.depth < maxDepth) {
              for (const link of content.links) {
                try {
                  const linkDomain = new URL(link.href).hostname;
                  if (!sameDomain || linkDomain === startDomain) {
                    if (!visited.has(link.href)) {
                      toVisit.push({ url: link.href, depth: current.depth + 1 });
                    }
                  }
                } catch {
                  // Invalid URL
                }
              }
            }
          } catch (e) {
            // Skip failed pages
          }
        }
        
        const lines = [`Crawled ${results.length} pages from ${startUrl}:\n`];
        for (const r of results) {
          lines.push(`- ${r.title || '(no title)'}`);
          lines.push(`  ${r.url}`);
          lines.push(`  Headings: ${r.headings}, Links: ${r.links}`);
        }
        
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'WebSearchAndFetch',
    description: 'Search the web and automatically fetch content from the top results',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        numResults: { type: 'number', description: 'Number of results to fetch content from (default: 3)' },
        maxContentLength: { type: 'number', description: 'Max content length per result (default: 3000)' },
      },
      required: ['query'],
    },
    func: async (p) => {
      try {
        const query = String(p.query);
        const numResults = Math.min((p.numResults as number) || 3, 5);
        const maxLen = (p.maxContentLength as number) || 3000;
        
        // Search
        const searchResults = await searchMulti(query);
        
        if (searchResults.length === 0) {
          return 'No search results found.';
        }
        
        // Fetch top results
        const lines = [`Search results for: ${query}\n`];
        
        for (let i = 0; i < Math.min(numResults, searchResults.length); i++) {
          const result = searchResults[i];
          lines.push(`## ${i + 1}. ${result.title}`);
          lines.push(`URL: ${result.url}\n`);
          
          try {
            const content = await fetchWebContent(result.url);
            lines.push(content.text.slice(0, maxLen));
            if (content.text.length > maxLen) {
              lines.push('\n... (truncated)');
            }
          } catch (e) {
            lines.push(`*Failed to fetch content: ${e instanceof Error ? e.message : String(e)}*`);
          }
          
          lines.push('\n---\n');
        }
        
        // Add remaining search results as links
        if (searchResults.length > numResults) {
          lines.push('\n### Additional Results:');
          for (let i = numResults; i < Math.min(searchResults.length, numResults + 5); i++) {
            const r = searchResults[i];
            lines.push(`${i + 1}. [${r.title}](${r.url})`);
            if (r.snippet) lines.push(`   ${r.snippet.slice(0, 100)}...`);
          }
        }
        
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });
}
