// ABOUTME: The trigger-agnostic context-recommendations process: runs the analysis
// ABOUTME: agent over a project's usage window and reconciles the results.

import { LlmSelectedModel } from '@nao/shared/types';
import { readUIMessageStream, UIMessage } from 'ai';
import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import { createQueryAppDbTool } from '../agents/tools/query-app-db';
import { createRecommendationCollector } from '../agents/tools/record-recommendation';
import s, { DBContextRecommendation, NewContextRecommendation } from '../db/abstractSchema';
import { db } from '../db/db';
import * as chatQueries from '../queries/chat.queries';
import * as crQueries from '../queries/context-recommendation.queries';
import * as projectQueries from '../queries/project.queries';
import { AgentSettings } from '../types/agent-settings';
import { logger } from '../utils/logger';
import { agentService } from './agent';
import { buildMethodologyPrompt } from './context-recommendations.prompt';
import { ExistingRecommendation, reconcile, ReconcileAction, WindowTotals } from './context-recommendations.reconcile';

const DEFAULT_LOOKBACK_DAYS = 90;
const IMPACT_FLOOR = 5;
const ANALYSIS_STEP_BUDGET = 40;

export async function runContextRecommendations(
	projectId: string,
	window?: { start?: Date; end?: Date },
): Promise<{ runId: string }> {
	const now = new Date();
	const windowEnd = window?.end ?? now;
	const windowStart = window?.start ?? (await resolveWindowStart(projectId, windowEnd));

	const agentSettings = await projectQueries.getAgentSettings(projectId);
	const modelSelection = resolveModel(agentSettings);

	const run = await crQueries.createRun({
		projectId,
		trigger: 'schedule',
		windowStart,
		windowEnd,
		llmProvider: modelSelection?.provider,
		llmModelId: modelSelection?.modelId,
	});

	try {
		const existing = await crQueries.getActiveRecommendations(projectId);
		const dismissedFingerprints = await crQueries.getDismissedFingerprints(projectId);
		const totals = await computeWindowTotals(projectId, windowStart, windowEnd);

		const userId = await firstProjectUserId(projectId);
		const [chat] = await chatQueries.createChat(
			{ title: 'Context recommendations run', userId, projectId },
			{ text: buildMethodologyPrompt({ windowStart, windowEnd, existing }), source: 'web' },
		);
		const [uiChat] = await chatQueries.getChat(chat.id);
		if (!uiChat) {
			throw new Error(`Failed to load run chat ${chat.id}`);
		}

		const collector = createRecommendationCollector();
		const agent = await agentService.create({ ...uiChat, id: chat.id, projectId, userId }, modelSelection, {
			excludeFollowUps: true,
			maxSteps: ANALYSIS_STEP_BUDGET,
			extraTools: {
				query_app_db: createQueryAppDbTool(projectId),
				record_recommendation: collector.recordTool,
				resolve_recommendation: collector.resolveTool,
			},
		});

		const stream = agent.stream(uiChat.messages ?? [], {});
		for await (const message of readUIMessageStream<UIMessage>({ stream })) {
			void message; // drain; the agent persists its own messages, tools mutate the collector by reference
		}

		const actions = reconcile({
			existing: existing.map(toExistingRec),
			recorded: collector.recorded,
			resolvedFingerprints: collector.resolvedFingerprints,
			dismissedFingerprints,
			totals,
			impactFloor: IMPACT_FLOOR,
			now,
		});

		await applyActions({ projectId, runId: run.id, model: modelSelection, actions, existing });
		await crQueries.completeRun(run.id);
		return { runId: run.id };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`Context recommendations run failed: ${message}`, { source: 'agent' });
		await crQueries.failRun(run.id, message);
		throw err;
	}
}

/** Fan out one run per project that has a folder configured. */
export async function runContextRecommendationsForAllProjects(): Promise<void> {
	const projects = await db.select({ id: s.project.id }).from(s.project).where(isNotNull(s.project.path)).execute();
	for (const { id } of projects) {
		try {
			await runContextRecommendations(id);
		} catch (err) {
			logger.error(`Context recommendations failed for project ${id}: ${String(err)}`, { source: 'agent' });
		}
	}
}

function resolveModel(agentSettings: AgentSettings | null): LlmSelectedModel | undefined {
	const cfg = agentSettings?.contextRecommendations;
	if (cfg?.modelProvider && cfg?.modelId) {
		return { provider: cfg.modelProvider, modelId: cfg.modelId };
	}
	return undefined; // agentService.create resolves the project default
}

async function resolveWindowStart(projectId: string, end: Date): Promise<Date> {
	const [last] = await db
		.select({ completedAt: s.contextRecommendationRun.completedAt })
		.from(s.contextRecommendationRun)
		.where(
			and(
				eq(s.contextRecommendationRun.projectId, projectId),
				eq(s.contextRecommendationRun.status, 'completed'),
			),
		)
		.orderBy(desc(s.contextRecommendationRun.completedAt))
		.limit(1)
		.execute();
	if (last?.completedAt) {
		return last.completedAt;
	}
	return new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

async function computeWindowTotals(projectId: string, start: Date, end: Date): Promise<WindowTotals> {
	const [errors] = await db
		.select({ n: sql<number>`count(*)` })
		.from(s.messagePart)
		.innerJoin(s.chatMessage, eq(s.chatMessage.id, s.messagePart.messageId))
		.innerJoin(s.chat, eq(s.chat.id, s.chatMessage.chatId))
		.where(
			and(
				eq(s.chat.projectId, projectId),
				eq(s.messagePart.toolState, 'output-error'),
				gte(s.messagePart.createdAt, start),
				lt(s.messagePart.createdAt, end),
			),
		)
		.execute();
	const [downvotes] = await db
		.select({ n: sql<number>`count(*)` })
		.from(s.messageFeedback)
		.innerJoin(s.chatMessage, eq(s.chatMessage.id, s.messageFeedback.messageId))
		.innerJoin(s.chat, eq(s.chat.id, s.chatMessage.chatId))
		.where(
			and(
				eq(s.chat.projectId, projectId),
				eq(s.messageFeedback.vote, 'down'),
				gte(s.messageFeedback.createdAt, start),
				lt(s.messageFeedback.createdAt, end),
			),
		)
		.execute();
	const [regenerations] = await db
		.select({ n: sql<number>`count(*)` })
		.from(s.chatMessage)
		.innerJoin(s.chat, eq(s.chat.id, s.chatMessage.chatId))
		.where(
			and(
				eq(s.chat.projectId, projectId),
				isNotNull(s.chatMessage.supersededAt),
				gte(s.chatMessage.createdAt, start),
				lt(s.chatMessage.createdAt, end),
			),
		)
		.execute();
	return {
		errors: Number(errors?.n ?? 0),
		downvotes: Number(downvotes?.n ?? 0),
		regenerations: Number(regenerations?.n ?? 0),
	};
}

function toExistingRec(r: DBContextRecommendation): ExistingRecommendation {
	return {
		id: r.id,
		fingerprint: r.fingerprint,
		status: r.status,
		snoozedUntil: r.snoozedUntil,
		occurrenceCount: r.occurrenceCount,
	};
}

async function applyActions(args: {
	projectId: string;
	runId: string;
	model: LlmSelectedModel | undefined;
	actions: ReconcileAction[];
	existing: DBContextRecommendation[];
}): Promise<void> {
	const byId = new Map(args.existing.map((r) => [r.id, r]));
	for (const action of args.actions) {
		if (action.kind === 'insert') {
			await crQueries.insertRecommendation({
				projectId: args.projectId,
				runId: args.runId,
				fingerprint: action.fingerprint,
				suggestedFile: action.finding.suggestedFile,
				subjectKey: action.finding.subjectKey,
				severity: action.finding.severity,
				impactScore: action.impactScore,
				impact: action.impact,
				insights: action.finding.insights,
				title: action.finding.title,
				summary: action.finding.summary,
				suggestedAction: action.finding.suggestedAction,
				llmProvider: args.model?.provider,
				llmModelId: args.model?.modelId,
			});
		} else if (action.kind === 'update') {
			const prev = byId.get(action.id);
			const patch: Partial<NewContextRecommendation> = {
				runId: args.runId,
				severity: action.finding.severity,
				impactScore: action.impactScore,
				impact: action.impact,
				insights: action.finding.insights,
				title: action.finding.title,
				summary: action.finding.summary,
				suggestedAction: action.finding.suggestedAction,
				occurrenceCount: (prev?.occurrenceCount ?? 1) + 1,
				llmProvider: args.model?.provider ?? null,
				llmModelId: args.model?.modelId ?? null,
			};
			if (action.reopen) {
				patch.status = 'open';
			}
			await crQueries.updateRecommendation(action.id, patch);
		} else if (action.kind === 'resolve') {
			await crQueries.updateRecommendation(action.id, { status: 'applied', statusChangedAt: new Date() });
		}
	}
}

async function firstProjectUserId(projectId: string): Promise<string> {
	const [member] = await db
		.select({ userId: s.projectMember.userId })
		.from(s.projectMember)
		.where(eq(s.projectMember.projectId, projectId))
		.limit(1)
		.execute();
	if (!member) {
		throw new Error(`No user found for project ${projectId}`);
	}
	return member.userId;
}
