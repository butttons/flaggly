import { jwt } from "hono/jwt";
import { validator } from "hono/validator";
import { object, string } from "zod/v4-mini";
import { FlagglyError } from "../error";
import {
	inputFeatureFlagSchema,
	segmentInputSchema,
	syncInputSchema,
	updateableFeatureFlagSchema,
} from "../schema";
import { createApp } from "./_app";

export const admin = createApp();
const paramSchema = object({ id: string() });

const paramValidator = validator("param", (value, c) => {
	const parsed = paramSchema.safeParse(value);
	if (!parsed.success) {
		const error = new FlagglyError(
			"Failed to validate params",
			"INVALID_PARAMS",
			parsed.error.issues,
		);
		return c.json(error, error.statusCode);
	}
	return parsed.data;
});

admin.use((c, next) =>
	jwt({
		secret: c.env.JWT_SECRET,
		verification: {
			iss: "flaggly.admin",
		},
	})(c, next),
);

admin.get("/flags", async (c) => {
	const data = await c.var.kv.getData();
	return c.json(data, 200);
});

admin.put(
	"/flags",
	validator("json", (value, c) => {
		const parsed = inputFeatureFlagSchema.safeParse(value);

		if (!parsed.success) {
			const error = new FlagglyError(
				"Invalid flag input",
				"INVALID_BODY",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		return parsed.data;
	}),
	async (c) => {
		const flag = c.req.valid("json");

		const [data, error] = await c.var.kv.putFlag({
			flag,
		});

		return error ? c.json(error, error.statusCode) : c.json(data, 200);
	},
);

admin.patch(
	"/flags/:id",
	paramValidator,
	validator("json", (value, c) => {
		const parsed = updateableFeatureFlagSchema.safeParse(value);

		if (!parsed.success) {
			const error = new FlagglyError(
				"Invalid flag input",
				"INVALID_BODY",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		if (Object.keys(parsed.data).length === 0) {
			const error = new FlagglyError(
				"Update object must have some fields",
				"INVALID_BODY",
			);
			return c.json(error, error.statusCode);
		}

		return parsed.data;
	}),
	async (c) => {
		const { id } = c.req.valid("param");
		const update = c.req.valid("json");

		const [data, error] = await c.var.kv.updateFlag({
			id,
			update,
		});

		return error ? c.json(error, error.statusCode) : c.json(data, 200);
	},
);

admin.delete("/flags/:id", paramValidator, async (c) => {
	const { id } = c.req.valid("param");

	const [data, error] = await c.var.kv.deleteFlag({ id: id });

	return error ? c.json(error, error.statusCode) : c.json(data, 200);
});

admin.put(
	"/segments",
	validator("json", (value, c) => {
		const parsed = segmentInputSchema.safeParse(value);

		if (!parsed.success) {
			const error = new FlagglyError(
				"Invalid segment input",
				"INVALID_BODY",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		return parsed.data;
	}),
	async (c) => {
		const flag = c.req.valid("json");

		const [data, error] = await c.var.kv.putSegment({
			id: flag.id,
			rule: flag.rule,
		});

		return error ? c.json(error, error.statusCode) : c.json(data, 200);
	},
);

admin.delete("/segments/:id", paramValidator, async (c) => {
	const { id } = c.req.valid("param");

	const [data, error] = await c.var.kv.deleteSegment({
		id,
	});

	return error ? c.json(error, error.statusCode) : c.json(data, 200);
});

admin.post(
	"/sync",
	validator("json", (value, c) => {
		const parsed = syncInputSchema.safeParse(value);

		if (!parsed.success) {
			const error = new FlagglyError(
				"Invalid segment input",
				"INVALID_BODY",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		return parsed.data;
	}),

	async (c) => {
		const params = c.req.valid("json");

		const [data, error] = await c.var.kv.syncEnv(params);

		return error ? c.json(error, error.statusCode) : c.json(data, 200);
	},
);

admin.post(
	"/sync/:id",
	paramValidator,
	validator("json", (value, c) => {
		const parsed = syncInputSchema.safeParse(value);

		if (!parsed.success) {
			const error = new FlagglyError(
				"Invalid segment input",
				"INVALID_BODY",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		return parsed.data;
	}),

	async (c) => {
		const params = c.req.valid("json");
		const { id } = c.req.valid("param");

		const [data, error] = await c.var.kv.syncFlag({
			id,
			...params,
		});

		return error ? c.json(error, error.statusCode) : c.json(data, 200);
	},
);
