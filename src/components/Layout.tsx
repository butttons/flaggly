import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import { version } from "../../package.json";

type LayoutProps = PropsWithChildren<{
	title: string;
	currentApp: string;
	currentEnv: string;
}>;

const buildUrl = ({
	path,
	app,
	env,
}: { path: string; app: string; env: string }) => {
	return `${path}?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`;
};

const Layout: FC<LayoutProps> = ({
	title,
	currentApp,
	currentEnv,
	children,
}) => {
	return html`<!doctype html>
		<html lang="en" class="dark">
			<head>
				<meta charset="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1"
				/>
				<title>${title}</title>
				<script src="https://cdn.tailwindcss.com"></script>
				<script>
					tailwind.config = {
						darkMode: "class",
						theme: {
							extend: {
								fontFamily: {
									mono: [
										"JetBrains Mono",
										"IBM Plex Mono",
										"ui-monospace",
										"SFMono-Regular",
										"monospace",
									],
								},
							},
						},
					};
				</script>
				<link
					rel="preconnect"
					href="https://fonts.googleapis.com"
				/>
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossorigin
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
					rel="stylesheet"
				/>
				<style>
					body {
						font-family: "JetBrains Mono", "IBM Plex Mono",
							ui-monospace, SFMono-Regular, monospace;
					}
					* {
						scrollbar-width: thin;
						scrollbar-color: #3f3f46 transparent;
					}
				</style>
			</head>
			<body
				class="bg-zinc-950 text-zinc-100 min-h-screen antialiased flex flex-col"
			>
				<nav class="border-b border-zinc-800">
					<div
						class="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between"
					>
						<div
							class="flex items-center gap-2 text-sm"
						>
							<a
								href="${buildUrl({ path: "/app", app: currentApp, env: currentEnv })}"
								class="font-bold text-zinc-100 hover:text-zinc-200 transition-colors"
								>flaggly</a
							>
							<span class="text-zinc-600">|</span>
							<span
								class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400"
								>${currentApp}</span
							>
							<span
								class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400"
								>${currentEnv}</span
							>
						</div>
						<a
							href="https://github.com/butttons/flaggly"
							target="_blank"
							rel="noopener noreferrer"
							class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
							>github</a
						>
					</div>
				</nav>
				<div class="max-w-4xl mx-auto px-4 py-8 w-full flex-1">
					${children}
				</div>
				<footer class="border-t border-zinc-800/50">
					<div
						class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between"
					>
						<span class="text-[11px] text-zinc-600">flaggly</span>
						<div class="flex items-center gap-2">
							<span class="text-[11px] text-zinc-600">v${version}</span>
							<a
								href="https://github.com/butttons/flaggly"
								target="_blank"
								rel="noopener noreferrer"
								class="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors"
								>github</a
							>
						</div>
					</div>
				</footer>
			</body>
		</html>`;
};

export { Layout, buildUrl };
export type { LayoutProps };
