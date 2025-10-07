import { jwt } from "hono/jwt";
import { validator } from "hono/validator";
import { omit } from "zod/v4-mini";

import { evaluateFlag } from "../engine";
import { FlagglyError } from "../error";
import { evaluateInputSchema, paramSchema, requestGeoSchema } from "../schema";
import { createApp } from "./_app";

export const api = createApp();

api.use((c, next) =>
	jwt({
		secret: c.env.JWT_SECRET,
		verification: {
			iss: "flaggly.user",
		},
	})(c, next),
);

const inputValidator = validator("json", (value, c) => {
	const parsed = omit(evaluateInputSchema, { request: true }).safeParse(value);

	if (!parsed.success) {
		const error = new FlagglyError(
			"Failed to parse request body",
			"INVALID_BODY",
			parsed.error.issues,
		);
		return c.json(error, error.statusCode);
	}

	return parsed.data;
});

api.post(
	"/eval",
	inputValidator,
	async (c) => {
		const params = c.req.valid("json");

		const { success } = await c.env.FLAGGLY_RATE_LIMITER.limit({
			key: params.id || "unknown",
		});

		if (!success) {
			const error = new FlagglyError("Too many requests", "TOO_MANY_REQUESTS");
			return c.json(error, error.statusCode);
		}
	},
	async (c) => {
		const params = c.req.valid("json");

		const headers = Object.fromEntries(c.req.raw.headers.entries());
		const geo = requestGeoSchema.parse(c.req.raw.cf);

		const data = await c.var.kv.getData();

		const flagResult: Record<string, unknown> = {};

		for (const [flagKey, flag] of Object.entries(data.flags)) {
			flagResult[flagKey] = evaluateFlag({
				flag,
				segments: data.segments,
				input: {
					id: params.id,
					user: params.user,
					page: params.page,
					geo,
					request: {
						headers: headers,
					},
				},
			});
		}

		return c.json(flagResult, 200);
	},
);

api.post(
	"/eval/:id",
	inputValidator,
	async (c) => {
		const params = c.req.valid("json");

		const { success } = await c.env.FLAGGLY_RATE_LIMITER.limit({
			key: params.id || "unknown",
		});

		if (!success) {
			const error = new FlagglyError("Too many requests", "TOO_MANY_REQUESTS");
			return c.json(error, error.statusCode);
		}
	},
	validator("param", (value, c) => {
		const parsed = paramSchema.safeParse(value);

		if (!parsed.success) {
			const error = new FlagglyError(
				"Failed to parse parameters",
				"INVALID_PARAMS",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		return parsed.data;
	}),
	async (c) => {
		const input = c.req.valid("json");
		const params = c.req.valid("param");

		const headers = Object.fromEntries(c.req.raw.headers.entries());
		const geo = requestGeoSchema.parse(c.req.raw.cf);

		const data = await c.var.kv.getData();

		if (!(params.id in data.flags)) {
			const error = new FlagglyError("Flag not found", "NOT_FOUND");
			return c.json(error, error.statusCode);
		}

		const flagResult = evaluateFlag({
			flag: data.flags[params.id],
			segments: data.segments,
			input: {
				id: input.id,
				user: input.user,
				page: input.page,
				geo,
				request: {
					headers: headers,
				},
			},
		});

		return c.json(flagResult, 200);
	},
);
