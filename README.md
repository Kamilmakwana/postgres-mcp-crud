# Postgres MCP Server

> A Model Context Protocol (MCP) server that exposes PostgreSQL resources and tools for structured data access, mutation, and function management.

<p align="center">
  <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/postgresql/postgresql-original.svg" alt="PostgreSQL" width="90" />
</p>

---

## 🚀 Feature Rundown

| Capability | What it does |
| --- | --- |
| 📚 Schema explorer | Surfaces table schemas from your Postgres instance as MCP resources |
| 🔍 Safe querying | Executes read-only SQL inside rollback-only transactions |
| ✍️ Data mutations | Insert, update, delete with auto-commit transactions |
| 🧠 Function tooling | Call existing functions or create/replace them directly |
| 🔐 Configurable | Loads connection info from `.env` or CLI argument |

---

## 🧱 Architecture at a Glance

```mermaid
flowchart TD
  Client[Chat Client / MCP Agent]
  Server[Postgres MCP Server]
  Pool[(pg Pool)]
  DB[(PostgreSQL)]

  Client -- MCP requests --> Server
  Server -- tool executions --> Pool
  Pool -- SQL --> DB
  DB -- rows/result metadata --> Pool -- JSON --> Server -- responses --> Client
```

- **Server**: `src/postgres.ts` boots the MCP server, loads environment variables, registers resources, and exposes tools.
- **Pool**: Dedicated `pg` pool shared across all tool calls.
- **Transactions**: Read-only tools rollback; write tools commit on success.

---

## 🛠️ Requirements

1. Node.js **18+** (for ES modules and `node:path` helpers)
2. npm (bundled with Node)
3. Reachable PostgreSQL database and credentials

Optional helpers: `nvm` for version management, `psql` CLI for manual verification.

---

## 🧾 Installation & Setup (Step-by-Step)

### 1. Clone & install dependencies

```bash
git clone <your-fork-url> postgres-mcp
cd postgres-mcp
npm install
```

### 2. Configure environment variables

Create `.env` (already gitignored) in the project root:

```env
DATABASE_URL=postgres://username:password@host:5432/database
```

> You can override this later by passing the connection string as a command-line argument.

### 3. Build the TypeScript sources

```bash
npm run build
```

The compiled JavaScript lands in the `build/` directory.

### 4. Launch the MCP server

- **Using `.env`:**

  ```bash
  node build/postgres.js
  ```

- **Providing the connection explicitly:**

  ```bash
  node build/postgres.js "postgres://username:password@host:5432/database"
  ```

The server communicates over STDIO. Wire it up in your MCP-aware client or agent configuration.

---

## 🧪 Available MCP Tools

| Tool | Description | Transaction mode | Response payload |
| --- | --- | --- | --- |
| `query` | Execute read-only SQL | `BEGIN TRANSACTION READ ONLY` + rollback | `rows` |
| `insert` | Execute `INSERT` statements | `BEGIN` + commit | `{ rowCount, rows, command }` |
| `update` | Execute `UPDATE` statements | `BEGIN` + commit | `{ rowCount, rows, command }` |
| `delete` | Execute `DELETE` statements | `BEGIN` + commit | `{ rowCount, rows, command }` |
| `function_call` | Run `SELECT fn(...)` or `CALL fn(...)` | `BEGIN` + commit | `{ rowCount, rows, command }` |
| `function_create` | Create/replace stored functions | `BEGIN` + commit | `{ rowCount, rows, command }` |

> All tools enforce a non-empty `sql` string argument and return JSON as string content.

### Example request payload

```json
{
  "sql": "UPDATE customers SET status = 'active' WHERE id = 42"
}
```

### Example response handling (TypeScript snippet)

```ts
const toolCall = await mcpClient.callTool("insert", {
  sql: "INSERT INTO audit_log(event) VALUES('server-started');"
});

const payload = JSON.parse(toolCall.content[0].text);
console.log(payload.rowCount);
}

---

## 🤝 Integrating with MCP Clients

1. Configure your MCP-capable app to launch `node build/postgres.js` (or invoke `tsx src/postgres.ts` during development).
2. Provide tool inputs as JSON payloads (see examples above).
3. Handle responses as JSON strings—parse them if you need structured data.

### Claude Desktop

Claude Desktop loads server definitions from `claude_desktop_config.json`.

- **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add (or merge) the following under the top-level `"mcpServers"` object:

```json
{
  "postgres-mcp": {
    "command": "node",
    "args": [
      "C:/path/to/postgres/build/postgres.js"
    ]
  }
}
```

Tips:

- Update the path to the compiled `postgres.js` for your machine.
- Ensure your project root contains a `.env` file with `DATABASE_URL=postgres://username:password@host:5432/database` (see setup instructions above).
- Restart Claude Desktop (or reload MCP servers) after editing the config file.

### Other MCP Clients

Most MCP clients follow a similar pattern:

1. Register the server command (`node build/postgres.js`).
2. Pass CLI args or environment variables as needed.
3. Ensure the working directory is the project root so `.env` resolves correctly.
4. Parse each tool response—content is emitted as a JSON string for easy consumption.

Example integration snippet (pseudo-code):

```ts
const response = await mcpClient.callTool("query", {
  sql: "SELECT NOW();"
});

const data = JSON.parse(response.content[0].text);
console.log(data);
```

---

## 📚 Resource Endpoints

- `ListResources` returns table entries like:

  ```text
  postgres://user@host:5432/database/orders/schema
  ```

- `ReadResource` yields column metadata:

  ```json
  [
    { "column_name": "id", "data_type": "integer" },
    { "column_name": "created_at", "data_type": "timestamp without time zone" }
  ]
  ```

---

## 🧰 Development Workflow Tips

```bash
# Rebuild on change
npm run build

# TypeScript in watch mode
npx tsc --watch

# (Optional) linting – configure ESLint first
npx eslint "src/**/*.ts"
```

Feel free to adapt scripts to match your tooling preferences.

---

## 🛡️ Operational Guidance

- Validate SQL before issuing write commands; statements execute as provided.
- Group multi-statement migrations within a single `sql` payload to run atomically.
- Rotate credentials regularly and keep `.env` out of source control.

---

## 🧭 Project Layout

```text
postgres/
├─ build/             # Compiled JS output
├─ src/
│  └─ postgres.ts     # MCP server implementation
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-idea`
3. Commit with clear messages: `git commit -m "feat: add new tool"`
4. Push and open a Pull Request

Suggestions, issues, and discussions are welcome!

---

## 📄 License

MIT

---

## 💡 Need Support?

- Inspect Postgres logs for authentication or connection failures
- Ensure `.env` loads by running `console.log(process.env.DATABASE_URL)` locally once
- Open an issue with reproduction steps if you encounter MCP integration quirks

Enjoy building intelligent assistants on top of your PostgreSQL data! 🌤️
