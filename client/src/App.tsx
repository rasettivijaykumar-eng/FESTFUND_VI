import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "./components/Logo";
import { DashboardShell, type NavItem } from "./components/DashboardShell";
import { FestivalScopeProvider } from "./hooks/useFestivalScope";
import { useAuth, useMotionPref } from "./context/AppState";
import type { Role } from "./lib/api";
import { LoginPage, AdminRegister, CommitteeRegister, VendorRegister } from "./pages/AuthPages";
import { EnterFestPage } from "./pages/AdCarousel";
import {
  AdminHome, AdsAdminPage, AnalyticsPage, CommitteeQueue, CreateFestivalPage, DonorsPage, EventsPage,
  ExpensesPage, FestivalAdminDetail, FestivalsPage, GalleryPage, MembersPage, NearbyPage, NotesPage,
  ReceiptsPage, ReportsPage, SettingsPage,
} from "./pages/dashboards";
import { ActivitiesPage, VendorAdsPage, VendorFestivalsPage, VendorHome, VendorProductsPage, VendorProfilePage } from "./pages/VendorPages";

const Landing = lazy(() => import("./pages/Landing"));
const FestivalPublic = lazy(() => import("./pages/FestivalPublic"));

function Boot() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0805] text-white">
      <Logo className="h-24 w-24" />
      <p className="mt-4 tracking-[0.3em]">FESTFUND</p>
    </div>
  );
}

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Boot />;
  if (!user) return <Navigate to={`/login/${role.toLowerCase()}`} replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <FestivalScopeProvider>{children}</FestivalScopeProvider>;
}

const nav: Partial<Record<Role, NavItem[]>> = {
  ADMIN: [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/festivals", label: "My Festivals" },
    { to: "/admin/festivals/create", label: "Create Festival" },
    { to: "/admin/committee", label: "Committee Requests" },
    { to: "/admin/donors", label: "Donors" },
    { to: "/admin/expenses", label: "Expenses" },
    { to: "/admin/events", label: "Events" },
    { to: "/admin/notes", label: "Admin Notes" },
    { to: "/admin/gallery", label: "Gallery" },
    { to: "/admin/vendors", label: "Nearby Vendors" },
    { to: "/admin/advertisements", label: "Advertisements" },
    { to: "/admin/reports", label: "Reports" },
    { to: "/admin/receipts", label: "Receipts" },
    { to: "/admin/analytics", label: "Analytics" },
    { to: "/admin/settings", label: "Profile" },
    { to: "/admin/settings", label: "Settings" },
  ],
  COMMITTEE: [
    { to: "/committee", label: "Overview" },
    { to: "/committee/events", label: "Events" },
    { to: "/committee/activities", label: "Activities" },
    { to: "/committee/donors", label: "Donors" },
    { to: "/committee/expenses", label: "Expenses" },
    { to: "/committee/notes", label: "Admin Notes" },
    { to: "/committee/photos", label: "Photos" },
    { to: "/committee/videos", label: "Videos" },
    { to: "/committee/reports", label: "Reports" },
    { to: "/committee/members", label: "Committee" },
    { to: "/committee/vendors", label: "Nearby Vendors" },
    { to: "/committee/profile", label: "Profile" },
  ],
  VENDOR: [
    { to: "/vendor", label: "Dashboard" },
    { to: "/vendor/products", label: "Products" },
    { to: "/vendor/profile", label: "Business Profile" },
    { to: "/vendor/location", label: "Location" },
    { to: "/vendor/advertisements", label: "Advertisements" },
    { to: "/vendor/media", label: "Upload Media" },
    { to: "/vendor/festivals", label: "Nearby Festivals" },
    { to: "/vendor/status", label: "Advertisement Status" },
    { to: "/vendor/settings", label: "Settings" },
  ],
};

function Shell({ role, children }: { role: Role; children: ReactNode }) {
  const items = nav[role] || [];
  return <Guard role={role}><DashboardShell items={items}>{children}</DashboardShell></Guard>;
}

function AnimatedRoutes() {
  const location = useLocation();
  const { reduced } = useMotionPref();
  const routes = (
    <Routes location={location}>
      <Route path="/" element={<Landing />} />
      <Route path="/enter-fest" element={<EnterFestPage />} />
      <Route path="/festival/:festId" element={<FestivalPublic />} />
      <Route path="/login/admin" element={<LoginPage role="ADMIN" />} />
      <Route path="/login/committee" element={<LoginPage role="COMMITTEE" />} />
      <Route path="/login/vendor" element={<LoginPage role="VENDOR" />} />
      <Route path="/register/admin" element={<AdminRegister />} />
      <Route path="/register/committee" element={<CommitteeRegister />} />
      <Route path="/register/vendor" element={<VendorRegister />} />
      <Route path="/admin" element={<Shell role="ADMIN"><AdminHome /></Shell>} />
      <Route path="/admin/festivals" element={<Shell role="ADMIN"><FestivalsPage /></Shell>} />
      <Route path="/admin/festivals/create" element={<Shell role="ADMIN"><CreateFestivalPage /></Shell>} />
      <Route path="/admin/festivals/:festId" element={<Shell role="ADMIN"><FestivalAdminDetail /></Shell>} />
      <Route path="/admin/committee" element={<Shell role="ADMIN"><CommitteeQueue /></Shell>} />
      <Route path="/admin/donors" element={<Shell role="ADMIN"><DonorsPage canEdit /></Shell>} />
      <Route path="/admin/expenses" element={<Shell role="ADMIN"><ExpensesPage canEdit /></Shell>} />
      <Route path="/admin/events" element={<Shell role="ADMIN"><EventsPage canEdit /></Shell>} />
      <Route path="/admin/notes" element={<Shell role="ADMIN"><NotesPage /></Shell>} />
      <Route path="/admin/gallery" element={<Shell role="ADMIN"><GalleryPage /></Shell>} />
      <Route path="/admin/vendors" element={<Shell role="ADMIN"><NearbyPage /></Shell>} />
      <Route path="/admin/advertisements" element={<Shell role="ADMIN"><AdsAdminPage /></Shell>} />
      <Route path="/admin/reports" element={<Shell role="ADMIN"><ReportsPage /></Shell>} />
      <Route path="/admin/receipts" element={<Shell role="ADMIN"><ReceiptsPage /></Shell>} />
      <Route path="/admin/analytics" element={<Shell role="ADMIN"><AnalyticsPage /></Shell>} />
      <Route path="/admin/settings" element={<Shell role="ADMIN"><SettingsPage /></Shell>} />
      <Route path="/committee" element={<Shell role="COMMITTEE"><AdminHome /></Shell>} />
      <Route path="/committee/events" element={<Shell role="COMMITTEE"><EventsPage canEdit /></Shell>} />
      <Route path="/committee/activities" element={<Shell role="COMMITTEE"><ActivitiesPage /></Shell>} />
      <Route path="/committee/donors" element={<Shell role="COMMITTEE"><DonorsPage canEdit={false} /></Shell>} />
      <Route path="/committee/expenses" element={<Shell role="COMMITTEE"><ExpensesPage canEdit={false} /></Shell>} />
      <Route path="/committee/notes" element={<Shell role="COMMITTEE"><NotesPage /></Shell>} />
      <Route path="/committee/photos" element={<Shell role="COMMITTEE"><GalleryPage fixedKind="photo" /></Shell>} />
      <Route path="/committee/videos" element={<Shell role="COMMITTEE"><GalleryPage fixedKind="video" /></Shell>} />
      <Route path="/committee/reports" element={<Shell role="COMMITTEE"><ReportsPage /></Shell>} />
      <Route path="/committee/members" element={<Shell role="COMMITTEE"><MembersPage /></Shell>} />
      <Route path="/committee/vendors" element={<Shell role="COMMITTEE"><NearbyPage /></Shell>} />
      <Route path="/committee/profile" element={<Shell role="COMMITTEE"><SettingsPage /></Shell>} />
      <Route path="/vendor" element={<Shell role="VENDOR"><VendorHome /></Shell>} />
      <Route path="/vendor/products" element={<Shell role="VENDOR"><VendorProductsPage /></Shell>} />
      <Route path="/vendor/profile" element={<Shell role="VENDOR"><VendorProfilePage /></Shell>} />
      <Route path="/vendor/location" element={<Shell role="VENDOR"><VendorProfilePage /></Shell>} />
      <Route path="/vendor/advertisements" element={<Shell role="VENDOR"><VendorAdsPage /></Shell>} />
      <Route path="/vendor/media" element={<Shell role="VENDOR"><VendorProfilePage /></Shell>} />
      <Route path="/vendor/festivals" element={<Shell role="VENDOR"><VendorFestivalsPage /></Shell>} />
      <Route path="/vendor/status" element={<Shell role="VENDOR"><VendorAdsPage /></Shell>} />
      <Route path="/vendor/settings" element={<Shell role="VENDOR"><SettingsPage /></Shell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
  if (reduced) return routes;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
        {routes}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Boot />}>
        <AnimatedRoutes />
      </Suspense>
    </BrowserRouter>
  );
}
