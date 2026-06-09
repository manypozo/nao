import { useCallback, useState } from 'react';

const STORAGE_KEY = 'recommendation-card-collapsed';

function readState(): Record<string, boolean> {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) {
			return {};
		}
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
	} catch {
		return {};
	}
}

function writeState(state: Record<string, boolean>) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore quota / availability errors
	}
}

/**
 * Persists the collapsed state of a recommendation card in localStorage, keyed by id.
 * Falls back to `defaultCollapsed` until the card has been toggled.
 */
export function useRecommendationCollapsed(id: string, defaultCollapsed = false) {
	const [collapsed, setCollapsedState] = useState<boolean>(() => {
		const state = readState();
		return id in state ? state[id] : defaultCollapsed;
	});

	const setCollapsed = useCallback(
		(value: boolean | ((prev: boolean) => boolean)) => {
			setCollapsedState((prev) => {
				const next = typeof value === 'function' ? value(prev) : value;
				const state = readState();
				state[id] = next;
				writeState(state);
				return next;
			});
		},
		[id],
	);

	return [collapsed, setCollapsed] as const;
}
