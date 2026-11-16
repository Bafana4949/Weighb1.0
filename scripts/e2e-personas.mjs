#!/usr/bin/env node
/**
 * End-to-end persona checks against a RUNNING app seeded with packages/database/seed-demo.ts.
 *   BASE_URL=http://localhost:3010 DEMO_PASSWORD='...' node scripts/e2e-personas.mjs
 * Signs in through NextAuth like a browser, then proves tenant/site isolation, tier rules
 * and edge-key binding over real HTTP. Writes demo transactions; never run against production.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3010";
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) { console.error("Set DEMO_PASSWORD"); process.exit(2); }

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => { cond ? passed++ : failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? `  -> ${detail}` : ""}`); };

async function signIn(email) {
  const jar = new Map();
  const keep = (res) => { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const [k, v] = kv.split("="); jar.set(k, v); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`); keep(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password: PASSWORD, json: "true" }) });
  keep(res);
  if (![...jar.keys()].some((k) => k.includes("session-token"))) throw new Error(`sign-in failed for ${email}`);
  return async (path, init = {}) => {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", cookie: cookie(), ...(init.headers ?? {}) } });
    let body = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  };
}

const sites = {};
const as = {};
async function main() {
  as.sa = await signIn("platform.admin@weighbridge.demo");
  as.ridgebackAdmin = await signIn("admin@ridgeback.demo");
  as.mopaneAdmin = await signIn("admin@mopane.demo");
  as.hclSiteAdmin = await signIn("siteadmin.hcl-p3@highveldcoal.demo");
  as.rbqOperator = await signIn("operator.rbq-01@ridgeback.demo");
  as.hclOperator = await signIn("operator.hcl-p3@highveldcoal.demo");
  as.transporter = await signIn("dispatch@swift.demo");

  const all = await as.sa("/api/sites");
  for (const s of all.body.data) sites[s.code] = s;
  check("Super Admin sees every company's sites", ["RBQ-01", "HCL-P3", "HCL-RS", "MOP-N", "MOP-D"].every((c) => sites[c]), Object.keys(sites).join(","));

  // Company isolation
  const rbSites = await as.ridgebackAdmin("/api/sites");
  check("Company Admin sees only own sites", rbSites.body.data.every((s) => s.code === "RBQ-01"), rbSites.body.data.map((s) => s.code).join(","));
  const mopTx = await as.mopaneAdmin(`/api/transactions?site=MOP-N&limit=1`);
  const mopTxId = mopTx.body?.data?.[0]?.id;
  check("Company Admin can read own transaction", Boolean(mopTxId) && (await as.mopaneAdmin(`/api/transactions/${mopTxId}`)).status === 200);
  check("Other company's admin gets 404 for that transaction (IDOR)", (await as.ridgebackAdmin(`/api/transactions/${mopTxId}`)).status === 404);
  check("Other company's admin cannot print its waybill", (await as.ridgebackAdmin(`/api/transactions/${mopTxId}/waybill`)).status === 404);
  const leak = await as.ridgebackAdmin("/api/bookings?site=MOP-N");
  check("?site= filter cannot widen tenant scope (bookings)", leak.status === 200 && leak.body.data.length === 0, `${leak.status} ${leak.body?.data?.length}`);

  // Fast-track on another company's order (critical finding C1)
  const mopOrders = await as.mopaneAdmin("/api/orders");
  const mopOrder = mopOrders.body.data[0];
  const ft = await as.rbqOperator(`/api/orders/${mopOrder.id}/fast-track`, { method: "POST", body: JSON.stringify({ action: "SAVE_PRESETS", presetTareWeightKg: 1 }) });
  check("Operator cannot fast-track another company's order", ft.status === 404, String(ft.status));

  // Site restriction (Site Admin)
  const hclSites = await as.hclSiteAdmin("/api/sites");
  check("Site Admin lists only assigned site", hclSites.body.data.length === 1 && hclSites.body.data[0].code === "HCL-P3", hclSites.body.data.map((s) => s.code).join(","));
  check("Site Admin cannot read sister site's capabilities", (await as.hclSiteAdmin(`/api/sites/HCL-RS/capabilities`)).status === 404);
  const me = await as.hclSiteAdmin("/api/users/me");
  check("Site Admin is labelled as such", me.body?.data?.roleLabel === "Site Admin", me.body?.data?.roleLabel);
  const grant = await as.hclSiteAdmin(`/api/admin/users/${me.body.data.id}/site-access`, { method: "POST", body: JSON.stringify({ siteId: sites["HCL-RS"].id }) });
  check("Site Admin cannot grant themselves more sites", grant.status === 403, String(grant.status));
  check("Company Admin cannot create Administrator accounts", (await as.mopaneAdmin("/api/admin/users", { method: "POST", body: JSON.stringify({ email: `x${Date.now()}@mopane.demo`, password: "Password123!", firstName: "Xx", lastName: "Yy", role: "ADMIN" }) })).status === 403);
  check("Hardware configuration is platform-only", (await as.mopaneAdmin(`/api/admin/sites/${sites["MOP-N"].id}/edge-key`, { method: "POST" })).status === 403);

  // Tier rules for typed weights
  const walkIn = (siteCode, extra = {}) => ({ method: "POST", body: JSON.stringify({ action: "FIRST_WEIGH", siteCode, plate: `ZZ ${Math.floor(Math.random() * 900 + 100)} GP`, driverName: "Test Driver", commodity: "G1 Crushed Stone 19mm", weightKg: 15200, weighType: "DISPATCH", idempotencyKey: crypto.randomUUID(), ...extra }) });
  const manualOk = await as.rbqOperator("/api/transactions/manual", walkIn("RBQ-01", { weightSource: "MANUAL" }));
  check("Manual tier: typed weight accepted without reason", manualOk.status === 200, `${manualOk.status} ${manualOk.body?.error ?? ""}`);
  const crossSite = await as.rbqOperator("/api/transactions/manual", walkIn("HCL-P3"));
  check("Operator cannot weigh at another company's site", crossSite.status === 403, String(crossSite.status));
  const semiNoReason = await as.hclOperator("/api/transactions/manual", walkIn("HCL-P3", { weightSource: "MANUAL", commodity: "RB1 Export Coal" }));
  check("Semi-automatic: typed weight without reason refused", semiNoReason.status === 422 && /reason/i.test(semiNoReason.body?.error ?? ""), `${semiNoReason.status} ${semiNoReason.body?.error}`);
  const semiReason = await as.hclOperator("/api/transactions/manual", walkIn("HCL-P3", { weightSource: "MANUAL", manualReason: "Indicator offline — reading taken from display", commodity: "RB1 Export Coal" }));
  check("Semi-automatic: typed weight with reason accepted", semiReason.status === 200, `${semiReason.status} ${semiReason.body?.error}`);
  const incidents = await as.hclSiteAdmin("/api/incidents?limit=50");
  check("Typed weight raised a MANUAL_OVERRIDE exception", incidents.body.data.some((i) => i.type === "MANUAL_OVERRIDE" && i.transactionId === semiReason.body?.data?.transactionId));
  check("No driver ID ciphertext in API responses", !JSON.stringify(incidents.body).includes("idNumberEncrypted"));

  // Transporter isolation
  const tOrders = await as.transporter("/api/orders");
  const tBookings = tOrders.body.data.flatMap((o) => o.bookings);
  const swift = (await as.transporter("/api/users/me")).body.data.organisationId;
  check("Transporter sees only its own bookings on shared orders", tBookings.length > 0 && tBookings.every((b) => b.transporterOrganisationId === swift), `${tBookings.length}`);
  check("Transporter cannot see commercial rate", tOrders.body.data.every((o) => o.ratePerTonZar === null));
  check("Transporter cannot drive the NFC reader", (await as.transporter("/api/nfc/uid?timeout=1000")).status === 403);

  // Edge key binding
  const issued = await as.sa(`/api/admin/sites/${sites["MOP-N"].id}/edge-key`, { method: "POST" });
  const key = issued.body?.data?.key;
  check("Super Admin issues a per-site edge key", typeof key === "string" && key.startsWith("wbe_"));
  const edge = (path, init = {}, k = key) => fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", "x-site-api-key": k, ...(init.headers ?? {}) } });
  const cfg = await (await edge("/api/edge/config")).json();
  check("Edge config resolves to its own site", cfg.data?.site?.code === "MOP-N" && cfg.data.mqtt.topicPrefix === `tenant/${cfg.data.site.organisationId}/site/${cfg.data.site.id}`);
  const hb = await edge("/api/edge/heartbeat", { method: "POST", body: JSON.stringify({ edgeVersion: "e2e", pendingSync: 0, failedSync: 0, mqttConnected: true, devices: [{ deviceKey: "SCALE_PRIMARY", health: "ONLINE" }] }) });
  check("Edge heartbeat accepted", hb.status === 200, String(hb.status));
  const wrongSite = await edge(`/api/transactions/chain-head?site=RBQ-01`);
  check("Edge key cannot read another site's chain head", wrongSite.status === 404, String(wrongSite.status));
  check("Bad edge key rejected", (await edge("/api/edge/config", {}, "wbe_" + "x".repeat(40))).status === 401);
  check("Legacy shared key rejected by default", (await edge("/api/edge/config", {}, "dev-site-key-change-me")).status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (process.env.PRINT_EDGE_KEY === "1") console.log(`EDGE_KEY=${key}`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
