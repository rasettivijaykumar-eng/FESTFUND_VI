import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

process.env.WHATSAPP_APP_SECRET = "fault-test-secret";

const { verifyWhatsAppWebhookSignature, normalizeWhatsAppRecipient } = await import("../../src/services/whatsapp.service.js");

test("Meta signature accepts raw bytes and rejects tampering", () => {
  const raw = Buffer.from('{"entry":[{"changes":[]}]}');
  const valid = `sha256=${createHmac("sha256", "fault-test-secret").update(raw).digest("hex")}`;
  assert.equal(verifyWhatsAppWebhookSignature(raw, valid), true);
  assert.equal(verifyWhatsAppWebhookSignature(Buffer.concat([raw, Buffer.from("x")]), valid), false);
  assert.equal(verifyWhatsAppWebhookSignature(raw, "sha256=" + "0".repeat(64)), false);
});

test("invalid or missing signatures are rejected", () => {
  const raw = Buffer.from('{"entry":[]}');
  assert.equal(verifyWhatsAppWebhookSignature(raw, undefined), false);
  assert.equal(verifyWhatsAppWebhookSignature(undefined, "sha256=" + "0".repeat(64)), false);
  assert.equal(verifyWhatsAppWebhookSignature(raw, "not-a-valid-signature"), false);
});

test("phone normalization protects provider recipient formatting", () => {
  assert.equal(normalizeWhatsAppRecipient("9876543210").apiRecipient, "919876543210");
  assert.equal(normalizeWhatsAppRecipient("123").status, "failed");
});
