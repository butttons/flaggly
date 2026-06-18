import {
	catch as _catch,
	_default,
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
