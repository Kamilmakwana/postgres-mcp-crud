#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import pg from "../node_modules/@types/pg/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const server = new Server(
  {
    name: "example-servers/postgres",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const args = process.argv.slice(2);

const databaseUrl = process.env.DATABASE_URL ?? args[0];

if (!databaseUrl) {
  console.error(
    "Please set DATABASE_URL in the environment or provide a database URL as a command-line argument",
  );
  process.exit(1);
}

const resourceBaseUrl = new URL(databaseUrl);
resourceBaseUrl.protocol = "postgres:";
resourceBaseUrl.password = "";

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

const SQL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    sql: { type: "string" },
  },
  required: ["sql"],
} as const;

type ToolDefinition = {
  name: "query" | "insert" | "update" | "delete" | "function_call" | "function_create";
  description: string;
  readOnly: boolean;
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "query",
    description: "Run a read-only SQL query",
    readOnly: true,
  },
  {
    name: "insert",
    description: "Execute an INSERT statement",
    readOnly: false,
  },
  {
    name: "update",
    description: "Execute an UPDATE statement",
    readOnly: false,
  },
  {
    name: "delete",
    description: "Execute a DELETE statement",
    readOnly: false,
  },
  {
    name: "function_call",
    description: "Invoke a stored function (SELECT or CALL)",
    readOnly: false,
  },
  {
    name: "function_create",
    description: "Create or replace a stored function",
    readOnly: false,
  },
];

async function executeSql(sql: string, options: { readOnly: boolean }) {
  const client = await pool.connect();
  let transactionCompleted = false;

  try {
    await client.query(options.readOnly ? "BEGIN TRANSACTION READ ONLY" : "BEGIN");
    const result = await client.query(sql);

    if (options.readOnly) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    transactionCompleted = true;
    return result;
  } catch (error) {
    if (!transactionCompleted) {
      await client
        .query("ROLLBACK")
        .catch(() => console.warn("Could not roll back transaction:"));
    }
    throw error;
  } finally {
    client.release();
  }
}

const SCHEMA_PATH = "schema";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    return {
      resources: result.rows.map((row: any) => ({
        uri: new URL(`${row.table_name}/${SCHEMA_PATH}`, resourceBaseUrl).href,
        mimeType: "application/json",
        name: `"${row.table_name}" database schema`,
      })),
    };
  } finally {
    client.release();
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUrl = new URL(request.params.uri);

  const pathComponents = resourceUrl.pathname.split("/");
  const schema = pathComponents.pop();
  const tableName = pathComponents.pop();

  if (schema !== SCHEMA_PATH) {
    throw new Error("Invalid resource URI");
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
      [tableName],
    );

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(result.rows, null, 2),
        },
      ],
    };
  } finally {
    client.release();
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOL_DEFINITIONS.map(({ name, description }) => ({
      name,
      description,
      inputSchema: SQL_INPUT_SCHEMA,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOL_DEFINITIONS.find(({ name }) => name === request.params.name);

  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const sqlArgument = request.params.arguments?.sql;

  if (typeof sqlArgument !== "string" || sqlArgument.trim().length === 0) {
    throw new Error('The "sql" argument must be a non-empty string.');
  }

  const result = await executeSql(sqlArgument, { readOnly: tool.readOnly });

  const responsePayload = tool.readOnly
    ? result.rows
    : {
        rowCount: result.rowCount,
        rows: result.rows,
        command: result.command,
      };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(responsePayload, null, 2),
      },
    ],
    isError: false,
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);