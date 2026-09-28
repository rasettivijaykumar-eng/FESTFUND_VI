import { z } from "zod";
import { Advertisement, Festival, Vendor } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { haversineKm } from "../utils/geo.js";
import { storeFile } from "../services/upload.service.js";

async function myVendor(userId: string) {
  const vendor = await Vendor.findOne({ user: userId });
  if (!vendor) throw new ApiError(404, "Create your business profile first");
  return vendor;
}

export const getMyVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ user: req.auth!.id });
  res.json({ success: true, data: vendor });
});

export const updateMyVendor = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const schema = z.object({
    businessName: z.string().min(2).optional(),
    ownerName: z.string().min(2).optional(),
    category: z.string().min(2).optional(),
    address: z.string().optional(),
    village: z.string().optional(),
    district: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    description: z.string().optional(),
    businessHours: z.string().optional(),
    contactMobile: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  Object.assign(vendor, parsed.data);
  if (parsed.data.latitude != null && parsed.data.longitude != null) {
    vendor.location = { type: "Point", coordinates: [parsed.data.longitude, parsed.data.latitude] };
  }
  const files = req.files as { logo?: Express.Multer.File[]; images?: Express.Multer.File[] } | undefined;
  if (files?.logo?.[0]) {
    const stored = await storeFile(files.logo[0], "vendors");
    vendor.logoUrl = stored.url;
    vendor.logoPublicId = stored.publicId;
  }
  if (files?.images?.length) {
    for (const image of files.images) {
      const stored = await storeFile(image, "vendors");
      vendor.images.push({ url: stored.url, publicId: stored.publicId, originalName: stored.originalName });
    }
  }
  await vendor.save();
  res.json({ success: true, data: vendor });
});

export const addProduct = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const parsed = z.object({
    name: z.string().min(1, "Product name is required"),
    price: z.coerce.number().positive("Price must be greater than zero"),
  }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid product");
  let imageUrl = "";
  let imagePublicId = "";
  if (req.file) {
    const stored = await storeFile(req.file, "vendor-products");
    imageUrl = stored.url;
    imagePublicId = stored.publicId;
  }
  vendor.products.push({ name: parsed.data.name, price: parsed.data.price, imageUrl, imagePublicId });
  await vendor.save();
  res.status(201).json({ success: true, data: vendor.products });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const product = vendor.products.id(req.params.productId);
  if (!product) throw new ApiError(404, "Product not found");
  const parsed = z.object({
    name: z.string().min(1, "Product name is required"),
    price: z.coerce.number().positive("Price must be greater than zero"),
  }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid product");
  product.name = parsed.data.name;
  product.price = parsed.data.price;
  if (req.file) {
    const stored = await storeFile(req.file, "vendor-products");
    product.imageUrl = stored.url;
    product.imagePublicId = stored.publicId;
  }
  await vendor.save();
  res.json({ success: true, data: vendor.products });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const product = vendor.products.id(req.params.productId);
  if (!product) throw new ApiError(404, "Product not found");
  product.deleteOne();
  await vendor.save();
  res.json({ success: true, data: vendor.products });
});

export const nearbyVendors = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || "").toUpperCase();
  const radius = Number(req.query.radius || 20);
  let lat = Number(req.query.lat);
  let lng = Number(req.query.lng);
  if (festId) {
    const festival = await Festival.findOne({ festId });
    if (!festival) throw new ApiError(404, "Fest ID not found");
    if (festival.latitude != null && festival.longitude != null) {
      lat = festival.latitude;
      lng = festival.longitude;
    }
  }
  const category = String(req.query.category || "");
  const vendors = await Vendor.find(category ? { category } : {});
  const mapped = vendors
    .map((vendor) => {
      const distance = vendor.latitude != null && vendor.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? haversineKm(lat, lng, vendor.latitude, vendor.longitude)
        : null;
      return {
        _id: vendor._id,
        businessName: vendor.businessName,
        ownerName: vendor.ownerName,
        category: vendor.category,
        description: vendor.description,
        address: vendor.address,
        village: vendor.village,
        district: vendor.district,
        state: vendor.state,
        pincode: vendor.pincode,
        latitude: vendor.latitude,
        longitude: vendor.longitude,
        logoUrl: vendor.logoUrl,
        images: vendor.images,
        contactMobile: vendor.contactMobile,
        businessHours: vendor.businessHours,
        products: (vendor.products || []).map((product) => ({ _id: product._id, name: product.name, price: product.price, imageUrl: product.imageUrl || "" })),
        distanceKm: distance == null ? null : Math.round(distance * 10) / 10,
      };
    })
    .filter((v) => v.distanceKm == null ? !festId : v.distanceKm <= radius)
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  res.json({ success: true, data: mapped, meta: { radiusKm: radius, mapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY) } });
});

export const listAds = asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.auth?.role === "VENDOR") {
    const vendor = await myVendor(req.auth.id);
    filter.vendor = vendor._id;
  }
  if (req.query.status) filter.status = String(req.query.status);
  const ads = await Advertisement.find(filter).populate("vendor", "businessName category logoUrl district").sort({ createdAt: -1 });
  res.json({ success: true, data: ads });
});

export const publicAds = asyncHandler(async (_req, res) => {
  const now = new Date();
  const ads = await Advertisement.find({
    status: "active",
    $or: [{ validUntil: { $exists: false } }, { validUntil: null }, { validUntil: { $gte: now } }],
  }).populate("vendor", "businessName ownerName category logoUrl district village state pincode address description contactMobile businessHours images products");
  res.json({ success: true, data: ads });
});

export const createAd = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const schema = z.object({
    title: z.string().min(2),
    description: z.string().optional().default(""),
    category: z.string().optional().default(""),
    contactNumber: z.string().optional().default(""),
    businessAddress: z.string().optional().default(""),
    validUntil: z.coerce.date().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  let mediaUrl = "";
  let mediaPublicId = "";
  let mediaType: "image" | "video" | "none" = "none";
  if (req.file) {
    const stored = await storeFile(req.file, "ads");
    mediaUrl = stored.url;
    mediaPublicId = stored.publicId;
    mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
  }
  const ad = await Advertisement.create({
    vendor: vendor._id,
    vendorUser: req.auth!.id,
    ...parsed.data,
    category: parsed.data.category || vendor.category,
    contactNumber: parsed.data.contactNumber || vendor.contactMobile,
    businessAddress: parsed.data.businessAddress || vendor.address,
    mediaUrl,
    mediaPublicId,
    mediaType,
    status: "active",
    isFree: true,
  });
  res.status(201).json({ success: true, data: ad, message: "Advertisement is live. Advertising is free." });
});

export const updateAd = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const ad = await Advertisement.findOne({ _id: req.params.id, vendor: vendor._id });
  if (!ad) throw new ApiError(404, "Advertisement not found");
  const schema = z.object({
    title: z.string().min(2).optional(),
    description: z.string().optional(),
    status: z.enum(["active", "paused"]).optional(),
    contactNumber: z.string().optional(),
    businessAddress: z.string().optional(),
    validUntil: z.coerce.date().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  Object.assign(ad, parsed.data);
  if (req.file) {
    const stored = await storeFile(req.file, "ads");
    ad.mediaUrl = stored.url;
    ad.mediaPublicId = stored.publicId;
    ad.mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
  }
  await ad.save();
  res.json({ success: true, data: ad });
});

export const deleteAd = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const ad = await Advertisement.findOne({ _id: req.params.id, vendor: vendor._id });
  if (!ad) throw new ApiError(404, "Advertisement not found");
  await ad.deleteOne();
  res.json({ success: true, message: "Advertisement removed" });
});

export const viewAd = asyncHandler(async (req, res) => {
  const ad = await Advertisement.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
  if (!ad) throw new ApiError(404, "Advertisement not found");
  res.json({ success: true, data: { views: ad.views } });
});

export const vendorFestivals = asyncHandler(async (req, res) => {
  const vendor = await myVendor(req.auth!.id);
  const radius = Number(req.query.radius || 20);
  const festivals = await Festival.find({ latitude: { $ne: null }, longitude: { $ne: null } });
  const data = festivals
    .map((festival) => ({
      festId: festival.festId,
      name: festival.name,
      type: festival.type,
      district: festival.district,
      village: festival.village,
      startDate: festival.startDate,
      endDate: festival.endDate,
      imageUrl: festival.imageUrl,
      distanceKm: vendor.latitude != null && vendor.longitude != null && festival.latitude != null && festival.longitude != null
        ? Math.round(haversineKm(vendor.latitude, vendor.longitude, festival.latitude, festival.longitude) * 10) / 10
        : null,
    }))
    .filter((f) => f.distanceKm != null && f.distanceKm <= radius)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  res.json({ success: true, data });
});
