import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage, type Ad } from "../lib/api";
import { useToast } from "../context/AppState";

export function AdCarousel({ ads }: { ads: Ad[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || ads.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % ads.length), 4200);
    return () => window.clearInterval(timer);
  }, [paused, ads.length]);
  useEffect(() => {
    const ad = ads[index];
    if (ad) void api.post(`/public/advertisements/${ad._id}/view`).catch(() => undefined);
  }, [index, ads]);
  if (!ads.length) {
    return <div className="rounded-[2rem] border border-dashed border-orange-200 bg-white px-6 py-16 text-center text-sm text-ink/60">Vendor advertisements will appear here. Advertising is free.</div>;
  }
  const ad = ads[index];
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-[#1a0d05] text-white" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="grid min-h-72 md:grid-cols-2">
        <div className="flex flex-col justify-center p-8 md:p-12">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{ad.category || "Local business"} · Free</p>
          <h3 className="mt-3 font-display text-4xl">{ad.title}</h3>
          <p className="mt-3 max-w-md text-white/75">{ad.description}</p>
          <p className="mt-4 text-sm text-white/60">{ad.businessAddress}</p>
          {ad.contactNumber && <a className="mt-4 text-sm text-amber-200" href={`tel:${ad.contactNumber}`}>{ad.contactNumber}</a>}
        </div>
        <div className="min-h-56 bg-orange-950/40">
          {ad.mediaType === "video" && ad.mediaUrl ? <video src={ad.mediaUrl} className="h-full w-full object-cover" controls /> : ad.mediaUrl ? <img src={ad.mediaUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/40">No media yet</div>}
        </div>
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex gap-2">
          <button aria-label="Previous advertisement" className="rounded-full border border-white/20 px-3 py-1" onClick={() => setIndex((i) => (i - 1 + ads.length) % ads.length)}>Prev</button>
          <button aria-label="Next advertisement" className="rounded-full border border-white/20 px-3 py-1" onClick={() => setIndex((i) => (i + 1) % ads.length)}>Next</button>
        </div>
        <div className="flex gap-1" aria-label="Advertisement pages">
          {ads.map((item, i) => <button key={item._id} aria-label={`Show advertisement ${i + 1}`} className={`h-2 w-2 rounded-full ${i === index ? "bg-amber-300" : "bg-white/30"}`} onClick={() => setIndex(i)} />)}
        </div>
      </div>
    </div>
  );
}

export function EnterFestPage() {
  const [festId, setFestId] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { push } = useToast();
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <form className="w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-xl" onSubmit={async (e) => {
        e.preventDefault();
        const id = festId.trim().toUpperCase();
        setBusy(true);
        try {
          await api.get(`/public/festivals/${id}/validate`);
          navigate(`/festival/${id}`);
        } catch (error) {
          push("error", errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}>
        <Link to="/" className="text-sm text-deep">Back home</Link>
        <h1 className="mt-4 font-display text-4xl">Enter Fest ID</h1>
        <p className="mt-2 text-sm text-ink/70">You will see only the festival that matches this ID.</p>
        <input required value={festId} onChange={(e) => setFestId(e.target.value.toUpperCase())} placeholder="FEST-WGL-2026-001" className="mt-6 w-full rounded-2xl border border-orange-100 px-4 py-3" />
        <button disabled={busy} className="fest-gradient mt-4 w-full rounded-full py-3 font-semibold text-white">{busy ? "Checking…" : "Open festival"}</button>
      </form>
    </div>
  );
}
