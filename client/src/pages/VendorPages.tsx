import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, inr, prettyDate, type Ad, type VendorProduct, type VendorProfile } from "../lib/api";
import { useToast } from "../context/AppState";
import { Badge, Button, EmptyState, Field, FileInput, Modal, PageHeader, SelectInput, Skeleton, StatCard, TextArea, TextInput } from "../components/ui";
import { LocationPicker } from "../components/LocationPicker";
import { AdCarousel } from "./AdCarousel";

export function VendorHome() {
  const ads = useQuery({ queryKey: ["my-ads"], queryFn: async () => (await api.get("/advertisements")).data.data as Ad[] });
  const publicAds = useQuery({ queryKey: ["public-ads"], queryFn: async () => (await api.get("/public/advertisements")).data.data as Ad[] });
  const festivals = useQuery({ queryKey: ["vendor-festivals"], queryFn: async () => (await api.get("/vendors/festivals")).data.data as { name: string }[] });
  if (ads.isLoading) return <Skeleton className="h-32" />;
  const views = (ads.data || []).reduce((sum, ad) => sum + ad.views, 0);
  return (
    <div>
      <PageHeader title="Vendor dashboard" subtitle="Advertising is free. There is no plan to upgrade." />
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Advertisements" value={ads.data?.length || 0} />
        <StatCard label="Views" value={views} />
        <StatCard label="Nearby festivals" value={festivals.data?.length || 0} hint="Within 20 km" />
      </div>
      <section className="mt-6"><h2 className="mb-3 text-xl">Local vendor advertisements</h2><AdCarousel ads={publicAds.data || []} /></section>
    </div>
  );
}

export function VendorProfilePage() {
  const { push } = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["vendor-me"], queryFn: async () => (await api.get("/vendors/me")).data.data as VendorProfile | null });
  const [form, setForm] = useState<Partial<VendorProfile> | null>(null);
  const profile = form || query.data;
  if (query.isLoading || !profile) return query.isLoading ? <Skeleton className="h-40" /> : <EmptyState title="Profile missing" body="Register again if this account has no business profile." />;
  const set = (key: keyof VendorProfile, value: string) => setForm({ ...profile, [key]: value });
  return (
    <form className="mx-auto grid max-w-3xl gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const data = new FormData();
      ["businessName", "ownerName", "category", "address", "village", "district", "state", "pincode", "latitude", "longitude", "description", "businessHours", "contactMobile"].forEach((key) => {
        const value = profile[key as keyof VendorProfile];
        if (value != null) data.append(key, String(value));
      });
      const logo = (document.getElementById("v-logo") as HTMLInputElement)?.files?.[0];
      const images = (document.getElementById("v-images") as HTMLInputElement)?.files;
      if (logo) data.append("logo", logo);
      if (images) Array.from(images).forEach((file) => data.append("images", file));
      try { await api.patch("/vendors/me", data); push("success", "Business profile saved"); await client.invalidateQueries({ queryKey: ["vendor-me"] }); }
      catch (error) { push("error", errorMessage(error)); }
    }}>
      <PageHeader title="Business profile" />
      <Field label="Business name"><TextInput value={profile.businessName} onChange={(e) => set("businessName", e.target.value)} /></Field>
      <Field label="Description"><TextArea value={profile.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="Hours"><TextInput value={profile.businessHours} onChange={(e) => set("businessHours", e.target.value)} /></Field>
      <Field label="Contact"><TextInput value={profile.contactMobile} onChange={(e) => set("contactMobile", e.target.value)} /></Field>
      <Field label="Address"><TextInput value={profile.address} onChange={(e) => set("address", e.target.value)} /></Field>
      <Field label="Village"><TextInput value={profile.village} onChange={(e) => set("village", e.target.value)} /></Field>
      <Field label="District"><TextInput value={profile.district} onChange={(e) => set("district", e.target.value)} /></Field>
      <Field label="State"><TextInput value={profile.state} onChange={(e) => set("state", e.target.value)} /></Field>
      <Field label="Pincode" hint="The map places this pincode"><TextInput inputMode="numeric" maxLength={6} placeholder="506002" value={profile.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>
      <LocationPicker
        pincode={profile.pincode}
        onPlace={(place) => setForm({
          ...profile,
          latitude: Number.isFinite(place.latitude) ? place.latitude : profile.latitude,
          longitude: Number.isFinite(place.longitude) ? place.longitude : profile.longitude,
          address: place.address || profile.address,
          village: place.village || profile.village,
          district: place.district || profile.district,
          state: place.state || profile.state,
        })}
      />
      <Field label="Replace logo"><FileInput id="v-logo" accept="image/jpeg,image/png,image/webp" /></Field>
      <Field label="Add business images"><FileInput id="v-images" accept="image/jpeg,image/png,image/webp" multiple /></Field>
      <div className="flex gap-3">{profile.images?.map((image) => <img key={image.url} src={image.url} alt="" className="h-20 w-20 rounded-2xl object-cover" />)}</div>
      <Button type="submit">Save profile</Button>
    </form>
  );
}

export function VendorAdsPage() {
  const { push } = useToast();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "Decoration", contactNumber: "", businessAddress: "", validUntil: "" });
  const [file, setFile] = useState<File | null>(null);
  const query = useQuery({ queryKey: ["my-ads"], queryFn: async () => (await api.get("/advertisements")).data.data as Ad[] });
  return (
    <div>
      <PageHeader title="Advertisements" subtitle="Free advertising" action={<Button onClick={() => setOpen(true)}>New advertisement</Button>} />
      {(query.data || []).map((ad) => (
        <article key={ad._id} className="glass mb-3 rounded-3xl p-4">
          <div className="flex items-center justify-between"><h3>{ad.title}</h3><Badge>{ad.status}</Badge></div>
          <p className="text-sm text-[var(--muted)]">{ad.views} views · {ad.category}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" onClick={async () => { await api.patch(`/advertisements/${ad._id}`, { status: ad.status === "active" ? "paused" : "active" }); await client.invalidateQueries({ queryKey: ["my-ads"] }); }}> {ad.status === "active" ? "Pause" : "Activate"}</Button>
            <Button variant="danger" onClick={async () => { await api.delete(`/advertisements/${ad._id}`); await client.invalidateQueries({ queryKey: ["my-ads"] }); }}>Delete</Button>
          </div>
        </article>
      ))}
      {query.data && query.data.length === 0 && <EmptyState title="No advertisements yet." body="Publish a banner or a short film. It will not be billed." />}
      <Modal open={open} title="New advertisement" onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label="Title"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Category"><SelectInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{["Decoration", "Stage", "Lighting", "Sound", "Food", "Transport", "Other"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Contact"><TextInput value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></Field>
          <Field label="Address"><TextInput value={form.businessAddress} onChange={(e) => setForm({ ...form, businessAddress: e.target.value })} /></Field>
          <Field label="Valid until"><TextInput type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></Field>
          <Field label="Media"><FileInput accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(file) => setFile(file)} /></Field>
          <Button onClick={async () => {
            const data = new FormData();
            Object.entries(form).forEach(([key, value]) => { if (value) data.append(key, value); });
            if (file) data.append("media", file);
            try { await api.post("/advertisements", data); setOpen(false); push("success", "Advertisement is live"); await client.invalidateQueries({ queryKey: ["my-ads"] }); }
            catch (error) { push("error", errorMessage(error)); }
          }}>Publish free ad</Button>
        </div>
      </Modal>
    </div>
  );
}

export function VendorProductsPage() {
  const { push } = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["vendor-me"], queryFn: async () => (await api.get("/vendors/me")).data.data as VendorProfile | null });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [editing, setEditing] = useState<VendorProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editImage, setEditImage] = useState<File | null>(null);
  const products = query.data?.products || [];

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["vendor-me"] });
  }

  async function addProduct() {
    const data = new FormData();
    data.append("name", name.trim());
    data.append("price", price);
    if (image) data.append("image", image);
    try {
      await api.post("/vendors/me/products", data);
      setName(""); setPrice(""); setImage(null);
      push("success", "Product added");
      await refresh();
    } catch (error) { push("error", errorMessage(error)); }
  }

  function startEdit(product: VendorProduct) {
    setEditing(product);
    setEditName(product.name);
    setEditPrice(String(product.price));
    setEditImage(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const data = new FormData();
    data.append("name", editName.trim());
    data.append("price", editPrice);
    if (editImage) data.append("image", editImage);
    try {
      await api.patch(`/vendors/me/products/${editing._id}`, data);
      setEditing(null);
      push("success", "Product updated");
      await refresh();
    } catch (error) { push("error", errorMessage(error)); }
  }

  return (
    <div>
      <PageHeader title="Products" subtitle="Name and price are shown to visitors, the committee, and the admin. A photo is optional." />
      <div className="glass mb-4 grid gap-3 rounded-3xl p-4 md:grid-cols-2">
        <Field label="Product name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Price"><TextInput type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Image (optional)"><FileInput accept="image/jpeg,image/png,image/webp" onChange={(file) => setImage(file)} /></Field>
        <div className="flex items-end"><Button onClick={() => void addProduct()}>Add product</Button></div>
      </div>
      {query.isLoading ? <Skeleton className="h-32" /> : products.length === 0 ? <EmptyState title="No products yet." body="Add a name and price. You can attach a photo later." /> : products.map((product) => (
        <article key={product._id} className="glass mb-3 flex flex-wrap items-center gap-4 rounded-3xl p-4">
          {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="h-16 w-16 rounded-2xl bg-white/10" />}
          {editing?._id === product._id ? (
            <div className="grid min-w-[240px] flex-1 gap-2">
              <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} />
              <TextInput type="number" min="1" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              <FileInput accept="image/jpeg,image/png,image/webp" onChange={(file) => setEditImage(file)} />
              <div className="flex gap-2">
                <Button onClick={() => void saveEdit()}>Save</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-lg">{product.name}</p>
                <p className="text-sm text-[var(--muted)]">{inr(product.price)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => startEdit(product)}>Edit</Button>
                <Button variant="danger" onClick={async () => { await api.delete(`/vendors/me/products/${product._id}`); push("success", "Product removed"); await refresh(); }}>Delete</Button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

export function VendorFestivalsPage() {
  const query = useQuery({ queryKey: ["vendor-festivals"], queryFn: async () => (await api.get("/vendors/festivals")).data.data as { festId: string; name: string; district: string; distanceKm: number; startDate: string }[] });
  return (
    <div>
      <PageHeader title="Nearby festivals" subtitle="Festivals within 20 km of your business." />
      {(query.data || []).map((festival) => <article key={festival.festId} className="glass mb-3 rounded-3xl p-4"><h3>{festival.name}</h3><p className="text-sm text-[var(--muted)]">{festival.festId} · {festival.distanceKm} km · {festival.district} · {prettyDate(festival.startDate)}</p></article>)}
      {query.data && query.data.length === 0 && <EmptyState title="No festivals nearby." body="When a festival is created within 20 km, it will show here." />}
    </div>
  );
}

export function ActivitiesPage() {
  const notes = useQuery({ queryKey: ["activity-notes"], queryFn: async () => (await api.get("/notifications")).data.data as { _id: string; title: string; message: string; createdAt: string }[] });
  return (
    <div>
      <PageHeader title="Activities" subtitle="Updates for your festival." />
      {(notes.data || []).map((item) => <article key={item._id} className="glass mb-2 rounded-2xl px-4 py-3"><p>{item.title}</p><p className="text-sm text-[var(--muted)]">{item.message}</p></article>)}
      {notes.data && notes.data.length === 0 && <EmptyState title="No activity yet." body="Approvals, events and notes will collect here." />}
    </div>
  );
}
