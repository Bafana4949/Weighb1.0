import { describe, expect, it } from "vitest";
import { laneTopic, siteSubscription, siteTopic } from "@weighbridge/mqtt-topics";

const ORG = "6b1f0c1e-0000-4000-8000-000000000001";
const SITE = "9d3c2b1a-0000-4000-8000-000000000002";

describe("MQTT topic hierarchy", () => {
  it("nests lane topics under tenant and site", () => {
    expect(laneTopic(ORG, SITE, 1, "scale/weight")).toBe(`tenant/${ORG}/site/${SITE}/lane/1/scale/weight`);
    expect(siteTopic(ORG, SITE, "edge/heartbeat")).toBe(`tenant/${ORG}/site/${SITE}/edge/heartbeat`);
  });
  it("scopes subscriptions to a single site", () => {
    expect(siteSubscription(ORG, SITE)).toBe(`tenant/${ORG}/site/${SITE}/#`);
  });
  it("refuses ids that would inject wildcards or extra levels", () => {
    expect(() => siteSubscription("+", SITE)).toThrow();
    expect(() => siteTopic(ORG, `${SITE}/#`, "alerts")).toThrow();
    expect(() => laneTopic(ORG, SITE, 0, "gate/command")).toThrow();
  });
});
