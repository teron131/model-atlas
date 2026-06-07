import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
	createServer as createHttpServer,
	type ServerResponse,
} from "node:http";
import { createServer as createProbeServer } from "node:net";
import { extname, normalize, resolve } from "node:path";
import { promisify } from "node:util";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? "127.0.0.1";
const STATIC_ROOTS = [
	resolve(ROOT, ".cache/stats-logos"),
	resolve(ROOT, "assets"),
];

const execFileAsync = promisify(execFile);

let refreshInFlight: Promise<unknown> | null = null;

const contentTypes: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
};

const server = createHttpServer(async (request, response) => {
	const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
	if (request.method !== "GET" && request.method !== "HEAD") {
		writeText(response, 405, "Method not allowed");
		return;
	}
	const sendBody = request.method === "GET";

	if (url.pathname === "/" || url.pathname === "/minimal_ui.html") {
		await serveFile(response, resolve(ROOT, "minimal_ui.html"), sendBody);
		return;
	}

	if (url.pathname === "/api/llm-stats") {
		await serveFreshStats(response, sendBody);
		return;
	}

	if (
		url.pathname.startsWith("/.cache/stats-logos/") ||
		url.pathname.startsWith("/assets/")
	) {
		const filePath = resolve(ROOT, normalize(url.pathname.slice(1)));
		if (STATIC_ROOTS.some((staticRoot) => isWithin(filePath, staticRoot))) {
			await serveFile(response, filePath, sendBody);
			return;
		}
	}

	writeText(response, 404, "Not found");
});

const port = await findAvailablePort(PORT);
server.listen(port, HOST, () => logServerUrl(port));

function logServerUrl(port: number): void {
	console.log(`Model Atlas UI: http://${HOST}:${port}/minimal_ui.html`);
	console.log(
		"The page refreshes live stats through /api/llm-stats while visible.",
	);
}

async function findAvailablePort(startPort: number): Promise<number> {
	for (let port = startPort; port < startPort + 100; port += 1) {
		if (await canListen(port)) {
			return port;
		}
	}
	throw new Error(`No open port found from ${startPort} to ${startPort + 99}`);
}

function canListen(port: number): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const probe = createProbeServer();
		probe.once("error", (error) => {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "EADDRINUSE"
			) {
				resolve(false);
				return;
			}
			reject(error);
		});
		probe.listen(port, HOST, () => {
			probe.close(() => resolve(true));
		});
	});
}

async function serveFreshStats(
	response: ServerResponse,
	sendBody: boolean,
): Promise<void> {
	try {
		if (!sendBody) {
			writeJson(response, 200, null, false);
			return;
		}
		refreshInFlight ??= refreshModelAtlasPayload().finally(() => {
			refreshInFlight = null;
		});
		const payload = await refreshInFlight;
		writeJson(response, 200, payload);
	} catch {
		writeText(response, 500, "Unable to refresh stats");
	}
}

async function refreshModelAtlasPayload(): Promise<unknown> {
	const { stdout } = await execFileAsync(
		"pnpm",
		["--silent", "exec", "tsx", "scripts/refresh-model-atlas-payload.ts"],
		{
			cwd: ROOT,
			maxBuffer: 1024 * 1024 * 8,
		},
	);
	return JSON.parse(stdout);
}

async function serveFile(
	response: ServerResponse,
	filePath: string,
	sendBody: boolean,
): Promise<void> {
	try {
		const stats = await stat(filePath);
		if (!stats.isFile()) {
			writeText(response, 404, "Not found");
			return;
		}
		response.writeHead(200, {
			"Cache-Control": "no-store",
			"Content-Type":
				contentTypes[extname(filePath)] ?? "application/octet-stream",
		});
		if (!sendBody) {
			response.end();
			return;
		}
		createReadStream(filePath).pipe(response);
	} catch {
		writeText(response, 404, "Not found");
	}
}

function writeJson(
	response: ServerResponse,
	statusCode: number,
	body: unknown,
	sendBody = true,
): void {
	response.writeHead(statusCode, {
		"Cache-Control": "no-store",
		"Content-Type": "application/json; charset=utf-8",
	});
	response.end(sendBody ? JSON.stringify(body) : undefined);
}

function writeText(
	response: ServerResponse,
	statusCode: number,
	body: string,
): void {
	response.writeHead(statusCode, {
		"Cache-Control": "no-store",
		"Content-Type": "text/plain; charset=utf-8",
	});
	response.end(body);
}

function isWithin(filePath: string, rootPath: string): boolean {
	const normalizedRoot = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
	return filePath === rootPath || filePath.startsWith(normalizedRoot);
}
