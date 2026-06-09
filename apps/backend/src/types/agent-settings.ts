import type { LlmProvider } from '@nao/shared/types';

import type { ContextRecommendationFrequency } from './context-recommendation';

export type WebSearchMode = 'provider';

export interface AgentSettings {
	memoryEnabled?: boolean;
	experimental?: {
		pythonSandboxing?: boolean;
		sandboxes?: boolean;
	};
	transcribe?: {
		enabled?: boolean;
		provider?: string;
		modelId?: string;
	};
	sql?: {
		dangerouslyWritePermEnabled?: boolean;
	};
	webSearch?: {
		enabled?: boolean;
		mode?: WebSearchMode;
	};
	contextRecommendations?: {
		modelProvider?: LlmProvider;
		modelId?: string;
		frequency?: ContextRecommendationFrequency;
		/** Repo for context PRs when the project folder itself is not a GitHub clone (e.g. nao deploy, volume mount). */
		repoFullName?: string;
		/** YOLO mode: open pull requests automatically after each run, without human review. */
		autoCreatePrs?: boolean;
		maxAutoPrsPerRun?: number;
	};
}
