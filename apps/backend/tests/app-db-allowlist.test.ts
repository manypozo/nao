import { describe, expect, it } from 'vitest';

import { validateAppDbQuery } from '../src/utils/app-db-allowlist';

describe('validateAppDbQuery', () => {
	it('allows a SELECT over an allowlisted view', async () => {
		expect((await validateAppDbQuery('SELECT id FROM v_chat')).ok).toBe(true);
	});

	it('allows a JOIN across allowlisted views', async () => {
		const sql = 'SELECT c.id FROM v_chat c JOIN v_chat_message m ON m.chat_id = c.id';
		expect((await validateAppDbQuery(sql)).ok).toBe(true);
	});

	it('allows a CTE over allowlisted views', async () => {
		const sql = 'WITH t AS (SELECT id FROM v_chat) SELECT * FROM t';
		expect((await validateAppDbQuery(sql)).ok).toBe(true);
	});

	it('rejects a write', async () => {
		expect((await validateAppDbQuery("UPDATE v_chat SET title = 'x'")).ok).toBe(false);
	});

	it('rejects a base table (not a view)', async () => {
		const res = await validateAppDbQuery('SELECT * FROM chat');
		expect(res.ok).toBe(false);
		expect(res.reason).toContain('chat');
	});

	it('rejects an auth/PII table', async () => {
		expect((await validateAppDbQuery('SELECT password FROM account')).ok).toBe(false);
	});

	it('rejects unparseable SQL', async () => {
		expect((await validateAppDbQuery('SELECT FROM WHERE )(')).ok).toBe(false);
	});
});
