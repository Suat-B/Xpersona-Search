## @ mentions (file context)

When you include a workspace path in your chat message like `@vitest.config.ts` or `@src/app.ts`, Playground will:

- Resolve the best-matching workspace file/folder.
- Read the file (or list the folder) and include it in the request context so the agent can answer questions about it.

Notes:

- Mentions work directly in the existing composer. Type `@` and pick from the suggestion list.
- Large files are truncated when needed to stay within the context budget.
