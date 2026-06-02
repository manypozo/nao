// ABOUTME: Pure, deterministic impact scoring and lifecycle reconciliation for
// ABOUTME: context recommendations. No DB or LLM access; fully unit-tested.

import { createHash } from 'crypto';

import {
	ContextRecommendationSeverity,
	ContextRecommendationStatus,
	RecommendationImpact,
	RecommendationInsight,
} from '../types/context-recommendation';

export interface ProposedFinding {
	suggestedFile: string;
	subjectKey: string;
	severity: ContextRecommendationSeverity;
	title: string;
	summary: string;
	suggestedAction: string;
	insights: RecommendationInsight[];
}

export interface WindowTotals {
	errors: number;
	downvotes: number;
	regenerations: number;
}

export interface ExistingRecommendation {
	id: string;
	fingerprint: string;
	status: ContextRecommendationStatus;
	snoozedUntil: Date | null;
	occurrenceCount: number;
}

export type ReconcileAction =
	| {
			kind: 'insert';
			fingerprint: string;
			finding: ProposedFinding;
			impact: RecommendationImpact;
			impactScore: number;
	  }
	| {
			kind: 'update';
			id: string;
			finding: ProposedFinding;
			impact: RecommendationImpact;
			impactScore: number;
			reopen: boolean;
	  }
	| { kind: 'resolve'; id: string };

export function fingerprintFor(suggestedFile: string, subjectKey: string): string {
	return createHash('sha256').update(`${suggestedFile} ${subjectKey}`).digest('hex');
}

export function computeImpact(
	insights: RecommendationInsight[],
	totals: WindowTotals,
): { impact: RecommendationImpact; impactScore: number } {
	const chatIds = new Set<string>();
	let totalCount = 0;
	for (const insight of insights) {
		totalCount += insight.count;
		for (const id of insight.exampleChatIds ?? []) {
			chatIds.add(id);
		}
	}
	const denominator = Math.max(1, totals.errors + totals.downvotes + totals.regenerations);
	const failureShare = Math.min(1, totalCount / denominator);
	const affectedChats = chatIds.size;
	// affectedUsers is enriched by the process via a query; default to 0 here.
	const impact: RecommendationImpact = { affectedChats, affectedUsers: 0, failureShare };
	const impactScore = Math.round(failureShare * 100) + affectedChats * 5;
	return { impact, impactScore };
}

export function reconcile(input: {
	existing: ExistingRecommendation[];
	recorded: ProposedFinding[];
	resolvedFingerprints: string[];
	dismissedFingerprints: string[];
	totals: WindowTotals;
	impactFloor: number;
	now: Date;
}): ReconcileAction[] {
	const { existing, recorded, resolvedFingerprints, dismissedFingerprints, totals, impactFloor, now } = input;
	const byFingerprint = new Map(existing.map((r) => [r.fingerprint, r]));
	const dismissed = new Set(dismissedFingerprints);
	const actions: ReconcileAction[] = [];
	const handled = new Set<string>();

	for (const finding of recorded) {
		const fingerprint = fingerprintFor(finding.suggestedFile, finding.subjectKey);
		if (dismissed.has(fingerprint)) {
			continue;
		}
		const { impact, impactScore } = computeImpact(finding.insights, totals);
		const current = byFingerprint.get(fingerprint);
		if (current) {
			handled.add(fingerprint);
			const snoozeExpired =
				current.status === 'snoozed' && current.snoozedUntil !== null && current.snoozedUntil <= now;
			const reopen = current.status === 'applied' || snoozeExpired;
			actions.push({ kind: 'update', id: current.id, finding, impact, impactScore, reopen });
		} else if (impactScore >= impactFloor) {
			actions.push({ kind: 'insert', fingerprint, finding, impact, impactScore });
		}
	}

	for (const fingerprint of resolvedFingerprints) {
		if (handled.has(fingerprint) || dismissed.has(fingerprint)) {
			continue;
		}
		const current = byFingerprint.get(fingerprint);
		if (current && (current.status === 'open' || current.status === 'acknowledged')) {
			actions.push({ kind: 'resolve', id: current.id });
		}
	}

	return actions;
}
