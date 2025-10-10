import jexl from "jexl";
import type {
	FeatureFlagInputSchema,
	FlagEvaluationInput,
	FlagResultSchema,
} from "./schema";

jexl.addTransform("split", (val, char) => val.split(char));
jexl.addTransform("lower", (val) => val.toLowerCase());
jexl.addTransform("upper", (val) => val.toUpperCase());

jexl.addFunction("ts", (val) => new Date(val).getTime());
jexl.addFunction("now", () => Date.now());

/**
 * Stable hash function (FNV-1a 32-bit)
 * Returns unsigned 32-bit integer
 */
export function hashFnv32a(str: string): number {
	let hval = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hval ^= str.charCodeAt(i);
		hval +=
			(hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
	}
	return hval >>> 0; // convert to unsigned
}

/**
 * Returns a deterministic bucket between 1–100 for a user + flag
 */
export function userPercentageHash({
	userId,
	flagKey,
}: {
	userId: string;
	flagKey: string;
}): number {
	const input = `${userId}:${flagKey}`;
	const hash = hashFnv32a(input);
	return (hash % 100) + 1; // 1–100 inclusive
}

/**
 * Pick a variant deterministically based on user + flag
 * @param userId - unique user identifier
 * @param flagKey - feature flag key
 * @param variants - array of {id, weight} objects, weights sum <= 100
 * @returns variant id
 */
export function chooseVariant<T extends { id: string; weight: number }[]>({
	userId,
	flagKey,
	variants,
}: {
	userId: string;
	flagKey: string;
	variants: T;
}): T[number]["id"] | null {
	const bucket = userPercentageHash({ userId, flagKey });
	let cumulative = 0;
	for (const v of variants) {
		cumulative += v.weight;
		if (bucket <= cumulative) return v.id;
	}
	return null;
}

/**
 * Check if a user is included in a percentage rollout
 * @param userId - unique user identifier
 * @param flagKey - feature flag key
 * @param percentage - 0–100
 * @returns boolean
 */
export function isUserInRollout({
	userId,
	flagKey,
	percentage,
}: {
	userId: string;
	flagKey: string;
	percentage: number;
}): boolean {
	if (percentage === 100) {
		return true;
	}
	const bucket = userPercentageHash({ userId, flagKey });
	return bucket <= percentage;
}

/**
 * Evaluate a single rollout step
 * @param step - The rollout step to evaluate
 * @param segments - Map of segment IDs to JEXL rules
 * @param userId - The user ID
 * @param flagKey - The flag key
 * @param input - The evaluation input context
 * @returns true if the user matches this rollout step
 */
export function evaluateRolloutStep({
	step,
	segments,
	userId,
	flagKey,
	input,
	now,
}: {
	step: { start: string; segment?: string; percentage?: number };
	segments: Record<string, string>;
	userId: string;
	flagKey: string;
	input: FlagEvaluationInput;
	now: number;
}): boolean {
	// Check if rollout step has started
	const startTime = new Date(step.start).getTime();
	if (now < startTime) {
		return false;
	}

	// Check segment condition
	const stepSegmentPassed = step.segment
		? segments[step.segment]
			? jexl.evalSync(segments[step.segment], input)
			: false // Return false if segment doesn't exist
		: true; // No segment requirement means it passes

	// Check percentage condition
	const stepPercentagePassed =
		step.percentage !== undefined
			? isUserInRollout({
					userId,
					flagKey,
					percentage: step.percentage,
				})
			: true; // No percentage requirement means it passes

	return stepSegmentPassed && stepPercentagePassed;
}

/**
 * Evaluate all rollout steps (OR logic - user matches if ANY step passes)
 * @param rollouts - Array of rollout steps
 * @param segments - Map of segment IDs to JEXL rules
 * @param userId - The user ID
 * @param flagKey - The flag key
 * @param input - The evaluation input context
 * @returns true if the user matches at least one rollout step
 */
export function evaluateRolloutSteps({
	rollouts,
	segments,
	userId,
	flagKey,
	input,
	now,
}: {
	rollouts: { start: string; segment?: string; percentage?: number }[];
	segments: Record<string, string>;
	userId: string;
	flagKey: string;
	input: FlagEvaluationInput;
	now: number;
}): boolean {
	for (const step of rollouts) {
		if (
			evaluateRolloutStep({
				step,
				segments,
				userId,
				flagKey,
				input,
				now,
			})
		) {
			return true; // First match wins
		}
	}
	return false; // No steps matched
}

const getDefaultFlag = (flag: FeatureFlagInputSchema): FlagResultSchema => {
	switch (flag.type) {
		case "boolean":
			return {
				type: "boolean",
				result: false,
				isEval: false,
			};
		case "payload":
			return {
				type: "payload",
				result: null,
				isEval: false,
			};
		case "variant":
			return {
				type: "variant",
				result: flag.variations.at(0)?.payload ?? flag.variations.at(0)?.id,
				isEval: false,
			};
		default:
			return {
				type: "boolean",
				result: false,
				isEval: false,
			};
	}
};

/**
 * Evaluate a single feature flag for a given user/context input
 */
export const evaluateFlag = (options: {
	input: FlagEvaluationInput;
	flag: FeatureFlagInputSchema;
	segments: Record<string, string>;
	now?: number;
}): FlagResultSchema => {
	const { input, flag, segments, now = Date.now() } = options;

	jexl.addFunction("now", () => now);

	if (!flag.enabled) {
		return getDefaultFlag(flag);
	}

	const userId = input.id;

	const flagSegments = flag.segments.reduce<Record<string, string>>(
		(acc, segmentKey) => {
			acc[segmentKey] = segments[segmentKey];
			return acc;
		},
		{},
	);

	// Evaluate all rules
	const rulesPassed =
		flag.rules.length === 0 ||
		flag.rules.every((rule) => jexl.evalSync(rule, input));

	if (!rulesPassed) {
		return getDefaultFlag(flag);
	}

	const hasSegments = Object.values(flagSegments).length > 0;
	const hasRolloutes = flag.rollouts.length > 0;

	// Only evaluate segments globally if they're not being used in rollout steps
	// If rollout steps exist, segments are evaluated within those steps instead
	if (!hasRolloutes && hasSegments) {
		const segmentsPassed = Object.values(flagSegments).some((rule) =>
			jexl.evalSync(rule, input),
		);

		if (!segmentsPassed) {
			return getDefaultFlag(flag);
		}
	}

	// Check rollout steps if any
	if (hasRolloutes) {
		const includedInRollout = evaluateRolloutSteps({
			rollouts: flag.rollouts,
			segments: flagSegments,
			userId,
			flagKey: flag.id,
			input,
			now,
		});

		if (!includedInRollout) {
			return getDefaultFlag(flag);
		}
	} else {
		// Only check main rollout percentage if no rollout steps exist
		const inRollout = isUserInRollout({
			userId,
			flagKey: flag.id,
			percentage: flag.rollout,
		});

		if (!inRollout) {
			return getDefaultFlag(flag);
		}
	}

	// Handle different flag types
	switch (flag.type) {
		case "boolean":
			return {
				type: "boolean",
				result: true,
				isEval: true,
			};

		case "payload":
			return {
				type: "payload",
				result: flag.payload ?? null,
				isEval: true,
			};

		case "variant": {
			const variantId = chooseVariant({
				userId,
				flagKey: flag.id,
				variants: flag.variations,
			});
			const variant = flag.variations.find((v) => v.id === variantId);
			return {
				type: "variant",
				result: variant?.payload ?? variant.id,
				isEval: true,
			};
		}
	}
};
