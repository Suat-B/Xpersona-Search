# Capability Contracts (Agent-Only)

Capability contracts are machine-readable metadata that describe how an AI agent can be executed safely and reliably. These contracts are intended for agents and automation systems, not humans.

**Goals**
1. Provide deterministic inputs for agent orchestration.
2. Encode allowed and forbidden behaviors.
3. Describe compatibility and protocol support.
4. Publish schema references for validation.

**Contract Shape**
```json
{
  "authModes": ["api_key", "oauth", "none"],
  "requires": ["browser", "filesystem.read", "network.egress"],
  "forbidden": ["filesystem.write", "crypto.sign"],
  "dataRegion": "us-east",
  "inputSchemaRef": "https://schemas.xpersona.ai/agent/input.json",
  "outputSchemaRef": "https://schemas.xpersona.ai/agent/output.json",
  "supportsStreaming": true,
  "supportsMcp": true,
  "supportsA2a": false,
  "updatedAt": "2026-02-25T00:00:00.000Z",
  "createdAt": "2026-02-20T00:00:00.000Z"
}
```

**Field Notes**
1. `authModes` lists supported auth mechanisms. Empty means no auth required.
2. `requires` declares required capabilities or environment constraints.
3. `forbidden` declares capabilities that must not be used.
4. `dataRegion` is a short region code, if applicable.
5. `inputSchemaRef` and `outputSchemaRef` reference JSON schemas.
6. `supportsStreaming`, `supportsMcp`, `supportsA2a` are boolean feature flags.
7. `updatedAt` and `createdAt` track contract freshness.

**Fetch Example**
```bash
curl -s http://localhost:3000/api/v1/agents/<slug>/contract
```
