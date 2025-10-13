import {
	catch as _catch,
	_default,
	enum as _enum,
	array,
	boolean,
	discriminatedUnion,
	type infer as Infer,
	literal,
	maximum,
	minimum,
	minLength,
	nullable,
	number,
	object,
	optional,
	record,
	refine,
	string,
	unknown,
} from "zod/v4-mini";

export const flagRule = string().check(
	minLength(1, { error: "JEXL rule is required" }),
);

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

export const featureFlagVariationSchema = object({
	id: string().check(minLength(1, { error: "Variation ID required" })),
	label: optional(string()),
	weight: number().check(minimum(0), maximum(100)),
	payload: optional(unknown()),
});

export const rolloutStep = object({
	start: string(), // ISO 8601 date string
	percentage: optional(number().check(minimum(0), maximum(100))),
	segment: optional(string()),
}).check(
	refine(
		(step) => step.percentage !== undefined || step.segment !== undefined,
		{
			error: "Each rollout step must define either percentage or segment",
		},
	),
);
export type RolloutStep = Infer<typeof rolloutStep>;

export const baseFeatureFlag = {
	id: string().check(minLength(1, { error: "Flag key is required" })),
	label: optional(string()),
	description: optional(string()),
	enabled: _default(optional(boolean()), false),
	rules: _default(array(flagRule), []),
	rollout: _default(number().check(minimum(0), maximum(100)), 100),
	rollouts: _default(array(rolloutStep), []),
	isTrackable: _default(boolean(), false),
};

export const inputFeatureFlag = {
	...baseFeatureFlag,
	segments: _default(array(string()), []),
};

export const booleanFeatureFlag = object({
	...inputFeatureFlag,
	type: literal("boolean"),
});

export const payloadFeatureFlag = object({
	...inputFeatureFlag,
	type: literal("payload"),
	payload: unknown(),
});

export const variantFeatureFlag = object({
	...inputFeatureFlag,
	type: literal("variant"),
	variations: array(featureFlagVariationSchema).check(
		minLength(2, "At least must have 2 variants"),
	),
});

export const inputFeatureFlagSchema = discriminatedUnion("type", [
	booleanFeatureFlag,
	payloadFeatureFlag,
	variantFeatureFlag,
]).check(
	refine(
		(x) =>
			!(
				x.type === "boolean" &&
				// @ts-expect-error we want to check for run time input
				(x?.variations !== undefined || x?.payload !== undefined)
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

export type FeatureFlagInputSchema = Infer<typeof inputFeatureFlagSchema>;

export type AppData = {
	flags: Record<string, FeatureFlagInputSchema>;
	segments: Record<string, string>;
};

export type FeatureFlagOutputSchema = Omit<
	FeatureFlagInputSchema,
	"segments"
> & {
	segments: Record<string, string>;
};

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

export const requestGeoSchema = _catch(
	object({
		country: optional(string()),

		isEUCountry: _catch(optional(boolean()), false),

		continent: optional(string()),
		city: optional(string()),
		postalCode: optional(string()),

		latitude: optional(string()),
		longitude: optional(string()),
		timezone: optional(string()),

		region: optional(string()),
		regionCode: optional(string()),
		metroCode: optional(string()),
	}),
	{
		isEUCountry: false,
	},
);

export const evaluateInputSchema = object({
	user: optional(unknown()),
	id: optional(string()),
	request: object({
		headers: record(string(), string()),
	}),
	page: object({
		url: nullable(string()),
	}),
	geo: requestGeoSchema,
});

export type FlagEvaluationInput = Infer<typeof evaluateInputSchema>;

const booleanFlagResult = object({
	type: literal("boolean"),
	result: boolean(),
	isEval: boolean(),
});

const payloadFlagResult = object({
	type: literal("payload"),
	result: unknown(),
	isEval: boolean(),
});

const variantFlagResult = object({
	type: literal("variant"),
	result: unknown(),
	isEval: boolean(),
});

export const evaluateOutputSchema = discriminatedUnion("type", [
	booleanFlagResult,
	payloadFlagResult,
	variantFlagResult,
]);
export type FlagResultSchema = Infer<typeof evaluateOutputSchema>;

export const evaluateBatchOutputSchema = record(
	string(),
	nullable(evaluateOutputSchema),
);

export const paramSchema = object({
	id: string(),
});

export const syncInputSchema = object({
	sourceEnv: optional(string()),
	targetEnv: string(),
	overwrite: _default(boolean(), false),
});

export type SyncInput = Infer<typeof syncInputSchema>;
