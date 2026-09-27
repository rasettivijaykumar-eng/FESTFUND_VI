import mongoose from "mongoose";
import { env, assertProductionEnv } from "./env.js";
import { ensureUploadDir } from "../services/upload.service.js";

export async function connectDb() {
  assertProductionEnv();
  await ensureUploadDir();
  let uri = env.mongodbUri;
  if (!uri) {
    if (env.nodeEnv === "production") {
      throw new Error("MONGODB_URI is required in production");
    }
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const memory = await MongoMemoryServer.create({
      instance: { launchTimeout: 120000 },
    });
    uri = memory.getUri();
    console.log("FestFund is using an in-memory MongoDB for local development.");
  }
  await mongoose.connect(uri);
}
