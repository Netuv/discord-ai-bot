import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Discord AI Bot Worker", () => {
	it("responds with 404 for unknown routes (unit style)", async () => {
		const request = new IncomingRequest("http://example.com/unknown-route-test");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Halaman Tidak Ditemukan");
	});

	it("responds with 404 for unknown routes (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/unknown-route-test");
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Halaman Tidak Ditemukan");
	});

	it("MCP endpoint returns JSON info on GET without SSE", async () => {
		const response = await SELF.fetch("https://example.com/mcp");
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toHaveProperty("name", "discord-mcp-bot");
		expect(data).toHaveProperty("tools");
	});
});
