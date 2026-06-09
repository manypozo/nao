import { runContextRecommendationsForAllProjects } from '../services/context-recommendations.service';
import { ensureRecurring, JobHandler } from '../services/scheduler.service';
import { CONTEXT_RECOMMENDATION_FREQUENCY_CRON, ContextRecommendationFrequency } from '../types/context-recommendation';

export const CONTEXT_RECOMMENDATIONS_JOB_NAME = 'context.recommendations';

export const contextRecommendationsHandler: JobHandler = async () => {
	await runContextRecommendationsForAllProjects();
};

/**
 * Register (or update) the recurring analysis job for the given frequency. Pass
 * `reset` when the user changes the cadence so the new schedule takes effect now
 * instead of after the next run.
 */
export async function ensureContextRecommendationsSchedule(
	frequency: ContextRecommendationFrequency,
	options?: { reset?: boolean },
): Promise<void> {
	await ensureRecurring({
		name: CONTEXT_RECOMMENDATIONS_JOB_NAME,
		cron: CONTEXT_RECOMMENDATION_FREQUENCY_CRON[frequency],
		uniqueKey: CONTEXT_RECOMMENDATIONS_JOB_NAME,
		resetRunAtOnConflict: options?.reset,
	});
}
