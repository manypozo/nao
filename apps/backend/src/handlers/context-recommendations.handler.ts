// ABOUTME: Scheduler entry point for the weekly context-recommendations run.
// ABOUTME: Fans out one analysis run per project.

import { runContextRecommendationsForAllProjects } from '../services/context-recommendations.service';
import { JobHandler } from '../services/scheduler.service';

export const CONTEXT_RECOMMENDATIONS_JOB_NAME = 'context-recommendations';

export const contextRecommendationsHandler: JobHandler = async () => {
	await runContextRecommendationsForAllProjects();
};
