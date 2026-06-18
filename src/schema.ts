import {
	catch as _catch,
	_default,
	array,
	boolean,
	enum as _enum,
	type infer as Infer,
	minLength,
	minimum,
	maximum,
	number,
	object,
	optional,
	record,
	refine,
	string,
	unknown,
} from "zod/v4-mini";

import {
	featureFlagVariationSchema,
	flagRule,
	rolloutStep,
} from "@flaggly/engine";

export const DEFAULT_ENV = ["production", "staging", "development"];

export const envSchema = object({
	id: string().check(minLength(1, { error: "Env ID is required" })),
	label: string(),
});

export const appSchema = object({
	id: _default(
		string().check(minLength(1, { error: "App ID is required" })),
		"default",
	),
	label: _default(string(), "Default app"),
	defaultEnv: _default(
		string().check(minLength(1, { error: "Env is required" })),
		"production",
	),
	env: _default(record(string(), envSchema), {
		production: {
			id: "production",
			label: "Production",
		},
		staging: {
			id: "staging",
			label: "Staging",
		},
		development: {
			id: "development",
			label: "Development",
		},
	}),
});
export type AppSchema = Infer<typeof appSchema>;

export const updateableFeatureFlagSchema = object({
	label: optional(string()),
	description: optional(string()),
	enabled: optional(boolean()),
	rules: optional(array(flagRule)),
	segments: optional(
		array(string(), {
			error: "Segments must be an array of the segments in this environment",
		}),
	),
	rollout: optional(number().check(minimum(0), maximum(100))),
	rollouts: optional(array(rolloutStep)),
			type: optional(_enum(["boolean", "payload", "variant"])),
	payload: optional(unknown()),
	variations: optional(
		array(featureFlagVariationSchema).check(
			minLength(2, "Variant flags must have at least 2 variations"),
		),
	),
	isTrackable: optional(boolean()),
}).check(
	refine(
		(x) =>
			!(
				x.type === "boolean" &&
				(x.variations !== undefined || x.payload !== undefined)
			),
		{
			error: "Boolean flags cannot have a payload",
		},
	),
	refine((x) => !(x.type === "payload" && x.payload === undefined), {
		error: "Payload flags must have a payload",
	}),
	refine((x) => !(x.type === "variant" && x.variations === undefined), {
		error: "Variant flags must have at least 2 variations",
	}),
);

export type UpdatableFeatureFlagSchema = Infer<
	typeof updateableFeatureFlagSchema
>;

export const segmentInputSchema = object({
	id: string().check(minLength(1, { error: "Segment key is required" })),
	rule: flagRule,
});

export type SegmentInputSchema = Infer<typeof segmentInputSchema>;

export const baseHeaderSchema = _catch(
	object({
		app: _default(
			string().check(minLength(1, { error: "App ID is required" })),
			"default",
		),
		env: _default(
			string().check(minLength(1, { error: "Env is required" })),
			"production",
		),
	}),
	{
		app: "default",
		env: "production",
	},
);

export const baseInputSchema = {
	userKey: _default(
		string().check(minLength(1, { error: "Key for the user ID" })),
		"user.id",
	),
};

export const paramSchema = object({
	id: string(),
});

export const syncInputSchema = object({
	sourceEnv: optional(string()),
	targetEnv: string(),
	overwrite: _default(boolean(), false),
});

export type SyncInput = Infer<typeof syncInputSchema>;
