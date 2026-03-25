"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runService = void 0;
// Entry point of the TypeScript service
const greet_1 = require("./greet");
// Export callable function
const runService = () => {
    console.log((0, greet_1.greet)('love'));
};
exports.runService = runService;
