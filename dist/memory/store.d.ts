export interface MemoryEntry {
    name: string;
    description: string;
    type: string;
    content: string;
    created: string;
    scope: "user" | "project";
    file_path: string;
}
export declare function saveMemory(entry: MemoryEntry, scope?: "user" | "project"): void;
export declare function deleteMemory(name: string, scope?: "user" | "project"): Promise<void>;
export declare function loadEntries(scope?: "user" | "project" | "all"): Promise<MemoryEntry[]>;
export declare function searchMemory(query: string, scope?: "user" | "project" | "all"): Promise<MemoryEntry[]>;
export declare function getMemoryContext(): Promise<string>;
//# sourceMappingURL=store.d.ts.map