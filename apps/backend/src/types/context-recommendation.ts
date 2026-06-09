export const CONTEXT_RECOMMENDATION_RUN_STATUSES = ['running', 'completed', 'failed'] as const;
export type ContextRecommendationRunStatus = (typeof CONTEXT_RECOMMENDATION_RUN_STATUSES)[number];

export const CONTEXT_RECOMMENDATION_RUN_TRIGGERS = ['schedule', 'manual'] as const;
export type ContextRecommendationRunTrigger = (typeof CONTEXT_RECOMMENDATION_RUN_TRIGGERS)[number];

export const CONTEXT_RECOMMENDATION_STATUSES = ['open', 'acknowledged', 'snoozed', 'applied', 'dismissed'] as const;
export type ContextRecommendationStatus = (typeof CONTEXT_RECOMMENDATION_STATUSES)[number];

export const CONTEXT_RECOMMENDATION_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type ContextRecommendationFrequency = (typeof CONTEXT_RECOMMENDATION_FREQUENCIES)[number];

export const DEFAULT_CONTEXT_RECOMMENDATION_FREQUENCY: ContextRecommendationFrequency = 'weekly';

/** Cron expressions for each frequency. All run at 03:00 UTC. */
export const CONTEXT_RECOMMENDATION_FREQUENCY_CRON: Record<ContextRecommendationFrequency, string> = {
	daily: '0 3 * * *',
	weekly: '0 3 * * 1',
	monthly: '0 3 1 * *',
};

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
	failureShare: number;
}

export const CONTEXT_RECOMMENDATION_FIX_KINDS = ['patch', 'manual'] as const;
export type ContextRecommendationFixKind = (typeof CONTEXT_RECOMMENDATION_FIX_KINDS)[number];

export interface ProposedEdit {
	path: string;
	kind: 'edit' | 'create';
	oldContent: string;
	newContent: string;
}

export interface WindowTotals {
	errors: number;
	downvotes: number;
	regenerations: number;
}
