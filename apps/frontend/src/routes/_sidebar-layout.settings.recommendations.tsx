import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
import { LlmProviderIcon } from '@/components/ui/llm-provider-icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsCard, SettingsPageWrapper } from '@/components/ui/settings-card';
import { Spinner } from '@/components/ui/spinner';
import { requireAdmin } from '@/lib/require-admin';
import { trpc } from '@/main';

export const Route = createFileRoute('/_sidebar-layout/settings/recommendations')({
	beforeLoad: requireAdmin,
	component: RecommendationsPage,
});

const SEVERITY_VARIANT = { high: 'destructive', medium: 'default', low: 'secondary' } as const;
const STATUS_LABEL = {
	open: 'Open',
	acknowledged: 'Acknowledged',
	snoozed: 'Snoozed',
	applied: 'Applied',
	dismissed: 'Dismissed',
} as const;

const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

const FREQUENCY_OPTIONS = [
	{ value: 'daily', label: 'Daily' },
	{ value: 'weekly', label: 'Weekly' },
	{ value: 'monthly', label: 'Monthly' },
] as const;

type Frequency = (typeof FREQUENCY_OPTIONS)[number]['value'];

/** The job runs at 03:00 UTC; render that moment in the viewer's local timezone (display only). */
function localRunTime(): string {
	const at = new Date();
	at.setUTCHours(3, 0, 0, 0);
	return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function exampleChatIds(insights: { exampleChatIds?: string[] }[] | null): string[] {
	const ids = new Set<string>();
	for (const insight of insights ?? []) {
		for (const id of insight.exampleChatIds ?? []) {
			ids.add(id);
		}
	}
	return [...ids];
}

function RecommendationsPage() {
	const queryClient = useQueryClient();
	const recommendations = useQuery(trpc.contextRecommendation.list.queryOptions({}));
	const latestRun = useQuery({
		...trpc.contextRecommendation.latestRun.queryOptions(),
		refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : false),
	});
	const availableModels = useQuery(trpc.contextRecommendation.listAvailableModels.queryOptions());
	const config = useQuery(trpc.contextRecommendation.getConfig.queryOptions());

	const setConfig = useMutation(trpc.contextRecommendation.setConfig.mutationOptions());
	const setStatus = useMutation(trpc.contextRecommendation.setStatus.mutationOptions());
	const run = useMutation(trpc.contextRecommendation.run.mutationOptions());

	const isRunning = run.isPending || latestRun.data?.status === 'running';

	const handleRun = async () => {
		await run.mutateAsync();
		queryClient.invalidateQueries({ queryKey: trpc.contextRecommendation.latestRun.queryKey() });
	};

	const previousRunStatus = useRef(latestRun.data?.status);
	useEffect(() => {
		const status = latestRun.data?.status;
		if (previousRunStatus.current === 'running' && status && status !== 'running') {
			queryClient.invalidateQueries({ queryKey: trpc.contextRecommendation.list.queryKey({}) });
		}
		previousRunStatus.current = status;
	}, [latestRun.data?.status, queryClient]);

	const selectedModelValue =
		config.data?.modelProvider && config.data?.modelId
			? `${config.data.modelProvider}:${config.data.modelId}`
			: undefined;

	const handleModelChange = async (value: string) => {
		const [provider, ...rest] = value.split(':');
		await setConfig.mutateAsync({ modelProvider: provider, modelId: rest.join(':') });
		queryClient.invalidateQueries({ queryKey: trpc.contextRecommendation.getConfig.queryKey() });
	};

	const selectedFrequency: Frequency = config.data?.frequency ?? 'weekly';

	const handleFrequencyChange = async (value: string) => {
		await setConfig.mutateAsync({ frequency: value as Frequency });
		queryClient.invalidateQueries({ queryKey: trpc.contextRecommendation.getConfig.queryKey() });
	};

	const changeStatus = async (id: string, status: 'acknowledged' | 'snoozed' | 'applied' | 'dismissed') => {
		await setStatus.mutateAsync({
			id,
			status,
			snoozedUntil: status === 'snoozed' ? Date.now() + SNOOZE_MS : undefined,
		});
		queryClient.invalidateQueries({ queryKey: trpc.contextRecommendation.list.queryKey({}) });
	};

	return (
		<SettingsPageWrapper>
			<SettingsCard
				title='Context Recommendations'
				titleSize='lg'
				description="Diagnostic suggestions for improving this project's context, mined from real usage."
				action={
					<div className='flex items-center gap-3'>
						{latestRun.data && (
							<span className='text-xs text-muted-foreground'>
								Last run: {new Date(latestRun.data.startedAt).toLocaleString()} ({latestRun.data.status}
								)
							</span>
						)}
						<Button size='sm' onClick={handleRun} disabled={isRunning}>
							{isRunning && <Spinner className='size-4' />}
							{isRunning ? 'Running…' : 'Run now'}
						</Button>
					</div>
				}
			>
				<div className='flex flex-col gap-4'>
					<div className='flex items-center justify-between gap-4'>
						<div className='text-sm'>Analysis model</div>
						<div className='w-72'>
							<Select
								value={selectedModelValue}
								onValueChange={handleModelChange}
								disabled={setConfig.isPending}
							>
								<SelectTrigger className='w-full'>
									<SelectValue placeholder='Project default' />
								</SelectTrigger>
								<SelectContent>
									{availableModels.data?.map((m) => (
										<SelectItem
											key={`${m.provider}:${m.modelId}`}
											value={`${m.provider}:${m.modelId}`}
										>
											<div className='flex items-center gap-2'>
												<LlmProviderIcon provider={m.provider} className='size-4' />
												{m.name}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className='flex items-center justify-between gap-4'>
						<div>
							<div className='text-sm'>Run frequency</div>
							<div className='text-xs text-muted-foreground'>Runs at {localRunTime()} your time</div>
						</div>
						<div className='w-72'>
							<Select
								value={selectedFrequency}
								onValueChange={handleFrequencyChange}
								disabled={setConfig.isPending}
							>
								<SelectTrigger className='w-full'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{FREQUENCY_OPTIONS.map((f) => (
										<SelectItem key={f.value} value={f.value}>
											{f.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>
			</SettingsCard>

			<SettingsCard title='Recommendations' description='Ranked by impact. Act on each, then re-run to refresh.'>
				{recommendations.isLoading ? (
					<div className='flex justify-center p-4'>
						<Spinner />
					</div>
				) : recommendations.isError && !recommendations.data ? (
					<Empty>Failed to load recommendations: {recommendations.error?.message ?? 'unknown error'}</Empty>
				) : !recommendations.data || recommendations.data.length === 0 ? (
					<Empty>No recommendations yet. They appear after the next analysis run.</Empty>
				) : (
					<div className='flex flex-col gap-3'>
						{recommendations.data.map((rec) => (
							<Card key={rec.id} className='gap-2 py-3'>
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
												{rec.impact.affectedChats} chats ·{' '}
												{Math.round(rec.impact.failureShare * 100)}% of window
											</span>
										)}
										{rec.llmModelId && <span>by {rec.llmModelId}</span>}
									</div>
									{exampleChatIds(rec.insights).length > 0 && (
										<div className='flex flex-wrap items-center gap-2 text-xs'>
											<span className='text-muted-foreground'>Chats:</span>
											{exampleChatIds(rec.insights)
												.slice(0, 5)
												.map((chatId) => (
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
									<div className='flex flex-wrap gap-2 pt-1'>
										<Button
											size='sm'
											variant='outline'
											onClick={() => changeStatus(rec.id, 'acknowledged')}
											disabled={setStatus.isPending}
										>
											Acknowledge
										</Button>
										<Button
											size='sm'
											variant='outline'
											onClick={() => changeStatus(rec.id, 'snoozed')}
											disabled={setStatus.isPending}
										>
											Snooze 30d
										</Button>
										<Button
											size='sm'
											variant='outline'
											onClick={() => changeStatus(rec.id, 'applied')}
											disabled={setStatus.isPending}
										>
											Mark applied
										</Button>
										<Button
											size='sm'
											variant='ghost-muted'
											onClick={() => changeStatus(rec.id, 'dismissed')}
											disabled={setStatus.isPending}
										>
											Dismiss
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</SettingsCard>
		</SettingsPageWrapper>
	);
}
