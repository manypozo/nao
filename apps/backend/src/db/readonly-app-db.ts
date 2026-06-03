import postgres from 'postgres';

import { env } from '../env';
import dbConfig, { Dialect } from './dbConfig';

export interface AppDbQueryResult {
	columns: string[];
	rows: Record<string, unknown>[];
}

/**
 * View name -> SELECT body. The `_scope` temp table holds the single project id
 * (bound via a parameter, never interpolated into SQL). Views expose only safe
 * columns and are filtered to the scoped project.
 */
const SCOPED_VIEWS: { name: string; body: string }[] = [
	{
		name: 'v_chat',
		body: 'SELECT id, user_id, title, created_at FROM chat WHERE project_id IN (SELECT project_id FROM _scope)',
	},
	{
		name: 'v_chat_message',
		body: 'SELECT id, chat_id, role, stop_reason, error_message, llm_provider, llm_model_id, superseded_at, source, created_at FROM chat_message WHERE chat_id IN (SELECT id FROM chat WHERE project_id IN (SELECT project_id FROM _scope))',
	},
	{
		name: 'v_message_part',
		body: 'SELECT id, message_id, "order", type, text, tool_name, tool_state, tool_error_text, tool_input, created_at FROM message_part WHERE message_id IN (SELECT id FROM chat_message WHERE chat_id IN (SELECT id FROM chat WHERE project_id IN (SELECT project_id FROM _scope)))',
	},
	{
		name: 'v_message_feedback',
		body: 'SELECT message_id, vote, explanation, created_at FROM message_feedback WHERE message_id IN (SELECT id FROM chat_message WHERE chat_id IN (SELECT id FROM chat WHERE project_id IN (SELECT project_id FROM _scope)))',
	},
	{
		name: 'v_memories',
		body: 'SELECT id, user_id, content, category, chat_id, superseded_by, created_at FROM memories WHERE chat_id IN (SELECT id FROM chat WHERE project_id IN (SELECT project_id FROM _scope))',
	},
	{
		name: 'v_llm_inference',
		body: 'SELECT id, type, total_tokens, created_at FROM llm_inference WHERE project_id IN (SELECT project_id FROM _scope)',
	},
	{
		name: 'v_mcp_call_log',
		body: 'SELECT id, tool_name, duration_ms, success, called_at FROM mcp_call_log WHERE project_id IN (SELECT project_id FROM _scope)',
	},
	{ name: 'v_project', body: 'SELECT id, name FROM project WHERE id IN (SELECT project_id FROM _scope)' },
];

export async function runScopedAppDbQuery(projectId: string, sql: string): Promise<AppDbQueryResult> {
	if (dbConfig.dialect === Dialect.Postgres) {
		return runPostgres(projectId, sql);
	}
	return runSqlite(projectId, sql);
}

async function runSqlite(projectId: string, sql: string): Promise<AppDbQueryResult> {
	// Production runs under Bun (bun:sqlite); tests run under Node (better-sqlite3).
	// better-sqlite3's native binding does not load under Bun, so the driver is chosen by runtime.
	if (typeof Bun !== 'undefined') {
		const { Database } = await import('bun:sqlite');
		const conn = new Database(dbConfig.dbUrl);
		try {
			conn.run('CREATE TEMP TABLE _scope (project_id TEXT NOT NULL)');
			conn.query('INSERT INTO _scope (project_id) VALUES (?)').run(projectId);
			for (const view of SCOPED_VIEWS) {
				conn.run(`CREATE TEMP VIEW ${view.name} AS ${view.body}`);
			}
			conn.run('PRAGMA query_only = ON');
			const rows = conn.query(sql).all() as Record<string, unknown>[];
			return { columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
		} finally {
			conn.close();
		}
	}

	const { default: Database } = await import('better-sqlite3');
	const conn = new Database(dbConfig.dbUrl);
	try {
		conn.exec('CREATE TEMP TABLE _scope (project_id TEXT NOT NULL)');
		conn.prepare('INSERT INTO _scope (project_id) VALUES (?)').run(projectId);
		for (const view of SCOPED_VIEWS) {
			conn.exec(`CREATE TEMP VIEW ${view.name} AS ${view.body}`);
		}
		// Belt-and-suspenders: block any write that slipped past the validator.
		conn.pragma('query_only = ON');
		const rows = conn.prepare(sql).all() as Record<string, unknown>[];
		return { columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
	} finally {
		conn.close();
	}
}

async function runPostgres(projectId: string, sql: string): Promise<AppDbQueryResult> {
	const ssl = env.DB_SSL ? 'require' : undefined;
	const client = postgres(dbConfig.dbUrl, { ssl, max: 1 });
	try {
		// Build the project-scoped sandbox in a read-write setup transaction. The temp
		// objects are session-scoped (no ON COMMIT DROP) so they survive into the
		// read-only query transaction below; they drop when the connection closes.
		await client.begin(async (tx) => {
			await tx`CREATE TEMP TABLE _scope (project_id text NOT NULL)`;
			await tx`INSERT INTO _scope (project_id) VALUES (${projectId})`;
			for (const view of SCOPED_VIEWS) {
				await tx.unsafe(`CREATE TEMP VIEW ${view.name} AS ${view.body}`);
			}
		});
		// Run the caller's query in a read-only transaction so any write that slipped
		// past the validator is rejected at the database level (parity with SQLite's
		// query_only pragma). CREATE is disallowed under READ ONLY, hence the split.
		return await client.begin(async (tx) => {
			await tx`SET TRANSACTION READ ONLY`;
			const rows = (await tx.unsafe(sql)) as unknown as Record<string, unknown>[];
			return { columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows: [...rows] };
		});
	} finally {
		await client.end({ timeout: 5 });
	}
}
