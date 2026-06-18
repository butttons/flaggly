export type RolloutStep = {
	start: string;
	percentage?: number;
	segment?: string;
};

export type FeatureFlagVariation = {
	id: string;
	label?: string;
	weight: number;
	payload?: unknown;
};

export type FeatureFlagInputSchema =
	| {
			id: string;
			label?: string;
			description?: string;
			enabled: boolean;
			type: "boolean";
			rules: string[];
			segments: string[];
			rollout: number;
			rollouts: RolloutStep[];
			isTrackable: boolean;
		}
	| {
			id: string;
			label?: string;
			description?: string;
			enabled: boolean;
			type: "payload";
			payload: unknown;
			rules: string[];
			segments: string[];
			rollout: number;
			rollouts: RolloutStep[];
			isTrackable: boolean;
		}
	| {
			id: string;
			label?: string;
			description?: string;
			enabled: boolean;
			type: "variant";
			variations: FeatureFlagVariation[];
			rules: string[];
			segments: string[];
			rollout: number;
			rollouts: RolloutStep[];
			isTrackable: boolean;
		};

export type FlagEvaluationInput = {
	user?: unknown;
	id?: string;
	request: {
		headers: Record<string, string>;
	};
	page: {
		url?: string | null;
	};
	geo: {
		country?: string;
		isEUCountry?: boolean;
		continent?: string;
		city?: string;
		postalCode?: string;
		latitude?: string;
		longitude?: string;
		timezone?: string;
		region?: string;
		regionCode?: string;
		metroCode?: string;
	};
};

export type FlagResultSchema =
	| {
			type: "boolean";
			result: boolean;
			isEval: boolean;
		}
	| {
			type: "payload";
			result: unknown;
			isEval: boolean;
		}
	| {
			type: "variant";
			result: unknown;
			isEval: boolean;
		};

export type AppData = {
	flags: Record<string, FeatureFlagInputSchema>;
	segments: Record<string, string>;
};
