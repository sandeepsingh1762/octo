import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import * as child_process from "child_process";
import { registerTool } from "./registry.js";

// Codebase mapping types (inspired by Aider's RepoMap)
export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lastModified: Date;
  functions: string[];
  classes: string[];
  exports: string[];
  imports: string[];
  lineCount: number;
}

export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'const' | 'method';
  file: string;
  line: number;
  exported: boolean;
  signature?: string;
}

export interface CodebaseMap {
  rootPath: string;
  files: Map<string, FileInfo>;
  symbols: Map<string, SymbolInfo[]>;
  lastUpdated: Date;
}

// Language detection
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

// Regex patterns for symbol extraction
const PATTERNS: Record<string, { functions: RegExp; classes: RegExp; exports: RegExp; imports: RegExp }> = {
  typescript: {
    functions: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    classes: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
    exports: /export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
    imports: /import\s+(?:{[^}]+}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g,
  },
  javascript: {
    functions: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    classes: /(?:export\s+)?class\s+(\w+)/g,
    exports: /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/g,
    imports: /import\s+(?:{[^}]+}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g,
  },
  python: {
    functions: /def\s+(\w+)\s*\(/g,
    classes: /class\s+(\w+)/g,
    exports: /__all__\s*=\s*\[([^\]]+)\]/g,
    imports: /(?:from\s+(\S+)\s+)?import\s+/g,
  },
  rust: {
    functions: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g,
    classes: /(?:pub\s+)?struct\s+(\w+)|(?:pub\s+)?enum\s+(\w+)|(?:pub\s+)?trait\s+(\w+)/g,
    exports: /pub\s+(?:fn|struct|enum|trait|const|static|type)\s+(\w+)/g,
    imports: /use\s+([^;]+)/g,
  },
  go: {
    functions: /func\s+(?:\([^)]+\)\s+)?(\w+)/g,
    classes: /type\s+(\w+)\s+struct/g,
    exports: /func\s+([A-Z]\w*)|type\s+([A-Z]\w+)/g,
    imports: /import\s+(?:\(\s*)?["']([^"']+)["']/g,
  },
};

// Global codebase cache
let codebaseCache: CodebaseMap | null = null;

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'unknown';
}

function extractSymbols(content: string, language: string, filePath: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const patterns = PATTERNS[language] || PATTERNS.typescript;
  const lines = content.split('\n');

  // Extract functions
  let match: RegExpExecArray | null;
  const funcPattern = new RegExp(patterns.functions.source, 'gm');
  while ((match = funcPattern.exec(content)) !== null) {
    const name = match[1];
    if (name) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name,
        type: 'function',
        file: filePath,
        line: lineNum,
        exported: match[0].includes('export') || match[0].includes('pub'),
      });
    }
  }

  // Extract classes
  const classPattern = new RegExp(patterns.classes.source, 'gm');
  while ((match = classPattern.exec(content)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name,
        type: 'class',
        file: filePath,
        line: lineNum,
        exported: match[0].includes('export') || match[0].includes('pub'),
      });
    }
  }

  // TypeScript/JavaScript specific: interfaces, types, enums
  if (language === 'typescript' || language === 'javascript') {
    const interfacePattern = /(?:export\s+)?interface\s+(\w+)/g;
    while ((match = interfacePattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[1]!,
        type: 'interface',
        file: filePath,
        line: lineNum,
        exported: match[0].includes('export'),
      });
    }

    const typePattern = /(?:export\s+)?type\s+(\w+)\s*=/g;
    while ((match = typePattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[1]!,
        type: 'type',
        file: filePath,
        line: lineNum,
        exported: match[0].includes('export'),
      });
    }

    const enumPattern = /(?:export\s+)?enum\s+(\w+)/g;
    while ((match = enumPattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[1]!,
        type: 'enum',
        file: filePath,
        line: lineNum,
        exported: match[0].includes('export'),
      });
    }

    const constPattern = /(?:export\s+)?const\s+(\w+)\s*[=:]/g;
    while ((match = constPattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[1]!,
        type: 'const',
        file: filePath,
        line: lineNum,
        exported: match[0].includes('export'),
      });
    }
  }

  return symbols;
}

async function analyzeFile(filePath: string, rootPath: string): Promise<FileInfo | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;

    const content = await fs.readFile(filePath, 'utf-8');
    const language = detectLanguage(filePath);
    const lines = content.split('\n');
    const relativePath = path.relative(rootPath, filePath);

    const patterns = PATTERNS[language];
    const functions: string[] = [];
    const classes: string[] = [];
    const exports: string[] = [];
    const imports: string[] = [];

    if (patterns) {
      let match: RegExpExecArray | null;
      
      const funcPattern = new RegExp(patterns.functions.source, 'gm');
      while ((match = funcPattern.exec(content)) !== null) {
        if (match[1]) functions.push(match[1]);
      }

      const classPattern = new RegExp(patterns.classes.source, 'gm');
      while ((match = classPattern.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3];
        if (name) classes.push(name);
      }

      const exportPattern = new RegExp(patterns.exports.source, 'gm');
      while ((match = exportPattern.exec(content)) !== null) {
        if (match[1]) exports.push(match[1]);
      }

      const importPattern = new RegExp(patterns.imports.source, 'gm');
      while ((match = importPattern.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
    }

    return {
      path: filePath,
      relativePath,
      language,
      size: stat.size,
      lastModified: stat.mtime,
      functions: [...new Set(functions)],
      classes: [...new Set(classes)],
      exports: [...new Set(exports)],
      imports: [...new Set(imports)],
      lineCount: lines.length,
    };
  } catch (e) {
    return null;
  }
}

async function buildCodebaseIndex(rootPath: string): Promise<CodebaseMap> {
  const absRoot = path.resolve(rootPath);
  const codebaseMap: CodebaseMap = {
    rootPath: absRoot,
    files: new Map(),
    symbols: new Map(),
    lastUpdated: new Date(),
  };

  // Find all source files
  const patterns = [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.py', '**/*.rs', '**/*.go', '**/*.java',
    '**/*.cpp', '**/*.c', '**/*.h', '**/*.hpp',
    '**/*.rb', '**/*.php', '**/*.swift', '**/*.kt',
  ];

  const ignorePatterns = [
    '**/node_modules/**', '**/dist/**', '**/build/**',
    '**/.git/**', '**/target/**', '**/__pycache__/**',
    '**/venv/**', '**/.venv/**', '**/vendor/**',
  ];

  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: absRoot,
      absolute: true,
      ignore: ignorePatterns,
    });

    for (const file of files) {
      const fileInfo = await analyzeFile(file, absRoot);
      if (fileInfo) {
        codebaseMap.files.set(fileInfo.relativePath, fileInfo);

        // Extract and index symbols
        const content = await fs.readFile(file, 'utf-8').catch(() => '');
        const symbols = extractSymbols(content, fileInfo.language, fileInfo.relativePath);
        for (const sym of symbols) {
          const existing = codebaseMap.symbols.get(sym.name) || [];
          existing.push(sym);
          codebaseMap.symbols.set(sym.name, existing);
        }
      }
    }
  }

  codebaseCache = codebaseMap;
  return codebaseMap;
}

function formatFileInfo(file: FileInfo): string {
  const lines = [
    `${file.relativePath} (${file.language})`,
    `  Lines: ${file.lineCount} | Size: ${(file.size / 1024).toFixed(1)}KB`,
  ];
  if (file.classes.length) lines.push(`  Classes: ${file.classes.join(', ')}`);
  if (file.functions.length) lines.push(`  Functions: ${file.functions.slice(0, 10).join(', ')}${file.functions.length > 10 ? '...' : ''}`);
  if (file.exports.length) lines.push(`  Exports: ${file.exports.slice(0, 10).join(', ')}${file.exports.length > 10 ? '...' : ''}`);
  return lines.join('\n');
}

function getGitHistory(filePath: string, limit = 10): string {
  try {
    const result = child_process.execSync(
      `git log --oneline -${limit} -- "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.trim() || 'No git history found';
  } catch {
    return 'Git not available or file not tracked';
  }
}

function getGitBlame(filePath: string, startLine: number, endLine: number): string {
  try {
    const result = child_process.execSync(
      `git blame -L ${startLine},${endLine} "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.trim() || 'No blame info found';
  } catch {
    return 'Git not available or file not tracked';
  }
}

// Register codebase tools
export function registerCodebaseTools() {
  registerTool({
    name: 'CodebaseIndex',
    description: 'Build or refresh the codebase index. This scans all source files and extracts symbols (functions, classes, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root path to index (default: cwd)' },
      },
    },
    func: async (p) => {
      try {
        const rootPath = p.path ? String(p.path) : process.cwd();
        const map = await buildCodebaseIndex(rootPath);
        return `Indexed ${map.files.size} files with ${map.symbols.size} unique symbols.`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: false,
  });

  registerTool({
    name: 'CodebaseMap',
    description: 'Get a high-level map of the project structure showing files, their languages, and key symbols',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to map (default: cwd)' },
        maxFiles: { type: 'number', description: 'Maximum files to show (default: 50)' },
      },
    },
    func: async (p) => {
      try {
        const rootPath = p.path ? String(p.path) : process.cwd();
        const map = codebaseCache?.rootPath === path.resolve(rootPath) 
          ? codebaseCache 
          : await buildCodebaseIndex(rootPath);
        
        const maxFiles = (p.maxFiles as number) || 50;
        const files = Array.from(map.files.values()).slice(0, maxFiles);
        
        // Group by directory
        const byDir: Record<string, FileInfo[]> = {};
        for (const file of files) {
          const dir = path.dirname(file.relativePath) || '.';
          if (!byDir[dir]) byDir[dir] = [];
          byDir[dir].push(file);
        }

        const lines: string[] = [`Codebase Map (${map.files.size} files, ${map.symbols.size} symbols)`];
        for (const [dir, dirFiles] of Object.entries(byDir).sort()) {
          lines.push(`\n📁 ${dir}/`);
          for (const file of dirFiles) {
            const symbols = [];
            if (file.classes.length) symbols.push(`${file.classes.length}C`);
            if (file.functions.length) symbols.push(`${file.functions.length}F`);
            lines.push(`  📄 ${path.basename(file.relativePath)} [${file.language}] ${symbols.join(' ')}`);
          }
        }

        if (map.files.size > maxFiles) {
          lines.push(`\n... and ${map.files.size - maxFiles} more files`);
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
    name: 'SymbolFind',
    description: 'Find symbol definitions (functions, classes, types) by name across the codebase',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name to find (supports partial match)' },
        type: { 
          type: 'string', 
          enum: ['function', 'class', 'interface', 'type', 'enum', 'const', 'all'],
          description: 'Filter by symbol type' 
        },
      },
      required: ['name'],
    },
    func: async (p) => {
      try {
        if (!codebaseCache) {
          await buildCodebaseIndex(process.cwd());
        }
        
        const searchName = String(p.name).toLowerCase();
        const filterType = p.type as string | undefined;
        const results: SymbolInfo[] = [];

        for (const [name, symbols] of codebaseCache!.symbols.entries()) {
          if (name.toLowerCase().includes(searchName)) {
            for (const sym of symbols) {
              if (!filterType || filterType === 'all' || sym.type === filterType) {
                results.push(sym);
              }
            }
          }
        }

        if (results.length === 0) return `No symbols found matching "${p.name}"`;

        const lines = results.slice(0, 30).map(sym => 
          `${sym.type} ${sym.name} (${sym.file}:${sym.line})${sym.exported ? ' [exported]' : ''}`
        );

        if (results.length > 30) {
          lines.push(`\n... and ${results.length - 30} more results`);
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
    name: 'SymbolReferences',
    description: 'Find all references to a symbol across the codebase using grep',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name to find references for' },
        path: { type: 'string', description: 'Path to search in (default: cwd)' },
      },
      required: ['name'],
    },
    func: async (p) => {
      try {
        const searchPath = p.path ? String(p.path) : process.cwd();
        const name = String(p.name);
        
        // Use ripgrep if available, fallback to grep
        let cmd: string;
        try {
          child_process.execSync('rg --version', { stdio: 'ignore' });
          cmd = `rg -n --no-heading "\\b${name}\\b" "${searchPath}" --type-add 'src:*.{ts,tsx,js,jsx,py,rs,go,java,cpp,c,rb,php}' -t src`;
        } catch {
          cmd = `grep -rn "\\b${name}\\b" "${searchPath}" --include="*.ts" --include="*.js" --include="*.py"`;
        }

        const result = child_process.execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
        const lines = result.trim().split('\n').slice(0, 50);
        
        if (lines.length === 0 || (lines.length === 1 && !lines[0])) {
          return `No references found for "${name}"`;
        }

        return `References to "${name}":\n${lines.join('\n')}${lines.length === 50 ? '\n... (truncated)' : ''}`;
      } catch (e) {
        if (e instanceof Error && e.message.includes('exit code 1')) {
          return `No references found for "${p.name}"`;
        }
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'DependencyGraph',
    description: 'Get the import/dependency graph for a file or module',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to analyze' },
      },
      required: ['file'],
    },
    func: async (p) => {
      try {
        const filePath = path.resolve(String(p.file));
        const content = await fs.readFile(filePath, 'utf-8');
        const language = detectLanguage(filePath);
        const patterns = PATTERNS[language];

        if (!patterns) {
          return `Language ${language} not supported for dependency analysis`;
        }

        const imports: string[] = [];
        const importPattern = new RegExp(patterns.imports.source, 'gm');
        let match: RegExpExecArray | null;
        while ((match = importPattern.exec(content)) !== null) {
          if (match[1]) imports.push(match[1]);
        }

        if (imports.length === 0) {
          return `No imports found in ${p.file}`;
        }

        const lines = [`Dependencies of ${path.basename(filePath)}:`];
        for (const imp of [...new Set(imports)]) {
          const isRelative = imp.startsWith('.') || imp.startsWith('/');
          lines.push(`  ${isRelative ? '📁' : '📦'} ${imp}`);
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
    name: 'CodebaseStats',
    description: 'Get statistics about the codebase (file counts, languages, line counts)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to analyze (default: cwd)' },
      },
    },
    func: async (p) => {
      try {
        const rootPath = p.path ? String(p.path) : process.cwd();
        const map = codebaseCache?.rootPath === path.resolve(rootPath) 
          ? codebaseCache 
          : await buildCodebaseIndex(rootPath);

        const byLanguage: Record<string, { files: number; lines: number; size: number }> = {};
        let totalLines = 0;
        let totalSize = 0;
        let totalFunctions = 0;
        let totalClasses = 0;

        for (const file of map.files.values()) {
          if (!byLanguage[file.language]) {
            byLanguage[file.language] = { files: 0, lines: 0, size: 0 };
          }
          byLanguage[file.language].files++;
          byLanguage[file.language].lines += file.lineCount;
          byLanguage[file.language].size += file.size;
          totalLines += file.lineCount;
          totalSize += file.size;
          totalFunctions += file.functions.length;
          totalClasses += file.classes.length;
        }

        const lines = [
          `Codebase Statistics`,
          `==================`,
          `Total Files: ${map.files.size}`,
          `Total Lines: ${totalLines.toLocaleString()}`,
          `Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
          `Total Functions: ${totalFunctions}`,
          `Total Classes: ${totalClasses}`,
          `Unique Symbols: ${map.symbols.size}`,
          ``,
          `By Language:`,
        ];

        const sorted = Object.entries(byLanguage).sort((a, b) => b[1].lines - a[1].lines);
        for (const [lang, stats] of sorted) {
          lines.push(`  ${lang}: ${stats.files} files, ${stats.lines.toLocaleString()} lines`);
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
    name: 'FileHistory',
    description: 'Get git history for a file',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path' },
        limit: { type: 'number', description: 'Number of commits to show (default: 10)' },
      },
      required: ['file'],
    },
    func: async (p) => {
      try {
        const history = getGitHistory(String(p.file), (p.limit as number) || 10);
        return `Git history for ${p.file}:\n${history}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'BlameLines',
    description: 'Get git blame for a line range in a file',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path' },
        startLine: { type: 'number', description: 'Start line number' },
        endLine: { type: 'number', description: 'End line number' },
      },
      required: ['file', 'startLine', 'endLine'],
    },
    func: async (p) => {
      try {
        const blame = getGitBlame(String(p.file), Number(p.startLine), Number(p.endLine));
        return `Git blame for ${p.file} lines ${p.startLine}-${p.endLine}:\n${blame}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });
}
