import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DBContextRecommendation } from '../db/abstractSchema';
import * as crQueries from '../queries/context-recommendation.queries';
import * as projectQueries from '../queries/project.queries';
import * as userQueries from '../queries/user.queries';
import { ProposedEdit } from '../types/context-recommendation';
import { logger } from '../utils/logger';
import { isHumanWritableContextPath } from '../utils/nao-context-paths';
import * as github from './github';

export interface CreatePullRequestResult {
	url: string;
	branch: string;
}

export interface RecommendationRepo {
	repoFullName: string;
	branch: string | null;
	source: 'project' | 'settings';
}

/**
 * Resolves the GitHub repository used for context pull requests. The project's own
 * git remote wins when it points at GitHub; otherwise we fall back to the repository
 * configured on the recommendations settings page (for projects deployed via
 * `nao deploy` or a mounted volume, where the folder is not a GitHub clone).
 */
export async function resolveRecommendationRepo(projectId: string): Promise<RecommendationRepo | null> {
	const project = await projectQueries.getProjectById(projectId);
	if (project?.path) {
		const gitInfo = github.getGitInfo(project.path);
		if (gitInfo.isGithub && gitInfo.repoFullName) {
			return { repoFullName: gitInfo.repoFullName, branch: gitInfo.branch, source: 'project' };
		}
	}

	const settings = await projectQueries.getAgentSettings(projectId);
	const configured = settings?.contextRecommendations?.repoFullName;
	if (configured) {
		return { repoFullName: configured, branch: null, source: 'settings' };
	}
	return null;
}

/**
 * YOLO mode: opens pull requests for the highest-impact open recommendations without
 * human review and marks each one applied. Failures are logged and skipped so a single
 * bad recommendation never blocks the rest; only successful PRs count toward the cap.
 */
export async function autoCreateRecommendationPullRequests(
	projectId: string,
	userId: string,
	maxPullRequests: number,
): Promise<number> {
	const open = await crQueries.listRecommendations(projectId, 'open');
	const candidates = open.filter(
		(rec) => rec.fixKind === 'patch' && (rec.proposedEdits?.length ?? 0) > 0 && !rec.prUrl,
	);

	let created = 0;
	for (const rec of candidates) {
		if (created >= maxPullRequests) {
			break;
		}
		try {
			const pr = await createRecommendationPullRequest(projectId, rec.id, userId);
			await crQueries.setRecommendationStatus({ id: rec.id, projectId, status: 'applied', userId });
			created++;
			logger.info(`Auto-created context PR ${pr.url} for recommendation ${rec.id}`, { source: 'agent' });
		} catch (err) {
			logger.warn(`Auto PR creation failed for recommendation ${rec.id}: ${String(err)}`, {
				source: 'agent',
			});
		}
	}
	return created;
}

/**
 * Opens a pull request for a recommendation's proposed edits.
 *
 * Works against a fresh, disposable clone so the live project at `project.path` is
 * never mutated: clone → branch → write the proposed file contents → commit → push →
 * open the PR via the GitHub API. Only human-written files are ever written.
 */
export async function createRecommendationPullRequest(
	projectId: string,
	recommendationId: string,
	userId: string,
): Promise<CreatePullRequestResult> {
	const rec = await crQueries.getRecommendationById(projectId, recommendationId);
	if (!rec) {
		throw new Error('Recommendation not found.');
	}
	if (rec.fixKind !== 'patch' || !rec.proposedEdits || rec.proposedEdits.length === 0) {
		throw new Error('This recommendation has no automated changes to open as a pull request.');
	}
	if (rec.prUrl) {
		return { url: rec.prUrl, branch: rec.prBranch ?? '' };
	}

	const repo = await resolveRecommendationRepo(projectId);
	if (!repo) {
		throw new Error(
			'No GitHub repository is configured for this project. Select one in Settings → Recommendations.',
		);
	}

	const token = await userQueries.getGithubToken(userId);
	if (!token) {
		throw new Error('GitHub is not connected. Connect your GitHub account first.');
	}

	const edits = rec.proposedEdits.filter((edit) => isHumanWritableContextPath(edit.path));
	if (edits.length === 0) {
		throw new Error('The proposed changes only touch auto-generated files and cannot be opened as a pull request.');
	}

	const repoFullName = repo.repoFullName;
	const branch = `nao/context-${recommendationId.slice(0, 8)}-${Date.now().toString(36)}`;
	const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'nao-context-pr-'));

	try {
		github.cloneRepo(token, repoFullName, workdir);
		const base = github.getGitInfo(workdir).branch ?? repo.branch ?? 'main';

		applyEdits(workdir, edits);

		const author = await github.getUserGitIdentity(token);
		github.commitAllAndPushBranch({
			token,
			repoFullName,
			dir: workdir,
			branch,
			message: commitMessage(rec),
			author,
			coAuthors: [github.NAO_CO_AUTHOR],
		});

		const pr = await github.createPullRequest(token, repoFullName, {
			title: prTitle(rec),
			head: branch,
			base,
			body: prBody(rec, edits),
		});

		const prCreatedAt = new Date();
		await crQueries.setRecommendationPr(rec.id, { prUrl: pr.html_url, prBranch: branch, prCreatedAt });
		return { url: pr.html_url, branch };
	} finally {
		try {
			fs.rmSync(workdir, { recursive: true, force: true });
		} catch (err) {
			logger.error(`Failed to clean up PR workdir ${workdir}: ${String(err)}`, { source: 'agent' });
		}
	}
}

function applyEdits(dir: string, edits: ProposedEdit[]): void {
	for (const edit of edits) {
		const target = path.resolve(dir, edit.path);
		if (target !== dir && !target.startsWith(dir + path.sep)) {
			throw new Error(`Refusing to write outside the repository: ${edit.path}`);
		}
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, edit.newContent, 'utf-8');
	}
}

function prTitle(rec: DBContextRecommendation): string {
	return `nao context: ${rec.title}`;
}

function commitMessage(rec: DBContextRecommendation): string {
	return `${prTitle(rec)}\n\n${rec.summary}`;
}

function prBody(rec: DBContextRecommendation, edits: ProposedEdit[]): string {
	const files = edits.map((edit) => `- \`${edit.path}\``).join('\n');
	return [
		'Proposed by **nao** context recommendations.',
		'',
		`**Why:** ${rec.summary}`,
		'',
		`**Fix:** ${rec.suggestedAction}`,
		'',
		'**Files changed:**',
		files,
		'',
		'_Review carefully — this change was drafted automatically from real usage signals._',
	].join('\n');
}
