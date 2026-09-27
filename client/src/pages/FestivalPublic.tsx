import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Logo } from "../components/Logo";
import { AdCarousel } from "./AdCarousel";
import { AnimatedNumber, Badge, Button, EmptyState, Skeleton, Tabs } from "../components/ui";
import { api, errorMessage, inr, prettyDate, type Ad, type Donor, type Expense, type FestEvent, type GalleryItem } from "../lib/api";
import { useToast } from "../context/AppState";

type Payload = {
  festival: {
    name: string; type: string; description: string; startDate: string; endDate: string; district: string; village: string; state: string;
    address: string; festId: string; imageUrl?: string; latitude?: number; longitude?: number; contactName?: string; contactMobile?: string;
  };
  donors: Donor[];
  expenses: Expense[];
  events: FestEvent[];
  gallery: GalleryItem[];
  committee: { name: string }[];
  finance: { contributions: number; expenses: number; balance: number; donorCount: number };
};

async function saveBlob(url: string, filename: string) {
  const response = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export default function FestivalPublic() {
  const { festId = "" } = useParams();
  const { push } = useToast();
  const [tab, setTab] = useState("overview");
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const query = useQuery({
    queryKey: ["public-festival", festId],
    queryFn: async () => (await api.get(`/public/festivals/${festId}`)).data.data as Payload,
  });
  const nearby = useQuery({
    queryKey: ["nearby", festId],
    enabled: Boolean(query.data),
    queryFn: async () => (await api.get("/public/vendors/nearby", { params: { festId, radius: 20 } })).data as { data: { _id: string; businessName: string; category: string; distanceKm: number | null; village: string; district: string; logoUrl?: string; contactMobile?: string; description?: string; images?: { url: string }[]; products?: { _id: string; name: string; price: number; imageUrl?: string }[] }[]; meta: { mapsConfigured: boolean } },
  });
  const ads = useQuery({ queryKey: ["public-ads"], queryFn: async () => (await api.get("/public/advertisements")).data.data as Ad[] });
  const [vendorId, setVendorId] = useState<string | null>(null);

  if (query.isLoading) return <div className="min-h-screen bg-[#0d0805] p-6"><Skeleton className="h-72" /><div className="mt-4 grid gap-3 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div></div>;
  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 text-center">
        <Logo className="h-20 w-20" />
        <h1 className="mt-4 font-display text-4xl">Fest ID not found</h1>
        <p className="mt-2 text-ink/70">Check the ID and try again. Nothing else is shown.</p>
        <Link to="/enter-fest" className="mt-6 underline">Enter another Fest ID</Link>
      </div>
    );
  }
  const { festival, finance } = query.data;
  async function downloadReceipt(donor: Donor) {
    try {
      await saveBlob(`/public/festivals/${festival.festId}/donors/${donor._id}/receipt`, `${donor.name}-receipt.pdf`);
      push("success", "Receipt downloaded");
    } catch (error) { push("error", errorMessage(error)); }
  }
  async function downloadReport(type: "donors" | "expenses", format: "pdf" | "xlsx") {
    try {
      await saveBlob(`/public/festivals/${festival.festId}/reports/${type}?format=${format}`, `${type}-${festival.festId}.${format}`);
      push("success", format === "pdf" ? "PDF downloaded" : "Excel downloaded");
    } catch (error) { push("error", errorMessage(error)); }
  }
  const vendor = nearby.data?.data.find((v) => v._id === vendorId);
  const photos = query.data.gallery.filter((g) => g.kind === "photo");
  const videos = query.data.gallery.filter((g) => g.kind === "video");

  return (
    <div className="min-h-screen bg-[#0d0805] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2"><Logo className="h-11 w-11" /><span>FestFund</span></Link>
        <Link to="/enter-fest" className="text-sm text-amber-200">Change Fest ID</Link>
      </header>
      <section className="relative mx-4 overflow-hidden rounded-[2rem] md:mx-auto md:max-w-6xl" style={{ backgroundImage: festival.imageUrl ? `url(${festival.imageUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="bg-gradient-to-r from-black/80 via-black/55 to-orange-900/30 px-6 py-16 md:px-12">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-200">FestFund</p>
          <h1 className="mt-3 font-display text-5xl md:text-7xl">{festival.name}</h1>
          <p className="mt-3 inline-flex rounded-full bg-white/10 px-4 py-1 text-amber-100">{festival.festId}</p>
          <p className="mt-4 flex items-center gap-2 text-white/80"><MapPin className="h-4 w-4" /> {festival.village}, {festival.district}</p>
          <p className="text-white/80">{prettyDate(festival.startDate)} – {prettyDate(festival.endDate)}</p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-3 md:grid-cols-3">
          <article className="glass rounded-3xl p-5"><p className="text-xs text-[var(--muted)]">Contributions</p><p className="mt-2 text-3xl"><AnimatedNumber value={finance.contributions} format={inr} /></p></article>
          <article className="glass rounded-3xl p-5"><p className="text-xs text-[var(--muted)]">Expenses</p><p className="mt-2 text-3xl"><AnimatedNumber value={finance.expenses} format={inr} /></p></article>
          <article className="glass rounded-3xl p-5"><p className="text-xs text-[var(--muted)]">Balance</p><p className="mt-2 text-3xl"><AnimatedNumber value={finance.balance} format={inr} /></p></article>
        </div>
        <div className="mt-8">
          <Tabs value={tab} onChange={setTab} tabs={["Overview", "Donors", "Expenses", "Events", "Photos", "Videos", "Committee", "Reports", "Nearby Vendors", "Advertisements"].map((label) => ({ id: label.toLowerCase().replace(" ", "-"), label }))} />
          {tab === "overview" && <p className="max-w-3xl leading-7 text-white/80">{festival.description}</p>}
          {tab === "donors" && (
            <div className="space-y-3">
              <ReportDownloads onDownload={downloadReport} />
              {query.data.donors.length ? query.data.donors.map((donor) => (
                <article key={donor._id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
                  <span>{donor.name} · {donor.category} · {inr(donor.amount)} · {prettyDate(donor.date)}</span>
                  <Button className="px-4 py-2" onClick={() => void downloadReceipt(donor)}>Download receipt</Button>
                </article>
              )) : <EmptyState title="No donors added yet." body="The admin has not entered contribution records for this festival." />}
            </div>
          )}
          {tab === "expenses" && (query.data.expenses.length ? <RecordList rows={query.data.expenses.map((e) => `${e.description} · ${e.category} · ${inr(e.amount)} · ${prettyDate(e.date)}`)} /> : <EmptyState title="No expenses yet." body="Spending will appear here once the admin records it." />)}
          {tab === "events" && <EventList events={query.data.events} />}
          {tab === "photos" && <MediaGrid items={photos} onOpen={setLightbox} />}
          {tab === "videos" && <MediaGrid items={videos} onOpen={setLightbox} />}
          {tab === "committee" && (query.data.committee.length ? <RecordList rows={query.data.committee.map((m) => m.name)} /> : <EmptyState title="Committee list is empty." body="Approved members will be listed here." />)}
          {tab === "reports" && (
            <div className="glass space-y-4 rounded-3xl p-6">
              <p className="text-sm text-white/70">Public summary for {festival.festId}. Each donor can also download their own receipt from the Donors tab.</p>
              <p>Donors {finance.donorCount} · Contributions {inr(finance.contributions)} · Expenses {inr(finance.expenses)} · Balance {inr(finance.balance)}</p>
              <ReportDownloads onDownload={downloadReport} />
            </div>
          )}
          {tab === "nearby-vendors" && (
            <div className="space-y-3">
              {festival.latitude != null && festival.longitude != null && <iframe title="Festival map" className="h-64 w-full rounded-3xl border-0" src={`https://maps.google.com/maps?q=${festival.latitude},${festival.longitude}&z=14&output=embed`} />}
              {(nearby.data?.data || []).map((item) => (
                <button key={item._id} onClick={() => setVendorId(item._id)} className="glass lift flex w-full items-center gap-4 rounded-3xl p-4 text-left">
                  {item.logoUrl ? <img src={item.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="h-16 w-16 rounded-2xl bg-white/10" />}
                  <div>
                    <p className="text-lg">{item.businessName}</p>
                    <p className="text-sm text-white/60">{item.category} · {item.distanceKm != null ? `${item.distanceKm} km` : item.district} · {item.village}</p>
                    {(item.products || []).length > 0 && <p className="text-sm text-amber-200">{item.products?.map((product) => `${product.name} ${inr(product.price)}`).join(" · ")}</p>}
                  </div>
                </button>
              ))}
              {nearby.data && nearby.data.data.length === 0 && <EmptyState title="No vendors within 20 km." body="Businesses closer to this festival will show up here." />}
            </div>
          )}
          {tab === "advertisements" && <AdCarousel ads={ads.data || []} />}
        </div>
      </div>
      {vendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label={vendor.businessName}>
          <div className="w-full max-w-lg rounded-3xl bg-[#1a100b] p-6">
            <h2 className="text-2xl">{vendor.businessName}</h2>
            <p className="text-amber-200">{vendor.category}</p>
            <p className="mt-3 text-sm text-white/75">{vendor.description}</p>
            <p className="mt-2 text-sm">{vendor.contactMobile}</p>
            {(vendor.products || []).length > 0 && (
              <ul className="mt-4 space-y-2">
                {vendor.products?.map((product) => (
                  <li key={product._id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" /> : null}
                    <span className="flex-1">{product.name}</span>
                    <span>{inr(product.price)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="mt-4 text-sm underline" onClick={() => setVendorId(null)}>Close</button>
          </div>
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-label={lightbox.title}>
          {lightbox.kind === "video" ? <video src={lightbox.url} controls autoPlay className="max-h-[80vh] max-w-full" /> : <img src={lightbox.url} alt={lightbox.title} className="max-h-[80vh] max-w-full" />}
          <div className="absolute bottom-6 flex gap-4 text-sm">
            <a href={`${api.defaults.baseURL}/gallery/${lightbox._id}/download`} className="underline">Download original</a>
            <button onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDownloads({ onDownload }: { onDownload: (type: "donors" | "expenses", format: "pdf" | "xlsx") => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button className="px-4 py-2" onClick={() => onDownload("donors", "pdf")}>Donation report PDF</Button>
      <Button variant="ghost" className="px-4 py-2" onClick={() => onDownload("donors", "xlsx")}>Donation report Excel</Button>
      <Button className="px-4 py-2" onClick={() => onDownload("expenses", "pdf")}>Expense report PDF</Button>
      <Button variant="ghost" className="px-4 py-2" onClick={() => onDownload("expenses", "xlsx")}>Expense report Excel</Button>
    </div>
  );
}

function RecordList({ rows }: { rows: string[] }) {
  return <ul className="space-y-2">{rows.map((row) => <li key={row} className="glass rounded-2xl px-4 py-3 text-sm">{row}</li>)}</ul>;
}

function EventList({ events }: { events: FestEvent[] }) {
  if (!events.length) return <EmptyState title="No events scheduled." body="Create your first festival event from the admin or committee dashboard." />;
  return <div className="grid gap-3 md:grid-cols-2">{events.map((event) => <article key={event._id} className="glass rounded-3xl p-5"><Badge>{event.status}</Badge><h3 className="mt-3 text-xl">{event.name}</h3><p className="text-sm text-white/70">{prettyDate(event.date)} · {event.startTime} {event.location}</p><p className="mt-2 text-sm text-white/80">{event.description}</p></article>)}</div>;
}

function MediaGrid({ items, onOpen }: { items: GalleryItem[]; onOpen: (item: GalleryItem) => void }) {
  if (!items.length) return <EmptyState title="No gallery items." body="Upload festival photos to get started." />;
  return <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">{items.map((item) => <button key={item._id} onClick={() => onOpen(item)} className="mb-3 block w-full overflow-hidden rounded-3xl">{item.kind === "video" ? <video src={item.url} className="w-full" /> : <img src={item.url} alt={item.title} className="w-full" />}<span className="block px-2 py-2 text-left text-sm">{item.title}</span></button>)}</div>;
}
