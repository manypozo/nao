// ABOUTME: CRUD and dedup queries for context-recommendation runs and recommendations.
// ABOUTME: Used by the context-recommendations process and (later) the tRPC surface.

import { and, desc, eq, inArray } from 'drizzle-orm';

import s, { DBContextRecommendation, DBContextRecommendationRun, NewContextRecommendation } from '../db/abstractSchema';
import { db } from '../db/db';

const ACTIVE_STATUSES = ['open', 'acknowledged', 'snoozed'] as const;

export async function createRun(input: {
	projectId: string;
	trigger: 'schedule';
	windowStart?: Date;
	windowEnd?: Date;
	llmProvider?: DBContextRecommendationRun['llmProvider'];
	llmModelId?: string;
}): Promise<DBContextRecommendationRun> {
	const [run] = await db.insert(s.contextRecommendationRun).values(input).returning().execute();
	return run;
}

export async function completeRun(
	runId: string,
	tokens: { inputTotalTokens?: number; outputTotalTokens?: number; totalTokens?: number } = {},
): Promise<void> {
	await db
		.update(s.contextRecommendationRun)
		.set({ status: 'completed', completedAt: new Date(), ...tokens })
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

export async function insertRecommendation(value: NewContextRecommendation): Promise<DBContextRecommendation> {
	const [rec] = await db.insert(s.contextRecommendation).values(value).returning().execute();
	return rec;
}

export async function updateRecommendation(id: string, patch: Partial<NewContextRecommendation>): Promise<void> {
	await db
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
