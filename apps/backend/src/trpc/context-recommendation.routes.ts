import { LlmProvider } from '@nao/shared/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ensureContextRecommendationsSchedule } from '../handlers/context-recommendations.handler';
import * as crQueries from '../queries/context-recommendation.queries';
import { getAgentSettings, updateAgentSettings } from '../queries/project.queries';
import { runContextRecommendations } from '../services/context-recommendations.service';
import { CONTEXT_RECOMMENDATION_FREQUENCIES, CONTEXT_RECOMMENDATION_STATUSES } from '../types/context-recommendation';
import { getProjectAvailableModels } from '../utils/llm';
import { logger } from '../utils/logger';
import { adminProtectedProcedure } from './trpc';

export const contextRecommendationRoutes = {
	list: adminProtectedProcedure
		.input(z.object({ status: z.enum(CONTEXT_RECOMMENDATION_STATUSES).optional() }).optional())
		.query(async ({ ctx, input }) => crQueries.listRecommendations(ctx.project.id, input?.status)),

	latestRun: adminProtectedProcedure.query(async ({ ctx }) => crQueries.getLatestRun(ctx.project.id)),

	run: adminProtectedProcedure.mutation(async ({ ctx }) => {
		const latestRun = await crQueries.getLatestRun(ctx.project.id);
		if (latestRun?.status === 'running') {
			throw new TRPCError({ code: 'CONFLICT', message: 'A recommendations run is already in progress.' });
		}
		void runContextRecommendations(ctx.project.id, { trigger: 'manual' }).catch((err) => {
			logger.error(`Manual context recommendations run failed: ${String(err)}`, { source: 'agent' });
		});
		return { started: true };
	}),

	listAvailableModels: adminProtectedProcedure.query(async ({ ctx }) => getProjectAvailableModels(ctx.project.id)),

	getConfig: adminProtectedProcedure.query(async ({ ctx }) => {
		const settings = await getAgentSettings(ctx.project.id);
		return settings?.contextRecommendations ?? null;
	}),

	setConfig: adminProtectedProcedure
		.input(
			z.object({
				modelProvider: z.string().optional(),
				modelId: z.string().optional(),
				frequency: z.enum(CONTEXT_RECOMMENDATION_FREQUENCIES).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const current = (await getAgentSettings(ctx.project.id))?.contextRecommendations;
			await updateAgentSettings(ctx.project.id, {
				contextRecommendations: {
					modelProvider: (input.modelProvider as LlmProvider) ?? current?.modelProvider,
					modelId: input.modelId ?? current?.modelId,
					frequency: input.frequency ?? current?.frequency,
				},
			});
			if (input.frequency) {
				await ensureContextRecommendationsSchedule(input.frequency, { reset: true });
			}
		}),

	setStatus: adminProtectedProcedure
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
};
