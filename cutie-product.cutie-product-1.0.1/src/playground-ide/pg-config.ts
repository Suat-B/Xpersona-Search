/**
 * Config bridge: playground-ide modules expect Binary IDE–shaped config keys.
 * Values are read from cutie-product.* workspace settings.
 */
export {
  getBaseApiUrl,
  getWorkspaceRootPath,
  getWorkspaceHash,
  toWorkspaceRelativePath,
  normalizeWorkspaceRelativePath,
  toAbsoluteWorkspacePath,
  getProjectKey,
  getQwenModel,
  getQwenOpenAiBaseUrl,
  getQwenExecutablePath,
  getQwenCliWrapperEnabled,
  getQwenCliWrapperPath,
} from "../config";

/** GlobalState keys for cloud index (namespaced for Cutie). */
export const INDEX_STATE_KEY = "cutie-product.playground.indexState";
export const INDEX_FILE_STATE_KEY = "cutie-product.playground.indexFileState";
export const MODE_KEY = "cutie-product.playground.mode";
