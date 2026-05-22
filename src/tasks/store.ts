export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "deleted";

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  created_at: string;
}

const _tasks: Map<string, Task> = new Map();

export function createTask(subject: string, description: string): Task {
  const id = "t_" + Math.random().toString(36).slice(2, 10);
  const t: Task = { id, subject, description, status: "pending", created_at: new Date().toISOString() };
  _tasks.set(id, t);
  return t;
}

export function updateTask(id: string, updates: Partial<Task>): Task | undefined {
  const t = _tasks.get(id);
  if (!t) return undefined;
  Object.assign(t, updates);
  if (updates.status === "deleted") _tasks.delete(id);
  return t;
}

export function getTask(id: string): Task | undefined {
  return _tasks.get(id);
}

export function listTasks(): Task[] {
  return Array.from(_tasks.values()).filter((t) => t.status !== "deleted");
}
