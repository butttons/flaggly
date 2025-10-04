import { type MapStore, map } from "nanostores";

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

export type BaseFlag = BooleanFlag | VariantFlag | PayloadFlag;

export type FlagDefinitions = Record<string, BaseFlag>;

export type FlagInput = {
	user?: unknown;
	id?: string;
	page?: {
		url: string | null;
	};
};

export type FlagValueResult<FR extends BaseFlag = BaseFlag> = FR extends {
	type: "variant";
}
	? FR["result"]
	: FR extends { type: "payload" }
		? FR["result"]
		: boolean;

export type FlagValues<FD extends FlagDefinitions = FlagDefinitions> = {
	[K in keyof FD]: FlagValueResult<FD[K]>;
};

export type FlagResult<FD extends FlagDefinitions = FlagDefinitions> = {
	[K in keyof FD]: {
		type: FD[K]["type"];
		result: FlagValueResult<FD[K]>;
	};
};

export type FlagglyOptions<TFlags extends FlagDefinitions = FlagDefinitions> = {
	url: string;
	apiKey: string;
	app?: string;
	env?: string;
	lazy?: boolean;
	bootstrap?: Partial<FlagValues<TFlags>>;
};

export class FlagglyClient<TFlags extends FlagDefinitions = FlagDefinitions> {
	private url: string;
	private apiKey: string;
	private app: string;
	private env: string;

	public user?: unknown;
	public id?: string;
	public userKey?: string;

	#flags: MapStore<FlagResult<TFlags>>;

	constructor({
		url,
		apiKey,
		app = "default",
		env = "production",
		lazy = false,
		bootstrap,
	}: FlagglyOptions<TFlags>) {
		this.url = url;
		this.apiKey = apiKey;
		this.app = app;
		this.env = env;

		const defValues = bootstrap
			? Object.entries(bootstrap).reduce<FlagResult<TFlags>>(
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
					{} as FlagResult<TFlags>,
				)
			: undefined;

		this.#flags = map<FlagResult<TFlags>>(defValues);

		if (!lazy) {
			this.#fetchFlags();
		}
	}

	async identify(id: string, user: unknown): Promise<FlagResult<TFlags>> {
		this.id = id;
		this.user = user;
		return await this.#fetchFlags({ id, user });
	}

	#getUrl() {
		if ("window" in globalThis) {
			return window.location.href;
		}

		return null;
	}

	#getBackupId() {
		if ("window" in globalThis) {
			const storage = window.localStorage.getItem("__flaggly_id");
			if (!storage) {
				const id = globalThis.crypto.randomUUID();
				window.localStorage.setItem("__flaggly_id", id);
			}
			return storage;
		}
	}

	async #request<T>(
		path: string,
		options: {
			method?: string;
			body?: unknown;
		} = {},
	): Promise<T> {
		const { method = "POST", body } = options;

		const response = await fetch(`${this.url}${path}`, {
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
			throw new Error(`Request failed: ${response.statusText}`, {
				cause: await response.json(),
			});
		}

		return response.json();
	}

	async #fetchFlags(input?: FlagInput): Promise<FlagResult<TFlags>> {
		const result = await this.#request<FlagResult<TFlags>>("/api/eval", {
			method: "POST",
			body: {
				id: input?.id ?? this.id ?? this.#getBackupId(),
				user: input?.user ?? this.user,
				page: {
					url: this.#getUrl(),
				},
			},
		});

		if (result) {
			this.#flags.set(result);
		}
		return result;
	}

	getFlags() {
		return this.#flags.get();
	}

	getFlag<K extends keyof TFlags>(key: K): FlagValueResult<TFlags[K]> {
		const flags = this.#flags.get();
		return flags?.[key]?.result;
	}

	getBooleanFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "boolean" } ? K : never),
	): FlagValueResult<TFlags[K]> | false {
		const flags = this.#flags.get();
		return flags[key]?.result ?? false;
	}

	getVariantFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "variant" } ? K : never),
	): FlagValueResult<TFlags[K]> | null {
		const flags = this.#flags.get();
		return flags[key]?.result ?? null;
	}

	getPayloadFlag<K extends keyof TFlags>(
		key: K & (TFlags[K] extends { type: "payload" } ? K : never),
	): FlagValueResult<TFlags[K]> | null {
		const flags = this.#flags.get();
		return flags[key]?.result ?? null;
	}

	getStore() {
		return this.#flags;
	}
}
