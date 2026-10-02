import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, errorMessage, inr, prettyDate, type Ad, type Analytics, type Donor, type Expense, type FestEvent, type GalleryItem, type Note } from "../lib/api";
import { useFestivalScope } from "../hooks/useFestivalScope";
import { LocationPicker } from "../components/LocationPicker";
import { useAuth, useMotionPref, useToast } from "../context/AppState";
import { AnimatedNumber, Badge, Button, ConfirmDialog, EmptyState, Field, FileInput, Modal, PageHeader, SearchBar, SelectInput, Skeleton, StatCard, Tabs, TextArea, TextInput, useDebounced } from "../components/ui";
import { AdCarousel, AdDetailsModal } from "./AdCarousel";

const colors = ["#FF6B00", "#FF8A00", "#FFC107", "#E65100", "#FFB300", "#8D4A1F"];

function todayLocal() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function useAnalytics(festId?: string) {
  return useQuery({
    queryKey: ["analytics", festId],
    enabled: Boolean(festId),
    queryFn: async () => (await api.get("/analytics", { params: { festId } })).data.data as Analytics,
  });
}

export function AdminHome() {
  const { festId, current, loading } = useFestivalScope();
  const query = useAnalytics(festId);
  const ads = useQuery({ queryKey: ["public-ads"], queryFn: async () => (await api.get("/public/advertisements")).data.data as Ad[] });
  if (loading || query.isLoading) return <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!festId) return <EmptyState title="Choose a festival" body="Select a festival in the header. The dashboard shows only that festival." />;
  const data = query.data;
  if (!data) return <EmptyState title="Analytics unavailable" body="The server could not load this festival." />;
  return (
    <div>
      <PageHeader title={current?.name || "Dashboard"} subtitle={`${festId} · figures for this festival only`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Festival" value={<span className="text-2xl">{festId}</span>} hint={current?.district} />
        <StatCard label="Total donors" value={<AnimatedNumber value={data.donors} />} />
        <StatCard label="Total contributions" value={<AnimatedNumber value={data.contributions} format={inr} />} />
        <StatCard label="Total expenses" value={<AnimatedNumber value={data.expenses} format={inr} />} />
        <StatCard label="Current balance" value={<AnimatedNumber value={data.balance} format={inr} />} hint="Contributions minus expenses" />
        <StatCard label="Committee members" value={<AnimatedNumber value={data.committee} />} />
        <StatCard label="Events" value={<AnimatedNumber value={data.events.total} />} hint={`${data.events.upcoming} upcoming`} />
        <StatCard label="Gallery items" value={<AnimatedNumber value={data.gallery} />} />
        <StatCard label="Nearby vendors" value={<AnimatedNumber value={data.nearbyVendors} />} hint="Within 20 km" />
      </div>
      <section className="mt-6"><h2 className="mb-3 text-xl">Local vendor advertisements</h2><AdCarousel ads={ads.data || []} /></section>
      <div className="mt-6"><FinanceCharts data={data} /></div>
    </div>
  );
}

export function FinanceCharts({ data }: { data: Analytics }) {
  if (!data.trend.length && !data.expenseByCategory.length) return <EmptyState title="No chart data yet." body="Add donors and expenses to see the festival accounts move." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="glass rounded-3xl p-4">
        <h2 className="mb-3 text-sm text-[var(--muted)]">Contributions and expenses</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={data.trend}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#B9B1AA" />
              <YAxis stroke="#B9B1AA" />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="contributions" stroke="#FFC107" fill="#FFC10733" />
              <Area type="monotone" dataKey="expenses" stroke="#FF6B00" fill="#FF6B0033" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className="glass rounded-3xl p-4">
        <h2 className="mb-3 text-sm text-[var(--muted)]">Expense categories</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data.expenseByCategory} dataKey="amount" nameKey="category" outerRadius={90}>
                {data.expenseByCategory.map((entry, index) => <Cell key={entry.category} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className="glass rounded-3xl p-4 lg:col-span-2">
        <h2 className="mb-3 text-sm text-[var(--muted)]">Balance view</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={[{ name: "Funds", contributions: data.contributions, expenses: data.expenses, balance: data.balance }]}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#B9B1AA" />
              <YAxis stroke="#B9B1AA" />
              <Tooltip />
              <Legend />
              <Bar dataKey="contributions" fill="#FFC107" />
              <Bar dataKey="expenses" fill="#FF6B00" />
              <Bar dataKey="balance" fill="#FF8A00" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </div>
  );
}

export function FestivalsPage() {
  const { festivals, setFestId, loading } = useFestivalScope();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  if (loading) return <Skeleton className="h-40" />;
  return (
    <div>
      <PageHeader title="My festivals" subtitle="Each Fest ID keeps its own donors, expenses, events and gallery." action={<Link to="/admin/festivals/create"><Button>Create festival</Button></Link>} />
      {festivals.length === 0 ? <EmptyState title="No festivals yet." body="Create your first festival to generate a Fest ID." action={<Link to="/admin/festivals/create"><Button>Create festival</Button></Link>} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {festivals.map((festival) => (
            <article key={festival.festId} className="glass lift rounded-3xl p-5">
              <h2 className="mt-2 text-2xl">{festival.name}</h2>
              <p className="text-amber-200">{festival.festId}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{festival.district}, {festival.state}</p>
              <p className="text-sm text-[var(--muted)]">{prettyDate(festival.startDate)} – {prettyDate(festival.endDate)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => { setFestId(festival.festId); navigator.clipboard.writeText(festival.festId); push("success", "Fest ID copied"); }}>Copy Fest ID</Button>
                <Link to={`/admin/festivals/${festival.festId}`}><Button variant="ghost">View festival</Button></Link>
                <Link to={`/festival/${festival.festId}`}><Button variant="ghost">Public page</Button></Link>
                <Button variant="danger" onClick={() => setPending(festival.festId)}>Delete</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog open={Boolean(pending)} title="Delete festival" body="This removes the festival and its records." loading={false} onClose={() => setPending(null)} onConfirm={async () => {
        if (!pending) return;
        try { await api.delete(`/festivals/${pending}`); push("success", "Festival removed"); await queryClient.invalidateQueries({ queryKey: ["my-festivals"] }); }
        catch (error) { push("error", errorMessage(error)); }
        setPending(null);
      }} />
    </div>
  );
}

const types = ["Ganesh Utsav", "Diwali", "Durga Puja", "Ugadi", "Sankranti", "Temple Festival", "Cultural Fair", "Other"];

export function CreateFestivalPage() {
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { push } = useToast();
  const queryClient = useQueryClient();
  const { setFestId } = useFestivalScope();
  const [form, setForm] = useState({
    name: "", type: "Ganesh Utsav", description: "", startDate: "", endDate: "", plannedExpenseBudget: "", address: "", village: "", district: "", state: "", pincode: "", latitude: "", longitude: "", contactName: "", contactMobile: "", contactEmail: "",
  });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit() {
    setLoading(true);
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    if (file) data.append("image", file);
    try {
      const response = await api.post("/festivals", data);
      setCreated(response.data.data.festId);
      setFestId(response.data.data.festId);
      await queryClient.invalidateQueries({ queryKey: ["my-festivals"] });
      push("success", "Festival created successfully");
    } catch (error) { push("error", errorMessage(error)); }
    finally { setLoading(false); }
  }
  if (created) {
    return (
      <div className="glass mx-auto max-w-xl rounded-[2rem] p-8 text-center">
        <p className="text-4xl">Festival created successfully</p>
        <p className="mt-4 text-sm text-[var(--muted)]">Your Fest ID</p>
        <p className="mt-2 font-display text-4xl text-amber-200">{created}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => { void navigator.clipboard.writeText(created); push("success", "Fest ID copied"); }}>Copy Fest ID</Button>
          <Link to={`/admin/festivals/${created}`}><Button variant="ghost">View festival</Button></Link>
        </div>
      </div>
    );
  }
  const steps = ["Identity", "Schedule", "Place", "Contact"];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create festival" subtitle={`Step ${step + 1} of ${steps.length}: ${steps[step]}`} />
      <div className="mb-4 flex gap-2">{steps.map((label, index) => <span key={label} className={`rounded-full px-3 py-1 text-xs ${index === step ? "fest-gradient text-white" : "bg-white/10"}`}>{label}</span>)}</div>
      <div className="glass space-y-4 rounded-3xl p-6">
        {step === 0 && <>
          <Field label="Festival name"><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Festival type"><SelectInput value={form.type} onChange={(e) => set("type", e.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</SelectInput></Field>
          <Field label="Description"><TextArea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Festival image"><FileInput accept="image/jpeg,image/png,image/webp" onChange={(file) => setFile(file)} /></Field>
        </>}
        {step === 1 && <>
          <Field label="Start date"><TextInput type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="End date"><TextInput type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
          <Field label="Planned expense budget (optional)" hint="Used for AI budget alerts and forecasts"><TextInput type="number" min="0" inputMode="decimal" placeholder="e.g. 500000" value={form.plannedExpenseBudget} onChange={(e) => set("plannedExpenseBudget", e.target.value)} /></Field>
        </>}
        {step === 2 && <>
          <Field label="Address"><TextInput value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Village / town"><TextInput value={form.village} onChange={(e) => set("village", e.target.value)} /></Field>
          <Field label="District"><TextInput value={form.district} onChange={(e) => set("district", e.target.value)} /></Field>
          <Field label="State"><TextInput value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
          <Field label="Pincode" hint="The map places this pincode"><TextInput inputMode="numeric" maxLength={6} placeholder="506002" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>
          <LocationPicker
            pincode={form.pincode}
            onPlace={(place) => setForm((current) => ({
              ...current,
              latitude: Number.isFinite(place.latitude) ? String(place.latitude) : current.latitude,
              longitude: Number.isFinite(place.longitude) ? String(place.longitude) : current.longitude,
              address: place.address || current.address,
              village: place.village || current.village,
              district: place.district || current.district,
              state: place.state || current.state,
            }))}
          />
        </>}
        {step === 3 && <>
          <Field label="Contact name"><TextInput value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
          <Field label="Contact mobile"><TextInput value={form.contactMobile} onChange={(e) => set("contactMobile", e.target.value)} /></Field>
          <Field label="Contact email"><TextInput value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
        </>}
        <div className="flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {step < 3 ? <Button onClick={() => setStep((s) => s + 1)}>Continue</Button> : <Button loading={loading} onClick={() => void submit()}>Create festival</Button>}
        </div>
      </div>
    </div>
  );
}

export function FestivalAdminDetail() {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const id = window.location.pathname.split("/").pop() || festId;
  const query = useQuery({ queryKey: ["festival", id], queryFn: async () => (await api.get(`/festivals/${id}`)).data.data });
  const [budget, setBudget] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  useEffect(() => {
    if (query.data) setBudget(query.data.plannedExpenseBudget == null ? "" : String(query.data.plannedExpenseBudget));
  }, [query.data]);
  if (query.isLoading) return <Skeleton className="h-48" />;
  if (!query.data) return <EmptyState title="Festival not found" body="This Fest ID is not in your account." />;
  const festival = query.data as { name: string; festId: string; description: string; district: string; plannedExpenseBudget?: number };
  return (
    <div>
      <PageHeader title={festival.name} subtitle={festival.festId} action={<Link to={`/festival/${festival.festId}`}><Button>Public page</Button></Link>} />
      <p className="mt-4 max-w-2xl text-[var(--muted)]">{festival.description}</p>
      <p className="mt-2 text-sm">{festival.district}</p>
      <form className="glass mt-5 max-w-xl space-y-3 rounded-2xl p-4" onSubmit={async (event) => {
        event.preventDefault();
        setSavingBudget(true);
        try {
          const value = budget.trim() ? Number(budget) : null;
          const response = await api.patch(`/festivals/${festival.festId}`, { plannedExpenseBudget: value });
          queryClient.setQueryData(["festival", id], response.data.data);
          await queryClient.invalidateQueries({ queryKey: ["my-festivals"] });
          push("success", value == null ? "Budget cleared" : "Budget saved");
        } catch (error) { push("error", errorMessage(error)); }
        finally { setSavingBudget(false); }
      }}>
        <Field label="Planned expense budget" hint="Optional; used for private staff alerts and AI forecasts"><TextInput type="number" min="0" inputMode="decimal" placeholder="No budget set" value={budget} onChange={(event) => setBudget(event.target.value)} /></Field>
        <Button type="submit" loading={savingBudget}>Save budget</Button>
      </form>
    </div>
  );
}

async function saveBlob(url: string, filename: string, params?: Record<string, string>) {
  const response = await api.get(url, { params, responseType: "blob" });
  const href = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

async function reportDownloadError(error: unknown) {
  const response = (error as { response?: { data?: unknown; status?: number } } | null)?.response;
  if (response?.data instanceof Blob) {
    const body = await response.data.text();
    try { return (JSON.parse(body) as { message?: string }).message || body; }
    catch { return body || (response.status ? `Report download failed (HTTP ${response.status})` : errorMessage(error)); }
  }
  return errorMessage(error);
}

export function DonorsPage({ canEdit }: { canEdit: boolean }) {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10000);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Donor | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["donors", festId, debounced, page, limit],
    enabled: Boolean(festId),
    queryFn: async () => (await api.get("/donors", { params: { festId, q: debounced, page, limit, sort: "date", dir: "desc" } })).data as { data: Donor[]; meta: { page: number; limit: number; total: number } },
  });
  const donors = query.data?.data || [];
  const totalDonors = query.data?.meta.total || 0;
  const blank = { name: "", mobile: "", amount: "" };
  const [form, setForm] = useState(blank);
  const [recordDate, setRecordDate] = useState(todayLocal);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  function openNew() { setEditing(null); setForm(blank); setRecordDate(todayLocal()); setSubmissionId(crypto.randomUUID()); setOpen(true); }
  function openEdit(donor: Donor) {
    setEditing(donor);
    setForm({ name: donor.name, mobile: donor.mobile || "", amount: String(donor.amount) });
    setRecordDate(donor.date.slice(0, 10));
    setOpen(true);
  }
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = { name: form.name, mobile: form.mobile, amount: Number(form.amount), date: recordDate, festId, category: "General", ...(!editing ? { submissionId } : {}) };
      if (editing) await api.patch(`/donors/${editing._id}`, payload);
      else await api.post("/donors", payload);
      setOpen(false);
      if (!editing) setSubmissionId(crypto.randomUUID());
      push("success", editing ? "Donor updated" : "Donor added");
      await client.invalidateQueries({ queryKey: ["donors"] });
      await client.invalidateQueries({ queryKey: ["analytics"] });
    } catch (error) { push("error", errorMessage(error)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function downloadReceipt(donor: Donor) {
    try {
      const created = await api.post("/receipts", { donorId: donor._id });
      const receipt = created.data.data as { _id: string; receiptNo: string };
      await saveBlob(`/receipts/${receipt._id}/pdf`, `${receipt.receiptNo}.pdf`);
      push("success", `Receipt ${receipt.receiptNo} downloaded`);
    } catch (error) { push("error", await reportDownloadError(error)); }
  }
  async function downloadReport(type: "donors" | "expenses", format: "pdf" | "xlsx") {
    try {
      await saveBlob(`/reports/${type}`, `${type}-${festId}.${format}`, { festId, format });
    } catch (error) { push("error", await reportDownloadError(error)); }
  }
  if (!festId) return <EmptyState title="Choose a festival" body="Create a festival before recording donors." />;
  return (
    <div>
      <PageHeader title="Donors" subtitle={`Recorded for ${festId}. The date is set to today.`} action={canEdit ? <Button onClick={openNew}>Add donor</Button> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => void downloadReport("donors", "pdf")}>Donation report PDF</Button>
        <Button variant="ghost" onClick={() => void downloadReport("donors", "xlsx")}>Donation report Excel</Button>
        <Button onClick={() => void downloadReport("expenses", "pdf")}>Expense report PDF</Button>
        <Button variant="ghost" onClick={() => void downloadReport("expenses", "xlsx")}>Expense report Excel</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search donations by donor, mobile, or category" />
        <SelectInput aria-label="Rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
          <option value={10000}>All records (up to 10,000)</option>
          {[20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
        </SelectInput>
      </div>
      {query.isLoading ? <Skeleton className="mt-4 h-40" /> : !donors.length ? <div className="mt-4"><EmptyState title={debounced ? "No donations match your search." : "No donors added yet."} body={debounced ? "Try another donor name, mobile number, or category." : "Add your first donor record."} /></div> : (
        <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalDonors)} of {totalDonors} donors</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
            <Button variant="ghost" disabled={page * limit >= totalDonors} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </div>
        <div className="mt-2 overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">Name</th><th>Mobile</th><th>Amount</th><th>Date</th><th>Receipt</th>{canEdit && <th>Actions</th>}</tr></thead>
            <tbody>
              {donors.map((donor) => (
                <tr key={donor._id} className="border-t border-white/10">
                  <td className="py-3">{donor.name}</td>
                  <td>{donor.mobile}</td>
                  <td>{inr(donor.amount)}</td>
                  <td>{prettyDate(donor.date)}</td>
                  <td><button className="underline" onClick={() => void downloadReceipt(donor)}>Download receipt</button></td>
                  {canEdit && <td className="space-x-2"><button className="underline" onClick={() => openEdit(donor)}>Edit</button><button className="underline" onClick={() => setRemoveId(donor._id)}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Modal open={open} title={editing ? "Edit donor" : "Add donor"} onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <p className="text-sm text-white/70">{festId} · {prettyDate(recordDate)}</p>
          <Field label="Donor name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Mobile number"><TextInput inputMode="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          <Field label="Amount"><TextInput type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Button loading={saving} onClick={() => void save()}>{saving ? "Saving donor" : "Save record"}</Button>
        </div>
      </Modal>
      <ConfirmDialog open={Boolean(removeId)} title="Delete donor" body="This contribution will leave the festival totals." onClose={() => setRemoveId(null)} onConfirm={async () => {
        if (!removeId) return;
        await api.delete(`/donors/${removeId}`);
        setRemoveId(null);
        await client.invalidateQueries({ queryKey: ["donors"] });
        push("success", "Donor record removed");
      }} />
    </div>
  );
}

const expenseCategories = ["Decoration", "Stage", "Lighting", "Sound", "Food", "Transport", "Other"];

export function ExpensesPage({ canEdit }: { canEdit: boolean }) {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const client = useQueryClient();
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", category: "Decoration", date: todayLocal() });
  const [bill, setBill] = useState<File | null>(null);
  const query = useQuery({
    queryKey: ["expenses", festId, category, debounced],
    enabled: Boolean(festId),
    queryFn: async () => (await api.get("/expenses", { params: { festId, category: category || undefined, q: debounced || undefined } })).data.data as Expense[],
  });
  const totals = useMemo(() => (query.data || []).reduce((sum, item) => sum + item.amount, 0), [query.data]);
  if (!festId) return <EmptyState title="Choose a festival" body="Expenses belong to one Fest ID." />;
  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${festId} · recorded spend ${inr(totals)}`} action={canEdit ? <Button onClick={() => { setForm({ description: "", amount: "", category: "Decoration", date: todayLocal() }); setOpen(true); }}>Add expense</Button> : undefined} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]"><SearchBar value={q} onChange={setQ} placeholder="Search expenses by description" /><SelectInput value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</SelectInput></div>
      {query.isLoading ? <Skeleton className="mt-4 h-40" /> : !query.data?.length ? <div className="mt-4"><EmptyState title="No expenses yet." body="Add a bill when you have one. Upload is optional." /></div> : (
        <div className="mt-4 space-y-2">{query.data.map((expense) => (
          <article key={expense._id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
            <div><p>{expense.description}</p><p className="text-[var(--muted)]">{expense.category} · {prettyDate(expense.date)} · {expense.addedByName}</p></div>
            <div className="flex items-center gap-3"><span>{inr(expense.amount)}</span>{expense.billUrl && <a className="underline" href={expense.billUrl} target="_blank" rel="noreferrer">Bill</a>}{canEdit && <button className="underline" onClick={async () => { await api.delete(`/expenses/${expense._id}`); await client.invalidateQueries({ queryKey: ["expenses"] }); }}>Delete</button>}</div>
          </article>
        ))}</div>
      )}
      <Modal open={open} title="Add expense" onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label="Description"><TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Amount"><TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Category"><SelectInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Bill (optional)"><FileInput accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(file) => setBill(file)} /></Field>
          <Button onClick={async () => {
            const data = new FormData();
            data.append("festId", festId); data.append("description", form.description); data.append("amount", form.amount); data.append("category", form.category); data.append("date", form.date);
            if (bill) data.append("bill", bill);
            try { await api.post("/expenses", data); setOpen(false); push("success", "Expense added"); await client.invalidateQueries({ queryKey: ["expenses"] }); }
            catch (error) { push("error", errorMessage(error)); }
          }}>Save expense</Button>
        </div>
      </Modal>
    </div>
  );
}

export function EventsPage({ canEdit }: { canEdit: boolean }) {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", date: "", startTime: "", endTime: "", location: "", status: "Upcoming" });
  const query = useQuery({
    queryKey: ["events", festId, status],
    enabled: Boolean(festId),
    queryFn: async () => (await api.get("/events", { params: { festId, status: status || undefined } })).data.data as FestEvent[],
  });
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const lead = monthStart.getDay();
  const cells = [...Array.from({ length: lead }, () => ""), ...Array.from({ length: days }, (_, i) => String(i + 1))];
  const onDay = (day: string) => {
    if (!day) return;
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
    setSelected(iso);
  };
  const dayEvents = (query.data || []).filter((event) => selected && event.date.slice(0, 10) === selected);
  if (!festId) return <EmptyState title="Choose a festival" body="Events are stored against one Fest ID." />;
  return (
    <div>
      <PageHeader title="Events" action={canEdit ? <Button onClick={() => setOpen(true)}>Create event</Button> : undefined} />
      <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["Upcoming", "Ongoing", "Completed", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</SelectInput>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>Previous</button>
            <p>{cursor.toLocaleString("en-IN", { month: "long", year: "numeric" })}</p>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Next</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--muted)]">{"SMTWTFS".split("").map((d) => <span key={d}>{d}</span>)}</div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              const iso = day ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${day.padStart(2, "0")}` : "";
              const has = (query.data || []).some((event) => event.date.slice(0, 10) === iso);
              return <button key={`${day}-${index}`} onClick={() => onDay(day)} className={`h-12 rounded-xl text-sm ${selected === iso ? "fest-gradient text-white" : "bg-white/5"}`}>{day}{has && <span className="block text-[10px] text-amber-200">•</span>}</button>;
            })}
          </div>
        </div>
        <div className="space-y-3">
          {(selected ? dayEvents : query.data || []).map((event) => (
            <article key={event._id} className="glass rounded-3xl p-4">
              <Badge>{event.status}</Badge>
              <h3 className="mt-2 text-xl">{event.name}</h3>
              <p className="text-sm text-[var(--muted)]">{prettyDate(event.date)} · {event.startTime}–{event.endTime} · {event.location}</p>
              <p className="mt-2 text-sm">{event.description}</p>
              {canEdit && <button className="mt-2 text-sm underline" onClick={async () => { await api.delete(`/events/${event._id}`); await client.invalidateQueries({ queryKey: ["events"] }); }}>Delete</button>}
            </article>
          ))}
          {query.data && query.data.length === 0 && <EmptyState title="No events scheduled." body="Create your first festival event." />}
        </div>
      </div>
      <Modal open={open} title="Create event" onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label="Event name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Start"><TextInput type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
          <Field label="End"><TextInput type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
          <Field label="Location"><TextInput value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Status"><SelectInput value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["Upcoming", "Ongoing", "Completed", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Button onClick={async () => {
            try { await api.post("/events", { ...form, festId }); setOpen(false); push("success", "Event created"); await client.invalidateQueries({ queryKey: ["events"] }); }
            catch (error) { push("error", errorMessage(error)); }
          }}>Save event</Button>
        </div>
      </Modal>
    </div>
  );
}

export function GalleryPage({ fixedKind }: { fixedKind?: "photo" | "video" }) {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const client = useQueryClient();
  const [kind, setKind] = useState<"photo" | "video">(fixedKind || "photo");
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(fixedKind === "video" ? "Cultural Program" : "Festival Activities");
  const query = useQuery({
    queryKey: ["gallery", festId, fixedKind || kind],
    enabled: Boolean(festId),
    queryFn: async () => (await api.get("/gallery", { params: { festId, kind: fixedKind || kind } })).data.data as GalleryItem[],
  });
  if (!festId) return <EmptyState title="Choose a festival" body="Gallery files stay with one Fest ID." />;
  return (
    <div>
      <PageHeader title={fixedKind === "video" ? "Videos" : fixedKind === "photo" ? "Photos" : "Gallery"} subtitle="Downloads keep the original file." />
      {!fixedKind && <Tabs value={kind} onChange={(id) => setKind(id as "photo" | "video")} tabs={[{ id: "photo", label: "Photos" }, { id: "video", label: "Videos" }]} />}
      <div className="glass mb-4 rounded-3xl p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Category"><SelectInput value={category} onChange={(e) => setCategory(e.target.value)}>{["Opening Ceremony", "Cultural Program", "Religious Events", "Festival Activities", "Special Events", "Decoration", "Stage"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <div className="md:col-span-2"><Field label="File"><FileInput accept={kind === "video" || fixedKind === "video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp"} onChange={async (file) => {
            if (!file) return;
            const data = new FormData();
            data.append("file", file); data.append("festId", festId); data.append("kind", fixedKind || kind); data.append("title", title || file.name); data.append("category", category);
            try {
              await api.post("/gallery", data, { onUploadProgress: (ev) => setProgress(ev.total ? Math.round((ev.loaded / ev.total) * 100) : 0) });
              setProgress(0); push("success", "Upload complete"); await client.invalidateQueries({ queryKey: ["gallery"] });
            } catch (error) { setProgress(0); push("error", errorMessage(error)); }
          }} /></Field></div>
        </div>
        {progress > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full fest-gradient" style={{ width: `${progress}%` }} /></div>}
      </div>
      {query.isLoading ? <Skeleton className="h-40" /> : !query.data?.length ? <EmptyState title="No gallery items." body="Upload festival photos to get started." /> : (
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
          {query.data.map((item) => (
            <article key={item._id} className="mb-3 break-inside-avoid overflow-hidden rounded-3xl bg-white/5">
              <button className="block w-full" onClick={() => setActive(item)}>{item.kind === "video" ? <video src={item.url} className="w-full" /> : <GalleryPhoto key={item._id} src={item.url} alt={item.title} className="w-full transition duration-300 hover:scale-[1.02]" />}</button>
              <div className="flex items-center justify-between p-3 text-sm"><span>{item.title}</span><button className="underline" onClick={async () => { await api.delete(`/gallery/${item._id}`); await client.invalidateQueries({ queryKey: ["gallery"] }); }}>Delete</button></div>
            </article>
          ))}
        </div>
      )}
      {active && <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4" role="dialog" aria-label={active.title}>{active.kind === "video" ? <video src={active.url} controls autoPlay className="max-h-[75vh]" /> : <GalleryPhoto key={active._id} src={active.url} alt={active.title} className="max-h-[75vh]" />}<div className="mt-4 flex gap-4 text-sm"><a href={`${api.defaults.baseURL}/gallery/${active._id}/download`}>Download original</a><button onClick={() => setActive(null)}>Close</button></div></div>}
    </div>
  );
}

function GalleryPhoto({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <div className={`flex min-h-40 items-center justify-center bg-white/5 p-6 text-center text-sm text-white/60 ${className || ""}`}>Image file unavailable. Re-upload to restore it.</div>;
  return <img src={src} alt={alt} className={className} onError={() => setUnavailable(true)} />;
}

export function NotesPage() {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", priority: "Normal" });
  const query = useQuery({ queryKey: ["notes", festId], enabled: Boolean(festId), queryFn: async () => (await api.get("/notes", { params: { festId } })).data.data as Note[] });
  if (!festId) return <EmptyState title="Choose a festival" body="Notes stay inside the festival and off the public page." />;
  return (
    <div>
      <PageHeader title="Admin notes" subtitle="Internal only. Visitors do not see these." />
      <form className="glass mb-4 grid gap-3 rounded-3xl p-4" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.post("/notes", { ...form, festId }); setForm({ title: "", description: "", priority: "Normal" }); push("success", "Note saved"); await client.invalidateQueries({ queryKey: ["notes"] }); }
        catch (error) { push("error", errorMessage(error)); }
      }}>
        <Field label="Title"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Priority"><SelectInput value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{["Normal", "Important", "Urgent"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
        <Button type="submit">Add note</Button>
      </form>
      <div className="space-y-3">{(query.data || []).map((note) => <article key={note._id} className="glass rounded-3xl p-4"><Badge tone={note.priority === "Urgent" ? "red" : note.priority === "Important" ? "orange" : "slate"}>{note.priority}</Badge><h3 className="mt-2 text-xl">{note.title}</h3><p className="text-sm text-[var(--muted)]">{note.authorName} · {prettyDate(note.createdAt)}</p><p className="mt-2 text-sm">{note.description}</p></article>)}</div>
      {query.data && query.data.length === 0 && <EmptyState title="No notes yet." body="Committee members can leave a note for the admin." />}
    </div>
  );
}

export function CommitteeQueue() {
  const { push } = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["requests"], queryFn: async () => (await api.get("/committee/requests")).data.data as { _id: string; status: string; festId: string; user?: { name?: string; email?: string; mobile?: string } }[] });
  if (query.isLoading) return <Skeleton className="h-40" />;
  return (
    <div>
      <PageHeader title="Committee requests" subtitle="Pending members cannot open the festival until you approve them." />
      {!query.data?.length ? <EmptyState title="No requests" body="Committee registrations will land here." /> : query.data.map((request) => (
        <article key={request._id} className="glass mb-3 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
          <div><p className="text-lg">{request.user?.name}</p><p className="text-sm text-[var(--muted)]">{request.user?.email} · {request.festId}</p><Badge>{request.status}</Badge></div>
          {request.status === "pending" && <div className="flex gap-2">
            <Button onClick={async () => { await api.patch(`/committee/requests/${request._id}`, { status: "approved" }); push("success", "Approved"); await client.invalidateQueries({ queryKey: ["requests"] }); }}>Approve</Button>
            <Button variant="danger" onClick={async () => { await api.patch(`/committee/requests/${request._id}`, { status: "rejected" }); push("warning", "Rejected"); await client.invalidateQueries({ queryKey: ["requests"] }); }}>Reject</Button>
          </div>}
        </article>
      ))}
    </div>
  );
}

export function MembersPage() {
  const { festId } = useFestivalScope();
  const query = useQuery({ queryKey: ["members", festId], enabled: Boolean(festId), queryFn: async () => (await api.get("/committee/members", { params: { festId } })).data.data as { _id: string; status: string; user?: { name?: string; email?: string; mobile?: string } }[] });
  return (
    <div>
      <PageHeader title="Committee" subtitle={festId} />
      {(query.data || []).map((member) => <article key={member._id} className="glass mb-2 rounded-2xl px-4 py-3"><p>{member.user?.name}</p><p className="text-sm text-[var(--muted)]">{member.user?.email} · {member.status}</p></article>)}
      {query.data && query.data.length === 0 && <EmptyState title="No committee members" body="Approve a join request to add someone." />}
    </div>
  );
}

export function NearbyPage() {
  const { festId, current } = useFestivalScope();
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["nearby-admin", festId], enabled: Boolean(festId), queryFn: async () => (await api.get("/vendors/nearby", { params: { festId, radius: 20 } })).data as { data: { _id: string; businessName: string; ownerName: string; category: string; distanceKm: number | null; village: string; district: string; state: string; pincode: string; address: string; contactMobile: string; description: string; businessHours: string; logoUrl?: string; images?: { url: string; originalName?: string }[]; products?: { _id: string; name: string; price: number; imageUrl?: string }[] }[]; meta: { mapsConfigured: boolean } } });
  const selectedVendor = query.data?.data.find((vendor) => vendor._id === selectedVendorId);
  return (
    <div>
      <PageHeader title="Nearby vendors" subtitle="Default radius 20 km" />
      {current?.latitude != null && current.longitude != null && <iframe title="Festival map" className="mb-4 h-64 w-full rounded-3xl border-0" src={`https://maps.google.com/maps?q=${current.latitude},${current.longitude}&z=14&output=embed`} />}
      {(query.data?.data || []).map((vendor) => (
        <article key={vendor._id} className="glass mb-3 rounded-3xl p-4">
          <button className="flex w-full items-center gap-4 text-left" onClick={() => setSelectedVendorId(vendor._id)}>
            {vendor.logoUrl ? <img src={vendor.logoUrl} alt="" className="h-16 w-16 rounded-xl object-contain" /> : <span className="h-16 w-16 rounded-xl bg-white/5" />}
            <span><span className="block text-lg">{vendor.businessName}</span><span className="block text-sm text-[var(--muted)]">{vendor.category} · {vendor.distanceKm ?? "—"} km · {vendor.village}</span><span className="mt-1 block text-sm text-amber-200">View vendor details</span></span>
          </button>
        </article>
      ))}
      {selectedVendor && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={`${selectedVendor.businessName} details`}>
        <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-[#1a100b] p-6 text-white">
          <div className="flex items-start justify-between gap-4"><div><p className="text-2xl">{selectedVendor.businessName}</p><p className="text-amber-200">{selectedVendor.category}</p></div><button className="underline" onClick={() => setSelectedVendorId(null)}>Close</button></div>
          <p className="mt-2 text-sm text-white/70">Owner: {selectedVendor.ownerName}</p>
          <p className="mt-3 text-sm">{[selectedVendor.address, selectedVendor.village, selectedVendor.district, selectedVendor.state, selectedVendor.pincode].filter(Boolean).join(", ")}</p>
          {selectedVendor.contactMobile && <a className="mt-2 inline-block text-sm text-amber-200 underline" href={`tel:${selectedVendor.contactMobile}`}>{selectedVendor.contactMobile}</a>}
          {selectedVendor.businessHours && <p className="mt-2 text-sm">Business hours: {selectedVendor.businessHours}</p>}
          {selectedVendor.description && <p className="mt-3 whitespace-pre-wrap text-sm text-white/75">{selectedVendor.description}</p>}
          {(selectedVendor.images || []).length > 0 && <><h3 className="mt-5 text-lg">Shop gallery</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selectedVendor.images?.map((image, index) => <a key={image.url || index} href={image.url} target="_blank" rel="noreferrer" title="Open full-size image"><img src={image.url} alt={image.originalName || `${selectedVendor.businessName} photo ${index + 1}`} className="h-48 w-full rounded-xl bg-black/30 object-contain" /></a>)}</div></>}
          {(selectedVendor.products || []).length > 0 && <><h3 className="mt-5 text-lg">Products</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{selectedVendor.products?.map((product) => <article key={product._id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            {product.imageUrl ? <a href={product.imageUrl} target="_blank" rel="noreferrer" title="Open full-size product image"><img src={product.imageUrl} alt={product.name} className="h-24 w-24 rounded-lg object-contain" /></a> : <span className="h-24 w-24 rounded-lg bg-white/5" />}
            <span className="flex-1">{product.name}</span><span>{inr(product.price)}</span>
          </article>)}</div></>}
        </div>
      </div>}
    </div>
  );
}

export function AdsAdminPage() {
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const query = useQuery({ queryKey: ["ads"], queryFn: async () => (await api.get("/advertisements")).data.data as Ad[] });
  return (
    <div>
      <PageHeader title="Advertisements" subtitle="Vendor advertising is free." />
      {(query.data || []).map((ad) => <button key={ad._id} onClick={() => setSelectedAd(ad)} className="glass mb-3 flex w-full items-center gap-4 rounded-2xl p-4 text-left">
        {ad.mediaUrl && ad.mediaType === "image" ? <img src={ad.mediaUrl} alt="" className="h-16 w-24 rounded-lg object-contain" /> : <span className="h-16 w-24 rounded-lg bg-white/5" />}
        <span><span className="block">{ad.title}</span><span className="block text-sm text-[var(--muted)]">{ad.vendor?.businessName} · {ad.status} · {ad.views} views</span><span className="mt-1 block text-sm text-amber-200">View full advertisement</span></span>
      </button>)}
      {query.data && query.data.length === 0 && <EmptyState title="No advertisements" body="Vendors can publish a free advertisement from their dashboard." />}
      {selectedAd && <AdDetailsModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}
    </div>
  );
}

const reports = [
  ["committee", "Committee Members"],
  ["donors", "All Donations with Total"],
  ["expenses", "All Expenses with Total"],
] as const;

export function ReportsPage() {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const totals = useAnalytics(festId);
  async function download(type: string, format: string) {
    if (!festId) return;
    try { await saveBlob(`/reports/${type}`, `${type}-${festId}.${format}`, { festId, format }); }
    catch (error) { push("error", await reportDownloadError(error)); }
  }
  return (
    <div>
      <PageHeader title="Reports" subtitle={festId || "Select a festival"} />
      {totals.data && <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total donations" value={inr(totals.data.contributions)} />
        <StatCard label="Total expenses" value={inr(totals.data.expenses)} />
        <StatCard label="Net balance" value={inr(totals.data.balance)} />
      </div>}
      <div className="grid gap-3 md:grid-cols-2">
        {reports.map(([type, label]) => (
          <article key={type} className="glass rounded-3xl p-5">
            <h2>{label}</h2>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => download(type, "pdf")}>PDF</Button>
              <Button variant="ghost" onClick={() => download(type, "csv")}>CSV</Button>
              <Button variant="ghost" onClick={() => download(type, "xlsx")}>Excel</Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ReceiptsPage() {
  const { festId } = useFestivalScope();
  const { push } = useToast();
  const query = useQuery({ queryKey: ["receipts", festId], enabled: Boolean(festId), queryFn: async () => (await api.get("/receipts", { params: { festId } })).data.data as { _id: string; receiptNo: string; donorName: string; amount: number }[] });
  async function downloadReceipt(receipt: { _id: string; receiptNo: string }) {
    try {
      await saveBlob(`/receipts/${receipt._id}/pdf`, `${receipt.receiptNo}.pdf`);
      push("success", `Receipt ${receipt.receiptNo} downloaded`);
    } catch (error) { push("error", await reportDownloadError(error)); }
  }
  return (
    <div>
      <PageHeader title="Receipts" subtitle="Generated from admin-entered contributions. Not shown on the public page." />
      {(query.data || []).map((receipt) => <article key={receipt._id} className="glass mb-2 flex items-center justify-between rounded-2xl px-4 py-3"><span>{receipt.receiptNo} · {receipt.donorName} · {inr(receipt.amount)}</span><button className="underline" onClick={() => void downloadReceipt(receipt)}>Download PDF</button></article>)}
      {query.data && query.data.length === 0 && <EmptyState title="No receipts yet." body="Open a donor record and generate a receipt." />}
    </div>
  );
}

type FinancialAdvisorData = {
  forecast: {
    currentContributions: number;
    currentExpenses: number;
    currentBalance: number;
    estimatedContributions: number | null;
    estimatedExpenses: number | null;
    estimatedBalance: number | null;
    confidence: string;
    festivalProgress: number;
    plannedExpenseBudget: number | null;
    budgetStatus: string;
  };
  expenseByCategory: { category: string; amount: number; share: number }[];
  expenseAlerts: { expenseId: string; category: string; amount: number; historicalMedian: number; threshold: number; ratio: number; date: string }[];
  monthlyTrend: { month: string; contributions: number; expenses: number }[];
  historicalFestivalsCompared: number;
  upcomingEvents: { name: string; date: string; status: string }[];
  insights: string;
};

export function AnalyticsPage() {
  const { festId } = useFestivalScope();
  const query = useAnalytics(festId || undefined);
  const advisor = useQuery({
    queryKey: ["financial-advisor", festId],
    enabled: Boolean(festId),
    queryFn: async () => (await api.get("/analytics/financial-advisor", { params: { festId } })).data.data as FinancialAdvisorData,
  });
  if (!festId) return <EmptyState title="Choose a festival" body="Analytics follow the festival selected in the header." />;
  if (query.isLoading || !query.data) return <Skeleton className="h-64" />;
  const estimate = (value: number | null) => value == null ? "Not enough history" : inr(value);
  const insightLines = (advisor.data?.insights || "").split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|#{1,4})\s*/, "").replace(/\*\*/g, "").trim()).filter(Boolean);
  return (
    <div>
      <PageHeader title="AI Financial Advisor" subtitle={`${festId} · verified totals, forecasts, and review alerts`} />
      <FinanceCharts data={query.data} />
      {advisor.isLoading ? <Skeleton className="mt-4 h-72" /> : advisor.isError || !advisor.data ? (
        <EmptyState title="Financial advisor unavailable" body="Could not load verified financial analysis for this festival." />
      ) : <div className="mt-4 space-y-4">
        <section className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-xl">Forecast</h2><p className="text-xs text-[var(--muted)]">Estimates use this festival’s activity and your previous festivals.</p></div>
            <Badge tone={advisor.data.forecast.confidence === "Medium" ? "green" : undefined}>{advisor.data.forecast.confidence} confidence · {advisor.data.forecast.festivalProgress}% elapsed</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Contributions to date" value={inr(advisor.data.forecast.currentContributions)} />
            <StatCard label="Estimated final contributions" value={estimate(advisor.data.forecast.estimatedContributions)} />
            <StatCard label="Expenses to date" value={inr(advisor.data.forecast.currentExpenses)} />
            <StatCard label="Estimated final expenses" value={estimate(advisor.data.forecast.estimatedExpenses)} />
            <StatCard label="Current balance" value={inr(advisor.data.forecast.currentBalance)} />
            <StatCard label="Estimated final balance" value={estimate(advisor.data.forecast.estimatedBalance)} />
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">Compared with {advisor.data.historicalFestivalsCompared} historical festival{advisor.data.historicalFestivalsCompared === 1 ? "" : "s"}. Forecasts are estimates, not guarantees.</p>
        </section>

        <section className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg">Budget alert</h2><p className="text-sm text-[var(--muted)]">{advisor.data.forecast.budgetStatus}</p></div>{advisor.data.forecast.plannedExpenseBudget != null && <Badge tone={advisor.data.forecast.budgetStatus.toLowerCase().includes("exceed") ? undefined : "green"}>{inr(advisor.data.forecast.plannedExpenseBudget)} planned</Badge>}</div>
        </section>

        <section className="glass rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Expense review alerts</h2><span className="text-xs text-[var(--muted)]">Pattern flags need human review; they are not evidence of wrongdoing.</span></div>
          {advisor.data.expenseAlerts.length ? <ul className="mt-3 space-y-2">{advisor.data.expenseAlerts.map((alert) => <li key={alert.expenseId} className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Possible unusual {alert.category} expense</strong><time className="text-[var(--muted)]">{prettyDate(alert.date)}</time></div><p className="mt-1 text-sm">{inr(alert.amount)} · Historical median {inr(alert.historicalMedian)} · {alert.ratio.toFixed(1)}× median</p><p className="mt-1 text-xs text-[var(--muted)]">Review the supporting invoice and category with the festival committee. This automated signal makes no accusation.</p></li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No expenses currently exceed the historical review threshold.</p>}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass rounded-2xl p-5"><h2 className="mb-3 text-lg">Expense categories</h2>
            {advisor.data.expenseByCategory.length ? <div className="space-y-3">{advisor.data.expenseByCategory.map((item) => <div key={item.category}><div className="flex justify-between gap-3 text-sm"><span>{item.category}</span><span>{inr(item.amount)} · {Math.round(item.share * 100)}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(2, item.share * 100)}%` }} /></div></div>)}</div> : <p className="text-sm text-[var(--muted)]">No expenses recorded yet.</p>}
          </section>
          <section className="glass rounded-2xl p-5"><h2 className="mb-3 text-lg">Upcoming events</h2>
            {advisor.data.upcomingEvents.length ? <ul className="space-y-2">{advisor.data.upcomingEvents.map((event) => <li key={`${event.name}-${event.date}`} className="flex justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm"><span>{event.name}</span><span className="text-[var(--muted)]">{prettyDate(event.date)}</span></li>)}</ul> : <p className="text-sm text-[var(--muted)]">No upcoming events are recorded.</p>}
          </section>
        </div>

        <section className="glass rounded-2xl p-5"><h2 className="mb-3 text-lg">Financial insight</h2>
          {insightLines.length ? <ul className="space-y-2">{insightLines.map((line, index) => <li key={`${index}-${line}`} className="rounded-lg bg-white/5 px-3 py-2 text-sm leading-6">{line}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">No additional insight is available.</p>}
        </section>
      </div>}
    </div>
  );
}

export function SettingsPage() {
  const { push } = useToast();
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { reduced, setReduced } = useMotionPref();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Settings" subtitle="Profile, password, notifications and appearance." />
      <form className="glass space-y-3 rounded-3xl p-5" onSubmit={async (e) => { e.preventDefault(); const data = new FormData(); data.append("name", name); data.append("mobile", mobile); const avatar = (document.getElementById("avatar") as HTMLInputElement)?.files?.[0]; if (avatar) data.append("avatar", avatar); try { await api.patch("/auth/profile", data); await refresh(); push("success", "Profile saved"); } catch (error) { push("error", errorMessage(error)); } }}>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mobile"><TextInput value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
        <Field label="Profile image"><FileInput id="avatar" accept="image/jpeg,image/png,image/webp" /></Field>
        <Button type="submit">Save profile</Button>
      </form>
      <form className="glass space-y-3 rounded-3xl p-5" onSubmit={async (e) => { e.preventDefault(); try { await api.patch("/auth/password", { currentPassword, newPassword }); push("success", "Password updated"); setCurrentPassword(""); setNewPassword(""); } catch (error) { push("error", errorMessage(error)); } }}>
        <Field label="Current password"><TextInput type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
        <Field label="New password"><TextInput type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <Button type="submit">Change password</Button>
      </form>
      <div className="glass space-y-3 rounded-3xl p-5">
        <label className="flex items-center justify-between text-sm">In-app notifications <input type="checkbox" defaultChecked={user?.notificationPrefs?.inApp !== false} onChange={async (e) => { await api.patch("/auth/profile", { inApp: e.target.checked }); await refresh(); }} /></label>
        <label className="flex items-center justify-between text-sm">Appearance <SelectInput defaultValue={user?.appearance || "dark"} onChange={async (e) => { await api.patch("/auth/profile", { appearance: e.target.value }); await refresh(); }}><option value="dark">Dark</option><option value="light">Light</option></SelectInput></label>
        <label className="flex items-center justify-between text-sm">Reduce decorative motion <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /></label>
        <Button variant="danger" onClick={() => void logout().then(() => { window.location.href = "/"; })}>Log out</Button>
      </div>
    </div>
  );
}

