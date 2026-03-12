export type LocalApplyFailureCategory =
  | "invalid_patch"
  | "path_mismatch"
  | "no_content_delta"
  | "target_missing"
  | "unsupported_patch_shape"
  | "write_blocked"
  | "workspace_unavailable"
  | "unknown_apply_failure";

export type LocalRecoveryStage =
  | "patch_repair"
  | "target_path_repair"
  | "single_file_rewrite"
  | "pine_specialization";

type ApplyClassificationInput = {
  actionKind: "edit" | "write_file" | "mkdir";
  status: string;
  reason?: string;
  changed: boolean;
  path: string;
  targetExistedBefore?: boolean;
};

export function classifyLocalApplyFailure(input: ApplyClassificationInput): {
  category: LocalApplyFailureCategory;
  summary: string;
  retryable: boolean;
} {
  const reason = String(input.reason || "").trim();
  const normalized = reason.toLowerCase();

  if (/no workspace folder open/i.test(reason)) {
    return { category: "workspace_unavailable", summary: `${input.path}: no workspace folder is open.`, retryable: false };
  }
  if (!input.changed && /(already matched requested content|did not change content|patch produced no file changes|no file content changed)/i.test(reason)) {
    return { category: "no_content_delta", summary: `${input.path}: the requested change produced no content delta.`, retryable: true };
  }
  if (input.actionKind === "write_file" && /overwrite=false|already exists/i.test(reason)) {
    return { category: "write_blocked", summary: `${input.path}: write_file was blocked by overwrite rules.`, retryable: false };
  }
  if (input.status === "rejected_invalid_patch") {
    if (/unsupported patch format/i.test(reason)) {
      return { category: "unsupported_patch_shape", summary: `${input.path}: the patch shape was unsupported locally.`, retryable: true };
    }
    return { category: "invalid_patch", summary: `${input.path}: the patch was invalid or malformed.`, retryable: true };
  }
  if (/invalid target path|invalid relative path|missing\/invalid target path|patch header/i.test(reason)) {
    return { category: "path_mismatch", summary: `${input.path}: the edit target path did not match a valid workspace file.`, retryable: true };
  }
  if (input.actionKind === "edit" && input.targetExistedBefore === false) {
    return { category: "target_missing", summary: `${input.path}: the target file did not exist for patch-based editing.`, retryable: true };
  }
  if (!input.changed) {
    return { category: "no_content_delta", summary: `${input.path}: the requested change did not modify file content.`, retryable: true };
  }
  return { category: "unknown_apply_failure", summary: `${input.path}: local apply failed${normalized ? ` (${reason})` : ""}.`, retryable: true };
}

export function nextLocalRecoveryStage(
  attemptedStages: LocalRecoveryStage[],
  filePath: string
): LocalRecoveryStage | null {
  const ordered: LocalRecoveryStage[] = [
    "patch_repair",
    "target_path_repair",
    "single_file_rewrite",
    ...(filePath.toLowerCase().endsWith(".pine") ? (["pine_specialization"] as LocalRecoveryStage[]) : []),
  ];
  for (const stage of ordered) {
    if (!attemptedStages.includes(stage)) return stage;
  }
  return null;
}

export function buildLocalApplyRetryTask(input: {
  objective: string;
  filePath: string;
  category: LocalApplyFailureCategory;
  reason?: string;
  stage: LocalRecoveryStage;
}): string {
  const header = input.objective.trim();
  const reasonLine = input.reason ? `Previous local apply failure: ${input.reason}` : `Previous local apply category: ${input.category}`;
  const shared = [
    header,
    "",
    `Target file: ${input.filePath}`,
    reasonLine,
    "The prior response did not successfully mutate the local workspace.",
    "Return concrete file actions only. Do not narrate completed work.",
  ];

  if (input.stage === "patch_repair") {
    return [
      ...shared,
      "Recovery stage: patch_repair.",
      "Return a corrected edit action or a write_file action for exactly this file.",
      "If you use edit, the patch must apply cleanly to the current file contents.",
    ].join("\n");
  }
  if (input.stage === "target_path_repair") {
    return [
      ...shared,
      "Recovery stage: target_path_repair.",
      "Bind every file action to exactly the target file above.",
      "Do not invent alternate paths or omit the target path.",
    ].join("\n");
  }
  if (input.stage === "single_file_rewrite") {
    return [
      ...shared,
      "Recovery stage: single_file_rewrite.",
      'Return a single write_file action for exactly this file with the full updated file contents.',
      "Preserve unchanged code and only implement the requested change.",
    ].join("\n");
  }
  return [
    ...shared,
    "Recovery stage: pine_specialization.",
    'Return a single write_file action for exactly this .pine strategy file.',
    "Use Pine strategy structure from the active file and implement the requested strategy change without commentary.",
  ].join("\n");
}
