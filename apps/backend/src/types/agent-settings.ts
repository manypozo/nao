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
	};
}
