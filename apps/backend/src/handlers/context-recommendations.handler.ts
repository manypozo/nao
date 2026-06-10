import * as crQueries from '../queries/context-recommendation.queries';
import * as scheduledJobQueries from '../queries/scheduled-job.queries';
import { runContextRecommendations } from '../services/context-recommendations.service';
import { ensureRecurring, JobHandler } from '../services/scheduler.service';
import {
	CONTEXT_RECOMMENDATION_FREQUENCY_CRON,
	ContextRecommendationFrequency,
	DEFAULT_CONTEXT_RECOMMENDATION_FREQUENCY,
} from '../types/context-recommendation';

export const CONTEXT_RECOMMENDATIONS_JOB_NAME = 'context.recommendations';

interface ContextRecommendationsJobPayload {
	projectId?: unknown;
}

export const contextRecommendationsHandler: JobHandler<ContextRecommendationsJobPayload> = async (payload) => {
	if (typeof payload.projectId !== 'string') {
		throw new Error('Context recommendations job is missing a projectId payload.');
	}
	await runContextRecommendations(payload.projectId);
};

/**
 * Register (or update) the recurring analysis job for the given frequency. Pass
 * `reset` when the user changes the cadence so the new schedule takes effect now
 * instead of after the next run.
 */
export async function ensureContextRecommendationsSchedule(
	projectId: string,
	frequency: ContextRecommendationFrequency,
	options?: { reset?: boolean },
): Promise<void> {
	await ensureRecurring({
		name: CONTEXT_RECOMMENDATIONS_JOB_NAME,
		cron: CONTEXT_RECOMMENDATION_FREQUENCY_CRON[frequency],
		uniqueKey: contextRecommendationsJobUniqueKey(projectId),
		payload: { projectId },
		resetRunAtOnConflict: options?.reset,
	});
}

export async function ensureContextRecommendationsSchedules(): Promise<void> {
	await scheduledJobQueries.deleteJobByUniqueKey(CONTEXT_RECOMMENDATIONS_JOB_NAME);

	const configs = await crQueries.listProjectRecommendationScheduleConfigs();
	for (const config of configs) {
		await ensureContextRecommendationsSchedule(
			config.projectId,
			config.frequency ?? DEFAULT_CONTEXT_RECOMMENDATION_FREQUENCY,
		);
	}
}

export function contextRecommendationsJobUniqueKey(projectId: string): string {
	return `${CONTEXT_RECOMMENDATIONS_JOB_NAME}:${projectId}`;
}
