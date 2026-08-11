import type { RawMetaSnapshot, ReportConfig } from "../report/types";
import { fixtureSnapshot } from "./fixtures";

export interface MetaProvider {
  readonly name: string;
  listAccounts(): Promise<Array<{ id: string; name: string; currency: string; timezone: string }>>;
  fetchSnapshot(config: ReportConfig): Promise<RawMetaSnapshot>;
}

export class FixtureMetaProvider implements MetaProvider {
  readonly name = "fixture";

  async listAccounts() {
    return [
      {
        id: "act_2094000108",
        name: "Loja Aurora — Principal",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
      },
      {
        id: "act_4851000322",
        name: "Clínica Horizonte — Leads",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
      },
    ];
  }

  async fetchSnapshot(config: ReportConfig) {
    const snapshot = fixtureSnapshot(config.objective);
    return {
      ...snapshot,
      account: {
        ...snapshot.account,
        id: config.accountId,
        name: config.accountName,
      },
      period: config.period,
      comparisonPeriod: config.comparisonPeriod,
    };
  }
}
