import * as fs from "fs/promises";
import * as path from "path";
import * as child_process from "child_process";
import { glob } from "glob";
import { registerTool } from "./registry.js";

// Diagnostic types
interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source: string;
  code?: string;
  fix?: { range: { start: number; end: number }; text: string };
}

// Test result types
interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
  file?: string;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

// Execute command with timeout
function execCommand(cmd: string, cwd?: string, timeout = 60000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const opts = {
      cwd: cwd || process.cwd(),
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8' as BufferEncoding,
    };

    child_process.exec(cmd, opts, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code || 1 : 0,
      });
    });
  });
}

// Parse TypeScript compiler output
function parseTscOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Format: file(line,col): error TS1234: message
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):\s*(.+)$/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] as 'error' | 'warning',
        message: match[6],
        source: 'tsc',
        code: `TS${match[5]}`,
      });
    }
  }
  
  return diagnostics;
}

// Parse ESLint output
function parseEslintOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  try {
    const results = JSON.parse(output);
    for (const file of results) {
      for (const msg of file.messages || []) {
        diagnostics.push({
          file: file.filePath,
          line: msg.line || 1,
          column: msg.column || 1,
          severity: msg.severity === 2 ? 'error' : 'warning',
          message: msg.message,
          source: 'eslint',
          code: msg.ruleId,
        });
      }
    }
  } catch {
    // Parse non-JSON output (default format)
    const lines = output.split('\n');
    let currentFile = '';
    
    for (const line of lines) {
      if (line.startsWith('/') || line.match(/^[A-Z]:\\/)) {
        currentFile = line.trim();
      } else {
        const match = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+)$/);
        if (match && currentFile) {
          diagnostics.push({
            file: currentFile,
            line: parseInt(match[1]),
            column: parseInt(match[2]),
            severity: match[3] as 'error' | 'warning',
            message: match[4],
            source: 'eslint',
            code: match[5],
          });
        }
      }
    }
  }
  
  return diagnostics;
}

// Parse Pyright/Pylint output
function parsePythonLintOutput(output: string, source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Pyright format: file:line:col - error: message
    let match = line.match(/^(.+?):(\d+):(\d+)\s*-\s*(error|warning|information):\s*(.+)$/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] === 'error' ? 'error' : match[4] === 'warning' ? 'warning' : 'info',
        message: match[5],
        source,
      });
      continue;
    }
    
    // Pylint format: file:line:col: C1234: message
    match = line.match(/^(.+?):(\d+):(\d+):\s*([CRWEF]\d+):\s*(.+)$/);
    if (match) {
      const severity = match[4][0] === 'E' || match[4][0] === 'F' ? 'error' : 'warning';
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity,
        message: match[5],
        source,
        code: match[4],
      });
    }
  }
  
  return diagnostics;
}

// Parse test output (jest-like)
function parseTestOutput(output: string): TestSuite {
  const suite: TestSuite = {
    name: 'Test Suite',
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
  };
  
  // Try to parse as JSON (jest --json)
  try {
    const json = JSON.parse(output);
    if (json.testResults) {
      for (const file of json.testResults) {
        for (const test of file.assertionResults || []) {
          const result: TestResult = {
            name: test.fullName || test.title,
            status: test.status === 'passed' ? 'passed' : test.status === 'pending' ? 'skipped' : 'failed',
            duration: test.duration,
            file: file.name,
          };
          if (test.failureMessages?.length) {
            result.error = test.failureMessages.join('\n');
          }
          suite.tests.push(result);
        }
      }
    }
  } catch {
    // Parse text output
    const lines = output.split('\n');
    for (const line of lines) {
      // Jest/Vitest format
      if (line.includes('✓') || line.includes('✕') || line.includes('○')) {
        const passed = line.includes('✓');
        const skipped = line.includes('○');
        const nameMatch = line.match(/[✓✕○]\s+(.+?)(?:\s+\(\d+\s*(?:ms|s)\))?$/);
        if (nameMatch) {
          suite.tests.push({
            name: nameMatch[1].trim(),
            status: passed ? 'passed' : skipped ? 'skipped' : 'failed',
          });
        }
      }
    }
  }
  
  suite.passed = suite.tests.filter(t => t.status === 'passed').length;
  suite.failed = suite.tests.filter(t => t.status === 'failed').length;
  suite.skipped = suite.tests.filter(t => t.status === 'skipped').length;
  
  return suite;
}

// Detect project type and available tools
async function detectProjectTools(rootPath: string): Promise<{
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | null;
  testRunner: string | null;
  linter: string | null;
  formatter: string | null;
  typeChecker: string | null;
}> {
  const tools = {
    packageManager: null as 'npm' | 'yarn' | 'pnpm' | 'bun' | null,
    testRunner: null as string | null,
    linter: null as string | null,
    formatter: null as string | null,
    typeChecker: null as string | null,
  };
  
  // Check for lock files
  try {
    await fs.access(path.join(rootPath, 'bun.lockb'));
    tools.packageManager = 'bun';
  } catch {
    try {
      await fs.access(path.join(rootPath, 'pnpm-lock.yaml'));
      tools.packageManager = 'pnpm';
    } catch {
      try {
        await fs.access(path.join(rootPath, 'yarn.lock'));
        tools.packageManager = 'yarn';
      } catch {
        try {
          await fs.access(path.join(rootPath, 'package-lock.json'));
          tools.packageManager = 'npm';
        } catch {
          // No JS package manager
        }
      }
    }
  }
  
  // Check package.json for scripts and devDependencies
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(rootPath, 'package.json'), 'utf-8'));
    const scripts = pkgJson.scripts || {};
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    
    // Test runner
    if (deps.vitest || scripts.test?.includes('vitest')) tools.testRunner = 'vitest';
    else if (deps.jest || scripts.test?.includes('jest')) tools.testRunner = 'jest';
    else if (deps.mocha) tools.testRunner = 'mocha';
    
    // Linter
    if (deps.eslint || deps['@eslint/js']) tools.linter = 'eslint';
    if (deps.biome || deps['@biomejs/biome']) tools.linter = 'biome';
    
    // Formatter
    if (deps.prettier) tools.formatter = 'prettier';
    if (deps.biome || deps['@biomejs/biome']) tools.formatter = tools.formatter || 'biome';
    
    // Type checker
    if (deps.typescript) tools.typeChecker = 'tsc';
  } catch {
    // No package.json
  }
  
  // Python project
  try {
    await fs.access(path.join(rootPath, 'pyproject.toml'));
    tools.testRunner = tools.testRunner || 'pytest';
    tools.linter = tools.linter || 'ruff';
    tools.formatter = tools.formatter || 'black';
    tools.typeChecker = tools.typeChecker || 'pyright';
  } catch {
    try {
      await fs.access(path.join(rootPath, 'requirements.txt'));
      tools.testRunner = tools.testRunner || 'pytest';
    } catch {
      // Not a Python project
    }
  }
  
  return tools;
}

// Format diagnostics
function formatDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return 'No issues found.';
  }
  
  // Group by file
  const byFile: Record<string, Diagnostic[]> = {};
  for (const d of diagnostics) {
    const key = d.file;
    if (!byFile[key]) byFile[key] = [];
    byFile[key].push(d);
  }
  
  const lines: string[] = [`Found ${diagnostics.length} issues:\n`];
  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;
  lines.push(`Errors: ${errors}, Warnings: ${warnings}\n`);
  
  for (const [file, fileDiags] of Object.entries(byFile)) {
    lines.push(`\n${file}:`);
    for (const d of fileDiags) {
      const icon = d.severity === 'error' ? '✗' : d.severity === 'warning' ? '⚠' : 'ℹ';
      const code = d.code ? ` [${d.code}]` : '';
      lines.push(`  ${d.line}:${d.column} ${icon} ${d.message}${code}`);
    }
  }
  
  return lines.join('\n');
}

// Format test results
function formatTestResults(suite: TestSuite): string {
  const lines: string[] = [
    `Test Results: ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped\n`,
  ];
  
  // Show failed tests first
  const failed = suite.tests.filter(t => t.status === 'failed');
  if (failed.length > 0) {
    lines.push('Failed:');
    for (const t of failed) {
      lines.push(`  ✗ ${t.name}`);
      if (t.error) {
        lines.push(`    ${t.error.split('\n')[0]}`);
      }
    }
    lines.push('');
  }
  
  // Show passed tests
  const passed = suite.tests.filter(t => t.status === 'passed');
  if (passed.length > 0) {
    lines.push(`Passed (${passed.length}):`);
    for (const t of passed.slice(0, 20)) {
      lines.push(`  ✓ ${t.name}`);
    }
    if (passed.length > 20) {
      lines.push(`  ... and ${passed.length - 20} more`);
    }
  }
  
  return lines.join('\n');
}

// Register advanced coding tools
export function registerCodingAdvancedTools() {
  registerTool({
    name: 'DiagnosticsGet',
    description: 'Get all diagnostics (errors, warnings) for a file or project using TypeScript, ESLint, or language-specific linters',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File to check (or directory for all files)' },
        tool: { 
          type: 'string', 
          enum: ['auto', 'tsc', 'eslint', 'biome', 'pyright', 'ruff'],
          description: 'Linter to use (default: auto-detect)' 
        },
      },
    },
    func: async (p) => {
      try {
        const targetPath = p.file ? String(p.file) : process.cwd();
        const absPath = path.resolve(targetPath);
        const isFile = (await fs.stat(absPath)).isFile();
        const rootPath = isFile ? path.dirname(absPath) : absPath;
        
        const tools = await detectProjectTools(rootPath);
        const requestedTool = p.tool as string | undefined;
        let diagnostics: Diagnostic[] = [];
        
        // TypeScript check
        if (requestedTool === 'tsc' || (!requestedTool && tools.typeChecker === 'tsc')) {
          const { stdout, stderr } = await execCommand(
            `npx tsc --noEmit ${isFile ? absPath : ''}`,
            rootPath
          );
          diagnostics.push(...parseTscOutput(stdout + stderr));
        }
        
        // ESLint
        if (requestedTool === 'eslint' || (!requestedTool && tools.linter === 'eslint')) {
          const { stdout } = await execCommand(
            `npx eslint ${isFile ? absPath : '.'} --format json`,
            rootPath
          );
          diagnostics.push(...parseEslintOutput(stdout));
        }
        
        // Biome
        if (requestedTool === 'biome' || (!requestedTool && tools.linter === 'biome')) {
          const { stdout, stderr } = await execCommand(
            `npx biome check ${isFile ? absPath : '.'}`,
            rootPath
          );
          // Parse biome output (similar to eslint)
          const lines = (stdout + stderr).split('\n');
          for (const line of lines) {
            const match = line.match(/^(.+?):(\d+):(\d+)\s+(.+)$/);
            if (match) {
              diagnostics.push({
                file: match[1],
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                severity: line.toLowerCase().includes('error') ? 'error' : 'warning',
                message: match[4],
                source: 'biome',
              });
            }
          }
        }
        
        // Python: Pyright
        if (requestedTool === 'pyright' || (!requestedTool && tools.typeChecker === 'pyright')) {
          const { stdout } = await execCommand(
            `npx pyright ${isFile ? absPath : '.'}`,
            rootPath
          );
          diagnostics.push(...parsePythonLintOutput(stdout, 'pyright'));
        }
        
        // Python: Ruff
        if (requestedTool === 'ruff' || (!requestedTool && tools.linter === 'ruff')) {
          const { stdout } = await execCommand(
            `ruff check ${isFile ? absPath : '.'}`,
            rootPath
          );
          diagnostics.push(...parsePythonLintOutput(stdout, 'ruff'));
        }
        
        // If no tool found
        if (diagnostics.length === 0 && !requestedTool) {
          return `No linter configured. Detected tools: ${JSON.stringify(tools, null, 2)}`;
        }
        
        return formatDiagnostics(diagnostics);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'DiagnosticsFix',
    description: 'Auto-fix all fixable linting issues using ESLint --fix, Biome, or language-specific tools',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File or directory to fix' },
        tool: { 
          type: 'string', 
          enum: ['auto', 'eslint', 'biome', 'ruff', 'prettier'],
          description: 'Tool to use for fixing' 
        },
      },
    },
    func: async (p) => {
      try {
        const targetPath = p.file ? String(p.file) : '.';
        const absPath = path.resolve(targetPath);
        const rootPath = (await fs.stat(absPath)).isFile() ? path.dirname(absPath) : absPath;
        
        const tools = await detectProjectTools(rootPath);
        const requestedTool = p.tool as string | undefined;
        const results: string[] = [];
        
        // ESLint fix
        if (requestedTool === 'eslint' || (!requestedTool && tools.linter === 'eslint')) {
          const { stdout, stderr, exitCode } = await execCommand(
            `npx eslint ${targetPath} --fix`,
            rootPath
          );
          results.push(`ESLint fix: ${exitCode === 0 ? 'Success' : 'Partial'}`);
          if (stderr) results.push(stderr.slice(0, 500));
        }
        
        // Biome fix
        if (requestedTool === 'biome' || (!requestedTool && tools.linter === 'biome')) {
          const { stdout, stderr, exitCode } = await execCommand(
            `npx biome check ${targetPath} --apply`,
            rootPath
          );
          results.push(`Biome fix: ${exitCode === 0 ? 'Success' : 'Partial'}`);
        }
        
        // Ruff fix
        if (requestedTool === 'ruff' || (!requestedTool && tools.linter === 'ruff')) {
          const { stdout, stderr, exitCode } = await execCommand(
            `ruff check ${targetPath} --fix`,
            rootPath
          );
          results.push(`Ruff fix: ${exitCode === 0 ? 'Success' : 'Partial'}`);
        }
        
        // Prettier
        if (requestedTool === 'prettier' || (!requestedTool && tools.formatter === 'prettier')) {
          const { exitCode } = await execCommand(
            `npx prettier --write ${targetPath}`,
            rootPath
          );
          results.push(`Prettier format: ${exitCode === 0 ? 'Success' : 'Failed'}`);
        }
        
        if (results.length === 0) {
          return 'No auto-fix tools configured for this project.';
        }
        
        return results.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TestRun',
    description: 'Run tests using the project\'s test runner (Jest, Vitest, Pytest, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific test file to run (optional)' },
        pattern: { type: 'string', description: 'Test name pattern to match (optional)' },
        tool: { type: 'string', enum: ['auto', 'vitest', 'jest', 'pytest', 'mocha'] },
        watch: { type: 'boolean', description: 'Run in watch mode' },
      },
    },
    func: async (p) => {
      try {
        const rootPath = process.cwd();
        const tools = await detectProjectTools(rootPath);
        const requestedTool = (p.tool as string) || tools.testRunner || 'vitest';
        
        let cmd = '';
        const file = p.file ? String(p.file) : '';
        const pattern = p.pattern ? String(p.pattern) : '';
        
        switch (requestedTool) {
          case 'vitest':
            cmd = `npx vitest run ${file} ${pattern ? `-t "${pattern}"` : ''} --reporter=verbose`;
            break;
          case 'jest':
            cmd = `npx jest ${file} ${pattern ? `--testNamePattern="${pattern}"` : ''} --verbose`;
            break;
          case 'pytest':
            cmd = `pytest ${file} ${pattern ? `-k "${pattern}"` : ''} -v`;
            break;
          case 'mocha':
            cmd = `npx mocha ${file} ${pattern ? `--grep "${pattern}"` : ''}`;
            break;
          default:
            return `Unknown test runner: ${requestedTool}`;
        }
        
        if (p.watch) {
          cmd = cmd.replace('vitest run', 'vitest').replace('jest ', 'jest --watch ');
        }
        
        const { stdout, stderr, exitCode } = await execCommand(cmd, rootPath, 120000);
        const output = stdout + stderr;
        
        const suite = parseTestOutput(output);
        
        if (suite.tests.length > 0) {
          return formatTestResults(suite);
        }
        
        // Return raw output if parsing failed
        return `Exit code: ${exitCode}\n\n${output.slice(0, 10000)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'TestGenerate',
    description: 'Generate a test file template for a given source file',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Source file to generate tests for' },
        framework: { type: 'string', enum: ['vitest', 'jest', 'pytest'], description: 'Test framework' },
        outputPath: { type: 'string', description: 'Output path for test file (optional)' },
      },
      required: ['file'],
    },
    func: async (p) => {
      try {
        const filePath = path.resolve(String(p.file));
        const content = await fs.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const framework = p.framework as string || 'vitest';
        
        // Extract exports and function names
        const exports: string[] = [];
        const funcMatch = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
        for (const m of funcMatch) exports.push(m[1]);
        
        const constMatch = content.matchAll(/export\s+const\s+(\w+)/g);
        for (const m of constMatch) exports.push(m[1]);
        
        const classMatch = content.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g);
        for (const m of classMatch) exports.push(m[1]);
        
        if (exports.length === 0) {
          return 'No exports found in file to generate tests for.';
        }
        
        // Generate test file
        let testContent = '';
        const importPath = `./${baseName}`;
        
        if (framework === 'pytest') {
          testContent = `"""Tests for ${baseName}"""\n\nimport pytest\nfrom ${baseName.replace(/-/g, '_')} import ${exports.join(', ')}\n\n`;
          for (const exp of exports) {
            testContent += `\nclass Test${exp.charAt(0).toUpperCase() + exp.slice(1)}:\n    """Tests for ${exp}"""\n\n    def test_basic(self):\n        """Test basic functionality"""\n        # TODO: Implement test\n        pass\n`;
          }
        } else {
          // Vitest/Jest
          testContent = `import { describe, it, expect } from '${framework}';\nimport { ${exports.join(', ')} } from '${importPath}';\n\n`;
          for (const exp of exports) {
            testContent += `describe('${exp}', () => {\n  it('should work correctly', () => {\n    // TODO: Implement test\n    expect(true).toBe(true);\n  });\n});\n\n`;
          }
        }
        
        // Determine output path
        const testExt = framework === 'pytest' ? '.py' : ext;
        const testName = framework === 'pytest' ? `test_${baseName}${testExt}` : `${baseName}.test${testExt}`;
        const outputPath = p.outputPath ? String(p.outputPath) : path.join(path.dirname(filePath), testName);
        
        await fs.writeFile(outputPath, testContent, 'utf-8');
        
        return `Generated test file: ${outputPath}\n\nExports covered:\n${exports.map(e => `  - ${e}`).join('\n')}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: 'FormatCode',
    description: 'Format code using Prettier, Biome, Black, or language-specific formatters',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File or directory to format' },
        tool: { type: 'string', enum: ['auto', 'prettier', 'biome', 'black', 'rustfmt', 'gofmt'] },
        check: { type: 'boolean', description: 'Check only, don\'t modify files' },
      },
    },
    func: async (p) => {
      try {
        const targetPath = p.file ? String(p.file) : '.';
        const absPath = path.resolve(targetPath);
        const rootPath = (await fs.stat(absPath).catch(() => ({ isFile: () => false }))).isFile?.() 
          ? path.dirname(absPath) 
          : absPath;
        
        const tools = await detectProjectTools(rootPath);
        const requestedTool = (p.tool as string) || tools.formatter || 'prettier';
        const checkOnly = Boolean(p.check);
        
        let cmd = '';
        switch (requestedTool) {
          case 'prettier':
            cmd = `npx prettier ${checkOnly ? '--check' : '--write'} "${targetPath}"`;
            break;
          case 'biome':
            cmd = `npx biome format ${checkOnly ? '--check' : '--write'} "${targetPath}"`;
            break;
          case 'black':
            cmd = `black ${checkOnly ? '--check' : ''} "${targetPath}"`;
            break;
          case 'rustfmt':
            cmd = `rustfmt ${checkOnly ? '--check' : ''} "${targetPath}"`;
            break;
          case 'gofmt':
            cmd = checkOnly ? `gofmt -l "${targetPath}"` : `gofmt -w "${targetPath}"`;
            break;
          default:
            return `Unknown formatter: ${requestedTool}`;
        }
        
        const { stdout, stderr, exitCode } = await execCommand(cmd, rootPath);
        
        if (exitCode === 0) {
          return checkOnly ? 'All files are formatted correctly.' : `Formatted: ${targetPath}`;
        }
        
        return `${checkOnly ? 'Formatting check failed' : 'Formatting completed with issues'}:\n${stdout}\n${stderr}`.slice(0, 5000);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TypeCheck',
    description: 'Run type checking using TypeScript, Pyright, or language-specific type checkers',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File or directory to check' },
        tool: { type: 'string', enum: ['auto', 'tsc', 'pyright', 'mypy'] },
      },
    },
    func: async (p) => {
      try {
        const targetPath = p.file ? String(p.file) : '.';
        const absPath = path.resolve(targetPath);
        const rootPath = (await fs.stat(absPath)).isFile() ? path.dirname(absPath) : absPath;
        
        const tools = await detectProjectTools(rootPath);
        const requestedTool = (p.tool as string) || tools.typeChecker || 'tsc';
        
        let cmd = '';
        switch (requestedTool) {
          case 'tsc':
            cmd = `npx tsc --noEmit`;
            break;
          case 'pyright':
            cmd = `npx pyright ${targetPath}`;
            break;
          case 'mypy':
            cmd = `mypy ${targetPath}`;
            break;
          default:
            return `Unknown type checker: ${requestedTool}`;
        }
        
        const { stdout, stderr, exitCode } = await execCommand(cmd, rootPath, 120000);
        const output = stdout + stderr;
        
        if (exitCode === 0) {
          return `Type check passed. No errors found.`;
        }
        
        // Parse and format output
        let diagnostics: Diagnostic[] = [];
        if (requestedTool === 'tsc') {
          diagnostics = parseTscOutput(output);
        } else {
          diagnostics = parsePythonLintOutput(output, requestedTool);
        }
        
        if (diagnostics.length > 0) {
          return formatDiagnostics(diagnostics);
        }
        
        return `Type check output:\n${output.slice(0, 5000)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'ProjectDetect',
    description: 'Detect project type and available development tools (package manager, test runner, linter, formatter)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project path (default: cwd)' },
      },
    },
    func: async (p) => {
      try {
        const rootPath = p.path ? String(p.path) : process.cwd();
        const tools = await detectProjectTools(rootPath);
        
        const lines = [
          `Project Analysis: ${rootPath}`,
          '',
          `Package Manager: ${tools.packageManager || 'Not detected'}`,
          `Test Runner: ${tools.testRunner || 'Not detected'}`,
          `Linter: ${tools.linter || 'Not detected'}`,
          `Formatter: ${tools.formatter || 'Not detected'}`,
          `Type Checker: ${tools.typeChecker || 'Not detected'}`,
        ];
        
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });
}
