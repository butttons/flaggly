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
	 * The public `API_KEY` you set while installing the worker.
	 */
	apiKey: string;
	/**
	 * Optional app for this instance.
	 * @default "default"
	 */
	app?: string;
	/**
	 * Optional enviornment for this instance
	 * @default "production"
	 */
	env?: string;
	/**
	 * By default, flags are evaluated when you create the FlagglyClient instance.
	 * Pass this as true to manually initiate the flag evaluations.
	 * Useful if you just care about feature flags for authenticated users only,
	 * and want to evaluate flags when the users log in.
	 * @default false
	 */
	lazy?: boolean;
	/**
	 * Partial default values for the feature flags.
	 */
	bootstrap?: Partial<FlagValues<TFlags>>;
	/**
	 * Optional method to generate a backup identifer for the flags,
	 * for anonymous users when you don't have a stable ID.
	 * By default, it generate and store a value in local host per app/env.
	 * Use this method to pass in your own ID for anonymous users.
	 */
	getBackupId?: () => string;
};

export class Flaggly<TFlags extends FlagSchema = FlagSchema> {
	private url: string;
	private apiKey: string;
	private app: string;
	private env: string;

	public user?: unknown;
	public id?: string;

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
	}: FlagglyOptions<TFlags>) {
		this.url = url;
		this.apiKey = apiKey;
		this.app = app;
		this.env = env;
		this.getBackupId = getBackupId;

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

	async identify(id: string, user: unknown): Promise<EvaluatedFlags<TFlags>> {
		this.id = id;
		this.user = user;
		return await this.fetchFlags({ id, user });
	}

	getPageUrl() {
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

		const response = await fetch(url, {
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

	async fetchFlags(input?: FlagInput): Promise<EvaluatedFlags<TFlags>> {
		const result = await this.#request<EvaluatedFlags<TFlags>>("/api/eval", {
			method: "POST",
			body: {
				id: input?.id ?? this.id ?? this.#getBackupId(),
				user: input?.user ?? this.user,
				page: {
					url: this.getPageUrl(),
				},
			},
		});

		if (result) {
			this.#flags.set(result);
		}
		return result;
	}

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
						url: this.getPageUrl(),
					},
				},
			},
		);

		if (result) {
			this.#flags.setKey(key, result);
		}
		return result;
	}

	getFlags() {
		return this.#flags.get();
	}

	getFlag<K extends keyof TFlags>(key: K): FlagValue<TFlags[K]> {
		const flags = this.#flags.get();
		return flags?.[key]?.result;
	}

	getBooleanFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "boolean" } ? K : never),
	): FlagValue<TFlags[K]> | false {
		const flags = this.#flags.get();
		return flags[key]?.result ?? false;
	}

	getVariantFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "variant" } ? K : never),
	): FlagValue<TFlags[K]> | null {
		const flags = this.#flags.get();
		return flags[key]?.result ?? null;
	}

	getPayloadFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "payload" } ? K : never),
	): FlagValue<TFlags[K]> | null {
		const flags = this.#flags.get();
		return flags[key]?.result ?? null;
	}

	onChange(cb: (flags: EvaluatedFlags<TFlags>) => void) {
		return this.#flags.subscribe(cb);
	}

	get store() {
		return this.#flags;
	}
}
