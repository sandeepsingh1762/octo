import { registerTool } from "./registry.js";

// Task States (inspired by MiniClaw mc-board)
export type TaskState = 'backlog' | 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled' | 'blocked';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  description: string;
  state: TaskState;
  priority: TaskPriority;
  dependencies: string[];
  blockedBy: string[];
  assignedTo: string;
  parentTask?: string;
  subtasks: string[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  estimatedTokens?: number;
  actualTokens?: number;
  metadata: Record<string, unknown>;
}

export interface TaskBucket {
  id: string;
  name: string;
  tasks: Map<string, Task>;
  workflow: TaskState[];
  createdAt: Date;
}

// State machine transitions
const STATE_TRANSITIONS: Record<TaskState, TaskState[]> = {
  backlog: ['pending', 'cancelled'],
  pending: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['in_review', 'blocked', 'cancelled'],
  in_review: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: ['backlog'],
  blocked: ['pending', 'in_progress', 'cancelled'],
};

// In-memory storage
const buckets: Map<string, TaskBucket> = new Map();
let defaultBucketId: string | null = null;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultBucket(): TaskBucket {
  if (!defaultBucketId || !buckets.has(defaultBucketId)) {
    const bucket = createBucket('default');
    defaultBucketId = bucket.id;
  }
  return buckets.get(defaultBucketId)!;
}

function createBucket(name: string, workflow?: TaskState[]): TaskBucket {
  const bucket: TaskBucket = {
    id: generateId(),
    name,
    tasks: new Map(),
    workflow: workflow || ['backlog', 'pending', 'in_progress', 'in_review', 'completed'],
    createdAt: new Date(),
  };
  buckets.set(bucket.id, bucket);
  return bucket;
}

function createTask(
  bucketId: string | undefined,
  title: string,
  description: string,
  priority: TaskPriority = 'medium',
  dependencies: string[] = [],
  tags: string[] = []
): Task {
  const bucket = bucketId ? buckets.get(bucketId) : getDefaultBucket();
  if (!bucket) throw new Error(`Bucket ${bucketId} not found`);

  const task: Task = {
    id: generateId(),
    title,
    description,
    state: 'backlog',
    priority,
    dependencies,
    blockedBy: [],
    assignedTo: '',
    subtasks: [],
    tags,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };

  // Check if dependencies block this task
  for (const depId of dependencies) {
    const depTask = bucket.tasks.get(depId);
    if (depTask && depTask.state !== 'completed') {
      task.blockedBy.push(depId);
    }
  }
  if (task.blockedBy.length > 0) {
    task.state = 'blocked';
  }

  bucket.tasks.set(task.id, task);
  return task;
}

function transitionTask(taskId: string, newState: TaskState, reason?: string): Task {
  for (const bucket of buckets.values()) {
    const task = bucket.tasks.get(taskId);
    if (task) {
      const allowedTransitions = STATE_TRANSITIONS[task.state];
      if (!allowedTransitions.includes(newState)) {
        throw new Error(`Cannot transition from ${task.state} to ${newState}. Allowed: ${allowedTransitions.join(', ')}`);
      }

      task.state = newState;
      task.updatedAt = new Date();
      if (reason) {
        task.metadata.lastTransitionReason = reason;
      }

      // If task completed, unblock dependent tasks
      if (newState === 'completed') {
        for (const t of bucket.tasks.values()) {
          const idx = t.blockedBy.indexOf(taskId);
          if (idx !== -1) {
            t.blockedBy.splice(idx, 1);
            if (t.blockedBy.length === 0 && t.state === 'blocked') {
              t.state = 'pending';
              t.updatedAt = new Date();
            }
          }
        }
      }

      return task;
    }
  }
  throw new Error(`Task ${taskId} not found`);
}

function assignTask(taskId: string, agentId: string): Task {
  for (const bucket of buckets.values()) {
    const task = bucket.tasks.get(taskId);
    if (task) {
      task.assignedTo = agentId;
      task.updatedAt = new Date();
      return task;
    }
  }
  throw new Error(`Task ${taskId} not found`);
}

function decomposeTask(taskId: string, subtaskDefs: Array<{ title: string; description: string }>): Task[] {
  for (const bucket of buckets.values()) {
    const task = bucket.tasks.get(taskId);
    if (task) {
      const subtasks: Task[] = [];
      for (const def of subtaskDefs) {
        const subtask = createTask(bucket.id, def.title, def.description, task.priority, [], task.tags);
        subtask.parentTask = taskId;
        task.subtasks.push(subtask.id);
        subtasks.push(subtask);
      }
      task.updatedAt = new Date();
      return subtasks;
    }
  }
  throw new Error(`Task ${taskId} not found`);
}

function queryTasks(filters: {
  bucketId?: string;
  state?: TaskState;
  priority?: TaskPriority;
  assignee?: string;
  tags?: string[];
  parentTask?: string;
}): Task[] {
  const results: Task[] = [];
  const bucketsToSearch = filters.bucketId 
    ? [buckets.get(filters.bucketId)].filter(Boolean) as TaskBucket[]
    : Array.from(buckets.values());

  for (const bucket of bucketsToSearch) {
    for (const task of bucket.tasks.values()) {
      if (filters.state && task.state !== filters.state) continue;
      if (filters.priority && task.priority !== filters.priority) continue;
      if (filters.assignee && task.assignedTo !== filters.assignee) continue;
      if (filters.parentTask && task.parentTask !== filters.parentTask) continue;
      if (filters.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(t => task.tags.includes(t));
        if (!hasAllTags) continue;
      }
      results.push(task);
    }
  }

  // Sort by priority and creation date
  const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return results;
}

function blockTask(taskId: string, blockedBy: string, reason: string): Task {
  for (const bucket of buckets.values()) {
    const task = bucket.tasks.get(taskId);
    if (task) {
      if (!task.blockedBy.includes(blockedBy)) {
        task.blockedBy.push(blockedBy);
      }
      task.state = 'blocked';
      task.updatedAt = new Date();
      task.metadata.blockReason = reason;
      return task;
    }
  }
  throw new Error(`Task ${taskId} not found`);
}

function unblockTask(taskId: string, unblockedBy?: string): Task {
  for (const bucket of buckets.values()) {
    const task = bucket.tasks.get(taskId);
    if (task) {
      if (unblockedBy) {
        const idx = task.blockedBy.indexOf(unblockedBy);
        if (idx !== -1) task.blockedBy.splice(idx, 1);
      } else {
        task.blockedBy = [];
      }
      
      if (task.blockedBy.length === 0 && task.state === 'blocked') {
        task.state = 'pending';
      }
      task.updatedAt = new Date();
      delete task.metadata.blockReason;
      return task;
    }
  }
  throw new Error(`Task ${taskId} not found`);
}

function getNextTask(agentId?: string): Task | null {
  const bucket = getDefaultBucket();
  
  // Find highest priority pending task that's not blocked
  for (const task of bucket.tasks.values()) {
    if (task.state === 'pending' && task.blockedBy.length === 0) {
      if (!agentId || !task.assignedTo || task.assignedTo === agentId) {
        return task;
      }
    }
  }
  return null;
}

function formatTask(task: Task): string {
  const lines = [
    `[${task.id}] ${task.title}`,
    `  State: ${task.state} | Priority: ${task.priority}`,
    `  Description: ${task.description}`,
  ];
  if (task.assignedTo) lines.push(`  Assigned to: ${task.assignedTo}`);
  if (task.tags.length) lines.push(`  Tags: ${task.tags.join(', ')}`);
  if (task.dependencies.length) lines.push(`  Dependencies: ${task.dependencies.join(', ')}`);
  if (task.blockedBy.length) lines.push(`  Blocked by: ${task.blockedBy.join(', ')}`);
  if (task.subtasks.length) lines.push(`  Subtasks: ${task.subtasks.join(', ')}`);
  return lines.join('\n');
}

function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) return 'No tasks found.';
  return tasks.map(formatTask).join('\n\n');
}

// Register all task bucket tools
export function registerTaskBucketTools() {
  registerTool({
    name: 'TaskBucketCreate',
    description: 'Create a new task bucket/board for organizing tasks',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the bucket' },
        workflow: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Custom workflow states (optional)' 
        },
      },
      required: ['name'],
    },
    func: async (p) => {
      try {
        const bucket = createBucket(String(p.name), p.workflow as TaskState[] | undefined);
        return `Created bucket "${bucket.name}" with ID: ${bucket.id}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: 'TaskAdd',
    description: 'Add a new task to a bucket with title, description, priority, and optional dependencies',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Task priority' },
        dependencies: { type: 'array', items: { type: 'string' }, description: 'IDs of tasks this depends on' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        bucketId: { type: 'string', description: 'Bucket ID (uses default if not specified)' },
      },
      required: ['title', 'description'],
    },
    func: async (p) => {
      try {
        const task = createTask(
          p.bucketId as string | undefined,
          String(p.title),
          String(p.description),
          (p.priority as TaskPriority) || 'medium',
          (p.dependencies as string[]) || [],
          (p.tags as string[]) || []
        );
        return `Created task:\n${formatTask(task)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TaskTransition',
    description: 'Move a task to a new state (backlog → pending → in_progress → in_review → completed)',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        newState: { 
          type: 'string', 
          enum: ['backlog', 'pending', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked'],
          description: 'New state for the task' 
        },
        reason: { type: 'string', description: 'Reason for transition' },
      },
      required: ['taskId', 'newState'],
    },
    func: async (p) => {
      try {
        const task = transitionTask(String(p.taskId), p.newState as TaskState, p.reason as string | undefined);
        return `Task transitioned:\n${formatTask(task)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TaskAssign',
    description: 'Assign a task to an agent',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        agentId: { type: 'string', description: 'Agent ID to assign to' },
      },
      required: ['taskId', 'agentId'],
    },
    func: async (p) => {
      try {
        const task = assignTask(String(p.taskId), String(p.agentId));
        return `Task assigned:\n${formatTask(task)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TaskDecompose',
    description: 'Break a task into subtasks',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Parent task ID' },
        subtasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
          description: 'List of subtasks to create',
        },
      },
      required: ['taskId', 'subtasks'],
    },
    func: async (p) => {
      try {
        const subtasks = decomposeTask(String(p.taskId), p.subtasks as Array<{ title: string; description: string }>);
        return `Created ${subtasks.length} subtasks:\n${formatTaskList(subtasks)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TaskQuery',
    description: 'Query tasks by filters (state, priority, assignee, tags)',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['backlog', 'pending', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        assignee: { type: 'string', description: 'Agent ID' },
        tags: { type: 'array', items: { type: 'string' } },
        bucketId: { type: 'string' },
      },
    },
    func: async (p) => {
      try {
        const tasks = queryTasks({
          bucketId: p.bucketId as string | undefined,
          state: p.state as TaskState | undefined,
          priority: p.priority as TaskPriority | undefined,
          assignee: p.assignee as string | undefined,
          tags: p.tags as string[] | undefined,
        });
        return formatTaskList(tasks);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'TaskBlock',
    description: 'Mark a task as blocked by another task or external factor',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task to block' },
        blockedBy: { type: 'string', description: 'ID of blocking task or external factor' },
        reason: { type: 'string', description: 'Reason for blocking' },
      },
      required: ['taskId', 'blockedBy', 'reason'],
    },
    func: async (p) => {
      try {
        const task = blockTask(String(p.taskId), String(p.blockedBy), String(p.reason));
        return `Task blocked:\n${formatTask(task)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TaskUnblock',
    description: 'Unblock a task',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task to unblock' },
        unblockedBy: { type: 'string', description: 'Specific blocker to remove (removes all if not specified)' },
      },
      required: ['taskId'],
    },
    func: async (p) => {
      try {
        const task = unblockTask(String(p.taskId), p.unblockedBy as string | undefined);
        return `Task unblocked:\n${formatTask(task)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: false,
    concurrent_safe: false,
  });

  registerTool({
    name: 'TaskNext',
    description: 'Get the next highest priority task that is ready to work on',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to filter by assignment' },
      },
    },
    func: async (p) => {
      try {
        const task = getNextTask(p.agentId as string | undefined);
        if (!task) return 'No tasks available to work on.';
        return `Next task:\n${formatTask(task)}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    read_only: true,
    concurrent_safe: true,
  });

  registerTool({
    name: 'TaskBucketList',
    description: 'List all task buckets',
    input_schema: {
      type: 'object',
      properties: {},
    },
    func: async () => {
      if (buckets.size === 0) return 'No buckets created yet.';
      const lines: string[] = [];
      for (const bucket of buckets.values()) {
        const taskCount = bucket.tasks.size;
        const states: Record<string, number> = {};
        for (const task of bucket.tasks.values()) {
          states[task.state] = (states[task.state] || 0) + 1;
        }
        lines.push(`[${bucket.id}] ${bucket.name}`);
        lines.push(`  Tasks: ${taskCount}`);
        if (taskCount > 0) {
          const stateStr = Object.entries(states).map(([s, c]) => `${s}: ${c}`).join(', ');
          lines.push(`  States: ${stateStr}`);
        }
      }
      return lines.join('\n');
    },
    read_only: true,
    concurrent_safe: true,
  });
}
