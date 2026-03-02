import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/agents/providers', () => ({
	LLM_PROVIDERS: {
		ollama: {
			envVar: 'OLLAMA_API_KEY',
			baseUrlEnvVar: 'OLLAMA_BASE_URL',
			models: [{ id: 'qwen3:8b', name: 'Qwen 3 8B', default: true }],
		},
		openai: {
			envVar: 'OPENAI_API_KEY',
			baseUrlEnvVar: 'OPENAI_BASE_URL',
			models: [{ id: 'gpt-4.1', name: 'GPT 4.1', default: true }],
		},
	},
	getDefaultModelId: (provider: 'ollama' | 'openai') => (provider === 'ollama' ? 'qwen3:8b' : 'gpt-4.1'),
	createProviderModel: (
		provider: 'ollama' | 'openai',
		settings: { apiKey: string; baseURL?: string },
		modelId: string,
	) => ({
		model: { provider, modelId, settings },
		providerOptions: { [provider]: {} },
	}),
}));

vi.mock('../src/queries/project-llm-config.queries', () => ({
	getProjectLlmConfigByProvider: vi.fn().mockResolvedValue(null),
	getProjectLlmConfigs: vi.fn().mockResolvedValue([]),
}));

const { getEnvProviders, resolveProviderModel } = await import('../src/utils/llm');

describe('llm utils', () => {
	afterEach(() => {
		delete process.env.OLLAMA_BASE_URL;
		delete process.env.OPENAI_API_KEY;
	});

	it('resolves ollama models without project config or api key', async () => {
		const result = await resolveProviderModel('project-id', 'ollama', 'qwen3:8b');

		expect(result).not.toBeNull();
		expect(result?.providerOptions).toEqual({ ollama: {} });
	});

	it('treats ollama base url as an env-configured provider', () => {
		process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

		expect(getEnvProviders()).toContain('ollama');
	});

	it('does not include ollama without a base url', () => {
		process.env.OPENAI_API_KEY = 'test-key';

		expect(getEnvProviders()).toEqual(['openai']);
	});
});
