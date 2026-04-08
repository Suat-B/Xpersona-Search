import type { BinaryAnalysisResult, BinaryChunkResult, BinaryMutationReceipt, BinaryPatchPlan, BinaryTargetDescriptor } from "./types.js";
export type BinaryRiskClass = "low" | "high" | "critical";
export type BinaryArtifactKind = "regular_file" | "executable" | "shared_library" | "archive" | "document" | "image" | "disk_image" | "firmware" | "raw_device" | "system_file" | "unknown";
type BinaryTargetScope = "workspace" | "machine";
type ResolvedBinaryTarget = {
    inputPath: string;
    absolutePath: string;
    displayPath: string;
    scope: BinaryTargetScope;
};
type BinaryMutationPolicy = {
    blocked: boolean;
    approvalRequired: boolean;
    message?: string;
};
export type SearchBinaryMatch = {
    offset: number;
    length: number;
    hexPreview: string;
    asciiPreview: string;
};
export declare const MAX_BINARY_READ_BYTES: number;
export declare const MAX_BINARY_ANALYZE_BYTES: number;
export declare const MAX_BINARY_SEARCH_BYTES: number;
export declare function isRawDevicePath(targetPath: string): boolean;
export declare function looksLikeBinaryPath(inputPath: string): boolean;
export declare function classifyBinaryRisk(targetPath: string, isExecutable: boolean, artifactKind: BinaryArtifactKind): BinaryRiskClass;
export declare function resolveBinaryTarget(workspaceRoot: string, inputPath: string): Promise<ResolvedBinaryTarget | null>;
export declare function describeBinaryTarget(workspaceRoot: string, inputPath: string): Promise<BinaryTargetDescriptor | null>;
export declare function isLikelyBinaryFile(workspaceRoot: string, inputPath: string): Promise<boolean>;
export declare function binaryTextToolFailure(pathValue: string): {
    blocked: true;
    summary: string;
    data: Record<string, unknown>;
};
export declare function readBinaryChunk(workspaceRoot: string, inputPath: string, offsetInput: number, lengthInput: number): Promise<BinaryChunkResult | null>;
export declare function searchBinary(workspaceRoot: string, inputPath: string, pattern: string, options?: {
    encoding?: unknown;
    limit?: number;
}): Promise<{
    descriptor: BinaryTargetDescriptor;
    matches: SearchBinaryMatch[];
    truncated: boolean;
    encoding: string;
    normalizedPattern: string;
} | null>;
export declare function analyzeBinary(workspaceRoot: string, inputPath: string): Promise<BinaryAnalysisResult | null>;
export declare function hashBinary(workspaceRoot: string, inputPath: string): Promise<BinaryTargetDescriptor | null>;
export declare function writeBinaryFile(workspaceRoot: string, inputPath: string, args: {
    bytesBase64?: unknown;
    contentBase64?: unknown;
    dataBase64?: unknown;
    bytesHex?: unknown;
    contentHex?: unknown;
    overwrite?: unknown;
    approved?: unknown;
}): Promise<{
    descriptor: BinaryTargetDescriptor;
    receipt?: BinaryMutationReceipt;
    policy: BinaryMutationPolicy;
}>;
export declare function patchBinary(workspaceRoot: string, inputPath: string, args: {
    operations?: unknown;
    approved?: unknown;
    dryRun?: unknown;
}): Promise<{
    descriptor: BinaryTargetDescriptor;
    plan: BinaryPatchPlan;
    receipt?: BinaryMutationReceipt;
    policy: BinaryMutationPolicy;
}>;
export {};
