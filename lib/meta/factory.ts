import type { MetaProvider } from "./provider";
import { FixtureMetaProvider } from "./provider";
import { MetaMarketingApiProvider } from "./marketing-api";
import { MetaMcpProvider } from "./mcp";

export interface MetaRuntimeConfig {
  provider: "fixture" | "mcp" | "marketing_api";
  accessToken?: string;
  graphApiVersion?: string;
  mcpEndpoint?: string;
  mcpListAccountsTool?: string;
  mcpInsightsTool?: string;
}

export function createMetaProvider(config: MetaRuntimeConfig): MetaProvider {
  if (config.provider === "fixture") return new FixtureMetaProvider();
  if (config.provider === "mcp") {
    if (!config.accessToken || !config.mcpEndpoint) {
      throw new Error("O Meta MCP exige endpoint e autenticação OAuth.");
    }
    return new MetaMcpProvider({
      endpoint: config.mcpEndpoint,
      accessToken: config.accessToken,
      listAccountsTool: config.mcpListAccountsTool,
      insightsTool: config.mcpInsightsTool,
    });
  }
  if (!config.accessToken || !config.graphApiVersion) {
    throw new Error("A Marketing API exige token de leitura e versão explícita da Graph API.");
  }
  return new MetaMarketingApiProvider({
    accessToken: config.accessToken,
    apiVersion: config.graphApiVersion,
  });
}
