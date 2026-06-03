import { DBContextRecommendation } from '../db/abstractSchema';
import { ALLOWED_APP_DB_VIEWS } from '../utils/app-db-allowlist';

export function buildMethodologyPrompt(input: {
	windowStart: Date;
	windowEnd: Date;
	existing: Pick<DBContextRecommendation, 'fingerprint' | 'suggestedFile' | 'subjectKey' | 'title' | 'status'>[];
}): string {
	const existingBlock =
		input.existing.length === 0
			? 'There are no existing open recommendations.'
			: input.existing
					.map(
						(r) =>
							`- [${r.status}] fingerprint=${r.fingerprint} file=${r.suggestedFile} subject=${r.subjectKey} — ${r.title}`,
					)
					.join('\n');

	return [
		'You are NAO auditing your own project context to reduce user friction. Diagnose only — never edit files.',
		'',
		`Analysis window: ${input.windowStart.toISOString()} to ${input.windowEnd.toISOString()}.`,
		'',
		'## Data access',
		`Use the query_app_db tool to run read-only SQL over these project-scoped views ONLY: ${ALLOWED_APP_DB_VIEWS.join(', ')}.`,
		"Do NOT use execute_sql — that queries the customer data warehouse, not NAO's own usage. All usage signal comes from query_app_db.",
		'Use read, grep, and list to inspect the on-disk context files (RULES.md, semantics/*.md, databases/**/*.md, docs/).',
		'',
		'## What to look for (mine the window, then locate the fix)',
		'1. Tool errors: v_message_part where tool_state = "output-error" — cluster by the failing table/column. Cross-reference databases/**/columns.md and description.md.',
		'2. Repeated corrections: v_memories where category = "global_rule" — each is a rule users had to teach; it likely belongs in RULES.md or semantics/*.md.',
		'3. Downvote themes: v_message_feedback where vote = "down" (+ explanation).',
		'4. Regeneration / friction: v_chat_message where superseded_at is not null.',
		'5. Coverage gaps: frequent first user prompts (v_message_part text) with no matching semantics doc.',
		'',
		'## Recording (record as you go — never batch until the end)',
		'Your step budget is limited. The MOMENT you have confirmed a problematic resource — both its signal in the data and the relevant context file — call `record_recommendation` for it, then move to the next signal. If you defer recording and run out of steps, the finding is lost, so tackle the strongest signals first.',
		'Group findings by TARGET RESOURCE (a file + a stable subject such as a table, column, or normalized rule), and call `record_recommendation` once per resource with: suggestedFile, subjectKey, severity, title, summary, suggestedAction, and the supporting insights (each: signalType, a metric label, a count, and a few exampleChatIds). Derive counts from query results — never invent them.',
		'',
		'## Re-verify existing recommendations',
		'These recommendations already exist. For each, either (a) re-record it via `record_recommendation` if the gap STILL exists (with refreshed insights), or (b) call `resolve_recommendation({ fingerprint })` ONLY after you have read the file and verified the gap is fixed. If unsure, leave it alone.',
		existingBlock,
		'',
		'Be precise and evidence-driven. Record each substantiated finding the moment you confirm it; stop once every problematic resource you can support has been recorded.',
	].join('\n');
}
