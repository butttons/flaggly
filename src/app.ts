import { cors } from "hono/cors";
import { sign } from "hono/jwt";
import { poweredBy } from "hono/powered-by";
import { validator } from "hono/validator";
import { minLength, object, string } from "zod/v4-mini";

import { FlagglyError } from "./error";
import { createApp } from "./routes/_app";
import { admin } from "./routes/admin";
import { api } from "./routes/api";
import { baseHeaderSchema } from "./schema";
import { AppKV } from "./storage";

const app = createApp();

app.use(
	poweredBy({
		serverName: "flaggly",
	}),
);

app.use(
	cors({
		origin: (_, ctx) => {
			const incomingOrigin = ctx.req.header("Origin");
			const allowedOrigins = ctx.env.ORIGIN.split(",");

			if (!incomingOrigin) {
				return undefined;
			}

			if (allowedOrigins.length === 1) {
				return allowedOrigins[0];
			}

			const matchingOrigin = allowedOrigins.find(
				(origin: string) => origin === incomingOrigin,
			);

			return matchingOrigin ?? undefined;
		},
		allowHeaders: ["x-app-id", "x-env-id", "authorization", "content-type"],
	}),
);

app.use(async (c, next) => {
	const appHeaders = baseHeaderSchema.parse({
		app: c.req.header("x-app-id"),
		env: c.req.header("x-env-id"),
	});

	const kv = new AppKV({
		kv: c.env.FLAGGLY_KV,
		app: appHeaders.app,
		env: appHeaders.env,
	});

	c.set("kv", kv);

	await next();
});

app.route("/api", api);
app.route("/admin", admin);

const secretSchema = object({
	secret: string().check(minLength(32)),
});

app.post(
	"/__generate",
	validator("json", (data, c) => {
		const parsed = secretSchema.safeParse(data);
		if (!parsed.success) {
			const error = new FlagglyError(
				"Invalid secret",
				"INVALID_BODY",
				parsed.error.issues,
			);
			return c.json(error, error.statusCode);
		}

		if (c.env.JWT_SECRET !== parsed.data.secret) {
			return c.json(new FlagglyError("Invalid secret", "INVALID_BODY"), 400);
		}

		return parsed.data;
	}),
	async (c) => {
		const secret = c.req.valid("json").secret;
		const SIX_MONTHS = 15552000;
		const iat = Math.floor(Date.now() / 1000);
		const exp = iat + SIX_MONTHS;

		const baseClaims = {
			iat,
			exp,
		};

		const user = await sign(
			{
				iss: "flaggly.user",
				...baseClaims,
			},
			secret,
		);

		const admin = await sign(
			{
				iss: "flaggly.admin",
				...baseClaims,
			},
			secret,
		);

		return c.json({
			user,
			admin,
		});
	},
);

export default app;
