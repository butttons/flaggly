import { jwt } from "hono/jwt";
import { validator } from "hono/validator";
import { object, string } from "zod/v4-mini";
import {
	inputFeatureFlagSchema,
	segmentInputSchema,
	updateableFeatureFlagSchema,
} from "../schema";
import { createApp } from "./_app";

export const admin = createApp();

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
	return c.json(data);
});

admin.put(
	"/flags",
	validator("json", (value, c) => {
		const parsed = inputFeatureFlagSchema.safeParse(value);

		if (!parsed.success) {
			return c.json({
				success: false,
				error: {
					code: "INVALID_FLAG_INPUT",
					message: "Invalid input",
					details: parsed.error.issues,
				},
			});
		}

		return parsed.data;
	}),
	async (c) => {
		const flag = c.req.valid("json");
		const [result, error] = await c.var.kv.putFlag({
			flag,
		});

		if (error) {
			return c.json(
				{
					success: false,
					error,
				},
				500,
			);
		}

		return c.json(result);
	},
);

admin.patch(
	"/flags/:id",
	validator("param", (value) => object({ id: string() }).parse(value)),
	validator("json", (value, c) => {
		const parsed = updateableFeatureFlagSchema.safeParse(value);

		if (!parsed.success) {
			return c.json({
				success: false,
				error: {
					code: "INVALID_FLAG_INPUT",
					message: "Invalid input",
					details: parsed.error.issues,
				},
			});
		}

		if (Object.keys(parsed.data).length === 0) {
			return c.json({
				success: false,
				error: {
					code: "INVALID_FLAG_INPUT",
					message: "Update object must have some data",
				},
			});
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

		if (error) {
			return c.json(
				{
					success: false,
					error,
				},
				500,
			);
		}

		return c.json(data);
	},
);

admin.delete(
	"/flags/:id",
	validator("param", (value) => object({ id: string() }).parse(value)),
	async (c) => {
		const { id } = c.req.valid("param");

		const [data, error] = await c.var.kv.deleteFlag({ id: id });

		if (error) {
			return c.json(
				{
					success: false,
					error,
				},
				500,
			);
		}

		return c.json(data);
	},
);

admin.put(
	"/segments",
	validator("json", (value, c) => {
		const parsed = segmentInputSchema.safeParse(value);

		if (!parsed.success) {
			return c.json({
				success: false,
				error: {
					code: "INVALID_SEGMENT_INPUT",
					message: "Invalid input",
					details: parsed.error.issues,
				},
			});
		}

		return parsed.data;
	}),
	async (c) => {
		const flag = c.req.valid("json");
		const [result, error] = await c.var.kv.putSegment({
			id: flag.id,
			rule: flag.rule,
		});

		if (error) {
			return c.json(
				{
					success: false,
					error,
				},
				500,
			);
		}

		return c.json(result);
	},
);

admin.delete(
	"/segments/:id",
	validator("param", (value) => object({ id: string() }).parse(value)),

	async (c) => {
		const { id } = c.req.valid("param");
		const [result, error] = await c.var.kv.deleteSegment({
			id,
		});

		if (error) {
			return c.json(
				{
					success: false,
					error,
				},
				500,
			);
		}

		return c.json(result);
	},
);
