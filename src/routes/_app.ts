import { Hono } from "hono";
import type { AppKV } from "../storage";

export const createApp = () =>
	new Hono<{
		Bindings: Env;
		Variables: {
			kv: AppKV;
		};
	}>();
