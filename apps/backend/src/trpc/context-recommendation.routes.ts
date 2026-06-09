import { LLM_PROVIDERS } from '@nao/shared/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { env } from '../env';
import { ensureContextRecommendationsSchedule } from '../handlers/context-recommendations.handler';
import * as crQueries from '../queries/context-recommendation.queries';
import { getAgentSettings, updateAgentSettings } from '../queries/project.queries';
import { createRecommendationPullRequest } from '../services/context-pr.service';
import { runContextRecommendations } from '../services/context-recommendations.service';
import { CONTEXT_RECOMMENDATION_FREQUENCIES, CONTEXT_RECOMMENDATION_STATUSES } from '../types/context-recommendation';
import { getProjectAvailableModels } from '../utils/llm';
import { logger } from '../utils/logger';
import { adminProtectedProcedure } from './trpc';

const recommendationsProcedure = adminProtectedProcedure.use(async ({ next }) => {
	if (!env.BETA_CONTEXT_RECOMMENDATIONS_ENABLED) {
		throw new TRPCError({ code: 'FORBIDDEN', message: 'Context recommendations are disabled on this instance.' });
	}
	return next();
});

export const contextRecommendationRoutes = {
	list: recommendationsProcedure
		.input(z.object({ status: z.enum(CONTEXT_RECOMMENDATION_STATUSES).optional() }).optional())
		.query(async ({ ctx, input }) => crQueries.listRecommendations(ctx.project.id, input?.status)),

	latestRun: recommendationsProcedure.query(async ({ ctx }) => crQueries.getLatestRun(ctx.project.id)),

	run: recommendationsProcedure.mutation(async ({ ctx }) => {
		const latestRun = await crQueries.getLatestRun(ctx.project.id);
		if (latestRun?.status === 'running') {
			throw new TRPCError({ code: 'CONFLICT', message: 'A recommendations run is already in progress.' });
		}
		void runContextRecommendations(ctx.project.id, { trigger: 'manual' }).catch((err) => {
			logger.error(`Manual context recommendations run failed: ${String(err)}`, { source: 'agent' });
		});
		return { started: true };
	}),

	listAvailableModels: recommendationsProcedure.query(async ({ ctx }) => getProjectAvailableModels(ctx.project.id)),

	getConfig: recommendationsProcedure.query(async ({ ctx }) => {
		const settings = await getAgentSettings(ctx.project.id);
		return settings?.contextRecommendations ?? null;
	}),

	setConfig: recommendationsProcedure
		.input(
			z.object({
				modelProvider: z.enum(LLM_PROVIDERS).optional(),
				modelId: z.string().optional(),
				frequency: z.enum(CONTEXT_RECOMMENDATION_FREQUENCIES).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const current = (await getAgentSettings(ctx.project.id))?.contextRecommendations;
			await updateAgentSettings(ctx.project.id, {
				contextRecommendations: {
					modelProvider: input.modelProvider ?? current?.modelProvider,
					modelId: input.modelId ?? current?.modelId,
					frequency: input.frequency ?? current?.frequency,
				},
			});
			if (input.frequency) {
				await ensureContextRecommendationsSchedule(input.frequency, { reset: true });
			}
		}),

	setStatus: recommendationsProcedure
		.input(
			z.object({
				id: z.string(),
				status: z.enum(CONTEXT_RECOMMENDATION_STATUSES),
				snoozedUntil: z.number().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await crQueries.setRecommendationStatus({
				id: input.id,
				projectId: ctx.project.id,
				status: input.status,
				snoozedUntil: input.snoozedUntil ? new Date(input.snoozedUntil) : null,
				userId: ctx.user.id,
			});
		}),

	createPullRequest: recommendationsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
		try {
			return await createRecommendationPullRequest(ctx.project.id, input.id, ctx.user.id);
		} catch (err) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: err instanceof Error ? err.message : 'Failed to create pull request',
			});
		}
	}),
};
