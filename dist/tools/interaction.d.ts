export declare function getPendingQuestions(): {
    id: string;
    question: string;
    options?: Array<{
        label: string;
        description?: string;
    }>;
    allow_freetext: boolean;
    resolve: (value: string) => void;
}[];
export declare function hasPendingQuestions(): boolean;
export declare function askUserQuestion(question: string, options?: Array<{
    label: string;
    description?: string;
}>, allow_freetext?: boolean): Promise<string>;
export declare function registerInteractionTools(): void;
//# sourceMappingURL=interaction.d.ts.map