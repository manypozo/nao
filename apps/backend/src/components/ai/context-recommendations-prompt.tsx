import { DBContextRecommendation } from '../../db/abstractSchema';
import { Block, Code, List, ListItem, renderToMarkdown, Span, Title } from '../../lib/markdown';

type ExistingRecommendationSummary = Pick<
	DBContextRecommendation,
	'fingerprint' | 'suggestedFile' | 'subjectKey' | 'title' | 'status'
>;

type ContextRecommendationsPromptProps = {
	windowStart: Date;
	windowEnd: Date;
	existing: ExistingRecommendationSummary[];
	proposeFixes?: boolean;
};

export function renderContextRecommendationsPrompt(props: ContextRecommendationsPromptProps): string {
	return renderToMarkdown(<ContextRecommendationsPrompt {...props} />);
}

function ContextRecommendationsPrompt({
	windowStart,
	windowEnd,
	existing,
	proposeFixes = false,
}: ContextRecommendationsPromptProps) {
	return (
		<Block>
			<Span>
				Analysis window: {windowStart.toISOString()} to {windowEnd.toISOString()}.
			</Span>

			<Block separator={'\n'}>
				<Title>What to look for (mine the window, then locate the fix)</Title>
				<List ordered>
					<ListItem>
						Tool errors: v_messages where tool_state = &quot;output-error&quot; — cluster by the failing
						table/column. Cross-reference databases/**/columns.md and description.md.
					</ListItem>
					<ListItem>
						Repeated corrections: v_memories where category = &quot;global_rule&quot; — each is a rule users
						had to teach; it likely belongs in RULES.md or semantics/*.md.
					</ListItem>
					<ListItem>Downvote themes: v_messages where vote = &quot;down&quot; (+ explanation).</ListItem>
					<ListItem>Regeneration / friction: v_messages where superseded_at is not null.</ListItem>
					<ListItem>
						Coverage gaps: frequent first user prompts (v_messages text) with no matching semantics doc.
					</ListItem>
				</List>
			</Block>

			<Block separator={'\n'}>
				<Title>Recording (record as you go — never batch until the end)</Title>
				<Span>
					Your step budget is limited. The MOMENT you have confirmed a problematic resource — both its signal
					in the data and the relevant context file — call <Code>record_recommendation</Code> for it, then
					move to the next signal. If you defer recording and run out of steps, the finding is lost, so tackle
					the strongest signals first.
				</Span>
				<Span>
					Group findings by TARGET RESOURCE (a file + a stable subject such as a table, column, or normalized
					rule), and call <Code>record_recommendation</Code> once per resource with: suggestedFile,
					subjectKey, severity, title, summary, suggestedAction, and the supporting insights (each:
					signalType, a metric label, a count, and a few exampleChatIds). Derive counts from query results —
					never invent them.
				</Span>
			</Block>

			<Block separator={'\n'}>
				<Title>Re-verify existing recommendations</Title>
				<Span>
					These recommendations already exist. For each, either (a) re-record it via{' '}
					<Code>record_recommendation</Code> if the gap STILL exists (with refreshed insights), or (b) call{' '}
					<Code>resolve_recommendation({'{ fingerprint }'})</Code> ONLY after you have read the file and
					verified the gap is fixed. If unsure, leave it alone.
				</Span>
				<ExistingRecommendations existing={existing} />
			</Block>

			<Span>
				Be precise and evidence-driven. Record each substantiated finding the moment you confirm it
				{proposeFixes
					? ', then immediately propose its fix (edit_file for human-written files, propose_manual_fix for auto-generated ones)'
					: ''}
				; stop once every problematic resource you can support has been recorded.
			</Span>
		</Block>
	);
}

function ExistingRecommendations({ existing }: { existing: ExistingRecommendationSummary[] }) {
	if (existing.length === 0) {
		return <Span>There are no existing open recommendations.</Span>;
	}
	return (
		<List>
			{existing.map((r) => (
				<ListItem key={r.fingerprint}>
					[{r.status}] fingerprint={r.fingerprint} file={r.suggestedFile} subject={r.subjectKey} — {r.title}
				</ListItem>
			))}
		</List>
	);
}
