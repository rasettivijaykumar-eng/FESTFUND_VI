import { Router } from "express";
import rateLimit from "express-rate-limit";
import { changePassword, login, logout, me, registerAdmin, registerCommittee, registerVendor, updateProfile } from "../controllers/auth.controller.js";
import { createFestival, deleteFestival, getFestival, listMyFestivals, publicFestivalById, updateFestival, validateFestId } from "../controllers/festival.controller.js";
import { createDonor, deleteDonor, listDonors, updateDonor } from "../controllers/donor.controller.js";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../controllers/expense.controller.js";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../controllers/event.controller.js";
import { decideRequest, listMembers, listRequests } from "../controllers/committee.controller.js";
import { deleteGallery, downloadGallery, listGallery, uploadGallery } from "../controllers/gallery.controller.js";
import { createNote, deleteNote, listNotes } from "../controllers/note.controller.js";
import { addProduct, createAd, deleteAd, deleteProduct, getMyVendor, listAds, nearbyVendors, publicAds, updateAd, updateMyVendor, updateProduct, vendorFestivals, viewAd } from "../controllers/vendor.controller.js";
import { analytics, financialAdvisor, forecast, landingStats, searchAll } from "../controllers/analytics.controller.js";
import { createReceipt, downloadReport, listReceipts, publicDonorReceipt, publicFestivalReport, receiptPdf } from "../controllers/report.controller.js";
import { listNotifications, markAllRead, markRead } from "../controllers/notification.controller.js";
import { chatWithAi, chatWithPublicAi } from "../controllers/ai.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { billUpload, communityUpload, imageUpload, mediaUpload } from "../middleware/upload.js";
import { deleteCommunityMessage, listCommunityMessages, listPublicCommunityMessages, postCommunityMessage, postPublicCommunityMessage, publicCommunityLimiter } from "../controllers/community.controller.js";

export const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, message: { success: false, message: "Too many attempts. Please wait and try again." } });

router.get("/health", (_req, res) => res.json({ success: true, data: { service: "festfund" } }));
router.get("/public/landing", landingStats);
router.get("/public/festivals/:festId/donors/:donorId/receipt", publicDonorReceipt);
router.get("/public/festivals/:festId/reports/:type", publicFestivalReport);
router.get("/public/festivals/:festId/community/messages", listPublicCommunityMessages);
router.post("/public/festivals/:festId/community/messages", publicCommunityLimiter, communityUpload.single("media"), postPublicCommunityMessage);
router.get("/public/festivals/:festId", publicFestivalById);
router.get("/public/festivals/:festId/validate", validateFestId);
router.get("/public/vendors/nearby", nearbyVendors);
router.get("/public/advertisements", publicAds);
router.post("/public/advertisements/:id/view", viewAd);
router.get("/gallery/:id/download", downloadGallery);

router.post("/auth/register/admin", authLimiter, registerAdmin);
router.post("/auth/register/committee", authLimiter, registerCommittee);
router.post("/auth/register/vendor", authLimiter, imageUpload.fields([{ name: "logo", maxCount: 1 }, { name: "images", maxCount: 8 }]), registerVendor);
router.post("/auth/login", authLimiter, login);
router.post("/auth/logout", logout);
router.get("/auth/me", requireAuth, me);
router.patch("/auth/profile", requireAuth, imageUpload.single("avatar"), updateProfile);
router.patch("/auth/password", requireAuth, changePassword);
router.post("/ai/chat", requireAuth, chatWithAi);
router.post("/ai/public/chat", chatWithPublicAi);
router.get("/community/messages", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listCommunityMessages);
router.post("/community/messages", requireAuth, requireRoles("ADMIN", "COMMITTEE"), communityUpload.single("media"), postCommunityMessage);
router.delete("/community/messages/:id", requireAuth, requireRoles("ADMIN", "COMMITTEE"), deleteCommunityMessage);

router.post("/festivals", requireAuth, requireRoles("ADMIN"), imageUpload.single("image"), createFestival);
router.get("/festivals", requireAuth, requireRoles("ADMIN"), listMyFestivals);
router.get("/festivals/:festId", requireAuth, requireRoles("ADMIN", "COMMITTEE"), getFestival);
router.patch("/festivals/:festId", requireAuth, requireRoles("ADMIN"), imageUpload.single("image"), updateFestival);
router.delete("/festivals/:festId", requireAuth, requireRoles("ADMIN"), deleteFestival);

router.get("/donors", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listDonors);
router.post("/donors", requireAuth, requireRoles("ADMIN"), createDonor);
router.patch("/donors/:id", requireAuth, requireRoles("ADMIN"), updateDonor);
router.delete("/donors/:id", requireAuth, requireRoles("ADMIN"), deleteDonor);

router.get("/expenses", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listExpenses);
router.post("/expenses", requireAuth, requireRoles("ADMIN"), billUpload.single("bill"), createExpense);
router.patch("/expenses/:id", requireAuth, requireRoles("ADMIN"), billUpload.single("bill"), updateExpense);
router.delete("/expenses/:id", requireAuth, requireRoles("ADMIN"), deleteExpense);

router.get("/events", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listEvents);
router.post("/events", requireAuth, requireRoles("ADMIN", "COMMITTEE"), imageUpload.single("image"), createEvent);
router.patch("/events/:id", requireAuth, requireRoles("ADMIN", "COMMITTEE"), imageUpload.single("image"), updateEvent);
router.delete("/events/:id", requireAuth, requireRoles("ADMIN", "COMMITTEE"), deleteEvent);

router.get("/committee/requests", requireAuth, requireRoles("ADMIN"), listRequests);
router.patch("/committee/requests/:id", requireAuth, requireRoles("ADMIN"), decideRequest);
router.get("/committee/members", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listMembers);

router.get("/gallery", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listGallery);
router.post("/gallery", requireAuth, requireRoles("ADMIN", "COMMITTEE"), mediaUpload.single("file"), uploadGallery);
router.delete("/gallery/:id", requireAuth, requireRoles("ADMIN", "COMMITTEE"), deleteGallery);

router.get("/notes", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listNotes);
router.post("/notes", requireAuth, requireRoles("ADMIN", "COMMITTEE"), billUpload.single("attachment"), createNote);
router.delete("/notes/:id", requireAuth, requireRoles("ADMIN", "COMMITTEE"), deleteNote);

router.get("/vendors/me", requireAuth, requireRoles("VENDOR"), getMyVendor);
router.patch("/vendors/me", requireAuth, requireRoles("VENDOR"), imageUpload.fields([{ name: "logo", maxCount: 1 }, { name: "images", maxCount: 8 }]), updateMyVendor);
router.post("/vendors/me/products", requireAuth, requireRoles("VENDOR"), imageUpload.single("image"), addProduct);
router.patch("/vendors/me/products/:productId", requireAuth, requireRoles("VENDOR"), imageUpload.single("image"), updateProduct);
router.delete("/vendors/me/products/:productId", requireAuth, requireRoles("VENDOR"), deleteProduct);
router.get("/vendors/nearby", requireAuth, nearbyVendors);
router.get("/vendors/festivals", requireAuth, requireRoles("VENDOR"), vendorFestivals);

router.get("/advertisements", requireAuth, requireRoles("ADMIN", "VENDOR"), listAds);
router.post("/advertisements", requireAuth, requireRoles("VENDOR"), mediaUpload.single("media"), createAd);
router.patch("/advertisements/:id", requireAuth, requireRoles("VENDOR"), mediaUpload.single("media"), updateAd);
router.delete("/advertisements/:id", requireAuth, requireRoles("VENDOR"), deleteAd);

router.get("/analytics", requireAuth, requireRoles("ADMIN", "COMMITTEE"), analytics);
router.get("/analytics/forecast", requireAuth, requireRoles("ADMIN", "COMMITTEE"), forecast);
router.get("/analytics/financial-advisor", requireAuth, requireRoles("ADMIN", "COMMITTEE"), financialAdvisor);
router.get("/search", requireAuth, searchAll);

router.get("/receipts", requireAuth, requireRoles("ADMIN", "COMMITTEE"), listReceipts);
router.post("/receipts", requireAuth, requireRoles("ADMIN", "COMMITTEE"), createReceipt);
router.get("/receipts/:id/pdf", requireAuth, requireRoles("ADMIN", "COMMITTEE"), receiptPdf);
router.get("/reports/:type", requireAuth, requireRoles("ADMIN", "COMMITTEE"), downloadReport);

router.get("/notifications", requireAuth, listNotifications);
router.patch("/notifications/read-all", requireAuth, markAllRead);
router.patch("/notifications/:id/read", requireAuth, markRead);
