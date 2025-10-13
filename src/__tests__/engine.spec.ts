import { describe, expect, test } from "vitest";
import {
	evaluateFlag,
	evaluateRolloutStep,
	evaluateRolloutSteps,
} from "../engine";
import type { FeatureFlagInputSchema, FlagEvaluationInput } from "../schema";

function createMockInput(
	overrides?: Partial<FlagEvaluationInput>,
): FlagEvaluationInput {
	return {
		id: "user-123",
		user: {
			id: "user-123",
			email: "test@example.com",
			premium: false,
		},
		request: {
			headers: {
				"user-agent": "Mozilla/5.0",
			},
		},
		page: {
			url: "https://example.com/page",
		},
		geo: {
			country: "US",
			isEUCountry: false,
		},
		...overrides,
	};
}

function createMockBooleanFlag(
	overrides?: Partial<Extract<FeatureFlagInputSchema, { type: "boolean" }>>,
): FeatureFlagInputSchema {
	return {
		id: "test-flag",
		label: "Test Flag",
		description: "A test feature flag",
		enabled: true,
		type: "boolean",
		rules: [],
		segments: [],
		rollout: 100,
		rollouts: [],
		isTrackable: false,
		...overrides,
	};
}

function createMockPayloadFlag(
	payload: unknown,
	overrides?: Partial<Extract<FeatureFlagInputSchema, { type: "payload" }>>,
): FeatureFlagInputSchema {
	return {
		id: "test-payload-flag",
		label: "Test Payload Flag",
		description: "A test payload feature flag",
		enabled: true,
		type: "payload",
		payload,
		rules: [],
		segments: [],
		rollout: 100,
		rollouts: [],

		isTrackable: false,
		...overrides,
	};
}

function createMockVariantFlag(
	overrides?: Partial<Extract<FeatureFlagInputSchema, { type: "variant" }>>,
): FeatureFlagInputSchema {
	return {
		id: "test-variant-flag",
		label: "Test Variant Flag",
		description: "A test variant feature flag",
		enabled: true,
		type: "variant",
		variations: [
			{
				id: "control",
				label: "Control",
				weight: 50,
				payload: { variant: "A" },
			},
			{ id: "test", label: "Test", weight: 50, payload: { variant: "B" } },
		],
		rules: [],
		segments: [],
		rollout: 100,
		rollouts: [],

		isTrackable: false,
		...overrides,
	};
}

describe("evaluateRolloutStep", () => {
	test("returns false when segment does not exist (bug fix)", () => {
		const step = {
			start: "2024-01-01T00:00:00.000Z",
			segment: "nonExistentSegment",
		};
		const segments = { premiumUsers: "user.premium == true" };
		const input = createMockInput();

		const result = evaluateRolloutStep({
			step,
			segments,
			userId: "user-123",
			flagKey: "test-flag",
			input,
			now: new Date("2024-01-15").getTime(),
		});

		expect(result).toBe(false);
	});

	test("returns true when both segment AND percentage match", () => {
		const step = {
			start: "2024-01-01T00:00:00.000Z",
			segment: "premiumUsers",
			percentage: 100,
		};
		const segments = { premiumUsers: "user.premium == true" };
		const input = createMockInput({ user: { id: "user-123", premium: true } });

		const result = evaluateRolloutStep({
			step,
			segments,
			userId: "user-123",
			flagKey: "test-flag",
			input,
			now: new Date("2024-01-15").getTime(),
		});

		expect(result).toBe(true);
	});
});

describe("evaluateRolloutSteps", () => {
	test("short-circuits on first matching step with complex segments", () => {
		const rollouts = [
			{
				start: "2024-01-01T00:00:00.000Z",
				segment: "freeUsers",
				percentage: 100,
			}, // Matches
			{
				start: "2024-01-01T00:00:00.000Z",
				segment: "premiumUsers",
				percentage: 100,
			}, // Would not match
		];
		const segments = {
			freeUsers: "user.premium == false",
			premiumUsers: "user.premium == true",
		};
		const input = createMockInput({
			user: { id: "user-123", premium: false },
		});

		const result = evaluateRolloutSteps({
			rollouts,
			segments,
			userId: "user-123",
			flagKey: "test-flag",
			input,
			now: new Date("2024-01-15").getTime(),
		});

		expect(result).toBe(true);
	});
});

describe("evaluateFlag", () => {
	describe("Boolean Flags", () => {
		test("returns true when all conditions pass (happy path)", () => {
			const flag = createMockBooleanFlag();
			const input = createMockInput();

			const result = evaluateFlag({ input, flag, segments: {} });

			expect(result).toEqual({ type: "boolean", result: true, isEval: true });
		});
	});

	describe("Segment Evaluation", () => {
		test("evaluates segments with OR logic - matches if ANY segment passes", () => {
			const flag = createMockBooleanFlag({
				segments: ["premiumUsers", "betaUsers"],
			});

			// User is premium but NOT beta
			const input = createMockInput({
				user: { id: "user-123", premium: true, beta: false },
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
					betaUsers: "user.beta == true",
				},
			});

			// Should pass because user matches premiumUsers (OR logic)
			expect(result).toEqual({ type: "boolean", result: true, isEval: true });
		});

		test("returns false when NO segments match", () => {
			const flag = createMockBooleanFlag({
				segments: ["premiumUsers", "betaUsers"],
			});

			// User is neither premium nor beta
			const input = createMockInput({
				user: { id: "user-123", premium: false, beta: false },
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
					betaUsers: "user.beta == true",
				},
			});

			// Should fail because user matches NO segments
			expect(result).toEqual({ type: "boolean", result: false, isEval: false });
		});

		test("passes when user matches second segment but not first", () => {
			const flag = createMockBooleanFlag({
				segments: ["premiumUsers", "betaUsers"],
			});

			// User is beta but NOT premium
			const input = createMockInput({
				user: { id: "user-123", premium: false, beta: true },
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
					betaUsers: "user.beta == true",
				},
			});

			// Should pass because user matches betaUsers (OR logic)
			expect(result).toEqual({ type: "boolean", result: true, isEval: true });
		});
	});

	describe("Payload Flags", () => {
		test("supports complex nested payload objects", () => {
			const complexPayload = {
				config: { timeout: 5000, retries: 3 },
				features: ["feature1", "feature2"],
				nested: { deep: { value: 42 } },
			};
			const flag = createMockPayloadFlag(complexPayload);
			const input = createMockInput();

			const result = evaluateFlag({ input, flag, segments: {} });

			expect(result).toEqual({ type: "payload", result: complexPayload, isEval: true });
		});
	});

	describe("Variant Flags", () => {
		test("returns a variant payload when conditions pass", () => {
			const flag = createMockVariantFlag();
			const input = createMockInput();

			const result = evaluateFlag({ input, flag, segments: {} });

			expect(result.type).toBe("variant");
			// Result should be one of the variant payloads
			expect([{ variant: "A" }, { variant: "B" }]).toContainEqual(
				result.result,
			);
		});
	});

	describe("Rollout Steps", () => {
		test("includes user in multi-step rollout with matching segment", () => {
			const flag = createMockBooleanFlag({
				rollout: 0, // main rollout disabled
				rollouts: [
					{
						start: "2024-01-01T00:00:00.000Z",
						segment: "premiumUsers",
						percentage: 100,
					},
				],
				segments: ["premiumUsers"],
			});
			const input = createMockInput({
				user: { id: "user-123", premium: true },
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
				},
			});

			expect(result).toEqual({ type: "boolean", result: true, isEval: true });
		});

		test("evaluates multiple rollout steps and matches on second step", () => {
			const flag = createMockBooleanFlag({
				rollout: 0,
				rollouts: [
					{
						start: "2024-01-01T00:00:00.000Z",
						percentage: 10, // Most users won't match this
					},
					{
						start: "2024-01-02T00:00:00.000Z",
						percentage: 100, // All users match this
					},
				],
			});
			const input = createMockInput();

			const result = evaluateFlag({ input, flag, segments: {} });

			// Matches second rollout step (100%) - deterministic based on user hash
			expect(result).toEqual({ type: "boolean", result: true, isEval: true });
		});

		test("returns payload when rollout step matches", () => {
			const complexPayload = {
				apiUrl: "https://api.example.com/v2",
				timeout: 5000,
			};
			const flag = createMockPayloadFlag(complexPayload, {
				rollout: 0, // main rollout disabled
				rollouts: [
					{
						start: "2024-01-01T00:00:00.000Z",
						segment: "premiumUsers",
						percentage: 100,
					},
				],
				segments: ["premiumUsers"],
			});
			const input = createMockInput({
				user: { id: "user-123", premium: true },
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
				},
			});

			expect(result).toEqual({ type: "payload", result: complexPayload, isEval: true });
		});

		test("returns null payload when rollout step fails", () => {
			const complexPayload = {
				apiUrl: "https://api.example.com/v2",
				timeout: 5000,
			};
			const flag = createMockPayloadFlag(complexPayload, {
				rollout: 0, // main rollout disabled
				rollouts: [
					{
						start: "2024-01-01T00:00:00.000Z",
						segment: "premiumUsers",
						percentage: 100,
					},
				],
				segments: ["premiumUsers"],
			});
			const input = createMockInput({
				user: { id: "user-123", premium: false }, // Not premium
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
				},
			});

			expect(result).toEqual({ type: "payload", result: null, isEval: false });
		});

		test("returns variant payload when rollout step matches", () => {
			const flag = createMockVariantFlag({
				rollout: 0, // main rollout disabled
				rollouts: [
					{
						start: "2024-01-01T00:00:00.000Z",
						segment: "premiumUsers",
						percentage: 100,
					},
				],
				segments: ["premiumUsers"],
			});
			const input = createMockInput({
				user: { id: "user-123", premium: true },
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
				},
			});

			expect(result.type).toBe("variant");
			expect([{ variant: "A" }, { variant: "B" }]).toContainEqual(
				result.result,
			);
		});

		test("returns default variant when rollout step fails", () => {
			const flag = createMockVariantFlag({
				rollout: 0, // main rollout disabled
				rollouts: [
					{
						start: "2024-01-01T00:00:00.000Z",
						segment: "premiumUsers",
						percentage: 100,
					},
				],
				segments: ["premiumUsers"],
			});
			const input = createMockInput({
				user: { id: "user-123", premium: false }, // Not premium
			});

			const result = evaluateFlag({
				input,
				flag,
				segments: {
					premiumUsers: "user.premium == true",
				},
			});

			// Should return first variant's payload as default
			expect(result).toEqual({ type: "variant", result: { variant: "A" }, isEval: false });
		});
	});
});
