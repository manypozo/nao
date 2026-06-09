import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExternalLink, GitPullRequest, Loader2, ScrollText, Wand2 } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';

import type { TrpcRouter } from '@nao/backend/trpc';
import { RecommendationDiffPanel } from '@/components/side-panel/recommendation-diff-panel';
import { RecommendationManualFixPanel } from '@/components/side-panel/recommendation-manual-fix-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSidePanel } from '@/contexts/side-panel';
import { trpc } from '@/main';

type RouterOutputs = inferRouterOutputs<TrpcRouter>;
type Recommendation = RouterOutputs['contextRecommendation']['list'][number];
type RecommendationStatus = 'acknowledged' | 'snoozed' | 'applied' | 'dismissed';

const SEVERITY_VARIANT = { high: 'destructive', medium: 'default', low: 'secondary' } as const;
const STATUS_LABEL = {
	open: 'Open',
	acknowledged: 'Acknowledged',
	snoozed: 'Snoozed',
	applied: 'Applied',
	dismissed: 'Dismissed',
} as const;

function exampleChatIds(insights: { exampleChatIds?: string[] }[] | null): string[] {
	const ids = new Set<string>();
	for (const insight of insights ?? []) {
		for (const id of insight.exampleChatIds ?? []) {
			ids.add(id);
		}
	}
	return [...ids];
}

interface RecommendationCardProps {
	recommendation: Recommendation;
	onChangeStatus: (id: string, status: RecommendationStatus) => void;
	isPending: boolean;
}

export function RecommendationCard({ recommendation: rec, onChangeStatus, isPending }: RecommendationCardProps) {
	const chatIds = exampleChatIds(rec.insights);
	const queryClient = useQueryClient();
	const sidePanel = useSidePanel();

	const createPr = useMutation(
		trpc.contextRecommendation.createPullRequest.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.contextRecommendation.list.queryKey({}) });
			},
		}),
	);

	const edits = rec.proposedEdits ?? [];
	const hasPatch = rec.fixKind === 'patch' && edits.length > 0;
	const hasManualFix = rec.fixKind === 'manual' && (!!rec.fixGuidance || !!rec.fixPrompt);

	return (
		<Card className='gap-2 py-3'>
			<CardHeader>
				<div className='flex flex-wrap items-center gap-2'>
					<Badge variant={SEVERITY_VARIANT[rec.severity]}>{rec.severity}</Badge>
					<Badge variant='outline'>{STATUS_LABEL[rec.status]}</Badge>
					<CardTitle className='text-sm'>{rec.title}</CardTitle>
				</div>
			</CardHeader>
			<CardContent className='flex flex-col gap-2 text-sm'>
				<p className='text-muted-foreground'>{rec.summary}</p>
				<p>
					<span className='font-medium'>Fix:</span> {rec.suggestedAction}
				</p>
				<div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
					<span>
						File: <code>{rec.suggestedFile}</code>
					</span>
					{rec.impact && (
						<span>
							{rec.impact.affectedChats} chats · {Math.round(rec.impact.failureShare * 100)}% of window
						</span>
					)}
					{rec.llmModelId && <span>by {rec.llmModelId}</span>}
				</div>
				{chatIds.length > 0 && (
					<div className='flex flex-wrap items-center gap-2 text-xs'>
						<span className='text-muted-foreground'>Chats:</span>
						{chatIds.slice(0, 5).map((chatId) => (
							<Link
								key={chatId}
								to='/$chatId'
								params={{ chatId }}
								className='text-primary underline-offset-4 hover:underline'
							>
								{chatId.slice(0, 8)}
							</Link>
						))}
					</div>
				)}
				{(hasPatch || hasManualFix) && (
					<div className='flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 p-2'>
						{hasPatch && (
							<>
								<span className='text-xs font-medium text-muted-foreground'>
									nao drafted {edits.length} file change{edits.length === 1 ? '' : 's'}
								</span>
								<Button
									size='sm'
									variant='outline'
									onClick={() =>
										sidePanel.open(<RecommendationDiffPanel title={rec.title} edits={edits} />)
									}
								>
									<ScrollText className='size-3.5' />
									Show diff
								</Button>
								{rec.prUrl ? (
									<Button size='sm' variant='outline' asChild>
										<a href={rec.prUrl} target='_blank' rel='noopener noreferrer'>
											<ExternalLink className='size-3.5' />
											View PR
										</a>
									</Button>
								) : (
									<Button
										size='sm'
										onClick={() => createPr.mutate({ id: rec.id })}
										disabled={createPr.isPending}
									>
										{createPr.isPending ? (
											<Loader2 className='size-3.5 animate-spin' />
										) : (
											<GitPullRequest className='size-3.5' />
										)}
										Create PR
									</Button>
								)}
							</>
						)}
						{hasManualFix && (
							<>
								<span className='text-xs font-medium text-muted-foreground'>
									Needs a manual fix (auto-generated file)
								</span>
								<Button
									size='sm'
									variant='outline'
									onClick={() =>
										sidePanel.open(
											<RecommendationManualFixPanel
												title={rec.title}
												guidance={rec.fixGuidance}
												prompt={rec.fixPrompt}
											/>,
										)
									}
								>
									<Wand2 className='size-3.5' />
									How to fix
								</Button>
							</>
						)}
						{createPr.error && (
							<span className='w-full text-xs text-destructive'>{createPr.error.message}</span>
						)}
					</div>
				)}
				<div className='flex flex-wrap gap-2 pt-1'>
					<Button
						size='sm'
						variant='outline'
						onClick={() => onChangeStatus(rec.id, 'acknowledged')}
						disabled={isPending}
					>
						Acknowledge
					</Button>
					<Button
						size='sm'
						variant='outline'
						onClick={() => onChangeStatus(rec.id, 'snoozed')}
						disabled={isPending}
					>
						Snooze 30d
					</Button>
					<Button
						size='sm'
						variant='outline'
						onClick={() => onChangeStatus(rec.id, 'applied')}
						disabled={isPending}
					>
						Mark applied
					</Button>
					<Button
						size='sm'
						variant='ghost-muted'
						onClick={() => onChangeStatus(rec.id, 'dismissed')}
						disabled={isPending}
					>
						Dismiss
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
