export type PatchApplyStatus = "applied" | "partial" | "rejected_invalid_patch";
export type PatchApplyResult = {
    status: PatchApplyStatus;
    content?: string;
    targetPath?: string | null;
    reason?: string;
    hunksApplied: number;
    totalHunks: number;
};
export declare function applyUnifiedDiff(originalText: string, patchText: string): PatchApplyResult;
