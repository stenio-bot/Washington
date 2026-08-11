import assert from "node:assert/strict";
import test from "node:test";
import { mapInsightRow } from "../../lib/meta/marketing-api";

test("normaliza ações da Marketing API sem somar eventos equivalentes", () => {
  const row = mapInsightRow(
    {
      campaign_id: "cmp_1",
      campaign_name: "Campanha",
      spend: "100.50",
      impressions: "10000",
      reach: "8000",
      inline_link_clicks: "400",
      actions: [
        { action_type: "omni_purchase", value: "12" },
        { action_type: "purchase", value: "12" },
        { action_type: "lead", value: "31" },
      ],
      action_values: [
        { action_type: "omni_purchase", value: "2400" },
        { action_type: "purchase", value: "2400" },
      ],
    },
    "campaign",
  );

  assert.equal(row.entityId, "cmp_1");
  assert.equal(row.spend, 100.5);
  assert.equal(row.purchases, 12);
  assert.equal(row.purchaseValue, 2400);
  assert.equal(row.leads, 31);
});
