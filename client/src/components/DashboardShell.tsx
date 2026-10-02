import { NavLink, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { Drawer, SearchBar } from "./ui";
import { FestFundAI } from "./FestFundAI";
import { api } from "../lib/api";
import { useAuth } from "../context/AppState";
import { useFestivalScope } from "../hooks/useFestivalScope";

export type NavItem = { to: string; label: string };

export function DashboardShell({ items, children }: { items: NavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [q, setQ] = useState("");
  const scope = useFestivalScope();
  const queryClient = useQueryClient();
  const appearance = user?.appearance || "dark";
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data as { data: { _id: string; title: string; message: string; read: boolean; link?: string }[]; meta: { unread: number } },
  });
  const search = useQuery({
    queryKey: ["search", q],
    enabled: q.trim().length > 1,
    queryFn: async () => (await api.get("/search", { params: { q } })).data.data as { label: string; hint: string; href: string }[],
  });

  const sidebar = (
    <div className="flex h-full flex-col">
      <NavLink to="/" className="mb-6 flex items-center gap-3" onClick={() => setOpen(false)}>
        <Logo className="h-16 w-16" />
        <span className="text-lg font-semibold tracking-wide">FestFund</span>
      </NavLink>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard">
        {items.map((item) => (
          <NavLink key={item.label} to={item.to} end={item.to.split("/").length <= 2} onClick={() => setOpen(false)} className={({ isActive }) => `rounded-2xl px-3 py-2.5 text-sm ${isActive ? "fest-gradient text-white" : "text-white/75 hover:bg-white/5"}`}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button className="mt-4 rounded-2xl px-3 py-2 text-left text-sm text-white/70 hover:bg-white/5" onClick={() => { void logout().then(() => navigate("/")); }}>Log out</button>
    </div>
  );

  return (
    <div className={`dashboard ${appearance === "light" ? "light" : ""}`}>
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-auto border-r border-white/10 bg-[#120a06] p-4 text-white lg:block">{sidebar}</aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg)]/80 px-4 py-3 backdrop-blur-xl">
            <button className="rounded-full p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></button>
            <Logo className="h-10 w-10 lg:hidden" />
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 opacity-50 sm:block" />
              <div className="sm:pl-6"><SearchBar value={q} onChange={setQ} placeholder="Search festivals or donors" /></div>
              {search.data && search.data.length > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-2xl border border-white/10 bg-[#1a100b] p-2 text-sm shadow-xl">
                  {search.data.map((item) => (
                    <button key={item.href + item.label} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/5" onClick={() => { setQ(""); navigate(item.href); }}>
                      <span className="block">{item.label}</span>
                      <span className="text-xs text-[var(--muted)]">{item.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {user?.role !== "VENDOR" && scope.festivals.length > 0 && (
              <label className="text-xs">
                <span className="sr-only">Active festival</span>
                <select value={scope.festId} onChange={(e) => scope.setFestId(e.target.value)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                  {scope.festivals.map((f) => <option key={f.festId} value={f.festId}>{f.festId}</option>)}
                </select>
              </label>
            )}
            <button className="relative rounded-full p-2" aria-label="Notifications" onClick={() => setNotesOpen((v) => !v)}>
              <Bell />
              {(notes.data?.meta.unread || 0) > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-festival" />}
            </button>
            <NavLink to={user?.role === "VENDOR" ? "/vendor/settings" : user?.role === "COMMITTEE" ? "/committee/profile" : "/admin/settings"} className="flex items-center gap-2 text-sm">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full fest-gradient text-xs font-bold text-white">{user?.name.slice(0, 1)}</span>}
              <span className="hidden md:inline">{user?.name}</span>
            </NavLink>
          </header>
          {notesOpen && (
            <div className="absolute right-4 z-40 mt-2 w-[min(92vw,360px)] rounded-3xl border border-white/10 bg-[#1a100b] p-3 text-white shadow-2xl">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>Notifications</span>
                <button className="text-festival" onClick={async () => { await api.patch("/notifications/read-all"); await queryClient.invalidateQueries({ queryKey: ["notifications"] }); }}>Mark all read</button>
              </div>
              <div className="max-h-80 space-y-2 overflow-auto">
                {(notes.data?.data || []).length === 0 && <p className="p-3 text-sm text-white/60">You are all caught up.</p>}
                {notes.data?.data.map((note) => (
                  <button key={note._id} className={`block w-full rounded-2xl px-3 py-2 text-left text-sm ${note.read ? "opacity-60" : "bg-white/5"}`} onClick={async () => { await api.patch(`/notifications/${note._id}/read`); setNotesOpen(false); if (note.link) navigate(note.link); await queryClient.invalidateQueries({ queryKey: ["notifications"] }); }}>
                    <span className="block font-medium">{note.title}</span>
                    <span className="text-white/70">{note.message}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <main className="px-4 py-6 pb-24 md:px-8">{children}</main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-[#120a06]/95 px-2 py-2 text-[11px] text-white lg:hidden" aria-label="Mobile">
        {items.slice(0, 4).map((item) => (
          <NavLink key={item.label} to={item.to} className="px-2 py-1 text-center">{item.label.split(" ")[0]}</NavLink>
        ))}
        <button onClick={() => setOpen(true)}>More</button>
      </nav>
      <Drawer open={open} onClose={() => setOpen(false)}>{sidebar}</Drawer>
      {user?.role !== "VENDOR" && <FestFundAI festivalId={scope.festId} festivalName={scope.current?.name} role={user?.role === "ADMIN" || user?.role === "COMMITTEE" ? user.role : "VISITOR"} />}
    </div>
  );
}
