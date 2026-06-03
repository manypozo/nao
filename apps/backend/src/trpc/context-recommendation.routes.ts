import { LlmProvider } from '@nao/shared/types';
import { z } from 'zod';

import * as crQueries from '../queries/context-recommendation.queries';
import { getAgentSettings, updateAgentSettings } from '../queries/project.queries';
import { CONTEXT_RECOMMENDATION_STATUSES } from '../types/context-recommendation';
import { getProjectAvailableModels } from '../utils/llm';
import { adminProtectedProcedure } from './trpc';

export const contextRecommendationRoutes = {
	list: adminProtectedProcedure
		.input(z.object({ status: z.enum(CONTEXT_RECOMMENDATION_STATUSES).optional() }).optional())
		.query(async ({ ctx, input }) => crQueries.listRecommendations(ctx.project.id, input?.status)),

	latestRun: adminProtectedProcedure.query(async ({ ctx }) => crQueries.getLatestRun(ctx.project.id)),

	listAvailableModels: adminProtectedProcedure.query(async ({ ctx }) => getProjectAvailableModels(ctx.project.id)),

	getConfig: adminProtectedProcedure.query(async ({ ctx }) => {
		const settings = await getAgentSettings(ctx.project.id);
		return settings?.contextRecommendations ?? null;
	}),

	setConfig: adminProtectedProcedure
		.input(z.object({ modelProvider: z.string(), modelId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await updateAgentSettings(ctx.project.id, {
				contextRecommendations: { modelProvider: input.modelProvider as LlmProvider, modelId: input.modelId },
			});
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
