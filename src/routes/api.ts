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
	async (c, next) => {
		const params = c.req.valid("json");

		const { success } = await c.env.FLAGGLY_RATE_LIMITER.limit({
			key: params.id || "unknown",
		});

		if (!success) {
			const error = new FlagglyError("Too many requests", "TOO_MANY_REQUESTS");
			return c.json(error, error.statusCode);
		}

		await next();
	},
	async (c) => {
		const params = c.req.valid("json");

		const headers = Object.fromEntries(c.req.raw.headers.entries());
		const geo = requestGeoSchema.parse(c.req.raw.cf);

		const data = await c.var.kv.getData();

		const flagResult: Record<string, unknown> = {};
		const analyticsPoints: AnalyticsEngineDataPoint[] = [];

		const baseKey = c.var.kv.cacheKeys.all();

		for (const [flagKey, flag] of Object.entries(data.flags)) {
			const { result, isEval } = evaluateFlag({
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

			flagResult[flagKey] = {
				type: flag.type,
				result: result,
			};

			const index = `${baseKey}:${flagKey}`;

			if (flag.isTrackable) {
				analyticsPoints.push({
					blobs: [
						c.var.kv.app,
						c.var.kv.env,
						flagKey,
						flag.type,
						String(result),
						params.id,
					],
					doubles: [
						isEval ? 1 : 0,
						flag.enabled ? 1 : 0,
						flag.rollout,
						flag.rules?.length ?? 0,
						flag.segments?.length ?? 0,
						flag.rollouts.length ?? 0,
					],
					indexes: [index],
				});
			}
		}

		const writePoints = async () => {
			const validPoints = analyticsPoints.slice(0, 24);
			for (const point of validPoints) {
				c.env.FLAGGLY_ANALYTICS.writeDataPoint(point);
			}
		};

		if (c.env.ENABLE_ANALYTICS === "true" && analyticsPoints.length > 0) {
			c.executionCtx.waitUntil(writePoints());
		}

		return c.json(flagResult, 200);
	},
);

api.post(
	"/eval/:id",
	inputValidator,
	async (c, next) => {
		const params = c.req.valid("json");

		const { success } = await c.env.FLAGGLY_RATE_LIMITER.limit({
			key: params.id || "unknown",
		});

		if (!success) {
			const error = new FlagglyError("Too many requests", "TOO_MANY_REQUESTS");
			return c.json(error, error.statusCode);
		}

		await next();
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
		const flagKey = params.id;

		const headers = Object.fromEntries(c.req.raw.headers.entries());
		const geo = requestGeoSchema.parse(c.req.raw.cf);

		const data = await c.var.kv.getData();

		if (!(flagKey in data.flags)) {
			const error = new FlagglyError("Flag not found", "NOT_FOUND");
			return c.json(error, error.statusCode);
		}

		const flag = data.flags[flagKey];

		const { result, isEval } = evaluateFlag({
			flag,
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

		if (c.env.ENABLE_ANALYTICS === "true" && flag.isTrackable) {
			const index = `${c.var.kv.cacheKeys.all()}:${flagKey}`;
			c.env.FLAGGLY_ANALYTICS.writeDataPoint({
				blobs: [
					c.var.kv.app,
					c.var.kv.env,
					flagKey,
					flag.type,
					String(result),
					params.id,
				],
				doubles: [
					isEval ? 1 : 0,
					flag.enabled ? 1 : 0,
					flag.rollout,
					flag.rules?.length ?? 0,
					flag.segments?.length ?? 0,
					flag.rollouts.length ?? 0,
				],
				indexes: [index],
			});
		}

		return c.json(
			{
				type: flag.type,
				result,
			},
			200,
		);
	},
);
