## @ mentions (file context)

When you include a workspace path in your chat message like `@vitest.config.ts` or `@src/app.ts`, Playground will:

- Resolve the best-matching workspace file/folder.
- Read the file (or list the folder) and include it in the request context so the agent can answer questions about it.

Notes:

- This only applies when IDE context is enabled in the composer, and `xpersona.playground.mentions.enabled` is `true`.
- Large files are truncated (or skipped if very large) to avoid blowing the context budget.
