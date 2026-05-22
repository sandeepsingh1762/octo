export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "deleted";
export interface Task {
    id: string;
    subject: string;
    description: string;
    status: TaskStatus;
    created_at: string;
}
export declare function createTask(subject: string, description: string): Task;
export declare function updateTask(id: string, updates: Partial<Task>): Task | undefined;
export declare function getTask(id: string): Task | undefined;
export declare function listTasks(): Task[];
//# sourceMappingURL=store.d.ts.map