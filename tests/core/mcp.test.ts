import assert from "node:assert/strict";
import test from "node:test";
import { MetaMcpProvider } from "../../lib/meta/mcp";

test("negocia MCP, preserva sessão e lista somente contas autorizadas", async () => {
  const requests: Array<{ method: string; session: string | null }> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params?: { name?: string };
    };
    const headers = new Headers(init?.headers);
    requests.push({ method: body.method, session: headers.get("Mcp-Session-Id") });
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Mcp-Session-Id": "session-1" },
      });
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              { name: "list_ad_accounts", description: "List ad accounts", inputSchema: { properties: {} } },
              {
                name: "get_insights",
                description: "Read performance insights",
                inputSchema: { properties: { account_id: {}, time_range: {}, level: {} } },
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (body.method === "tools/call" && body.params?.name === "list_ad_accounts") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          result: {
            structuredContent: {
              accounts: [
                { id: "act_123", name: "Conta piloto", currency: "BRL", timezone: "America/Sao_Paulo" },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 400 });
  };

  const provider = new MetaMcpProvider({
    endpoint: "https://mcp.example.test",
    accessToken: "oauth-token",
    fetchImpl,
  });
  const accounts = await provider.listAccounts();

  assert.deepEqual(accounts, [
    { id: "act_123", name: "Conta piloto", currency: "BRL", timezone: "America/Sao_Paulo" },
  ]);
  assert.deepEqual(requests.map((item) => item.method), [
    "initialize",
    "notifications/initialized",
    "tools/list",
    "tools/call",
  ]);
  assert.equal(requests[0].session, null);
  assert.equal(requests.slice(1).every((item) => item.session === "session-1"), true);
});
