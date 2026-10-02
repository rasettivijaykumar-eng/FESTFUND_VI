import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const nodeEnv = process.env.NODE_ENV || "development";

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  mongodbUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || (nodeEnv === "production" ? "" : "dev-only-festfund-secret-change-me"),
  jwtExpires: process.env.JWT_EXPIRES || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    templateName: process.env.WHATSAPP_DONATION_TEMPLATE_NAME || "",
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
    businessPhone: process.env.WHATSAPP_BUSINESS_PHONE || "",
  },
  festfundPublicUrl: process.env.FESTFUND_PUBLIC_URL || "http://localhost:5173",
  forecastApiUrl: process.env.FORECAST_API_URL || "",
};

export const cloudinaryEnabled = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret,
);

export function assertProductionEnv() {
  if (env.nodeEnv !== "production") return;
  const missing = ["MONGODB_URI", "JWT_SECRET"].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
