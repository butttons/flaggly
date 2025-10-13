import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FeatureFlagInputSchema } from "../schema";
import { AppKV } from "../storage";

function createMockKV(): KVNamespace {
	const store = new Map<string, { value: string; metadata: unknown }>();

	return {
		get: vi.fn(async (key: string, options?: string | { type?: string }) => {
			const item = store.get(key);
			if (!item) return null;

			const type = typeof options === "string" ? options : options?.type;

			if (type === "json") {
				return JSON.parse(item.value);
			}
			return item.value;
		}),
		getWithMetadata: vi.fn(async (key: string) => {
			const item = store.get(key);
			if (!item) {
				return { value: null, metadata: null };
			}
			return {
				value: item.value,
				metadata: item.metadata,
			};
		}),
		put: vi.fn(
			async (key: string, value: string, options?: { metadata?: unknown }) => {
				store.set(key, {
					value,
					metadata: options?.metadata ?? null,
				});
			},
		),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		list: vi.fn(),
	} as unknown as KVNamespace;
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

describe("AppKV", () => {
	let mockKV: KVNamespace;
	let appKV: AppKV;

	beforeEach(() => {
		mockKV = createMockKV();
		appKV = new AppKV({
			kv: mockKV,
			app: "test-app",
			env: "test-env",
		});
	});

	describe("Segment validation", () => {
		test("rejects flag with non-existent segment", async () => {
			const flag = createMockBooleanFlag({
				segments: ["nonExistentSegment"],
			});

			const [data, error] = await appKV.putFlag({ flag });

			expect(error).toBeTruthy();
			expect(error?.code).toBe("INVALID_BODY");
			expect(data).toBeNull();
		});

		test("allows flag with existing segment", async () => {
			await appKV.putSegment({ id: "beta-users", rule: "user.beta == true" });

			const flag = createMockBooleanFlag({
				segments: ["beta-users"],
			});

			const [data, error] = await appKV.putFlag({ flag });

			expect(error).toBeNull();
			expect(data?.flags["test-flag"]).toEqual(flag);
		});

		test("rejects flag update with non-existent segment", async () => {
			const flag = createMockBooleanFlag();
			await appKV.putFlag({ flag });

			const [data, error] = await appKV.updateFlag({
				id: "test-flag",
				update: { segments: ["nonExistentSegment"] },
			});

			expect(error).toBeTruthy();
			expect(error?.code).toBe("INVALID_BODY");
			expect(data).toBeNull();
		});
	});

	describe("deleteSegment", () => {
		test("removes segment from flags that reference it", async () => {
			// Create segment
			await appKV.putSegment({ id: "beta-users", rule: "user.beta == true" });

			// Create flag using segment
			const flag = createMockBooleanFlag({
				segments: ["beta-users"],
			});
			await appKV.putFlag({ flag });

			// Delete segment
			const [data, error] = await appKV.deleteSegment({ id: "beta-users" });

			expect(error).toBeNull();
			expect(data?.segments["beta-users"]).toBeUndefined();
			expect(data?.flags["test-flag"]?.segments).toEqual([]);
		});

		test("removes segment from multiple flags", async () => {
			await appKV.putSegment({ id: "premium", rule: "user.premium == true" });

			const flag1 = createMockBooleanFlag({
				id: "flag-1",
				segments: ["premium"],
			});
			const flag2 = createMockBooleanFlag({
				id: "flag-2",
				segments: ["premium"],
			});

			await appKV.putFlag({ flag: flag1 });
			await appKV.putFlag({ flag: flag2 });

			const [data] = await appKV.deleteSegment({ id: "premium" });

			expect(data?.flags["flag-1"]?.segments).toEqual([]);
			expect(data?.flags["flag-2"]?.segments).toEqual([]);
		});

		test("only removes deleted segment from flags, keeps others", async () => {
			await appKV.putSegment({ id: "premium", rule: "user.premium == true" });
			await appKV.putSegment({ id: "beta", rule: "user.beta == true" });

			const flag = createMockBooleanFlag({
				segments: ["premium", "beta"],
			});

			await appKV.putFlag({ flag });

			const [data] = await appKV.deleteSegment({ id: "premium" });

			expect(data?.flags["test-flag"]?.segments).toEqual(["beta"]);
		});
	});

	describe("Multi-app/env isolation", () => {
		test("isolates flags by app and env", async () => {
			const appKV1 = new AppKV({ kv: mockKV, app: "app1", env: "prod" });
			const appKV2 = new AppKV({ kv: mockKV, app: "app2", env: "prod" });

			const flag1 = createMockBooleanFlag({ id: "shared-flag" });
			const flag2 = createMockBooleanFlag({
				id: "shared-flag",
				label: "Different Flag",
			});

			await appKV1.putFlag({ flag: flag1 });
			await appKV2.putFlag({ flag: flag2 });

			const data1 = await appKV1.getData();
			const data2 = await appKV2.getData();

			expect(data1?.flags["shared-flag"]?.label).toBe("Test Flag");
			expect(data2?.flags["shared-flag"]?.label).toBe("Different Flag");
		});

		test("isolates segments by app and env", async () => {
			const appKV1 = new AppKV({ kv: mockKV, app: "app1", env: "prod" });
			const appKV2 = new AppKV({ kv: mockKV, app: "app2", env: "prod" });

			await appKV1.putSegment({ id: "users", rule: "user.id > 100" });
			await appKV2.putSegment({ id: "users", rule: "user.id < 50" });

			const data1 = await appKV1.getData();
			const data2 = await appKV2.getData();

			expect(data1?.segments.users).toBe("user.id > 100");
			expect(data2?.segments.users).toBe("user.id < 50");
		});
	});

	describe("deleteFlag error handling", () => {
		test("returns error when deleting non-existent flag", async () => {
			const [data, error] = await appKV.deleteFlag({ id: "non-existent" });

			expect(error).toBeTruthy();
			expect(error?.code).toBe("NOT_FOUND");
			expect(data).toBeNull();
		});
	});

	describe("updateFlag error handling", () => {
		test("returns error when updating non-existent flag", async () => {
			const [data, error] = await appKV.updateFlag({
				id: "non-existent",
				update: { label: "Updated" },
			});

			expect(error).toBeTruthy();
			expect(error?.code).toBe("NOT_FOUND");
			expect(data).toBeNull();
		});
	});

	describe("syncEnv", () => {
		test("syncs flags and segments with safe defaults (overwrite: false)", async () => {
			const sourceAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "source",
			});

			await sourceAppKV.putSegment({
				id: "beta-users",
				rule: "user.beta == true",
			});
			const flag = createMockBooleanFlag({
				id: "feature-a",
				segments: ["beta-users"],
				enabled: true,
			});
			await sourceAppKV.putFlag({ flag });

			const [data, error] = await sourceAppKV.syncEnv({
				sourceEnv: "source",
				targetEnv: "target",
				overwrite: false,
			});

			expect(error).toBeNull();
			expect(data?.flags["feature-a"]?.enabled).toBe(false);
			expect(data?.segments["beta-users"]).toBe("user.beta == true");
		});

		test("preserves enabled state when overwrite is true", async () => {
			const sourceAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "source",
			});

			const enabledFlag = createMockBooleanFlag({
				id: "enabled-feature",
				enabled: true,
			});
			await sourceAppKV.putFlag({ flag: enabledFlag });

			const [data] = await sourceAppKV.syncEnv({
				sourceEnv: "source",
				targetEnv: "target",
				overwrite: true,
			});

			expect(data?.flags["enabled-feature"]?.enabled).toBe(true);
		});

		test("merges with existing target data without removing it", async () => {
			const sourceAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "source",
			});
			const sourceFlag = createMockBooleanFlag({ id: "source-flag" });
			await sourceAppKV.putFlag({ flag: sourceFlag });

			const targetAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "target",
			});
			const targetFlag = createMockBooleanFlag({ id: "target-flag" });
			await targetAppKV.putFlag({ flag: targetFlag });

			const [data] = await sourceAppKV.syncEnv({
				sourceEnv: "source",
				targetEnv: "target",
				overwrite: false,
			});

			expect(data?.flags["source-flag"]).toBeDefined();
			expect(data?.flags["target-flag"]).toBeDefined();
		});
	});

	describe("syncFlag", () => {
		test("syncs single flag with its segments (overwrite: false)", async () => {
			const sourceAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "source",
			});

			// Create two segments, but flag only uses one
			await sourceAppKV.putSegment({
				id: "beta-users",
				rule: "user.beta == true",
			});
			await sourceAppKV.putSegment({
				id: "premium-users",
				rule: "user.premium == true",
			});

			const flag = createMockBooleanFlag({
				id: "feature-a",
				segments: ["beta-users"], // Only uses beta-users
				enabled: true,
			});
			await sourceAppKV.putFlag({ flag });

			const [data, error] = await sourceAppKV.syncFlag({
				id: "feature-a",
				sourceEnv: "source",
				targetEnv: "target",
				overwrite: false,
			});

			expect(error).toBeNull();
			expect(data?.flags["feature-a"]?.enabled).toBe(false);
			// Only beta-users segment should be copied (not premium-users)
			expect(data?.segments["beta-users"]).toBe("user.beta == true");
			expect(data?.segments["premium-users"]).toBeUndefined();
		});

		test("preserves enabled state when overwrite is true", async () => {
			const sourceAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "source",
			});

			const enabledFlag = createMockBooleanFlag({
				id: "enabled-feature",
				enabled: true,
			});
			await sourceAppKV.putFlag({ flag: enabledFlag });

			const [data] = await sourceAppKV.syncFlag({
				id: "enabled-feature",
				sourceEnv: "source",
				targetEnv: "target",
				overwrite: true,
			});

			expect(data?.flags["enabled-feature"]?.enabled).toBe(true);
		});

		test("returns error when syncing non-existent flag", async () => {
			const sourceAppKV = new AppKV({
				kv: mockKV,
				app: "test-app",
				env: "source",
			});

			const [data, error] = await sourceAppKV.syncFlag({
				id: "non-existent",
				sourceEnv: "source",
				targetEnv: "target",
				overwrite: false,
			});

			expect(error).toBeTruthy();
			expect(error?.code).toBe("NOT_FOUND");
			expect(data).toBeNull();
		});
	});
});
