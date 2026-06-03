import { runContextRecommendationsForAllProjects } from '../services/context-recommendations.service';
import { JobHandler } from '../services/scheduler.service';

export const CONTEXT_RECOMMENDATIONS_JOB_NAME = 'context-recommendations';

export const contextRecommendationsHandler: JobHandler = async () => {
	await runContextRecommendationsForAllProjects();
};
