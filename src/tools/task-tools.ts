import { registerTool } from "./registry.js";
import * as tasks from "../tasks/store.js";

export function registerTaskTools() {
  registerTool({
    name: "TaskCreate",
    description: "Create a new task in the task list. Use this to track work items, to-dos, and multi-step plans.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        description: { type: "string" },
      },
      required: ["subject", "description"],
    },
    func: (p) => {
      const t = tasks.createTask(String(p.subject), String(p.description));
      return `Created task ${t.id}: ${t.subject}`;
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: "TaskUpdate",
    description: "Update a task: change status, subject, description. Set status='deleted' to remove.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        subject: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled", "deleted"] },
      },
      required: ["task_id"],
    },
    func: (p) => {
      const updates: Partial<tasks.Task> = {};
      if (p.subject) updates.subject = String(p.subject);
      if (p.description) updates.description = String(p.description);
      if (p.status) updates.status = p.status as tasks.TaskStatus;
      tasks.updateTask(String(p.task_id), updates);
      return `Updated task ${String(p.task_id)}`;
    },
    read_only: false,
    concurrent_safe: true,
  });

  registerTool({
    name: "TaskList",
    description: "List all tasks with their status.",
    input_schema: { type: "object", properties: {}, required: [] },
    func: () => {
      const list = tasks.listTasks();
      if (!list.length) return "No tasks.";
      return list.map((t) => `[${t.status}] ${t.id} - ${t.subject}`).join("\n");
    },
    read_only: true,
    concurrent_safe: true,
  });
}
