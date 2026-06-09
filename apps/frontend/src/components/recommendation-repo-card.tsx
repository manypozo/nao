import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Github, Unlink } from 'lucide-react';
import { useState } from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '@/components/ui/settings-card';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/main';

const RETURN_TO = '/settings/recommendations';

/**
 * Surfaces the GitHub link state that gates automatic PR drafting: the analysis run
 * only proposes file changes when the project is connected to a GitHub repository.
 */
export function RecommendationRepoCard() {
	const queryClient = useQueryClient();
	const [confirmUnlink, setConfirmUnlink] = useState(false);
	const available = useQuery(trpc.github.isAvailable.queryOptions());
	const status = useQuery({
		...trpc.github.getStatus.queryOptions(),
		enabled: available.data === true,
	});
	const gitInfo = useQuery({
		...trpc.github.getProjectGitInfo.queryOptions(),
		staleTime: 30_000,
	});
	const unlink = useMutation(
		trpc.github.unlinkProject.mutationOptions({
			onSuccess: () => {
				setConfirmUnlink(false);
				queryClient.invalidateQueries({ queryKey: trpc.github.getProjectGitInfo.queryKey() });
			},
		}),
	);

	if (available.data === false) {
		return null;
	}

	if (available.isLoading || status.isLoading || gitInfo.isLoading) {
		return (
			<SettingsCard title='Repository' icon={<Github className='size-4' />}>
				<Skeleton className='h-4 w-48' />
			</SettingsCard>
		);
	}

	const connected = status.data?.connected === true;
	const repo = gitInfo.data;
	const repoLinked = repo?.isGithub === true;

	if (!connected) {
		return (
			<SettingsCard
				title='Repository'
				icon={<Github className='size-4' />}
				description='Connect GitHub so nao can draft pull requests that improve your context.'
			>
				<Button size='sm' asChild>
					<a href={`/api/github/connect?returnTo=${RETURN_TO}`}>
						<Github className='size-3.5' />
						Connect GitHub
					</a>
				</Button>
			</SettingsCard>
		);
	}

	if (!repoLinked || !repo) {
		return (
			<SettingsCard title='Repository' icon={<Github className='size-4' />}>
				<p className='text-sm text-muted-foreground'>
					GitHub is connected, but this project is not linked to a repository. Import the project from GitHub
					to enable automatic pull requests.
				</p>
			</SettingsCard>
		);
	}

	const { repoFullName, branch } = repo;

	return (
		<SettingsCard
			title='Repository'
			icon={<Github className='size-4' />}
			description='Connected. New high-impact recommendations include drafted changes you can open as a pull request.'
		>
			<div className='flex items-center justify-between gap-2 text-sm'>
				<div className='flex items-center gap-2'>
					<a
						href={`https://github.com/${repoFullName}`}
						target='_blank'
						rel='noopener noreferrer'
						className='font-mono text-foreground hover:underline'
					>
						{repoFullName}
					</a>
					{branch && (
						<span className='flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
							<GitBranch className='size-3' />
							{branch}
						</span>
					)}
				</div>
				<Button size='sm' variant='outline' onClick={() => setConfirmUnlink(true)}>
					<Unlink className='size-3.5' />
					Unattach
				</Button>
			</div>

			<AlertDialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Unattach repository?</AlertDialogTitle>
						<AlertDialogDescription>
							nao will stop drafting pull requests for this project until you link a repository again.
							Your project files and local git history are kept — only the link to{' '}
							<span className='font-mono'>{repoFullName}</span> is removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{unlink.error && <p className='text-sm text-destructive'>{unlink.error.message}</p>}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={unlink.isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant='destructive'
							isLoading={unlink.isPending}
							onClick={(event) => {
								event.preventDefault();
								unlink.mutate();
							}}
						>
							Unattach
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsCard>
	);
}
