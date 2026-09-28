import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

const apiOrigin = new URL(api.defaults.baseURL || "/api", window.location.origin).origin;

function resolveUploadUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveUploadUrls);
  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.startsWith("/uploads/")
      ? new URL(value, apiOrigin).toString()
      : value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveUploadUrls(item)]),
  );
}

api.interceptors.response.use((response) => {
  response.data = resolveUploadUrls(response.data);
  return response;
});

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (!error.response) return error.code === "ERR_NETWORK" ? "Network error" : "Server unavailable";
    return (error.response.data as { message?: string })?.message || "Something went wrong";
  }
  return "Something went wrong";
}

export type Role = "ADMIN" | "COMMITTEE" | "VENDOR";

export type Account = {
  _id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  avatarUrl?: string;
  festId?: string;
  committeeStatus?: string;
  appearance?: "dark" | "light";
  notificationPrefs?: { inApp: boolean; email: boolean };
};

export type Festival = {
  _id: string;
  name: string;
  type: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactMobile?: string;
  contactEmail?: string;
  imageUrl?: string;
  festId: string;
  isDemo?: boolean;
};

export type Donor = {
  _id: string;
  festId: string;
  name: string;
  mobile?: string;
  email?: string;
  address?: string;
  amount: number;
  date: string;
  category: string;
  notes?: string;
};

export type Expense = {
  _id: string;
  festId: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  addedByName?: string;
  billUrl?: string;
  billName?: string;
};

export type FestEvent = {
  _id: string;
  festId: string;
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  imageUrl?: string;
  status: "Upcoming" | "Ongoing" | "Completed" | "Cancelled";
};

export type Note = {
  _id: string;
  title: string;
  description: string;
  priority: "Normal" | "Important" | "Urgent";
  attachmentUrl?: string;
  attachmentName?: string;
  authorName?: string;
  createdAt: string;
};

export type GalleryItem = {
  _id: string;
  kind: "photo" | "video";
  title: string;
  category: string;
  url: string;
  bytes: number;
  mime: string;
  originalName: string;
  createdAt: string;
};

export type VendorProfile = {
  _id: string;
  businessName: string;
  ownerName: string;
  category: string;
  address: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  description: string;
  businessHours: string;
  logoUrl?: string;
  images: { url: string; originalName?: string }[];
  contactMobile: string;
  products?: VendorProduct[];
};

export type VendorProduct = {
  _id: string;
  name: string;
  price: number;
  imageUrl?: string;
};

export type Ad = {
  _id: string;
  title: string;
  description: string;
  mediaUrl?: string;
  mediaType: "image" | "video" | "none";
  category: string;
  contactNumber: string;
  businessAddress: string;
  validUntil?: string;
  status: "active" | "paused";
  views: number;
  isFree: boolean;
  vendor?: { businessName?: string; category?: string; logoUrl?: string; district?: string; village?: string };
};

export type Analytics = {
  festivals: number;
  donors: number;
  contributions: number;
  expenses: number;
  balance: number;
  committee: number;
  events: { total: number; upcoming: number; ongoing: number; completed: number; cancelled: number };
  gallery: number;
  nearbyVendors: number;
  expenseByCategory: { category: string; amount: number }[];
  trend: { month: string; contributions: number; expenses: number }[];
  vendorCategories: { category: string; count: number }[];
  advertisementViews: number;
  advertisements: number;
};

export const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export const prettyDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export const monthLabel = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "";
