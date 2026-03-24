"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODE_KEY = exports.INDEX_FILE_STATE_KEY = exports.INDEX_STATE_KEY = exports.getQwenCliWrapperPath = exports.getQwenCliWrapperEnabled = exports.getQwenExecutablePath = exports.getQwenOpenAiBaseUrl = exports.getQwenModel = exports.getProjectKey = exports.toAbsoluteWorkspacePath = exports.normalizeWorkspaceRelativePath = exports.toWorkspaceRelativePath = exports.getWorkspaceHash = exports.getWorkspaceRootPath = exports.getBaseApiUrl = void 0;
/**
 * Config bridge: playground-ide modules expect Binary IDE–shaped config keys.
 * Values are read from cutie-product.* workspace settings.
 */
var config_1 = require("../config");
Object.defineProperty(exports, "getBaseApiUrl", { enumerable: true, get: function () { return config_1.getBaseApiUrl; } });
Object.defineProperty(exports, "getWorkspaceRootPath", { enumerable: true, get: function () { return config_1.getWorkspaceRootPath; } });
Object.defineProperty(exports, "getWorkspaceHash", { enumerable: true, get: function () { return config_1.getWorkspaceHash; } });
Object.defineProperty(exports, "toWorkspaceRelativePath", { enumerable: true, get: function () { return config_1.toWorkspaceRelativePath; } });
Object.defineProperty(exports, "normalizeWorkspaceRelativePath", { enumerable: true, get: function () { return config_1.normalizeWorkspaceRelativePath; } });
Object.defineProperty(exports, "toAbsoluteWorkspacePath", { enumerable: true, get: function () { return config_1.toAbsoluteWorkspacePath; } });
Object.defineProperty(exports, "getProjectKey", { enumerable: true, get: function () { return config_1.getProjectKey; } });
Object.defineProperty(exports, "getQwenModel", { enumerable: true, get: function () { return config_1.getQwenModel; } });
Object.defineProperty(exports, "getQwenOpenAiBaseUrl", { enumerable: true, get: function () { return config_1.getQwenOpenAiBaseUrl; } });
Object.defineProperty(exports, "getQwenExecutablePath", { enumerable: true, get: function () { return config_1.getQwenExecutablePath; } });
Object.defineProperty(exports, "getQwenCliWrapperEnabled", { enumerable: true, get: function () { return config_1.getQwenCliWrapperEnabled; } });
Object.defineProperty(exports, "getQwenCliWrapperPath", { enumerable: true, get: function () { return config_1.getQwenCliWrapperPath; } });
/** GlobalState keys for cloud index (namespaced for Cutie). */
exports.INDEX_STATE_KEY = "cutie-product.playground.indexState";
exports.INDEX_FILE_STATE_KEY = "cutie-product.playground.indexFileState";
exports.MODE_KEY = "cutie-product.playground.mode";
//# sourceMappingURL=pg-config.js.map