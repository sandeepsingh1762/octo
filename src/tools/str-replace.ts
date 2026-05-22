import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { registerTool } from "./registry.js";
import { unifiedDiff, maybeTruncateDiff } from "./diff.js";

// Edit history for undo functionality
interface EditRecord {
  id: string;
  timestamp: Date;
  file: string;
  oldContent: string;
  newContent: string;
  description: string;
}

// Checkpoint for grouping edits
interface Checkpoint {
  id: string;
  name: string;
  timestamp: Date;
  editIds: string[];
}

const editHistory: EditRecord[] = [];
const checkpoints: Checkpoint[] = [];
let currentCheckpointEdits: string[] = [];

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Fuzzy matching for whitespace variations
function fuzzyMatch(content: string, searchStr: string): { index: number; match: string } | null {
  // Try exact match first
  const exactIndex = content.indexOf(searchStr);
  if (exactIndex !== -1) {
    return { index: exactIndex, match: searchStr };
  }

  // Normalize whitespace for comparison
  const normalizedSearch = searchStr.replace(/\s+/g, ' ').trim();
  const lines = content.split('\n');
  
  // Try to find a section that matches when whitespace is normalized
  for (let i = 0; i < lines.length; i++) {
    const searchLines = searchStr.split('\n');
    if (i + searchLines.length > lines.length) break;
    
    let matches = true;
    const matchedLines: string[] = [];
    
    for (let j = 0; j < searchLines.length; j++) {
      const contentLine = lines[i + j];
      const searchLine = searchLines[j];
      
      // Compare with normalized whitespace
      const normalizedContent = contentLine.replace(/^\s+/, '').replace(/\s+$/, '');
      const normalizedSearchLine = searchLine.replace(/^\s+/, '').replace(/\s+$/, '');
      
      if (normalizedContent !== normalizedSearchLine) {
        matches = false;
        break;
      }
      matchedLines.push(contentLine);
    }
    
    if (matches) {
      const matchStr = matchedLines.join('\n');
      const index = content.indexOf(lines[i]);
      return { index, match: matchStr };
    }
  }
  
  return null;
}

// Core replace function with enhanced features
async function strReplace(
  filePath: string,
  oldString: string,
  newString: string,
  options: {
    replaceAll?: boolean;
    matchMode?: 'exact' | 'regex' | 'fuzzy';
    dryRun?: boolean;
    contextLines?: number;
  } = {}
): Promise<{ success: boolean; message: string; diff?: string; preview?: string }> {
  try {
    const p = path.resolve(filePath);
    const content = await fs.readFile(p, "utf-8");
    const normContent = content.replace(/\r\n/g, "\n");
    const normOld = oldString.replace(/\r\n/g, "\n");
    const normNew = newString.replace(/\r\n/g, "\n");

    let newContent: string;
    let matchCount = 0;

    if (options.matchMode === 'regex') {
      // Regex mode
      try {
        const regex = new RegExp(normOld, options.replaceAll ? 'g' : '');
        const matches = normContent.match(new RegExp(normOld, 'g'));
        matchCount = matches ? matches.length : 0;
        newContent = normContent.replace(regex, normNew);
      } catch (e) {
        return { success: false, message: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
      }
    } else if (options.matchMode === 'fuzzy') {
      // Fuzzy mode - handles whitespace variations
      const fuzzyResult = fuzzyMatch(normContent, normOld);
      if (!fuzzyResult) {
        return { success: false, message: "Error: old_string not found (even with fuzzy matching)" };
      }
      matchCount = 1;
      newContent = normContent.slice(0, fuzzyResult.index) + normNew + 
                   normContent.slice(fuzzyResult.index + fuzzyResult.match.length);
    } else {
      // Exact mode (default)
      matchCount = normContent.split(normOld).length - 1;
      if (matchCount === 0) {
        return { success: false, message: "Error: old_string not found in file. Please ensure EXACT match." };
      }
      if (matchCount > 1 && !options.replaceAll) {
        return { 
          success: false, 
          message: `Error: old_string appears ${matchCount} times. Use replace_all=true or provide more context.` 
        };
      }
      newContent = options.replaceAll 
        ? normContent.split(normOld).join(normNew)
        : normContent.replace(normOld, normNew);
    }

    // Generate diff
    const diff = unifiedDiff(content, newContent, path.basename(p));

    // Dry run - just return preview
    if (options.dryRun) {
      return {
        success: true,
        message: `Preview: Would replace ${matchCount} occurrence(s)`,
        preview: maybeTruncateDiff(diff),
      };
    }

    // Save to history for undo
    const editId = generateId();
    editHistory.push({
      id: editId,
      timestamp: new Date(),
      file: p,
      oldContent: content,
      newContent,
      description: `Replace in ${path.basename(p)}`,
    });
    currentCheckpointEdits.push(editId);

    // Apply changes
    await fs.writeFile(p, newContent, "utf-8");

    return {
      success: true,
      message: `Replaced ${matchCount} occurrence(s) in ${path.basename(p)}`,
      diff: maybeTruncateDiff(diff),
    };
  } catch (e) {
    return { success: false, message: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Multi-file replace
async function strReplaceMulti(
  pattern: string,
  oldString: string,
  newString: string,
  options: {
    replaceAll?: boolean;
    matchMode?: 'exact' | 'regex' | 'fuzzy';
    dryRun?: boolean;
    basePath?: string;
  } = {}
): Promise<{ success: boolean; message: string; results: Array<{ file: string; status: string }> }> {
  const basePath = options.basePath || process.cwd();
  const files = await glob(pattern, { cwd: basePath, absolute: true });
  
  if (files.length === 0) {
    return { success: false, message: `No files matched pattern: ${pattern}`, results: [] };
  }

  const results: Array<{ file: string; status: string }> = [];
  let successCount = 0;

  for (const file of files) {
    const result = await strReplace(file, oldString, newString, {
      replaceAll: options.replaceAll,
      matchMode: options.matchMode,
      dryRun: options.dryRun,
    });
    
    results.push({
      file: path.relative(basePath, file),
      status: result.success ? result.message : result.message,
    });
    
    if (result.success) successCount++;
  }

  return {
    success: successCount > 0,
    message: options.dryRun 
      ? `Preview: Would modify ${successCount}/${files.length} files`
      : `Modified ${successCount}/${files.length} files`,
    results,
  };
}

// Undo last edit
async function undoLastEdit(): Promise<{ success: boolean; message: string }> {
  const lastEdit = editHistory.pop();
  if (!lastEdit) {
    return { success: false, message: "No edits to undo" };
  }

  try {
    await fs.writeFile(lastEdit.file, lastEdit.oldContent, "utf-8");
    
    // Remove from current checkpoint
    const idx = currentCheckpointEdits.indexOf(lastEdit.id);
    if (idx !== -1) currentCheckpointEdits.splice(idx, 1);

    return {
      success: true,
      message: `Undone: ${lastEdit.description}`,
    };
  } catch (e) {
    // Put it back if undo failed
    editHistory.push(lastEdit);
    return { success: false, message: `Failed to undo: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Create checkpoint
function createCheckpoint(name: string): Checkpoint {
  const checkpoint: Checkpoint = {
    id: generateId(),
    name,
    timestamp: new Date(),
    editIds: [...currentCheckpointEdits],
  };
  checkpoints.push(checkpoint);
  currentCheckpointEdits = [];
  return checkpoint;
}

// Restore to checkpoint
async function restoreCheckpoint(checkpointId: string): Promise<{ success: boolean; message: string }> {
  const checkpointIndex = checkpoints.findIndex(c => c.id === checkpointId);
  if (checkpointIndex === -1) {
    return { success: false, message: `Checkpoint ${checkpointId} not found` };
  }

  // Find all edits after this checkpoint
  const checkpoint = checkpoints[checkpointIndex];
  const laterCheckpoints = checkpoints.slice(checkpointIndex + 1);
  const editIdsToUndo = new Set<string>();
  
  for (const cp of laterCheckpoints) {
    for (const editId of cp.editIds) {
      editIdsToUndo.add(editId);
    }
  }
  for (const editId of currentCheckpointEdits) {
    editIdsToUndo.add(editId);
  }

  // Undo edits in reverse order
  let undoCount = 0;
  for (let i = editHistory.length - 1; i >= 0; i--) {
    const edit = editHistory[i];
    if (editIdsToUndo.has(edit.id)) {
      try {
        await fs.writeFile(edit.file, edit.oldContent, "utf-8");
        undoCount++;
      } catch (e) {
        return { 
          success: false, 
          message: `Failed to restore: ${e instanceof Error ? e.message : String(e)}. ${undoCount} edits were undone.` 
        };
      }
    }
  }

  // Clean up history
  const editsToKeep = editHistory.filter(e => !editIdsToUndo.has(e.id));
  editHistory.length = 0;
  editHistory.push(...editsToKeep);
  
  checkpoints.length = checkpointIndex + 1;
  currentCheckpointEdits = [];

  return {
    success: true,
    message: `Restored to checkpoint "${checkpoint.name}". Undone ${undoCount} edits.`,
  };
}

// Register enhanced string replace tools
export function registerStrReplaceTools() {
  registerTool({
    name: 'StrReplace',
    description: 'Replace exact text in a file with enhanced options: regex mode, fuzzy matching, dry-run preview',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'File path to edit' },
        old_string: { type: 'string', description: 'Text to replace (or regex pattern in regex mode)' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
        match_mode: { 
          type: 'string', 
          enum: ['exact', 'regex', 'fuzzy'],
          description: 'Match mode: exact (default), regex, or fuzzy (whitespace-tolerant)' 
        },
        dry_run: { type: 'boolean', description: 'Preview changes without applying' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    func: async (p) => {
      const result = await strReplace(
        String(p.file_path),
        String(p.old_string),
        String(p.new_string),
        {
          replaceAll: Boolean(p.replace_all),
          matchMode: (p.match_mode as 'exact' | 'regex' | 'fuzzy') || 'exact',
          dryRun: Boolean(p.dry_run),
        }
      );
      
      if (result.success) {
        return result.diff || result.preview || result.message;
      }
      return result.message;
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'StrReplaceMulti',
    description: 'Replace text across multiple files matching a glob pattern',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files (e.g., "src/**/*.ts")' },
        old_string: { type: 'string', description: 'Text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences in each file' },
        match_mode: { type: 'string', enum: ['exact', 'regex', 'fuzzy'] },
        dry_run: { type: 'boolean', description: 'Preview changes without applying' },
        base_path: { type: 'string', description: 'Base path for glob pattern (default: cwd)' },
      },
      required: ['pattern', 'old_string', 'new_string'],
    },
    func: async (p) => {
      const result = await strReplaceMulti(
        String(p.pattern),
        String(p.old_string),
        String(p.new_string),
        {
          replaceAll: Boolean(p.replace_all),
          matchMode: (p.match_mode as 'exact' | 'regex' | 'fuzzy') || 'exact',
          dryRun: Boolean(p.dry_run),
          basePath: p.base_path as string | undefined,
        }
      );
      
      const lines = [result.message];
      for (const r of result.results) {
        lines.push(`  ${r.file}: ${r.status}`);
      }
      return lines.join('\n');
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'StrReplaceUndo',
    description: 'Undo the last string replacement',
    input_schema: {
      type: 'object',
      properties: {},
    },
    func: async () => {
      const result = await undoLastEdit();
      return result.message;
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'StrReplaceCheckpoint',
    description: 'Create a checkpoint that you can restore to later',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Checkpoint name' },
      },
      required: ['name'],
    },
    func: async (p) => {
      const checkpoint = createCheckpoint(String(p.name));
      return `Created checkpoint "${checkpoint.name}" (ID: ${checkpoint.id}) with ${checkpoint.editIds.length} edits`;
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: 'StrReplaceRestore',
    description: 'Restore to a previous checkpoint, undoing all changes since then',
    input_schema: {
      type: 'object',
      properties: {
        checkpoint_id: { type: 'string', description: 'Checkpoint ID to restore to' },
      },
      required: ['checkpoint_id'],
    },
    func: async (p) => {
      const result = await restoreCheckpoint(String(p.checkpoint_id));
      return result.message;
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'StrReplaceHistory',
    description: 'Show edit history and checkpoints',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent edits to show' },
      },
    },
    func: async (p) => {
      const limit = (p.limit as number) || 20;
      const lines: string[] = [];

      if (checkpoints.length > 0) {
        lines.push('Checkpoints:');
        for (const cp of checkpoints) {
          lines.push(`  [${cp.id}] ${cp.name} (${cp.editIds.length} edits) - ${cp.timestamp.toISOString()}`);
        }
        lines.push('');
      }

      lines.push(`Recent Edits (${Math.min(limit, editHistory.length)} of ${editHistory.length}):`);
      const recentEdits = editHistory.slice(-limit).reverse();
      for (const edit of recentEdits) {
        lines.push(`  [${edit.id}] ${edit.description} - ${edit.timestamp.toISOString()}`);
      }

      if (currentCheckpointEdits.length > 0) {
        lines.push(`\nUnsaved edits since last checkpoint: ${currentCheckpointEdits.length}`);
      }

      return lines.join('\n') || 'No edit history';
    },
    read_only: true,
    concurrent_safe: true,
  });
}
