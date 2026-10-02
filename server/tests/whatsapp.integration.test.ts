import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789012345";
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "123456789012345";
process.env.WHATSAPP_API_VERSION = "v22.0";
process.env.WHATSAPP_APP_SECRET = "test-app-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
process.env.WHATSAPP_DONATION_TEMPLATE_NAME = "festfund_donation_receipt";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en";
process.env.FESTFUND_PUBLIC_URL = "https://festfund.example.test";

type Handler = (req: any, res: any, next: (error?: unknown) => void) => unknown;

let memory: MongoMemoryServer;
let models: typeof import("../src/models/index.js");
let createDonor: Handler;
let resendDonationWhatsApp: Handler;
let sendDonationReceipt: typeof import("../src/services/whatsapp.service.js").sendDonationReceipt;
let processWhatsAppWebhook: typeof import("../src/services/whatsapp.service.js").processWhatsAppWebhook;
let verifyWhatsAppWebhookSignature: typeof import("../src/services/whatsapp.service.js").verifyWhatsAppWebhookSignature;
let normalizeWhatsAppRecipient: typeof import("../src/services/whatsapp.service.js").normalizeWhatsAppRecipient;
let verifyWhatsAppConfiguration: typeof import("../src/services/whatsapp.service.js").verifyWhatsAppConfiguration;
let getWhatsAppConfigFingerprint: typeof import("../src/services/whatsapp.service.js").getWhatsAppConfigFingerprint;
let originalFetch: typeof fetch;

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120_000 } });
  await mongoose.connect(memory.getUri());
  models = await import("../src/models/index.js");
  ({ createDonor } = await import("../src/controllers/donor.controller.js")) as unknown as { createDonor: Handler };
  ({ resendDonationWhatsApp } = await import("../src/controllers/whatsapp.controller.js")) as unknown as { resendDonationWhatsApp: Handler };
  const service = await import("../src/services/whatsapp.service.js");
  sendDonationReceipt = service.sendDonationReceipt;
  processWhatsAppWebhook = service.processWhatsAppWebhook;
  verifyWhatsAppWebhookSignature = service.verifyWhatsAppWebhookSignature;
  normalizeWhatsAppRecipient = service.normalizeWhatsAppRecipient;
  verifyWhatsAppConfiguration = service.verifyWhatsAppConfiguration;
  getWhatsAppConfigFingerprint = service.getWhatsAppConfigFingerprint;
  originalFetch = globalThis.fetch;
});

beforeEach(async () => {
  await Promise.all([
    models.User.deleteMany({}),
    models.Festival.deleteMany({}),
    models.Donor.deleteMany({}),
    models.WhatsAppSettings.deleteMany({}),
    models.Receipt.deleteMany({}),
    models.Notification.deleteMany({}),
    models.Counter.deleteMany({}),
  ]);
  globalThis.fetch = async () => { throw new Error("Unexpected WhatsApp API call"); };
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (memory) await memory.stop();
});

async function makeFestival() {
  const admin = await models.User.create({
    name: "Test Admin",
    email: `admin-${randomUUID()}@example.test`,
    mobile: "9000000000",
    password: "test-password",
    role: "ADMIN",
  });
  const festival = await models.Festival.create({
    name: "Test Festival",
    type: "Temple Festival",
    startDate: new Date("2026-10-01"),
    endDate: new Date("2026-10-10"),
    address: "Test Road",
    village: "Test Town",
    district: "Madurai",
    state: "Tamil Nadu",
    pincode: "625001",
    festId: `FEST-TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    createdBy: admin._id,
  });
  const settings = await models.WhatsAppSettings.create({
    adminUser: admin._id,
    enabled: true,
    verifiedAt: new Date(),
    verifiedConfigFingerprint: getWhatsAppConfigFingerprint(),
  });
  return { admin, festival, settings };
}

function invoke(handler: Handler, req: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const res: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { resolve({ status: this.statusCode, body }); return this; },
      sendStatus(code: number) { resolve({ status: code, body: null }); return this; },
    };
    try {
      const result = handler(req, res, (error) => error ? reject(error) : undefined);
      if (result && typeof (result as Promise<unknown>).then === "function") (result as Promise<unknown>).catch(reject);
    } catch (error) { reject(error); }
  });
}

function contributionBody(festId: string, mobile: string, submissionId = randomUUID()) {
  return { festId, submissionId, name: "Ravi Kumar", mobile, amount: 2500, date: "2026-10-02" };
}

function adminRequest(admin: { _id: unknown; name: string; email: string }, body: unknown) {
  return { body, auth: { id: String(admin._id), role: "ADMIN", name: admin.name, email: admin.email } };
}

test("optional number skips sending; a failed API never fails the contribution", async () => {
  const { admin, festival, settings } = await makeFestival();
  let apiCalls = 0;
  let shouldFail = true;
  globalThis.fetch = async () => {
    apiCalls += 1;
    return shouldFail
      ? new Response(JSON.stringify({ error: { code: 500, message: "Mock API failure" } }), { status: 500, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ messages: [{ id: "wamid.retry" }] }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const noNumber = await invoke(createDonor, adminRequest(admin, contributionBody(festival.festId, "")));
  assert.equal(noNumber.status, 201);
  assert.equal(noNumber.body.data.whatsappNotification.status, "no_number");
  assert.ok(noNumber.body.data.receiptNo);
  assert.equal(apiCalls, 0);

  settings.enabled = false;
  await settings.save();
  const disabled = await invoke(createDonor, adminRequest(admin, contributionBody(festival.festId, "+1 202 555 0198")));
  assert.equal(disabled.status, 201);
  assert.equal(disabled.body.data.whatsappNotification.status, "not_configured");
  assert.equal(apiCalls, 0);

  settings.enabled = true;
  await settings.save();
  const submissionId = randomUUID();
  const failed = await invoke(createDonor, adminRequest(admin, contributionBody(festival.festId, "9876543210", submissionId)));
  assert.equal(failed.status, 201);
  assert.equal(failed.body.data.whatsappNotification.status, "failed");
  assert.ok(failed.body.data.receiptNo);
  assert.notEqual(failed.body.data.receiptNo, noNumber.body.data.receiptNo);
  assert.equal(await models.Donor.countDocuments({ festId: festival.festId }), 3);
  assert.equal(await models.Notification.countDocuments({ user: admin._id, type: "whatsapp" }), 1);

  shouldFail = false;
  const retry = await invoke(resendDonationWhatsApp, {
    params: { id: String(failed.body.data._id) },
    body: { festId: festival.festId },
    auth: { id: String(admin._id), role: "ADMIN", name: admin.name, email: admin.email },
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.whatsappNotification.status, "pending");
  assert.equal(await models.Receipt.countDocuments({ donor: failed.body.data._id }), 1);
  assert.equal(await models.Donor.countDocuments({ festId: festival.festId }), 3);

  const duplicate = await invoke(createDonor, adminRequest(admin, contributionBody(festival.festId, "9876543210", submissionId)));
  assert.equal(duplicate.status, 200);
  assert.equal(apiCalls, 2);
  assert.equal(await models.Donor.countDocuments({ festId: festival.festId }), 3);
});

test("template send is festival-scoped, delivery webhooks update status, and delivered messages cannot be resent", async () => {
  const { admin, festival } = await makeFestival();
  let sentBody: Record<string, any> | undefined;
  let apiCalls = 0;
  globalThis.fetch = async (_url, init) => {
    apiCalls += 1;
    sentBody = JSON.parse(String(init?.body || ""));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test-message" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await invoke(createDonor, adminRequest(admin, contributionBody(festival.festId, "9876543210")));
  const donor = response.body.data;
  assert.equal(response.status, 201);
  assert.equal(donor.whatsappNotification.status, "pending");
  assert.equal(donor.mobile, "+919876543210");
  assert.equal(response.body.data.receiptNo, "FF-00001");
  assert.equal(sentBody?.to, "919876543210");
  const parameters = sentBody?.template.components[0].parameters.map((item: { text: string }) => item.text);
  assert.equal(parameters?.[0], "Ravi Kumar");
  assert.equal(parameters?.[1], "₹2,500");
  assert.equal(parameters?.[3], festival.festId);
  assert.equal(parameters?.[4], "FF-00001");
  assert.equal(parameters?.[5], `https://festfund.example.test/festival/${festival.festId}`);

  const webhook = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" }, statuses: [{ id: "wamid.test-message", status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] };
  const rawBody = Buffer.from(JSON.stringify(webhook));
  const signature = `sha256=${createHmac("sha256", "test-app-secret").update(rawBody).digest("hex")}`;
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, signature), true);
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, "sha256=bad"), false);
  await processWhatsAppWebhook(webhook);
  assert.equal((await models.Donor.findById(donor._id))?.whatsappNotification.status, "delivered");

  await assert.rejects(
    invoke(resendDonationWhatsApp, {
      params: { id: String(donor._id) },
      body: { festId: festival.festId },
      auth: { id: String(admin._id), role: "ADMIN", name: admin.name, email: admin.email },
    }),
    (error: { status?: number }) => error.status === 409,
  );
  assert.equal(apiCalls, 1);
  assert.equal(await models.Donor.countDocuments({ festId: festival.festId }), 1);
  assert.equal(await models.Receipt.countDocuments({ donor: donor._id }), 1);
});

test("Meta recipient-unavailable response is recorded without failing the contribution", async () => {
  const { admin, festival } = await makeFestival();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 131026, message: "Recipient unavailable" } }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  const response = await invoke(createDonor, adminRequest(admin, contributionBody(festival.festId, "9876543210")));
  assert.equal(response.status, 201);
  assert.equal(response.body.data.whatsappNotification.status, "not_available");
  assert.ok(response.body.data.receiptNo);
  assert.equal(await models.Donor.countDocuments({ festId: festival.festId }), 1);
  assert.equal(await models.Notification.countDocuments({ user: admin._id, type: "whatsapp" }), 1);
});

test("phone parsing handles Indian and international input", () => {
  assert.equal(normalizeWhatsAppRecipient("9876543210").e164, "+919876543210");
  assert.equal(normalizeWhatsAppRecipient("+1 202 555 0198").e164, "+12025550198");
  assert.equal(normalizeWhatsAppRecipient("").status, "no_number");
  assert.equal(normalizeWhatsAppRecipient("123").status, "failed");
});

test("configuration test requires the approved matching six-variable template", async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    if (String(url).includes("message_templates")) {
      return new Response(JSON.stringify({ data: [{
        name: "festfund_donation_receipt",
        language: "en",
        status: "APPROVED",
        components: [{ type: "BODY", text: "Thanks {{1}}: {{2}} at {{3}}. Fest ID {{4}}. Receipt {{5}}. Updates {{6}}" }],
      }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ display_phone_number: "+91 90000 00000", verified_name: "FestFund" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await verifyWhatsAppConfiguration();
  assert.equal(result.phoneNumber, "+91 90000 00000");
  assert.equal(result.businessName, "FestFund");
  assert.equal(calls, 2);
});