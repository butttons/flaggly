import { html } from "hono/html";
import type { FC } from "hono/jsx";
import type { AppData, FeatureFlagInputSchema } from "../schema";
import { inputFeatureFlagSchema, segmentInputSchema } from "../schema";
import { buildUrl, Layout } from "../components/Layout";
import { createApp } from "./_app";

export const ui = createApp();

// --- Helpers ---

const getString = ({ value }: { value: unknown }): string => {
	if (typeof value === "string") return value;
	return "";
};

const getCtx = ({ c }: { c: { var: { kv: { app: string; env: string } } } }) => {
	return { app: c.var.kv.app, env: c.var.kv.env };
};

// --- Components ---

type FlashProps = {
	success?: string;
	error?: string;
};

const FlashMessages: FC<FlashProps> = ({ success, error }) => (
	<>
		{success && (
			<div class="text-emerald-400 text-sm mb-4 bg-emerald-950/30 border border-emerald-900/50 rounded px-3 py-2">
				{success}
			</div>
		)}
		{error && (
			<div class="text-red-400 text-sm mb-4 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
				{error}
			</div>
		)}
	</>
);

type TypeBadgeProps = {
	flagType: string;
};

const TypeBadge: FC<TypeBadgeProps> = ({ flagType }) => {
	const colors: Record<string, string> = {
		boolean: "bg-blue-500/10 text-blue-400 border-blue-500/20",
		payload: "bg-amber-500/10 text-amber-400 border-amber-500/20",
		variant: "bg-violet-500/10 text-violet-400 border-violet-500/20",
	};
	const colorClass = colors[flagType] ?? "bg-zinc-800 text-zinc-400";
	return (
		<span class={`text-xs px-1.5 py-0.5 rounded border ${colorClass}`}>
			{flagType}
		</span>
	);
};

type FlagCardProps = {
	flag: FeatureFlagInputSchema;
	app: string;
	env: string;
};

const FlagCard: FC<FlagCardProps> = ({ flag, app, env }) => {
	const params = `?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`;
	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4">
			<div class="flex items-center justify-between mb-2">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-zinc-100">
						{flag.id}
					</span>
					<TypeBadge flagType={flag.type} />
					{flag.isTrackable && (
						<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
							tracked
						</span>
					)}
				</div>
				<div class="flex items-center gap-2">
					<form
						method="post"
						action={`/app/flags/${encodeURIComponent(flag.id)}/toggle${params}`}
					>
						<button
							type="submit"
							class={`text-xs font-medium py-1 px-2.5 rounded transition-colors ${
								flag.enabled
									? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
									: "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
							}`}
						>
							{flag.enabled ? "enabled" : "disabled"}
						</button>
					</form>
				</div>
			</div>
			{(flag.label || flag.description) && (
				<div class="mb-2">
					{flag.label && (
						<p class="text-xs text-zinc-300">{flag.label}</p>
					)}
					{flag.description && (
						<p class="text-xs text-zinc-500 mt-0.5">
							{flag.description}
						</p>
					)}
				</div>
			)}
			<div class="flex items-center gap-3 text-xs text-zinc-500 mb-3">
				<span>rollout: {flag.rollout}%</span>
				{flag.rules.length > 0 && (
					<span>
						{flag.rules.length}{" "}
						{flag.rules.length === 1 ? "rule" : "rules"}
					</span>
				)}
				{flag.segments.length > 0 && (
					<span>
						{flag.segments.length}{" "}
						{flag.segments.length === 1 ? "segment" : "segments"}
					</span>
				)}
				{flag.type === "variant" && "variations" in flag && (
					<span>{flag.variations.length} variants</span>
				)}
			</div>
			<div class="flex items-center gap-2">
				<a
					href={`/app/flags/${encodeURIComponent(flag.id)}/edit${params}`}
					class="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1 px-2.5 rounded transition-colors"
				>
					edit
				</a>
				<form
					method="post"
					action={`/app/flags/${encodeURIComponent(flag.id)}/delete${params}`}
					onsubmit="return confirm('Delete this flag?')"
					class="inline"
				>
					<button
						type="submit"
						class="text-xs bg-red-950/30 hover:bg-red-950/50 text-red-400 py-1 px-2.5 rounded transition-colors"
					>
						delete
					</button>
				</form>
			</div>
		</div>
	);
};

type SegmentRowProps = {
	segmentId: string;
	rule: string;
	app: string;
	env: string;
};

const SegmentRow: FC<SegmentRowProps> = ({ segmentId, rule, app, env }) => {
	const params = `?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`;
	return (
		<div class="flex items-center justify-between px-4 py-3">
			<div class="min-w-0 flex-1">
				<span class="text-sm text-zinc-100">{segmentId}</span>
				<p class="text-xs text-zinc-500 mt-0.5 truncate">{rule}</p>
			</div>
			<form
				method="post"
				action={`/app/segments/${encodeURIComponent(segmentId)}/delete${params}`}
				onsubmit="return confirm('Delete this segment? It will be removed from all flags using it.')"
			>
				<button
					type="submit"
					class="text-xs bg-red-950/30 hover:bg-red-950/50 text-red-400 py-1 px-2.5 rounded transition-colors ml-4"
				>
					delete
				</button>
			</form>
		</div>
	);
};

type FlagFormProps = {
	flag?: FeatureFlagInputSchema;
	segments: Record<string, string>;
	app: string;
	env: string;
	error?: string;
};

const FlagForm: FC<FlagFormProps> = ({ flag, segments, app, env, error }) => {
	const isEditing = !!flag;
	const title = isEditing ? `Edit: ${flag.id}` : "New Flag";
	const action = isEditing
		? `/app/flags/${encodeURIComponent(flag.id)}?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`
		: `/app/flags?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`;

	const segmentKeys = Object.keys(segments);
	const flagSegments = flag?.segments ?? [];
	const flagRules = flag?.rules ?? [];
	const flagType = flag?.type ?? "boolean";

	let payloadValue = "";
	if (flag && flag.type === "payload" && "payload" in flag) {
		payloadValue = JSON.stringify(flag.payload, null, 2);
	}

	let variationsValue = "";
	if (flag && flag.type === "variant" && "variations" in flag) {
		variationsValue = JSON.stringify(flag.variations, null, 2);
	}

	return (
		<Layout
			title={`${title} -- flaggly`}
			currentApp={app}
			currentEnv={env}
		>
			<div class="mb-6">
				<a
					href={buildUrl({ path: "/app", app, env })}
					class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
				>
					&larr; back
				</a>
			</div>

			<h1 class="text-xl font-bold mb-6">{title}</h1>

			<FlashMessages error={error} />

			<form method="post" action={action}>
				<div class="space-y-4">
					{/* ID */}
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							ID
						</label>
						<input
							type="text"
							name="id"
							value={flag?.id ?? ""}
							required
							readonly={isEditing}
							class={`w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors ${isEditing ? "opacity-50 cursor-not-allowed" : ""}`}
							placeholder="my-feature-flag"
						/>
					</div>

					{/* Type */}
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Type
						</label>
						<select
							name="type"
							id="flag-type-select"
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
						>
							<option
								value="boolean"
								selected={flagType === "boolean"}
							>
								boolean
							</option>
							<option
								value="payload"
								selected={flagType === "payload"}
							>
								payload
							</option>
							<option
								value="variant"
								selected={flagType === "variant"}
							>
								variant
							</option>
						</select>
					</div>

					{/* Label */}
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Label
						</label>
						<input
							type="text"
							name="label"
							value={flag?.label ?? ""}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
							placeholder="Human-readable name"
						/>
					</div>

					{/* Description */}
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Description
						</label>
						<textarea
							name="description"
							rows={2}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
							placeholder="What this flag does"
						>
							{flag?.description ?? ""}
						</textarea>
					</div>

					{/* Enabled + Rollout row */}
					<div class="flex gap-4">
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								name="enabled"
								id="flag-enabled"
								checked={flag?.enabled ?? false}
								class="rounded border-zinc-700 bg-zinc-950"
							/>
							<label
								for="flag-enabled"
								class="text-sm text-zinc-400"
							>
								Enabled
							</label>
						</div>
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								name="isTrackable"
								id="flag-trackable"
								checked={flag?.isTrackable ?? false}
								class="rounded border-zinc-700 bg-zinc-950"
							/>
							<label
								for="flag-trackable"
								class="text-sm text-zinc-400"
							>
								Trackable
							</label>
						</div>
						<div class="flex items-center gap-2 ml-auto">
							<label class="text-sm text-zinc-400">
								Rollout %
							</label>
							<input
								type="number"
								name="rollout"
								min={0}
								max={100}
								value={flag?.rollout ?? 100}
								class="w-20 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
							/>
						</div>
					</div>

					{/* Rules */}
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Rules{" "}
							<span class="text-zinc-600">(one JEXL expression per line, AND logic)</span>
						</label>
						<textarea
							name="rules"
							rows={3}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors resize-y font-mono"
							placeholder={"user.tier == 'premium'\ngeo.country == 'US'"}
						>
							{flagRules.join("\n")}
						</textarea>
					</div>

					{/* Segments */}
					{segmentKeys.length > 0 && (
						<div>
							<label class="block text-sm text-zinc-400 mb-1.5">
								Segments{" "}
								<span class="text-zinc-600">(OR logic)</span>
							</label>
							<div class="space-y-1">
								{segmentKeys.map((key) => (
									<label class="flex items-center gap-2 text-sm text-zinc-300">
										<input
											type="checkbox"
											name="segments"
											value={key}
											checked={flagSegments.includes(key)}
											class="rounded border-zinc-700 bg-zinc-950"
										/>
										<span>{key}</span>
										<span class="text-xs text-zinc-600">
											{segments[key]}
										</span>
									</label>
								))}
							</div>
						</div>
					)}

					{/* Rollout Steps */}
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Rollout Steps{" "}
							<span class="text-zinc-600">(JSON array, optional)</span>
						</label>
						<textarea
							name="rollouts"
							rows={3}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors resize-y font-mono"
							placeholder={'[\n  { "start": "2024-01-01T00:00:00Z", "percentage": 50 }\n]'}
						>
							{flag?.rollouts && flag.rollouts.length > 0
								? JSON.stringify(flag.rollouts, null, 2)
								: ""}
						</textarea>
					</div>

					{/* Payload section */}
					<div
						id="payload-section"
						style={flagType === "payload" ? "" : "display:none"}
					>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Payload{" "}
							<span class="text-zinc-600">(JSON)</span>
						</label>
						<textarea
							name="payload"
							rows={5}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors resize-y font-mono"
							placeholder={'{\n  "key": "value"\n}'}
						>
							{payloadValue}
						</textarea>
					</div>

					{/* Variant section */}
					<div
						id="variant-section"
						style={flagType === "variant" ? "" : "display:none"}
					>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Variations{" "}
							<span class="text-zinc-600">(JSON array, min 2)</span>
						</label>
						<textarea
							name="variations"
							rows={8}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors resize-y font-mono"
							placeholder={'[\n  { "id": "control", "label": "Control", "weight": 50 },\n  { "id": "treatment", "label": "Treatment", "weight": 50, "payload": "value" }\n]'}
						>
							{variationsValue}
						</textarea>
					</div>

					<button
						type="submit"
						class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
					>
						{isEditing ? "Update Flag" : "Create Flag"}
					</button>
				</div>
			</form>

			{html`<script>
				document
					.getElementById("flag-type-select")
					.addEventListener("change", function () {
						var type = this.value;
						document.getElementById("payload-section").style.display =
							type === "payload" ? "" : "none";
						document.getElementById("variant-section").style.display =
							type === "variant" ? "" : "none";
					});
			</script>`}
		</Layout>
	);
};

type SegmentFormProps = {
	app: string;
	env: string;
	error?: string;
};

const SegmentForm: FC<SegmentFormProps> = ({ app, env, error }) => {
	return (
		<Layout
			title="New Segment -- flaggly"
			currentApp={app}
			currentEnv={env}
		>
			<div class="mb-6">
				<a
					href={buildUrl({ path: "/app", app, env })}
					class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
				>
					&larr; back
				</a>
			</div>

			<h1 class="text-xl font-bold mb-6">New Segment</h1>

			<FlashMessages error={error} />

			<form
				method="post"
				action={`/app/segments?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`}
			>
				<div class="space-y-4">
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							ID
						</label>
						<input
							type="text"
							name="id"
							required
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
							placeholder="beta-users"
						/>
					</div>
					<div>
						<label class="block text-sm text-zinc-400 mb-1.5">
							Rule{" "}
							<span class="text-zinc-600">(JEXL expression)</span>
						</label>
						<input
							type="text"
							name="rule"
							required
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors font-mono"
							placeholder="'@company.com' in user.email"
						/>
					</div>
					<button
						type="submit"
						class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
					>
						Create Segment
					</button>
				</div>
			</form>
		</Layout>
	);
};

// --- Route Handlers ---

// Dashboard
ui.get("/", async (c) => {
	const { app, env } = getCtx({ c });
	const data = await c.var.kv.getData();
	const flags = Object.values(data.flags);
	const segmentEntries = Object.entries(data.segments);

	const success = c.req.query("success");
	const error = c.req.query("error");

	return c.html(
		<Layout title="flaggly" currentApp={app} currentEnv={env}>
			<FlashMessages success={success} error={error} />

			{/* Env switcher */}
			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
				<form method="get" action="/app" class="flex gap-3 items-end">
					<div class="flex-1">
						<label class="block text-xs text-zinc-500 mb-1">
							App
						</label>
						<input
							type="text"
							name="app"
							value={app}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
						/>
					</div>
					<div class="flex-1">
						<label class="block text-xs text-zinc-500 mb-1">
							Env
						</label>
						<input
							type="text"
							name="env"
							value={env}
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
						/>
					</div>
					<button
						type="submit"
						class="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm py-1.5 px-3 rounded transition-colors"
					>
						Switch
					</button>
				</form>
			</div>

			{/* Flags section */}
			<div class="mb-8">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-sm font-medium text-zinc-100">
						Flags ({flags.length})
					</h2>
					<a
						href={buildUrl({
							path: "/app/flags/new",
							app,
							env,
						})}
						class="text-xs bg-blue-600 hover:bg-blue-500 text-white py-1 px-3 rounded transition-colors"
					>
						+ New Flag
					</a>
				</div>
				{flags.length === 0 ? (
					<p class="text-zinc-500 text-sm">No flags yet.</p>
				) : (
					<div class="space-y-3">
						{flags.map((flag) => (
							<FlagCard flag={flag} app={app} env={env} />
						))}
					</div>
				)}
			</div>

			{/* Segments section */}
			<div>
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-sm font-medium text-zinc-100">
						Segments ({segmentEntries.length})
					</h2>
					<a
						href={buildUrl({
							path: "/app/segments/new",
							app,
							env,
						})}
						class="text-xs bg-blue-600 hover:bg-blue-500 text-white py-1 px-3 rounded transition-colors"
					>
						+ New Segment
					</a>
				</div>
				{segmentEntries.length === 0 ? (
					<p class="text-zinc-500 text-sm">No segments yet.</p>
				) : (
					<div class="bg-zinc-900 border border-zinc-800 rounded-md divide-y divide-zinc-800">
						{segmentEntries.map(([id, rule]) => (
							<SegmentRow
								segmentId={id}
								rule={rule}
								app={app}
								env={env}
							/>
						))}
					</div>
				)}
			</div>
		</Layout>,
	);
});

// Create flag form
ui.get("/flags/new", async (c) => {
	const { app, env } = getCtx({ c });
	const data = await c.var.kv.getData();
	const error = c.req.query("error");

	return c.html(
		<FlagForm
			segments={data.segments}
			app={app}
			env={env}
			error={error}
		/>,
	);
});

// Edit flag form
ui.get("/flags/:id/edit", async (c) => {
	const { app, env } = getCtx({ c });
	const flagId = c.req.param("id");
	const data = await c.var.kv.getData();
	const flag = data.flags[flagId];
	const error = c.req.query("error");

	if (!flag) {
		return c.redirect(
			buildUrl({ path: "/app", app, env }) +
				`&error=${encodeURIComponent("Flag not found.")}`,
		);
	}

	return c.html(
		<FlagForm
			flag={flag}
			segments={data.segments}
			app={app}
			env={env}
			error={error}
		/>,
	);
});

// Create flag handler
ui.post("/flags", async (c) => {
	const { app, env } = getCtx({ c });
	const dashUrl = buildUrl({ path: "/app", app, env });

	try {
		const flag = await parseFlagForm({ c });
		const parsed = inputFeatureFlagSchema.safeParse(flag);

		if (!parsed.success) {
			const msg = parsed.error.issues.map((i) => i.message).join(", ");
			return c.redirect(
				buildUrl({ path: "/app/flags/new", app, env }) +
					`&error=${encodeURIComponent(msg)}`,
			);
		}

		const [, error] = await c.var.kv.putFlag({ flag: parsed.data });

		if (error) {
			return c.redirect(
				buildUrl({ path: "/app/flags/new", app, env }) +
					`&error=${encodeURIComponent(error.message)}`,
			);
		}

		return c.redirect(
			`${dashUrl}&success=${encodeURIComponent(`Flag "${parsed.data.id}" created.`)}`,
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Failed to create flag";
		return c.redirect(
			buildUrl({ path: "/app/flags/new", app, env }) +
				`&error=${encodeURIComponent(msg)}`,
		);
	}
});

// Update flag handler
ui.post("/flags/:id", async (c) => {
	const { app, env } = getCtx({ c });
	const flagId = c.req.param("id");
	const dashUrl = buildUrl({ path: "/app", app, env });

	try {
		const flag = await parseFlagForm({ c });
		// Ensure the ID matches the URL param
		flag.id = flagId;

		const parsed = inputFeatureFlagSchema.safeParse(flag);

		if (!parsed.success) {
			const msg = parsed.error.issues.map((i) => i.message).join(", ");
			return c.redirect(
				buildUrl({ path: `/app/flags/${encodeURIComponent(flagId)}/edit`, app, env }) +
					`&error=${encodeURIComponent(msg)}`,
			);
		}

		const [, error] = await c.var.kv.putFlag({ flag: parsed.data });

		if (error) {
			return c.redirect(
				buildUrl({ path: `/app/flags/${encodeURIComponent(flagId)}/edit`, app, env }) +
					`&error=${encodeURIComponent(error.message)}`,
			);
		}

		return c.redirect(
			`${dashUrl}&success=${encodeURIComponent(`Flag "${flagId}" updated.`)}`,
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Failed to update flag";
		return c.redirect(
			buildUrl({ path: `/app/flags/${encodeURIComponent(flagId)}/edit`, app, env }) +
				`&error=${encodeURIComponent(msg)}`,
		);
	}
});

// Toggle flag
ui.post("/flags/:id/toggle", async (c) => {
	const { app, env } = getCtx({ c });
	const flagId = c.req.param("id");
	const dashUrl = buildUrl({ path: "/app", app, env });

	const data = await c.var.kv.getData();
	const flag = data.flags[flagId];

	if (!flag) {
		return c.redirect(
			`${dashUrl}&error=${encodeURIComponent("Flag not found.")}`,
		);
	}

	const [, error] = await c.var.kv.updateFlag({
		id: flagId,
		update: { enabled: !flag.enabled },
	});

	if (error) {
		return c.redirect(
			`${dashUrl}&error=${encodeURIComponent(error.message)}`,
		);
	}

	const status = flag.enabled ? "disabled" : "enabled";
	return c.redirect(
		`${dashUrl}&success=${encodeURIComponent(`Flag "${flagId}" ${status}.`)}`,
	);
});

// Delete flag
ui.post("/flags/:id/delete", async (c) => {
	const { app, env } = getCtx({ c });
	const flagId = c.req.param("id");
	const dashUrl = buildUrl({ path: "/app", app, env });

	const [, error] = await c.var.kv.deleteFlag({ id: flagId });

	if (error) {
		return c.redirect(
			`${dashUrl}&error=${encodeURIComponent(error.message)}`,
		);
	}

	return c.redirect(
		`${dashUrl}&success=${encodeURIComponent(`Flag "${flagId}" deleted.`)}`,
	);
});

// Create segment form
ui.get("/segments/new", async (c) => {
	const { app, env } = getCtx({ c });
	const error = c.req.query("error");

	return c.html(<SegmentForm app={app} env={env} error={error} />);
});

// Create segment handler
ui.post("/segments", async (c) => {
	const { app, env } = getCtx({ c });
	const dashUrl = buildUrl({ path: "/app", app, env });
	const body = await c.req.parseBody();

	const id = getString({ value: body.id }).trim();
	const rule = getString({ value: body.rule }).trim();

	const parsed = segmentInputSchema.safeParse({ id, rule });

	if (!parsed.success) {
		const msg = parsed.error.issues.map((i) => i.message).join(", ");
		return c.redirect(
			buildUrl({ path: "/app/segments/new", app, env }) +
				`&error=${encodeURIComponent(msg)}`,
		);
	}

	const [, error] = await c.var.kv.putSegment({
		id: parsed.data.id,
		rule: parsed.data.rule,
	});

	if (error) {
		return c.redirect(
			buildUrl({ path: "/app/segments/new", app, env }) +
				`&error=${encodeURIComponent(error.message)}`,
		);
	}

	return c.redirect(
		`${dashUrl}&success=${encodeURIComponent(`Segment "${parsed.data.id}" created.`)}`,
	);
});

// Delete segment
ui.post("/segments/:id/delete", async (c) => {
	const { app, env } = getCtx({ c });
	const segmentId = c.req.param("id");
	const dashUrl = buildUrl({ path: "/app", app, env });

	const [, error] = await c.var.kv.deleteSegment({ id: segmentId });

	if (error) {
		return c.redirect(
			`${dashUrl}&error=${encodeURIComponent(error.message)}`,
		);
	}

	return c.redirect(
		`${dashUrl}&success=${encodeURIComponent(`Segment "${segmentId}" deleted.`)}`,
	);
});

// --- Form Parsing ---

type ParseContext = {
	c: {
		req: {
			parseBody: (opts?: { all: true }) => Promise<Record<string, string | File | (string | File)[]>>;
		};
	};
};

const parseFlagForm = async ({ c }: ParseContext): Promise<Record<string, unknown>> => {
	const body = await c.req.parseBody({ all: true });

	const id = getString({ value: body.id }).trim();
	const type = getString({ value: body.type }).trim();
	const label = getString({ value: body.label }).trim();
	const description = getString({ value: body.description }).trim();
	const isEnabled = body.enabled === "on";
	const isTrackable = body.isTrackable === "on";
	const rollout = Number(getString({ value: body.rollout })) || 100;

	const rulesRaw = getString({ value: body.rules }).trim();
	const rules = rulesRaw
		? rulesRaw.split("\n").map((r) => r.trim()).filter(Boolean)
		: [];

	// Segments can be a single string or array
	let segments: string[] = [];
	if (body.segments) {
		if (Array.isArray(body.segments)) {
			segments = body.segments.filter(
				(v): v is string => typeof v === "string",
			);
		} else if (typeof body.segments === "string") {
			segments = [body.segments];
		}
	}

	// Rollout steps
	let rollouts: unknown[] = [];
	const rolloutsRaw = getString({ value: body.rollouts }).trim();
	if (rolloutsRaw) {
		rollouts = JSON.parse(rolloutsRaw);
	}

	const flag: Record<string, unknown> = {
		id,
		type,
		label: label || undefined,
		description: description || undefined,
		enabled: isEnabled,
		isTrackable,
		rollout,
		rules,
		segments,
		rollouts,
	};

	if (type === "payload") {
		const payloadRaw = getString({ value: body.payload }).trim();
		flag.payload = payloadRaw ? JSON.parse(payloadRaw) : undefined;
	}

	if (type === "variant") {
		const variationsRaw = getString({ value: body.variations }).trim();
		flag.variations = variationsRaw ? JSON.parse(variationsRaw) : undefined;
	}

	return flag;
};
