"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINARY_STREAMING_PLAN_FUTURE_EVENTS = void 0;
/** Future Streaming Binary IDE Plan event names — extend BinaryBuildEvent union when backend ships them. */
exports.BINARY_STREAMING_PLAN_FUTURE_EVENTS = [
    "token.delta",
    "ast.delta",
    "ast.state",
    "reliability.stream",
    "runtime.state",
    "snapshot.saved",
    "patch.applied",
];
//# sourceMappingURL=binary-types.js.map