import { cors } from "hono/cors";
import { createApp } from "./routes/_app";
import { admin } from "./routes/admin";
import { api } from "./routes/api";
import { baseHeaderSchema } from "./schema";
import { AppKV } from "./storage";

const app = createApp();

app.use(
	cors({
		origin: (_, ctx) => {
			const incomingOrigin = ctx.req.header("Origin");

			if (!incomingOrigin) return undefined;

			if (ctx.env.ORIGIN.length === 1) {
				return ctx.env.ORIGIN[0];
			}

			const matchingOrigin = ctx.env.ORIGIN.find(
				(origin) => origin === incomingOrigin,
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

export default app;
