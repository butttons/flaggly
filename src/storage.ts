import { FlagglyError, tryPromise } from "./error";
import type {
	AppData,
	FeatureFlagInputSchema,
	SegmentInputSchema,
	UpdatableFeatureFlagSchema,
} from "./schema";

type AppKVOptions = {
	kv: KVNamespace;
	app: string;
	env: string;
};

export class AppKV {
	private kv: KVNamespace;
	private app: string;
	private env: string;

	constructor(options: AppKVOptions) {
		this.kv = options.kv;
		this.app = options.app;
		this.env = options.env;
	}

	cacheKeys = {
		all: () => `v1:${this.app}:${this.env}`,
	};

	async #getData() {
		const key = this.cacheKeys.all();
		const data = await this.kv.get<AppData>(key, "json");

		if (data === null || !data) {
			return {
				flags: {},
				segments: {},
			};
		}

		return data;
	}

	async #saveData(input: AppData) {
		await this.kv.put(this.cacheKeys.all(), JSON.stringify(input), {
			metadata: { updatedAt: new Date().toISOString() },
		});
	}

	async getData() {
		return this.#getData();
	}

	#checkSegments({
		segments,
		input,
	}: {
		input: string[];
		segments: Record<string, string>;
	}) {
		if (input.length === 0) {
			return true;
		}

		const existingSegmentKeys = Object.keys(segments);
		const isValid = input.every((key) => existingSegmentKeys.includes(key));

		if (!isValid) {
			throw new FlagglyError("Add the segment before using it", "INVALID_BODY");
		}
	}

	#checkFlag({ id, data }: { id: string; data: AppData }) {
		if (!Object.keys(data.flags).includes(id)) {
			throw new FlagglyError("Flag not found", "NOT_FOUND");
		}
	}

	async #putFlag({ flag }: { flag: FeatureFlagInputSchema }) {
		const data = await this.#getData();

		this.#checkSegments({
			input: flag?.segments ?? [],
			segments: data.segments,
		});

		data.flags[flag.id] = flag;
		await this.#saveData(data);
		return data;
	}

	async putFlag({ flag }: { flag: FeatureFlagInputSchema }) {
		return tryPromise(this.#putFlag({ flag }), {
			message: "Failed to put flag",
			code: "PUT_FAILED",
		});
	}

	async #updateFlag({
		id,
		update,
	}: {
		id: string;
		update: UpdatableFeatureFlagSchema;
	}) {
		const data = await this.#getData();

		this.#checkSegments({
			input: update?.segments ?? [],
			segments: data.segments,
		});

		this.#checkFlag({ id, data });

		data.flags[id] = Object.assign(data.flags[id], update);
		await this.#saveData(data);
		return data;
	}

	async updateFlag({
		id,
		update,
	}: {
		id: string;
		update: UpdatableFeatureFlagSchema;
	}) {
		return tryPromise(this.#updateFlag({ id, update }), {
			message: "Failed to update flag",
			code: "UPDATE_FAILED",
		});
	}

	async #deleteFlag({ id }: { id: string }) {
		const data = await this.#getData();

		this.#checkFlag({ id, data });

		Reflect.deleteProperty(data.flags, id);

		const newData = {
			flags: data.flags,
			segments: data.segments,
		};
		await this.#saveData(newData);

		return newData;
	}

	async deleteFlag({ id }: { id: string }) {
		return tryPromise(this.#deleteFlag({ id }), {
			message: "Failed to delete flag",
			code: "DELETE_FAILED",
		});
	}

	async #putSegment({ id, rule }: SegmentInputSchema) {
		const data = await this.#getData();
		data.segments[id] = rule;
		await this.#saveData(data);
		return data;
	}

	async putSegment({ id, rule }: SegmentInputSchema) {
		return tryPromise(this.#putSegment({ id, rule }), {
			message: "Failed to save segment",
			code: "PUT_FAILED",
		});
	}

	async #deleteSegment({ id }: { id: string }) {
		const data = await this.#getData();

		if (!Object.keys(data.segments).includes(id)) {
			throw new FlagglyError("Cannot delete non existing segment", "NOT_FOUND");
		}

		Reflect.deleteProperty(data.segments, id);

		for (const flagId in data.flags) {
			const flagSegments = data.flags[flagId]?.segments ?? [];

			const hasDeletedSegment =
				flagSegments.length > 0 && flagSegments.some((seg) => seg === id);

			if (hasDeletedSegment) {
				data.flags[flagId].segments = flagSegments.filter((seg) => seg !== id);
			}
		}

		await this.#saveData(data);
		return data;
	}

	async deleteSegment({ id }: { id: string }) {
		return tryPromise(this.#deleteSegment({ id }), {
			message: "Failed to delete segment",
			code: "DELETE_FAILED",
		});
	}
}
