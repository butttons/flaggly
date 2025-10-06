import { bearerAuth } from "hono/bearer-auth";
import { validator } from "hono/validator";
import { omit } from "zod/v4-mini";
import { evaluateFlag } from "../engine";
import { evaluateInputSchema, paramSchema, requestGeoSchema } from "../schema";
import { createApp } from "./_app";

export const api = createApp();
api.use((c, next) => bearerAuth({ token: c.env.API_KEY })(c, next));

const inputValidator = validator("json", (value, c) => {
	const parsed = omit(evaluateInputSchema, { request: true }).safeParse(value);
	if (parsed.success) {
		return parsed.data;
	}
	return c.json(
		{
			error: {
				message: "Invalid request",
				issues: parsed.error.issues,
			},
		},
		400,
	);
});

api.post("/eval", inputValidator, async (c) => {
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

	return c.json(flagResult);
});

api.post(
	"/eval/:id",
	inputValidator,
	validator("param", (value, c) => {
		const parsed = paramSchema.safeParse(value);

		if (parsed.success) {
			return parsed.data;
		}
		return c.json(
			{
				error: {
					message: "Invalid request",
					issues: parsed.error.issues,
				},
			},
			400,
		);
	}),
	async (c) => {
		const input = c.req.valid("json");
		const params = c.req.valid("param");

		const headers = Object.fromEntries(c.req.raw.headers.entries());
		const geo = requestGeoSchema.parse(c.req.raw.cf);

		const data = await c.var.kv.getData();

		if (!(params.id in data.flags)) {
			return c.json(
				{
					error: true,
					message: "Flag not found",
				},
				404,
			);
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

		return c.json(flagResult);
	},
);
