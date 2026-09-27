import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, Images, MapPin, ShieldCheck, Sparkles, Store, Wallet } from "lucide-react";
import { Logo } from "../components/Logo";
import { FestivalAtmosphere } from "../components/FestivalAtmosphere";
import { AnimatedNumber, Button } from "../components/ui";
import { api, errorMessage, inr, prettyDate, type Ad } from "../lib/api";
import { useMotionPref, useToast } from "../context/AppState";
import { AdCarousel } from "./AdCarousel";

export default function LandingPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { reduced, setReduced } = useMotionPref();
  const [festId, setFestId] = useState("");
  const [busy, setBusy] = useState(false);
  const stats = useQuery({
    queryKey: ["landing"],
    queryFn: async () => (await api.get("/public/landing")).data.data as {
      festivals: number; donors: number; contributions: number; balance: number; vendors: number; events: number;
      featured: { name: string; festId: string; district: string; startDate: string; endDate: string; type: string }[];
    },
  });
  const ads = useQuery({ queryKey: ["public-ads"], queryFn: async () => (await api.get("/public/advertisements")).data.data as Ad[] });

  useEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".hero-logo", { scale: 0.86, opacity: 0, duration: 1, ease: "power3.out" });
      gsap.from(".hero-copy", { y: 28, opacity: 0, duration: 0.8, stagger: 0.08, delay: 0.15 });
    });
    return () => ctx.revert();
  }, [reduced]);

  async function enterFest(event: React.FormEvent) {
    event.preventDefault();
    const id = festId.trim().toUpperCase();
    if (!id) return;
    setBusy(true);
    try {
      await api.get(`/public/festivals/${id}/validate`);
      navigate(`/festival/${id}`);
    } catch (error) {
      push("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const revealAt = (index = 0) => reduced ? {} : {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.55, delay: index * 0.08 },
  };
  const hover = reduced ? {} : { whileHover: { y: -6, scale: 1.015 }, transition: { type: "spring" as const, stiffness: 260, damping: 18 } };
  const logins = [
    ["Admin", "/login/admin"],
    ["Committee", "/login/committee"],
    ["Vendor", "/login/vendor"],
  ] as const;

  return (
    <div className={`min-h-screen bg-cream text-ink ${reduced ? "motion-off" : ""}`}>
      <div className="overflow-hidden border-b border-orange-200/70 bg-[#1a0d05] text-amber-100">
        <div className="marquee-track flex w-max gap-10 py-2 text-xs font-semibold uppercase tracking-[0.28em]">
          {Array.from({ length: 2 }, (_, copy) => (
            <span key={copy} className="flex gap-10 px-5">
              <span>Celebrate together</span><span className="text-rose-300">•</span>
              <span>Manage transparently</span><span className="text-orange-300">•</span>
              <span>Connect locally</span><span className="text-amber-300">•</span>
              <span>Free vendor advertising</span><span className="text-fuchsia-300">•</span>
              <span>One Fest ID</span><span className="text-rose-300">•</span>
            </span>
          ))}
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-orange-100/80 bg-cream/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2"><Logo className="h-12 w-12" /><span className="font-semibold">FestFund</span></Link>
          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Primary">
            <a href="#about">About</a><a href="#how">How it works</a><a href="#transparency">Transparency</a><a href="#vendors">Vendors</a>
          </nav>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2" aria-label="Sign in">
              {logins.map(([label, to]) => (
                <Link key={to} to={to}><Button variant="outline" className="px-4 py-2">{label}</Button></Link>
              ))}
            </div>
            <Link to="/enter-fest"><Button>Enter Fest ID</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="orb pointer-events-none absolute -left-16 top-6 h-80 w-80 rounded-full bg-orange-400/45 blur-3xl" />
        <div className="orb orb-slow pointer-events-none absolute right-0 top-10 h-96 w-96 rounded-full bg-rose-400/35 blur-3xl" />
        <div className="orb pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-fuchsia-400/25 blur-3xl" style={{ animationDelay: "-3s" }} />
        <div className="orb orb-slow pointer-events-none absolute right-1/4 bottom-8 h-52 w-52 rounded-full bg-amber-300/60 blur-3xl" style={{ animationDelay: "-6s" }} />
        <FestivalAtmosphere />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
          <div>
            <div className="hero-logo relative mb-8 w-fit">
              <span className="rangoli-ring" aria-hidden />
              <span className="float-logo inline-flex rounded-full bg-white/70 p-2 shadow-xl shadow-rose-200/70"><Logo className="h-28 w-28" /></span>
            </div>
            <p className="hero-copy text-xs font-semibold uppercase tracking-[0.28em] text-rose-600">Festival operating system</p>
            <h1 className="hero-copy mt-3 font-display text-6xl leading-none md:text-8xl">
              {"FESTFUND".split("").map((letter, index) => (
                <motion.span
                  key={`${letter}-${index}`}
                  className="gradient-flow inline-block bg-gradient-to-r from-orange-600 via-rose-500 to-amber-500 bg-clip-text text-transparent"
                  initial={reduced ? false : { y: 48, opacity: 0, rotate: -8 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.15 + index * 0.06, type: "spring", stiffness: 220, damping: 16 }}
                >{letter}</motion.span>
              ))}
            </h1>
            <p className="hero-copy mt-4 max-w-xl text-lg text-ink/80">Celebrate Together • Manage Transparently • Connect Locally</p>
            <p className="hero-copy mt-4 max-w-lg text-sm leading-6 text-ink/70">Run the festival, publish the accounts, and let neighbours find the people who build the stage, cook the meals and light the street.</p>
            <form onSubmit={enterFest} className="hero-copy mt-8 flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Fest ID</span>
                <input value={festId} onChange={(e) => setFestId(e.target.value.toUpperCase())} placeholder="FEST-WGL-2026-001" className="w-full rounded-full border border-orange-200 bg-white px-5 py-3 outline-none focus:ring-4 focus:ring-orange-200" />
              </label>
              <Button type="submit" loading={busy}>Enter Fest ID <ArrowRight className="h-4 w-4" /></Button>
            </form>
            <div className="hero-copy mt-4 flex flex-wrap gap-3">
              <Link to="/register/admin"><Button variant="outline">Become Admin</Button></Link>
              <Link to="/register/vendor"><Button variant="outline">Become Vendor</Button></Link>
              <Link to="/register/committee" className="self-center text-sm underline decoration-orange-300">Join as committee</Link>
            </div>
          </div>
          <motion.div {...revealAt(0)} {...hover} className="sheen rounded-[2rem] border border-white/20 bg-gradient-to-br from-[#2a120c] via-[#4c1d4e] to-[#9a3412] p-6 text-white shadow-2xl shadow-rose-900/30">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Live ledger preview</p>
            <p className="mt-4 font-display text-4xl">{stats.data ? <AnimatedNumber value={stats.data.contributions} format={inr} /> : "—"}</p>
            <p className="text-sm text-white/60">Contributions recorded across festivals</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Festivals", stats.data?.festivals || 0],
                ["Donors", stats.data?.donors || 0],
                ["Events", stats.data?.events || 0],
                ["Vendors", stats.data?.vendors || 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-white/5 p-4">
                  <p className="text-white/50">{label}</p>
                  <p className="mt-1 text-2xl"><AnimatedNumber value={Number(value)} /></p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-6xl px-4 py-16">
        <motion.div {...revealAt(0)} className="grid gap-8 rounded-[2rem] bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 p-8 md:grid-cols-[0.8fr_1.2fr]">
          <h2 className="font-display text-4xl">About FestFund</h2>
          <p className="text-lg leading-8 text-ink/75">FestFund is the operating record for a festival. Admins keep donors, expenses and events in one place. Visitors open a single Fest ID and see only that celebration. Committee members join after approval. Local vendors introduce their work for free.</p>
        </motion.div>
      </section>

      <section id="how" className="relative overflow-hidden bg-gradient-to-br from-[#1a0d05] via-[#3b1230] to-[#7c2d12] py-16 text-white">
        <div className="orb pointer-events-none absolute -left-10 top-8 h-56 w-56 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="orb orb-slow pointer-events-none absolute right-0 bottom-0 h-64 w-64 rounded-full bg-amber-400/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="draw-line absolute left-8 right-8 top-10 hidden h-px bg-gradient-to-r from-orange-300 via-rose-300 to-amber-200 md:block" />
          <div className="grid gap-6 md:grid-cols-4">
          {[
            ["01", "Create", "An admin opens a festival and receives a Fest ID.", "from-orange-400 to-amber-300"],
            ["02", "Approve", "Committee members request access. Nothing opens until an admin agrees.", "from-rose-400 to-orange-300"],
            ["03", "Publish", "Visitors enter the Fest ID and see that festival alone.", "from-fuchsia-400 to-rose-300"],
            ["04", "Connect", "Nearby vendors share free advertisements with the crowd.", "from-amber-300 to-orange-400"],
          ].map(([n, title, body, wash], index) => (
            <motion.article key={n} {...revealAt(index)} {...hover} className="rounded-3xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm">
              <p className={`w-fit bg-gradient-to-r ${wash} bg-clip-text text-lg font-semibold text-transparent`}>{n}</p>
              <h3 className="mt-3 text-2xl">{title}</h3>
              <p className="mt-2 text-sm text-white/70">{body}</p>
            </motion.article>
          ))}
          </div>
        </div>
      </section>

      <section id="manage" className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "Festival management", body: "Multiple festivals, isolated records, and a Fest ID that never mixes two celebrations.", wash: "from-orange-100 to-amber-50 text-orange-700" },
          { icon: Wallet, title: "Transparency", body: "Contributions, expenses and the balance sit in the open for the selected festival.", wash: "from-rose-100 to-orange-50 text-rose-700" },
          { icon: CalendarDays, title: "Events", body: "A calendar, statuses and a public schedule from opening to immersion.", wash: "from-fuchsia-100 to-rose-50 text-fuchsia-700" },
          { icon: Images, title: "Gallery", body: "Photos and videos stay at the quality you uploaded.", wash: "from-amber-100 to-yellow-50 text-amber-800" },
          { icon: Store, title: "Nearby vendors", body: "Businesses within a chosen radius, with a graceful list if maps are not configured.", wash: "from-teal-100 to-emerald-50 text-teal-800" },
          { icon: Sparkles, title: "Free advertising", body: "Vendors publish banners and films. There is no subscription in this version.", wash: "from-amber-100 to-orange-50 text-amber-700" },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
          <motion.article key={item.title} {...revealAt(index)} {...hover} className={`lift rounded-3xl border border-white bg-gradient-to-br ${item.wash} p-6`}>
            <Icon className="h-6 w-6" />
            <h3 className="mt-4 text-xl">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink/70">{item.body}</p>
          </motion.article>
          );
        })}
      </section>

      <section id="transparency" className="mx-auto max-w-6xl px-4 pb-8">
        <div className="gradient-flow rounded-[2rem] bg-gradient-to-br from-orange-600 via-rose-500 to-amber-400 p-8 text-white shadow-xl shadow-rose-300/40 md:p-12">
          <h2 className="font-display text-4xl">The balance is simple</h2>
          <p className="mt-3 max-w-xl text-white/90">Balance = Total contributions − Total expenses. FestFund does not take online donations. An admin types each contribution by hand.</p>
          <p className="mt-6 font-display text-5xl">{stats.data ? inr(stats.data.balance) : "—"}</p>
          <p className="text-sm text-white/80">Combined balance currently on record</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-4xl">Festivals on the record</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(stats.data?.featured || []).map((festival) => (
            <motion.div key={festival.festId} {...revealAt(0)} {...hover}>
              <Link to={`/festival/${festival.festId}`} className="block rounded-3xl border border-rose-100 bg-gradient-to-br from-white to-orange-50 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-deep">{festival.type}</p>
              <h3 className="mt-2 text-2xl">{festival.name}</h3>
              <p className="mt-1 font-medium text-festival">{festival.festId}</p>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink/70"><MapPin className="h-4 w-4" /> {festival.district}</p>
              <p className="text-sm text-ink/70">{prettyDate(festival.startDate)} – {prettyDate(festival.endDate)}</p>
              </Link>
            </motion.div>
          ))}
          {!stats.data?.featured?.length && <p className="text-sm text-ink/60">Festivals will appear here once an admin creates one.</p>}
        </div>
      </section>

      <section id="vendors" className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-4xl">Local advertisements</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-deep">Free advertising</span>
        </div>
        <AdCarousel ads={ads.data || []} />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-[2rem] border border-rose-100 bg-gradient-to-br from-white via-orange-50 to-rose-50 px-6 py-12 text-center shadow-lg shadow-orange-100">
          <Logo className="mx-auto h-20 w-20" />
          <h2 className="mt-4 font-display text-4xl">Open a festival, or walk into one.</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/enter-fest"><Button>Enter Fest ID</Button></Link>
            <Link to="/register/admin"><Button variant="outline">Become Admin</Button></Link>
            <Link to="/register/vendor"><Button variant="outline">Become Vendor</Button></Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#1a0d05] px-4 py-10 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3"><Logo className="h-12 w-12" /><div><p className="font-semibold">FestFund</p><p className="text-sm text-white/60">Celebrate Together • Manage Transparently • Connect Locally</p></div></div>
          <div className="flex flex-wrap items-center gap-2 text-white">
            {logins.map(([label, to]) => (
              <Link key={to} to={to}><Button variant="outline" className="border-white/30 px-4 py-2 text-white hover:bg-white/10">{label}</Button></Link>
            ))}
            <button className="underline" aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
              {reduced ? "Enable motion" : "Reduce motion"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
