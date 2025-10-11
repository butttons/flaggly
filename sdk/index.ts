import { type MapStore, map } from "nanostores";

// Type from nanostores
type AllKeys<T> = T extends any ? keyof T : never;

type BooleanFlag = {
	type: "boolean";
};

type VariantFlag<T = string> = {
	type: "variant";
	result: T;
};

type PayloadFlag<T = unknown> = {
	type: "payload";
	result: T;
};

export type FlagConfig = BooleanFlag | VariantFlag | PayloadFlag;
export type FlagSchema = Record<string, FlagConfig>;

export type FlagInput = {
	user?: unknown;
	id?: string;
	page?: {
		url: string | null;
	};
};

export type FlagValue<FR extends FlagConfig = FlagConfig> = FR extends {
	type: "variant";
}
	? FR["result"]
	: FR extends { type: "payload" }
		? FR["result"]
		: boolean;

export type FlagValues<FD extends FlagSchema = FlagSchema> = {
	[K in keyof FD]: FlagValue<FD[K]>;
};

export type EvaluatedFlags<FD extends FlagSchema = FlagSchema> = {
	[K in keyof FD]: {
		type: FD[K]["type"];
		result: FlagValue<FD[K]>;
	};
};

export type FlagglyOptions<TFlags extends FlagSchema = FlagSchema> = {
	/**
	 * The base URL of your Flaggly worker.
	 */
	url: string;
	/**
	 * The public `user` JWT.
	 */
	apiKey: string;
	/**
	 * App for this instance.
	 * @default "default"
	 */
	app?: string;
	/**
	 * Enviornment for this instance
	 * @default "production"
	 */
	env?: string;
	/**
	 * By default, flags are evaluated when you initialize the FlagglyClient instance.
	 * Pass this as true to manually initiate the flag evaluations.
	 * Useful if you just care about feature flags for authenticated users only,
	 * and want to evaluate flags when the users log in.
	 * @default false
	 */
	lazy?: boolean;
	/**
	 * Default values for the feature flags.
	 */
	bootstrap?: Partial<FlagValues<TFlags>>;
	/**
	 * Optional method to generate a backup identifer for the flags,
	 * for anonymous users when you don't have a stable ID.
	 * By default, it generates and store a value in local storage per app/env.
	 * Use this method to pass in your own ID for anonymous users.
	 * This is not available server side, where local storage is not available.
	 * In that case, this method will default to generate a random ID everytime.
	 */
	getBackupId?: () => string;
	/**
	 * Pass in the `fetch` instance to be used when interacting with the API.
	 * Used when evaluating flags inside workers.
	 * Use a service binding to attach the flaggly worker to your worker and then
	 * When passing in the fetch from your service binding, make sure you bind the correct context.
	 * Otherwise, use a more explicit approach
	 * @example workerFetch: env.FLAGGLY_SERVICE.fetch.bind(env.FLAGGLY_SERVICE)
	 * @example workerFetch: (url, init) => env.FLAGGLY_SERVICE.fetch(url, init)
	 * @see https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors
	 */
	workerFetch?: typeof fetch;
};

export class Flaggly<TFlags extends FlagSchema = FlagSchema> {
	private url: string;
	private apiKey: string;
	private app: string;
	private env: string;

	public user?: unknown;
	public id?: string;

	public workerFetch: typeof fetch;

	public getBackupId?: () => string;

	#flags: MapStore<EvaluatedFlags<TFlags>> = map();

	constructor({
		url,
		apiKey,
		app = "default",
		env = "production",
		lazy = false,
		bootstrap,
		getBackupId,
		workerFetch,
	}: FlagglyOptions<TFlags>) {
		this.url = url;
		this.apiKey = apiKey;
		this.app = app;
		this.env = env;
		this.getBackupId = getBackupId;
		this.workerFetch = workerFetch ?? fetch;

		const defValues = bootstrap
			? Object.entries(bootstrap).reduce<EvaluatedFlags<TFlags>>(
					(acc, [flagKey, flagValue]) => {
						const type =
							typeof flagValue === "boolean"
								? "boolean"
								: typeof flagValue === "string"
									? "variant"
									: "payload";
						// @ts-expect-error
						acc[flagKey] = {
							type,
							result: flagValue,
						};
						return acc;
					},
					{} as EvaluatedFlags<TFlags>,
				)
			: undefined;

		if (defValues) {
			this.#flags.set(defValues);
		}

		if (!lazy) {
			this.fetchFlags();
		}
	}

	/**
	 * Method to identify a user and persist the ID and details for evaluations.
	 * Calling this method will evaluate the flags and reset the state.
	 * @param id Unique identifier for the user
	 * @param user User properties used for flag evaluations
	 * @returns
	 */
	async identify(id: string, user: unknown): Promise<EvaluatedFlags<TFlags>> {
		this.id = id;
		this.user = user;
		return await this.fetchFlags({ id, user });
	}

	#getPageUrl() {
		if ("window" in globalThis) {
			return globalThis.window.location.href;
		}

		return null;
	}

	#getBackupId() {
		if (this.getBackupId) {
			return this.getBackupId();
		}
		if ("window" in globalThis) {
			const key = `__flaggly_id.${this.app}.${this.env}`;
			const storage = globalThis.window.localStorage.getItem(key);
			if (!storage) {
				const id = globalThis.crypto.randomUUID();
				globalThis.window.localStorage.setItem(key, id);
				return id;
			}
			return storage;
		}
		return globalThis.crypto.randomUUID();
	}

	async #request<T>(
		path: string,
		options: {
			method?: string;
			body?: unknown;
		} = {},
	): Promise<T> {
		const { method = "POST", body } = options;
		const url = new URL(path, this.url);

		const response = await this.workerFetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"x-app-id": this.app,
				"x-env-id": this.env,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			let cause: unknown;
			try {
				cause = await response.json();
			} catch {
				cause = await response.text();
			}
			throw new Error(`Request failed: ${response.statusText}`, { cause });
		}

		return response.json();
	}

	/**
	 * Evaluates all flags for a user and updates local state.
	 * @param input
	 * @returns
	 */
	async fetchFlags(input?: FlagInput): Promise<EvaluatedFlags<TFlags>> {
		const result = await this.#request<EvaluatedFlags<TFlags>>("/api/eval", {
			method: "POST",
			body: {
				id: input?.id ?? this.id ?? this.#getBackupId(),
				user: input?.user ?? this.user,
				page: {
					url: this.#getPageUrl(),
				},
			},
		});

		if (result) {
			this.#flags.set(result);
		}
		return result;
	}

	/**
	 * Evaluates a single flag
	 * @param key
	 * @param input
	 * @returns
	 */
	async fetchFlag<K extends AllKeys<EvaluatedFlags<TFlags>>>(
		key: K,
		input?: FlagInput,
	): Promise<EvaluatedFlags<TFlags>[K]> {
		const result = await this.#request<EvaluatedFlags<TFlags>[K]>(
			`/api/eval/${String(key)}`,
			{
				method: "POST",
				body: {
					id: input?.id ?? this.id ?? this.#getBackupId(),
					user: input?.user ?? this.user,
					page: {
						url: this.#getPageUrl(),
					},
				},
			},
		);

		if (result) {
			this.#flags.setKey(key, result);
		}
		return result;
	}

	/**
	 * Get all flags
	 * @returns
	 */
	getFlags() {
		return this.#flags.get();
	}

	/**
	 * Get a single flag result
	 * @param key
	 * @returns
	 */
	getFlag<K extends keyof TFlags>(key: K): FlagValue<TFlags[K]> {
		const flags = this.#flags.get();
		return flags?.[key]?.result;
	}

	/**
	 * Get a single boolean flag results. Only boolean flag keys are valid.
	 * @param key
	 * @returns
	 */
	getBooleanFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "boolean" } ? K : never),
	): FlagValue<TFlags[K]> | false {
		const flags = this.#flags.get();
		return flags[key]?.result ?? false;
	}

	/**
	 * Get a single boolean flag results. Only variant flag keys are valid.
	 * @param key
	 * @returns
	 */
	getVariantFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "variant" } ? K : never),
	): FlagValue<TFlags[K]> | null {
		const flags = this.#flags.get();
		return flags[key]?.result ?? null;
	}

	/**
	 * Get a single boolean flag results. Only payload flag keys are valid.
	 * @param key
	 * @returns
	 */
	getPayloadFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "payload" } ? K : never),
	): FlagValue<TFlags[K]> | null {
		const flags = this.#flags.get();
		return flags[key]?.result ?? null;
	}

	/**
	 * Subscribe to changes in the flags.
	 */
	onChange(cb: (flags: EvaluatedFlags<TFlags>) => void) {
		return this.#flags.subscribe(cb);
	}

	/**
	 * Local nanostores `map` for interacting with state
	 * @see https://github.com/nanostores/nanostores?tab=readme-ov-file#maps
	 */
	get store() {
		return this.#flags;
	}
}
