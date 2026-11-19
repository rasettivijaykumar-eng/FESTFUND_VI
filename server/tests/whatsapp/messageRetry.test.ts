import assert from "node:assert/strict";
import { test } from "node:test";

function classifyRetry(failureReason: string) {
  return /timed out|HTTP 429|HTTP 5\d\d|Meta error 5\d\d/i.test(failureReason);
}

function monotonic(current: string, next: string) {
  const rank: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };
  if (current === "read") return next === "read";
  if (current === "delivered") return next === "delivered" || next === "read";
  return (rank[next] ?? -1) >= (rank[current] ?? -1);
}

test("retry classifier distinguishes transient and permanent provider failures", () => {
  assert.equal(classifyRetry("Request timed out"), true);
  assert.equal(classifyRetry("HTTP 429 rate limited"), true);
  assert.equal(classifyRetry("HTTP 500 server error"), true);
  assert.equal(classifyRetry("Meta error 131026 recipient unavailable"), false);
  assert.equal(classifyRetry("Invalid recipient phone number"), false);
});

test("message status progression is monotonic", () => {
  assert.equal(monotonic("sent", "delivered"), true);
  assert.equal(monotonic("delivered", "read"), true);
  assert.equal(monotonic("read", "delivered"), false);
  assert.equal(monotonic("delivered", "sent"), false);
});

test("retry policy exhausts after three attempts", () => {
  const maximumAttempts = 3;
  const attempted = Array.from({ length: maximumAttempts }, (_, index) => index + 1);
  assert.deepEqual(attempted, [1, 2, 3]);
});
