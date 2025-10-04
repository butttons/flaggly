import app from "./app";

export default {
	async fetch(req, env, ctx) {
		return app.fetch(req, env, ctx);
	},
} satisfies ExportedHandler<Env>;
