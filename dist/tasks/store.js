const _tasks = new Map();
export function createTask(subject, description) {
    const id = "t_" + Math.random().toString(36).slice(2, 10);
    const t = { id, subject, description, status: "pending", created_at: new Date().toISOString() };
    _tasks.set(id, t);
    return t;
}
export function updateTask(id, updates) {
    const t = _tasks.get(id);
    if (!t)
        return undefined;
    Object.assign(t, updates);
    if (updates.status === "deleted")
        _tasks.delete(id);
    return t;
}
export function getTask(id) {
    return _tasks.get(id);
}
export function listTasks() {
    return Array.from(_tasks.values()).filter((t) => t.status !== "deleted");
}
//# sourceMappingURL=store.js.map