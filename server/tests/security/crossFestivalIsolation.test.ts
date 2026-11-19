import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let memory: MongoMemoryServer;
let models: typeof import("../../src/models/index.js");
let updateDonor: any;
let deleteExpense: any;
let deleteGallery: any;
let receiptPdf: any;
let downloadExpenseBill: any;
let requireAuth: any;

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120_000 } });
  await mongoose.connect(memory.getUri());
  models = await import("../../src/models/index.js");
  ({ updateDonor, deleteExpense: deleteExpense } = await import("../../src/controllers/donor.controller.js"));
  ({ updateDonor } = await import("../../src/controllers/donor.controller.js"));
  ({ deleteExpense } = await import("../../src/controllers/expense.controller.js"));
  ({ deleteGallery } = await import("../../src/controllers/gallery.controller.js"));
  ({ receiptPdf } = await import("../../src/controllers/report.controller.js"));
  ({ downloadExpenseBill } = await import("../../src/controllers/expense.controller.js"));
  ({ requireAuth } = await import("../../src/middleware/auth.js"));
});

beforeEach(async () => {
  await Promise.all([
    models.User.deleteMany({}),
    models.Festival.deleteMany({}),
    models.Donor.deleteMany({}),
    models.Expense.deleteMany({}),
    models.GalleryItem.deleteMany({}),
    models.Receipt.deleteMany({}),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (memory) await memory.stop();
});

async function makeFixture(label: "A" | "B") {
  const admin = await models.User.create({
    name: `Admin ${label}`,
    email: `admin-${label}-${randomUUID()}@example.test`,
    password: "test-password",
    role: "ADMIN",
  });
  const committee = await models.User.create({
    name: `Committee ${label}`,
    email: `committee-${label}-${randomUUID()}@example.test`,
    password: "test-password",
    role: "COMMITTEE",
    committeeStatus: "approved",
    festId: `FEST-${label}-${randomUUID().slice(0, 8).toUpperCase()}`,
  });
  const festival = await models.Festival.create({
    name: `Festival ${label}`,
    type: "Temple Festival",
    startDate: new Date("2026-10-01"),
    endDate: new Date("2026-10-10"),
    address: "Synthetic Road",
    village: "Synthetic Town",
    district: "Synthetic District",
    state: "Tamil Nadu",
    pincode: "625001",
    festId: committee.festId,
    createdBy: admin._id,
  });
  committee.festival = festival._id;
  await committee.save();

  const donor = await models.Donor.create({
    festival: festival._id,
    festId: festival.festId,
    name: `Synthetic Donor ${label}`,
    mobile: "",
    amount: 1000,
    date: new Date("2026-10-02"),
  });
  const expense = await models.Expense.create({
    festival: festival._id,
    festId: festival.festId,
    description: `Synthetic Expense ${label}`,
    amount: 500,
    category: "Other",
    date: new Date("2026-10-03"),
  });
  const gallery = await models.GalleryItem.create({
    festival: festival._id,
    festId: festival.festId,
    kind: "photo",
    title: `Synthetic Gallery ${label}`,
    url: `/uploads/synthetic-${label}.jpg`,
    publicId: `synthetic-${label}.jpg`,
  });
  const receipt = await models.Receipt.create({
    receiptNo: `FF-SYN-${label}-${randomUUID().slice(0, 8)}`,
    donor: donor._id,
    festival: festival._id,
    festId: festival.festId,
    festivalName: festival.name,
    donorName: donor.name,
    amount: donor.amount,
    contributionDate: donor.date,
  });
  return { admin, committee, festival, donor, expense, gallery, receipt };
}

function invoke(handler: any, req: any) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const res: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(body: any) { resolve({ status: this.statusCode, body }); return this; },
      sendStatus(code: number) { resolve({ status: code, body: null }); return this; },
      setHeader() { return this; },
      redirect() { resolve({ status: 302, body: null }); },
      download() { resolve({ status: 200, body: null }); },
    };
    try {
      const result = handler(req, res, (error?: any) => error ? reject(error) : undefined);
      if (result && typeof result.then === "function") result.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

async function expectStatus(handler: any, req: any, status: number) {
  try {
    await invoke(handler, req);
    assert.fail("Expected unauthorized request to be rejected");
  } catch (error: any) {
    assert.equal(error.status, status);
  }
}

test("cross-festival admin and committee mutations cannot reach Festival B", async () => {
  const a = await makeFixture("A");
  const b = await makeFixture("B");

  const adminA = { id: String(a.admin._id), role: "ADMIN", name: a.admin.name, email: a.admin.email, festId: a.festival.festId };
  const committeeA = { id: String(a.committee._id), role: "COMMITTEE", name: a.committee.name, email: a.committee.email, festId: a.festival.festId };

  await Promise.all([
    expectStatus(updateDonor, { params: { id: String(b.donor._id) }, body: { name: "Leaked change" }, auth: adminA }, 404),
    expectStatus(deleteExpense, { params: { id: String(b.expense._id) }, auth: adminA }, 404),
    expectStatus(deleteGallery, { params: { id: String(b.gallery._id) }, auth: adminA }, 404),
    expectStatus(receiptPdf, { params: { id: String(b.receipt._id) }, auth: adminA, query: {} }, 404),
    expectStatus(downloadExpenseBill, { params: { id: String(b.expense._id) }, auth: committeeA, query: {} }, 404),
  ]);

  assert.equal((await models.Donor.findById(b.donor._id))?.name, `Synthetic Donor B`);
  assert.equal(await models.Expense.countDocuments({ _id: b.expense._id }), 1);
  assert.equal(await models.GalleryItem.countDocuments({ _id: b.gallery._id }), 1);
  assert.equal(await models.Receipt.countDocuments({ _id: b.receipt._id }), 1);
});

test("anonymous requests receive 401 and Festival B remains unchanged", async () => {
  const b = await makeFixture("B");
  await new Promise<void>((resolve, reject) => {
    requireAuth({ headers: {}, cookies: {} }, {}, (error?: any) => {
      if (error?.status === 401) resolve();
      else reject(error || new Error("Expected 401"));
    });
  });

  const receiptBefore = await models.Receipt.findById(b.receipt._id);
  assert.ok(receiptBefore);
  assert.equal(receiptBefore.festId, b.festival.festId);
});
