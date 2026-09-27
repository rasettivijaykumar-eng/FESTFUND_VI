import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { z } from "zod";
import { Logo } from "../components/Logo";
import { LocationPicker } from "../components/LocationPicker";
import { Button, Field, FileInput, TextInput, TextArea, SelectInput } from "../components/ui";
import { api, errorMessage, type Account, type Role } from "../lib/api";
import { useAuth, useMotionPref, useToast } from "../context/AppState";

const password = z.string().min(8, "Use at least 8 characters");

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { reduced } = useMotionPref();
  return (
    <div className={`relative min-h-screen overflow-hidden bg-gradient-to-br from-[#1a0d05] via-[#4a1540] to-[#9a3412] px-4 py-10 text-white ${reduced ? "motion-off" : ""}`}>
      <div className="orb pointer-events-none absolute -left-16 top-10 h-72 w-72 rounded-full bg-orange-500/40 blur-3xl" />
      <div className="orb orb-slow pointer-events-none absolute right-0 top-24 h-80 w-80 rounded-full bg-fuchsia-500/35 blur-3xl" />
      <div className="orb pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-amber-400/30 blur-3xl" style={{ animationDelay: "-4s" }} />
      <div className="relative mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-[0.8fr_1.2fr]">
        <motion.div initial={reduced ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
          <Link to="/" className="float-logo mb-6 inline-flex rounded-full ring-4 ring-orange-300/40"><Logo className="h-24 w-24" /></Link>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200">FestFund</p>
          <h1 className="gradient-flow mt-2 bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 bg-clip-text font-display text-5xl text-transparent">{title}</h1>
          <p className="mt-3 text-white/75">{subtitle}</p>
        </motion.div>
        <motion.div initial={reduced ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: reduced ? 0 : 0.12 }} className="rounded-[2rem] bg-gradient-to-br from-white via-orange-50 to-rose-50 p-6 text-ink shadow-2xl shadow-rose-900/30 md:p-8">{children}</motion.div>
      </div>
    </div>
  );
}

function useSessionRedirect() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  return (user: Account) => {
    setUser(user);
    navigate(user.role === "ADMIN" ? "/admin" : user.role === "COMMITTEE" ? "/committee" : "/vendor");
  };
}

export function LoginPage({ role }: { role: Role }) {
  const { push } = useToast();
  const go = useSessionRedirect();
  const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
  const form = useForm({ resolver: zodResolver(schema) });
  const label = role === "ADMIN" ? "Admin" : role === "COMMITTEE" ? "Committee" : "Vendor";
  return (
    <Shell title={`${label} sign in`} subtitle="Your role is checked on the server, not only in the browser.">
      <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
        try {
          const response = await api.post("/auth/login", { ...values, role });
          push("success", "Welcome back");
          go(response.data.data.user);
        } catch (error) { push("error", errorMessage(error)); }
      })}>
        <Field label="Email" error={form.formState.errors.email?.message}><TextInput type="email" {...form.register("email")} /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}><TextInput type="password" {...form.register("password")} /></Field>
        <Button type="submit" loading={form.formState.isSubmitting} className="w-full">Sign in</Button>
      </form>
      <p className="mt-4 text-sm">New here? <Link className="text-deep underline" to={`/register/${role.toLowerCase()}`}>Create {label === "Admin" ? "an admin" : `a ${label.toLowerCase()}`} account</Link></p>
    </Shell>
  );
}

export function AdminRegister() {
  const { push } = useToast();
  const go = useSessionRedirect();
  const schema = z.object({
    name: z.string().min(2), email: z.string().email(), mobile: z.string().min(8), password, confirmPassword: z.string(),
  }).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <Shell title="Become admin" subtitle="Create festivals, record contributions and publish the accounts.">
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        try { const response = await api.post("/auth/register/admin", values); push("success", "Admin account ready"); go(response.data.data.user); }
        catch (error) { push("error", errorMessage(error)); }
      })}>
        <Field label="Full name" error={form.formState.errors.name?.message}><TextInput {...form.register("name")} /></Field>
        <Field label="Email" error={form.formState.errors.email?.message}><TextInput type="email" {...form.register("email")} /></Field>
        <Field label="Mobile" error={form.formState.errors.mobile?.message}><TextInput {...form.register("mobile")} /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}><TextInput type="password" {...form.register("password")} /></Field>
        <Field label="Confirm password" error={form.formState.errors.confirmPassword?.message}><TextInput type="password" {...form.register("confirmPassword")} /></Field>
        <Button type="submit" loading={form.formState.isSubmitting}>Create admin account</Button>
      </form>
    </Shell>
  );
}

export function CommitteeRegister() {
  const { push } = useToast();
  const navigate = useNavigate();
  const schema = z.object({
    name: z.string().min(2), email: z.string().email(), mobile: z.string().min(8), password, confirmPassword: z.string(), festId: z.string().min(4, "Enter the Fest ID"),
  }).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <Shell title="Join a committee" subtitle="The Fest ID is checked first. You can sign in only after an admin approves you.">
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        try {
          await api.post("/auth/register/committee", { ...values, festId: values.festId.toUpperCase() });
          push("success", "Join request submitted");
          navigate("/login/committee");
        } catch (error) { push("error", errorMessage(error)); }
      })}>
        <Field label="Fest ID" error={form.formState.errors.festId?.message}><TextInput {...form.register("festId")} placeholder="FEST-WGL-2026-001" /></Field>
        <Field label="Full name" error={form.formState.errors.name?.message}><TextInput {...form.register("name")} /></Field>
        <Field label="Email" error={form.formState.errors.email?.message}><TextInput type="email" {...form.register("email")} /></Field>
        <Field label="Mobile" error={form.formState.errors.mobile?.message}><TextInput {...form.register("mobile")} /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}><TextInput type="password" {...form.register("password")} /></Field>
        <Field label="Confirm password" error={form.formState.errors.confirmPassword?.message}><TextInput type="password" {...form.register("confirmPassword")} /></Field>
        <Button type="submit" loading={form.formState.isSubmitting}>Submit join request</Button>
      </form>
    </Shell>
  );
}

const categories = ["Decoration", "Stage", "Lighting", "Sound", "Food", "Transport", "Other"];

export function VendorRegister() {
  const { push } = useToast();
  const go = useSessionRedirect();
  const schema = z.object({
    businessName: z.string().min(2), ownerName: z.string().min(2), email: z.string().email(), mobile: z.string().min(8),
    password, confirmPassword: z.string(), category: z.string().min(2), address: z.string().min(3), village: z.string().min(2),
    district: z.string().min(2), state: z.string().min(2), pincode: z.string().min(4),
    latitude: z.coerce.number().refine((value) => Number.isFinite(value), { message: "Allow location access so the map can place the business" }),
    longitude: z.coerce.number().refine((value) => Number.isFinite(value), { message: "Allow location access so the map can place the business" }),
    description: z.string().optional(), businessHours: z.string().optional(),
  }).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <Shell title="Become a vendor" subtitle="Your business is global. Advertising is free. There is no subscription.">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(async (values) => {
        const data = new FormData();
        Object.entries(values).forEach(([key, value]) => { if (value != null) data.append(key, String(value)); });
        const logo = (document.getElementById("vendor-logo") as HTMLInputElement)?.files?.[0];
        const images = (document.getElementById("vendor-images") as HTMLInputElement)?.files;
        if (logo) data.append("logo", logo);
        if (images) Array.from(images).forEach((file) => data.append("images", file));
        try {
          const response = await api.post("/auth/register/vendor", data);
          push("success", "Vendor account ready");
          go(response.data.data.user);
        } catch (error) { push("error", errorMessage(error)); }
      })}>
        <Field label="Business name" error={form.formState.errors.businessName?.message}><TextInput {...form.register("businessName")} /></Field>
        <Field label="Owner name" error={form.formState.errors.ownerName?.message}><TextInput {...form.register("ownerName")} /></Field>
        <Field label="Email" error={form.formState.errors.email?.message}><TextInput type="email" {...form.register("email")} /></Field>
        <Field label="Mobile" error={form.formState.errors.mobile?.message}><TextInput {...form.register("mobile")} /></Field>
        <Field label="Category" error={form.formState.errors.category?.message}><SelectInput {...form.register("category")}>{categories.map((c) => <option key={c}>{c}</option>)}</SelectInput></Field>
        <Field label="Business hours"><TextInput {...form.register("businessHours")} placeholder="9 AM – 8 PM" /></Field>
        <div className="md:col-span-2"><Field label="Address" error={form.formState.errors.address?.message}><TextInput {...form.register("address")} /></Field></div>
        <Field label="Village / town" error={form.formState.errors.village?.message}><TextInput {...form.register("village")} /></Field>
        <Field label="District" error={form.formState.errors.district?.message}><TextInput {...form.register("district")} /></Field>
        <Field label="State" error={form.formState.errors.state?.message}><TextInput {...form.register("state")} /></Field>
        <Field label="Pincode" error={form.formState.errors.pincode?.message} hint="The map places this pincode"><TextInput inputMode="numeric" maxLength={6} placeholder="506002" {...form.register("pincode")} /></Field>
        <div className="md:col-span-2">
          <LocationPicker
            pincode={form.watch("pincode")}
            onPlace={(place) => {
              if (Number.isFinite(place.latitude)) form.setValue("latitude", place.latitude, { shouldValidate: true });
              if (Number.isFinite(place.longitude)) form.setValue("longitude", place.longitude, { shouldValidate: true });
              if (place.address) form.setValue("address", place.address, { shouldValidate: true });
              if (place.village) form.setValue("village", place.village, { shouldValidate: true });
              if (place.district) form.setValue("district", place.district, { shouldValidate: true });
              if (place.state) form.setValue("state", place.state, { shouldValidate: true });
            }}
          />
        </div>
        <input type="hidden" {...form.register("latitude", { valueAsNumber: true })} />
        <input type="hidden" {...form.register("longitude", { valueAsNumber: true })} />
        {(form.formState.errors.latitude || form.formState.errors.longitude) && <p className="text-xs text-red-500 md:col-span-2">Enter a valid 6-digit pincode so the map can place the business.</p>}
        <div className="md:col-span-2"><Field label="Description"><TextArea {...form.register("description")} /></Field></div>
        <Field label="Logo"><FileInput id="vendor-logo" accept="image/jpeg,image/png,image/webp" /></Field>
        <Field label="Business images"><FileInput id="vendor-images" accept="image/jpeg,image/png,image/webp" multiple /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}><TextInput type="password" {...form.register("password")} /></Field>
        <Field label="Confirm password" error={form.formState.errors.confirmPassword?.message}><TextInput type="password" {...form.register("confirmPassword")} /></Field>
        <div className="md:col-span-2"><Button type="submit" loading={form.formState.isSubmitting}>Create vendor account</Button></div>
      </form>
    </Shell>
  );
}
