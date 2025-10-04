import { describe, expect, test } from "vitest";
import { evaluateFlag } from "../engine";
import type { FlagEvaluationInput } from "../schema";

/**
 * Helper to create properly structured evaluation input
 */
function createInput(overrides: Partial<FlagEvaluationInput> = {}): FlagEvaluationInput {
	return {
		id: "user-123",
		user: { id: "user-123" },
		request: {
			headers: { "user-agent": "Mozilla/5.0" },
		},
		page: {
			url: "https://example.com",
		},
		geo: { country: "US", isEUCountry: false },
		...overrides,
	};
}

/**
 * Comprehensive examples of all feature flag types and capabilities.
 * Each test is fully self-contained with inline flag definitions.
 */
describe("Feature Flag Examples", () => {
	test("Example 1: Simple boolean flag - Basic on/off toggle", () => {
		const flag = {
			id: "dark-mode",
			label: "Dark Mode",
			description: "Enable dark mode for all users",
			enabled: true,
			type: "boolean" as const,
			rules: [],
			segments: [],
			rollout: 100, // 100% of users
			rollouts: [],
		};

		const input = createInput({
			user: { id: "user-123", email: "john@example.com" },
		});

		const result = evaluateFlag({ input, flag, segments: {} });

		expect(result).toEqual({ type: "boolean", result: true });
	});

	test("Example 2: Boolean flag with rules - Target premium users only", () => {
		const flag = {
			id: "premium-feature",
			label: "Premium Feature Access",
			description: "Only available to premium users",
			enabled: true,
			type: "boolean" as const,
			rules: ["user.subscription == 'premium'"],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const premiumUser = createInput({
			id: "user-456",
			user: { id: "user-456", subscription: "premium" },
		});

		const freeUser = createInput({
			id: "user-789",
			user: { id: "user-789", subscription: "free" },
		});

		const premiumResult = evaluateFlag({
			input: premiumUser,
			flag,
			segments: {},
		});
		const freeResult = evaluateFlag({
			input: freeUser,
			flag,
			segments: {},
		});

		expect(premiumResult).toEqual({ type: "boolean", result: true });
		expect(freeResult).toEqual({ type: "boolean", result: false });
	});

	test("Example 3: Boolean flag with segments - Geo-targeting US users", () => {
		const flag = {
			id: "us-promotion",
			label: "US Promotion Banner",
			description: "Show promotion banner to US users only",
			enabled: true,
			type: "boolean" as const,
			rules: [],
			segments: ["usUsers"],
			rollout: 100,
			rollouts: [],
		};

		const usUser = createInput({
			id: "user-us-1",
			user: { id: "user-us-1" },
		});

		const euUser = createInput({
			id: "user-eu-1",
			user: { id: "user-eu-1" },
			geo: { country: "DE", isEUCountry: true },
		});

		const usResult = evaluateFlag({ input: usUser, flag, segments: { usUsers: 'geo.country == "US"' } });
		const euResult = evaluateFlag({ input: euUser, flag, segments: { usUsers: 'geo.country == "US"' } });

		expect(usResult).toEqual({ type: "boolean", result: true });
		expect(euResult).toEqual({ type: "boolean", result: false });
	});

	test("Example 4: Boolean flag with percentage rollout - 50% gradual rollout", () => {
		const flag = {
			id: "new-dashboard",
			label: "New Dashboard UI",
			description: "Gradual rollout of redesigned dashboard",
			enabled: true,
			type: "boolean" as const,
			rules: [],
			segments: [],
			rollout: 50, // 50% of users (deterministic based on userId + flagKey hash)
			rollouts: [],
		};

		// User that falls in the 50% bucket (hash = 34, which is <= 50)
		const userInRollout = createInput({
			id: "user-456",
			user: { id: "user-456" },
		});

		// User that does NOT fall in the 50% bucket (hash = 95, which is > 50)
		const userNotInRollout = createInput({
			id: "user-123",
			user: { id: "user-123" },
		});

		// Results are deterministic - same user + flag always gets same result
		expect(
			evaluateFlag({ input: userInRollout, flag, segments: {} }),
		).toEqual({
			type: "boolean",
			result: true,
		});

		expect(
			evaluateFlag({ input: userNotInRollout, flag, segments: {} }),
		).toEqual({ type: "boolean", result: false });
	});

	test("Example 5: Combined rules and segments - Enterprise feature", () => {
		const flag = {
			id: "advanced-analytics",
			label: "Advanced Analytics Dashboard",
			description: "Enterprise feature for large teams in allowed regions",
			enabled: true,
			type: "boolean" as const,
			rules: [
				"user.plan == 'enterprise'", // Must be enterprise plan
			],
			segments: ["allowedRegions"],
			rollout: 100,
			rollouts: [],
		};

		const qualifiedUser = createInput({
			id: "ent-user-1",
			user: { id: "ent-user-1", plan: "enterprise" },
		});

		const wrongPlanUser = createInput({
			id: "pro-user-1",
			user: { id: "pro-user-1", plan: "pro" },
		});

		const wrongRegionUser = createInput({
			id: "ent-user-2",
			user: { id: "ent-user-2", plan: "enterprise" },
			geo: { country: "DE", isEUCountry: true },
		});

		const qualifiedResult = evaluateFlag({
			input: qualifiedUser,
			flag,
			segments: {
				allowedRegions: 'geo.country == "US" || geo.country == "CA"',
			},
		});
		const wrongPlanResult = evaluateFlag({
			input: wrongPlanUser,
			flag,
			segments: {
				allowedRegions: 'geo.country == "US" || geo.country == "CA"',
			},
		});
		const wrongRegionResult = evaluateFlag({
			input: wrongRegionUser,
			flag,
			segments: {
				allowedRegions: 'geo.country == "US" || geo.country == "CA"',
			},
		});

		// Qualified user passes all checks
		expect(qualifiedResult).toEqual({ type: "boolean", result: true });

		// Wrong plan fails
		expect(wrongPlanResult).toEqual({ type: "boolean", result: false });

		// Wrong region fails
		expect(wrongRegionResult).toEqual({ type: "boolean", result: false });
	});

	test("Example 6: Payload flag - Feature configuration object", () => {
		const flag = {
			id: "api-config",
			label: "API Configuration",
			description: "Dynamic API configuration",
			enabled: true,
			type: "payload" as const,
			payload: {
				apiUrl: "https://api.example.com/v2",
				timeout: 5000,
				retries: 3,
				features: ["compression", "caching"],
			},
			rules: [],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const input = createInput();

		const result = evaluateFlag({ input, flag, segments: {} });

		expect(result).toEqual({
			type: "payload",
			result: {
				apiUrl: "https://api.example.com/v2",
				timeout: 5000,
				retries: 3,
				features: ["compression", "caching"],
			},
		});
	});

	test("Example 7: Variant flag (A/B Test) - Two variations with 50/50 split", () => {
		const flag = {
			id: "checkout-button-test",
			label: "Checkout Button A/B Test",
			description: "Test two different button colors",
			enabled: true,
			type: "variant" as const,
			variations: [
				{
					id: "control",
					label: "Blue Button (Control)",
					weight: 50,
					payload: { color: "blue", text: "Checkout" },
				},
				{
					id: "variant",
					label: "Green Button (Variant)",
					weight: 50,
					payload: { color: "green", text: "Buy Now" },
				},
			],
			rules: [],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const input = createInput({
			id: "user-abc",
			user: { id: "user-abc" },
			page: { url: "https://example.com/checkout" },
		});

		const result = evaluateFlag({ input, flag, segments: {} });

		// User will deterministically get either control or variant
		expect([
			{ color: "blue", text: "Checkout" },
			{ color: "green", text: "Buy Now" },
		]).toContainEqual(result?.result);
	});

	test("Example 8: Variant flag (A/B/C Test) - Three variations with different weights", () => {
		const flag = {
			id: "pricing-page-test",
			label: "Pricing Page Layout Test",
			description: "Test three different pricing layouts",
			enabled: true,
			type: "variant" as const,
			variations: [
				{
					id: "control",
					label: "Original Layout",
					weight: 40,
					payload: { layout: "original", showAnnual: false },
				},
				{
					id: "variant-a",
					label: "New Layout A",
					weight: 30,
					payload: { layout: "modern", showAnnual: true },
				},
				{
					id: "variant-b",
					label: "New Layout B",
					weight: 30,
					payload: { layout: "minimal", showAnnual: true },
				},
			],
			rules: [],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const input = createInput({
			id: "user-xyz",
			user: { id: "user-xyz" },
			page: { url: "https://example.com/pricing" },
		});

		const result = evaluateFlag({ input, flag, segments: {} });

		// User gets one of three variants based on weights
		expect([
			{ layout: "original", showAnnual: false },
			{ layout: "modern", showAnnual: true },
			{ layout: "minimal", showAnnual: true },
		]).toContainEqual(result?.result);
	});

	test("Example 9: Multi-step rollout - Progressive deployment", () => {
		const flag = {
			id: "new-search",
			label: "New Search Engine",
			description: "Progressive rollout using percentage-based steps",
			enabled: true,
			type: "boolean" as const,
			rules: [],
			segments: [],
			rollout: 0, // Main rollout disabled
			rollouts: [
				{
					start: "2025-01-01T00:00:00.000Z",
					percentage: 10, // Start with 10%
				},
				{
					start: "2025-02-01T00:00:00.000Z",
					percentage: 100, // Then expand to everyone
				},
			],
		};

		// User that falls in the 10% bucket (hash = 3, which is <= 10)
		const userIn10Percent = createInput({
			id: "user-28",
			user: { id: "user-28" },
		});

		// User that does NOT fall in the 10% bucket (hash = 75, which is > 10)
		const userNotIn10Percent = createInput({
			id: "user-0",
			user: { id: "user-0" },
		});

		// Before rollout starts (Dec 2024) - nobody gets access
		expect(
			evaluateFlag({
				input: userIn10Percent,
				flag,
				segments: {},
				now: new Date("2024-12-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: false });

		// Jan 15, 2025: 10% rollout active - only users in 10% bucket
		expect(
			evaluateFlag({
				input: userIn10Percent,
				flag,
				segments: {},
				now: new Date("2025-01-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: userNotIn10Percent,
				flag,
				segments: {},
				now: new Date("2025-01-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: false });

		// Feb 15, 2025: 100% rollout active - everyone gets access
		expect(
			evaluateFlag({
				input: userIn10Percent,
				flag,
				segments: {},
				now: new Date("2025-02-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: userNotIn10Percent,
				flag,
				segments: {},
				now: new Date("2025-02-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });
	});

	test("Example 10: Disabled flag - Returns false when disabled", () => {
		const flag = {
			id: "maintenance-mode",
			label: "Maintenance Mode",
			description: "Put app in maintenance mode",
			enabled: false, // Flag is disabled
			type: "boolean" as const,
			rules: [],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const input = createInput({
			id: "admin-user",
			user: { id: "admin-user" },
		});

		const result = evaluateFlag({ input, flag, segments: {} });

		// Disabled flags always return false
		expect(result).toEqual({ type: "boolean", result: false });
	});

	test("Example 11: Custom userKey - Using email instead of user.id", () => {
		const flag = {
			id: "email-based-feature",
			label: "Email-based Feature",
			description: "Feature targeting using email as identifier",
			enabled: true,
			type: "boolean" as const,
			rules: [],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const input = createInput({
			id: "user@example.com",
			user: {
				// No 'id' field - using email as unique identifier
				email: "user@example.com",
				name: "John Doe",
			},
		});

		const result = evaluateFlag({
			input,
			flag,
			segments: {},
		});

		expect(result).toEqual({ type: "boolean", result: true });
	});

	test("Example 12: Boolean flag with users - Target internal team members", () => {
		const flag = {
			id: "detail-card",
			label: "Product details card",
			description: "Show extra information about the product to team members",
			enabled: true,
			type: "boolean" as const,
			rules: [],
			segments: ["teamMember"],
			rollout: 100,
			rollouts: [],
		};

		const companyUser = createInput({
			id: "user-company-1",
			user: { id: "user-company-1", email: "user@company.com" },
		});

		const customerUser = createInput({
			id: "user-customer-1",
			user: { id: "user-customer-1", email: "user@example.com" },
			geo: { country: "DE", isEUCountry: true },
		});

		const companyResult = evaluateFlag({
			input: companyUser,
			flag,
			segments: {
				teamMember: "'@company.com' in user.email",
			},
		});

		const customerResult = evaluateFlag({
			input: customerUser,
			flag,
			segments: {
				teamMember: "'@company.com' in user.email",
			},
		});

		expect(companyResult).toEqual({ type: "boolean", result: true });
		expect(customerResult).toEqual({ type: "boolean", result: false });
	});

	test("Example 13: Boolean flag with users - Target premium members whose subscription expires in 30 days with dates", () => {
		const flag = {
			id: "premium-feature",
			label: "Premium feature",
			description: "A premium feature",
			enabled: true,
			type: "boolean" as const,
			rules: ["ts(user.premiumUntil) > (now() - 2592000000)"],
			segments: [],
			rollout: 100,
			rollouts: [],
		};

		const user = createInput({
			id: "user-customer-1",
			user: {
				id: "user-customer-1",
				email: "user@example.com",
				premiumUntil: "2025-11-01T00:00:00.000Z",
			},
			geo: { country: "UK", isEUCountry: false },
		});

		const companyResult = evaluateFlag({
			input: user,
			flag,
			segments: {},
			now: new Date("2025-10-15T00:00:00.000Z").getTime(),
		});

		expect(companyResult).toEqual({ type: "boolean", result: true });
	});

	test("Example 14: Time-gated progressive rollout - Scheduled feature release", () => {
		const flag = {
			id: "new-editor",
			label: "New Code Editor",
			description:
				"Progressive rollout: internal team → beta testers → all users",
			enabled: true,
			type: "boolean" as const,
			rules: ["now() >= ts('2025-01-01T00:00:00.000Z')"], // Feature available starting Jan 1
			segments: ["internalTeam", "premiumUser", "allUser"],
			rollout: 0, // Main rollout disabled
			rollouts: [
				{
					start: "2025-01-01T00:00:00.000Z",
					segment: "internalTeam",
				},
				{
					start: "2025-02-01T00:00:00.000Z",
					segment: "premiumUser",
				},
				{
					start: "2025-03-01T00:00:00.000Z",
					segment: "allUser",
				},
			],
		};

		const internalUser = createInput({
			id: "emp-001",
			user: {
				id: "emp-001",
				email: "alice@example.com",
				plan: "free",
			},
		});

		const premiumUser = createInput({
			id: "premium-001",
			user: {
				id: "premium-001",
				email: "user@gmail.com",
				plan: "premium",
			},
		});

		const regularUser = createInput({
			id: "user-001",
			user: {
				id: "user-001",
				email: "user@gmail.com",
				plan: "free",
			},
		});

		const segments = {
			internalTeam: "'@example.com' in user.email",
			premiumUser: "user.plan == 'premium'",
			allUser: "true",
		};

		// Dec 15, 2024: Before Jan 1 launch - nobody gets access (rule blocks it)
		expect(
			evaluateFlag({
				input: internalUser,
				flag,
				segments,
				now: new Date("2024-12-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: false });

		// Jan 15, 2025: Phase 1 - Only internal team gets access
		expect(
			evaluateFlag({
				input: internalUser,
				flag,
				segments,
				now: new Date("2025-01-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: premiumUser,
				flag,
				segments,
				now: new Date("2025-01-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: false });

		expect(
			evaluateFlag({
				input: regularUser,
				flag,
				segments,
				now: new Date("2025-01-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: false });

		// Feb 15, 2025: Phase 2 - Internal team + Premium users get access
		expect(
			evaluateFlag({
				input: internalUser,
				flag,
				segments,
				now: new Date("2025-02-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: premiumUser,
				flag,
				segments,
				now: new Date("2025-02-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: regularUser,
				flag,
				segments,
				now: new Date("2025-02-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: false });

		// Mar 15, 2025: Phase 3 - All users get access
		expect(
			evaluateFlag({
				input: internalUser,
				flag,
				segments,
				now: new Date("2025-03-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: premiumUser,
				flag,
				segments,
				now: new Date("2025-03-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });

		expect(
			evaluateFlag({
				input: regularUser,
				flag,
				segments,
				now: new Date("2025-03-15T00:00:00.000Z").getTime(),
			}),
		).toEqual({ type: "boolean", result: true });
	});
});
