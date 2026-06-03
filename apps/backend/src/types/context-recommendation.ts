export const CONTEXT_RECOMMENDATION_RUN_STATUSES = ['running', 'completed', 'failed'] as const;
export type ContextRecommendationRunStatus = (typeof CONTEXT_RECOMMENDATION_RUN_STATUSES)[number];

export const CONTEXT_RECOMMENDATION_RUN_TRIGGERS = ['schedule'] as const;
export type ContextRecommendationRunTrigger = (typeof CONTEXT_RECOMMENDATION_RUN_TRIGGERS)[number];

export const CONTEXT_RECOMMENDATION_STATUSES = ['open', 'acknowledged', 'snoozed', 'applied', 'dismissed'] as const;
export type ContextRecommendationStatus = (typeof CONTEXT_RECOMMENDATION_STATUSES)[number];

export const CONTEXT_RECOMMENDATION_SEVERITIES = ['high', 'medium', 'low'] as const;
export type ContextRecommendationSeverity = (typeof CONTEXT_RECOMMENDATION_SEVERITIES)[number];

export const CONTEXT_RECOMMENDATION_SIGNAL_TYPES = [
	'tool_error',
	'repeated_correction',
	'downvote_theme',
	'coverage_gap',
	'friction',
] as const;
export type ContextRecommendationSignalType = (typeof CONTEXT_RECOMMENDATION_SIGNAL_TYPES)[number];

export interface RecommendationInsight {
	signalType: ContextRecommendationSignalType;
	metric: string;
	count: number;
	exampleChatIds?: string[];
	snippet?: string;
}

export interface RecommendationImpact {
	affectedChats: number;
	affectedUsers: number;
	failureShare: number;
}
