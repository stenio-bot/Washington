import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { createMetaProvider } from "../../../../lib/meta/factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const demo = url.searchParams.get("demo") === "1";
  const user = await getChatGPTUser();
  if (!user && !demo) return NextResponse.json({ error: "Autenticação obrigatória." }, { status: 401 });
  try {
    const runtime = env as unknown as Record<string, unknown>;
    const providerName = runtime.META_PROVIDER === "marketing_api" ? "marketing_api" : "mcp";
    const provider = demo
      ? createMetaProvider({ provider: "fixture" })
      : createMetaProvider({
          provider: providerName,
          accessToken: typeof runtime.META_ACCESS_TOKEN === "string" ? runtime.META_ACCESS_TOKEN : undefined,
          graphApiVersion:
            typeof runtime.META_GRAPH_API_VERSION === "string" ? runtime.META_GRAPH_API_VERSION : undefined,
          mcpEndpoint:
            typeof runtime.META_MCP_ENDPOINT === "string"
              ? runtime.META_MCP_ENDPOINT
              : undefined,
          mcpListAccountsTool:
            typeof runtime.META_MCP_LIST_ACCOUNTS_TOOL === "string"
              ? runtime.META_MCP_LIST_ACCOUNTS_TOOL
              : undefined,
          mcpInsightsTool:
            typeof runtime.META_MCP_INSIGHTS_TOOL === "string"
              ? runtime.META_MCP_INSIGHTS_TOOL
              : undefined,
        });
    return NextResponse.json({ source: provider.name, accounts: await provider.listAccounts() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível listar as contas." },
      { status: 500 },
    );
  }
}
