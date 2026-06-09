import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import s, { DBContextRecommendation, DBContextRecommendationRun, NewContextRecommendation } from '../db/abstractSchema';
import { db } from '../db/db';
import { WindowTotals } from '../types/context-recommendation';

/** A db handle or an open transaction, so writes can be composed atomically. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const ACTIVE_STATUSES = ['open', 'acknowledged', 'snoozed'] as const;

export async function createRun(input: {
	projectId: string;
	trigger: 'schedule' | 'manual';
	windowStart?: Date;
	windowEnd?: Date;
	llmProvider?: DBContextRecommendationRun['llmProvider'];
	llmModelId?: string;
}): Promise<DBContextRecommendationRun> {
	const [run] = await db.insert(s.contextRecommendationRun).values(input).returning().execute();
	return run;
}

export async function setRunChat(runId: string, chatId: string, executor: Executor = db): Promise<void> {
	await executor
		.update(s.contextRecommendationRun)
		.set({ chatId })
		.where(eq(s.contextRecommendationRun.id, runId))
		.execute();
}

export async function completeRun(
	runId: string,
	patch: {
		inputTotalTokens?: number;
		outputTotalTokens?: number;
		totalTokens?: number;
		llmProvider?: DBContextRecommendationRun['llmProvider'];
		llmModelId?: string;
	} = {},
	executor: Executor = db,
): Promise<void> {
	await executor
		.update(s.contextRecommendationRun)
		.set({ status: 'completed', completedAt: new Date(), ...patch })
		.where(eq(s.contextRecommendationRun.id, runId))
		.execute();
}

export async function failRun(runId: string, errorMessage: string): Promise<void> {
	await db
		.update(s.contextRecommendationRun)
		.set({ status: 'failed', completedAt: new Date(), errorMessage })
		.where(eq(s.contextRecommendationRun.id, runId))
		.execute();
}

export async function getActiveRecommendations(projectId: string): Promise<DBContextRecommendation[]> {
	return db
		.select()
		.from(s.contextRecommendation)
		.where(
			and(
				eq(s.contextRecommendation.projectId, projectId),
				inArray(s.contextRecommendation.status, [...ACTIVE_STATUSES]),
			),
		)
		.execute();
}

export async function getDismissedFingerprints(projectId: string): Promise<string[]> {
	const rows = await db
		.select({ fingerprint: s.contextRecommendation.fingerprint })
		.from(s.contextRecommendation)
		.where(and(eq(s.contextRecommendation.projectId, projectId), eq(s.contextRecommendation.status, 'dismissed')))
		.execute();
	return rows.map((r) => r.fingerprint);
}

export async function insertRecommendation(
	value: NewContextRecommendation,
	executor: Executor = db,
): Promise<DBContextRecommendation> {
	const [rec] = await executor.insert(s.contextRecommendation).values(value).returning().execute();
	return rec;
}

export async function updateRecommendation(
	id: string,
	patch: Partial<NewContextRecommendation>,
	executor: Executor = db,
): Promise<void> {
	await executor
		.update(s.contextRecommendation)
		.set({ ...patch, lastSeenAt: new Date() })
		.where(eq(s.contextRecommendation.id, id))
		.execute();
}

export async function listRecommendations(
	projectId: string,
	status?: DBContextRecommendation['status'],
): Promise<DBContextRecommendation[]> {
	const where = status
		? and(eq(s.contextRecommendation.projectId, projectId), eq(s.contextRecommendation.status, status))
		: eq(s.contextRecommendation.projectId, projectId);
	return db
		.select()
		.from(s.contextRecommendation)
		.where(where)
		.orderBy(desc(s.contextRecommendation.impactScore))
		.execute();
}

export async function getLatestRun(projectId: string): Promise<DBContextRecommendationRun | null> {
	const [run] = await db
		.select()
		.from(s.contextRecommendationRun)
		.where(eq(s.contextRecommendationRun.projectId, projectId))
		.orderBy(desc(s.contextRecommendationRun.startedAt))
		.limit(1)
		.execute();
	return run ?? null;
}

export async function setRecommendationStatus(input: {
	id: string;
	projectId: string;
	status: DBContextRecommendation['status'];
	snoozedUntil?: Date | null;
	userId: string;
}): Promise<void> {
	await db
		.update(s.contextRecommendation)
		.set({
			status: input.status,
			snoozedUntil: input.snoozedUntil ?? null,
			statusChangedAt: new Date(),
			statusChangedBy: input.userId,
		})
		.where(and(eq(s.contextRecommendation.id, input.id), eq(s.contextRecommendation.projectId, input.projectId)))
		.execute();
}

/** Total friction signals (errors, downvotes, regenerations) for a project over a window. */
export async function getWindowTotals(projectId: string, start: Date, end: Date): Promise<WindowTotals> {
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

/** The earliest-created admin of a project, used to attribute scheduled runs. */
export async function getFirstProjectAdminUserId(projectId: string): Promise<string> {
	const [admin] = await db
		.select({ userId: s.projectMember.userId })
		.from(s.projectMember)
		.where(and(eq(s.projectMember.projectId, projectId), eq(s.projectMember.role, 'admin')))
		.orderBy(asc(s.projectMember.createdAt))
		.limit(1)
		.execute();
	if (!admin) {
		throw new Error(`No admin found for project ${projectId}`);
	}
	return admin.userId;
}

/** Sum of token usage across every message of a run's chat. */
export async function getChatTokenTotals(
	chatId: string,
): Promise<{ inputTotalTokens: number; outputTotalTokens: number; totalTokens: number }> {
	const [row] = await db
		.select({
			inputTotalTokens: sql<number>`coalesce(sum(${s.chatMessage.inputTotalTokens}), 0)`,
			outputTotalTokens: sql<number>`coalesce(sum(${s.chatMessage.outputTotalTokens}), 0)`,
			totalTokens: sql<number>`coalesce(sum(${s.chatMessage.totalTokens}), 0)`,
		})
		.from(s.chatMessage)
		.where(eq(s.chatMessage.chatId, chatId))
		.execute();
	return {
		inputTotalTokens: Number(row?.inputTotalTokens ?? 0),
		outputTotalTokens: Number(row?.outputTotalTokens ?? 0),
		totalTokens: Number(row?.totalTokens ?? 0),
	};
}
