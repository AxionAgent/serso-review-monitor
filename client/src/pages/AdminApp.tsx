import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, FileText, FileImage, History, LayoutDashboard, Loader2, LogIn, LogOut, Menu, Pencil, QrCode, RefreshCw, Search, Settings, ShieldAlert, Sparkles, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const navItems = [
  { label: "Overview", path: "/admin", icon: LayoutDashboard },
  { label: "Reviews", path: "/admin/reviews", icon: FileText },
  { label: "Alerts", path: "/admin/alerts", icon: ShieldAlert },
  { label: "QR Codes", path: "/admin/qr-codes", icon: QrCode },
  { label: "Analytics", path: "/admin/analytics", icon: Sparkles },
  { label: "Settings", path: "/admin/settings", icon: Settings },
];

const moneyDate = (value: Date | string) => new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const moneyDateTime = (value: Date | string) => new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const stars = (value: number) => "★".repeat(Math.round(value)) + "☆".repeat(Math.max(0, 5 - Math.round(value)));
const todayLabel = () => new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function AdminApp() {
  const [location, navigate] = useLocation();
  const active = navItems.find((item) => item.path === location || (item.path !== "/admin" && location.startsWith(item.path))) ?? navItems[0];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  if (!user) return <LoginGate isPending={login.isPending} error={login.error?.message ?? undefined} onLogin={(username, password) => login.mutate({ username, password })} />;
  return (
    <div className="min-h-screen bg-[#f3f7ff] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-[#0f2f5f] text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="flex h-24 items-center gap-3 px-7"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#79a8ff] text-[#0f2f5f]"><MessageMark /></div><div><p className="text-sm font-black tracking-tight">Service Solution</p><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-100">Experience OS</p><p className="mt-0.5 font-mono text-[10px] text-blue-100/50">v{__APP_VERSION__}</p></div><button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden"><X className="h-5 w-5" /></button></div>
          <div className="px-4"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100/60">Workspace</p>{navItems.map((item) => { const Icon = item.icon; const isActive = item.path === location; return <Link key={item.path} href={item.path} onClick={() => setMobileOpen(false)} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? "bg-white/15 text-white shadow-sm" : "text-blue-100/70 hover:bg-white/10 hover:text-white"}`}><Icon className={`h-4 w-4 ${isActive ? "text-[#79a8ff]" : ""}`} />{item.label}{item.label === "Alerts" ? <span className="ml-auto rounded-full bg-blue-300/20 px-2 py-0.5 text-[10px] text-blue-100">Live</span> : null}</Link>; })}</div>
          <div className="mt-auto border-t border-white/10 p-4"><div className="mb-3 rounded-2xl bg-white/10 p-3"><p className="text-xs font-semibold text-blue-100">Data health</p><div className="mt-2 flex items-center gap-2 text-[11px] text-blue-100/70"><span className="h-2 w-2 rounded-full bg-[#79a8ff]" /> Database connected</div><div className="mt-1 flex items-center gap-2 text-[11px] text-blue-100/70"><span className="h-2 w-2 rounded-full bg-[#79a8ff]" /> QR routing active</div></div><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-blue-100/70 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /> Sign out</button></div>
        </div>
      </aside>
      <NewReviewToasts onOpenReviews={() => { navigate("/admin/reviews"); utils.admin.reviews.invalidate(); }} />
      {mobileOpen ? <button onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-blue-950/30 lg:hidden" aria-label="Close menu" /> : null}
      <div className="lg:pl-72"><header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-white/70 bg-white/65 px-5 backdrop-blur-2xl sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 hover:bg-white/80 lg:hidden"><Menu className="h-5 w-5" /></button><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f6fed]">Customer experience</p><h1 className="text-lg font-bold tracking-tight">{active.label}</h1></div></div><div className="flex items-center gap-3"><NotificationBell onOpenReview={(id) => { navigate("/admin/reviews"); setDetailId(id); utils.admin.reviews.invalidate(); }} /><div className="hidden h-10 w-10 place-items-center rounded-xl bg-[#2f6fed] text-sm font-bold text-white shadow-lg shadow-blue-500/20 sm:grid">{user.name?.slice(0, 1).toUpperCase() ?? "A"}</div></div></header><main className="mx-auto max-w-[1440px] p-5 sm:p-8"><PageContent path={location} detailId={detailId} onDetailConsumed={() => setDetailId(null)} /></main></div>
    </div>
  );
}

/**
 * Poll ringan (10s): id review terbaru. Naik -> toast + invalidate list, jadi halaman
 * Reviews yang lagi kebuka ikut refresh tanpa pindah menu/refresh manual (owner request).
 * PC: pojok kanan bawah; mobile: atas. First run cuma nyetup baseline, gak notif review lama.
 */
function NewReviewToasts({ onOpenReviews }: { onOpenReviews: () => void }) {
  const utils = trpc.useUtils();
  const lastId = useRef<number | null>(null);
  const { data } = trpc.admin.latestReviewAt.useQuery(undefined, { refetchInterval: 10_000 });
  useEffect(() => {
    if (!data) return;
    if (lastId.current === null) { lastId.current = data.id; return; }
    if (data.id > lastId.current) {
      lastId.current = data.id;
      const mobile = window.matchMedia("(max-width: 639px)").matches;
      toast(`Review baru masuk: ${data.receiptNo || "?"}`, {
        id: "new-review",
        duration: 8000,
        position: mobile ? "top-center" : "bottom-right",
        action: { label: "Lihat", onClick: onOpenReviews },
      });
      utils.admin.reviews.invalidate();
      utils.admin.alerts.invalidate();
      utils.dashboard.overview.invalidate();
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Item 5 owner: dropdown mana pun menutup saat klik di luar area-nya. */
function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

/**
 * Item 9 owner: bell = riwayat notifikasi (review baru masuk + alert),
 * bukan tombol mati. Poll 15s; badge jumlah unread. Search box header dibuang.
 */
function NotificationBell({ onOpenReview }: { onOpenReview: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const { data } = trpc.admin.notifications.useQuery(undefined, { refetchInterval: 15_000 });
  const items = data ?? [];
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/80 bg-white/70 text-slate-500 shadow-sm backdrop-blur-xl">
        <Bell className="h-4 w-4" />
        {unread ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-500" />}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifikasi</p>
            <p className="text-[11px] text-slate-400">{unread ? `${unread} belum dibaca` : "semua terbaca"}</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!items.length ? <p className="px-4 py-8 text-center text-xs text-slate-400">Belum ada notifikasi.</p> : null}
            {items.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                onClick={() => { setOpen(false); onOpenReview(item.reviewId); }}
                className="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-slate-200" : item.kind === "alert" ? "bg-rose-500" : "bg-blue-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-800">{item.kind === "alert" ? `Alert · ${item.title}` : item.title}</span>
                  <span className="block text-[11px] text-slate-400">{item.sub} · {moneyDateTime(item.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoginGate({ isPending, error, onLogin }: { isPending: boolean; error?: string; onLogin: (username: string, password: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbe7ff,transparent_42%),linear-gradient(135deg,#f8fbff,#eaf2ff)] px-5 py-10"><div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center"><form onSubmit={(event) => { event.preventDefault(); onLogin(username, password); }} className="w-full rounded-[2rem] border border-white/80 bg-white/65 p-8 shadow-[0_30px_100px_-30px_rgba(37,99,235,.45)] backdrop-blur-2xl"><div className="mb-8 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#2f6fed] text-white shadow-lg shadow-blue-500/25"><LogIn className="h-5 w-5" /></div><div><p className="text-sm font-black text-[#0f2f5f]">Service Solution</p><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2f6fed]">Admin workspace</p></div></div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2f6fed]">Local access</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0f2f5f]">Welcome back</h1><p className="mt-3 text-sm leading-6 text-slate-500">Sign in with the local workspace credentials to manage reviews, alerts, and branches.</p><div className="mt-8 space-y-4"><Input label="Username" value={username} onChange={setUsername} placeholder="admin" /><Input label="Password" value={password} onChange={setPassword} placeholder="admin" /></div>{error ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{error}</p> : null}<button disabled={isPending} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2f6fed] text-sm font-bold text-white shadow-lg shadow-blue-500/25 disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Sign in</button><p className="mt-5 text-center text-xs text-slate-400">Sign in menggunakan kredensial yang diberikan administrator.</p></form></div></div>;
}
function PageContent({ path, detailId, onDetailConsumed }: { path: string; detailId: number | null; onDetailConsumed: () => void }) {
  if (path === "/admin/reviews") return <ReviewsPage externalDetailId={detailId} onExternalConsumed={onDetailConsumed} />;
  if (path === "/admin/alerts") return <AlertsPage />;
  if (path === "/admin/qr-codes") return <QRCodesPage />;
  if (path === "/admin/analytics") return <AnalyticsPage />;
  if (path === "/admin/settings") return <SettingsPage />;
  return <OverviewPage />;
}

function OverviewPage() {
  const { data, isLoading } = trpc.dashboard.overview.useQuery({});
  if (isLoading || !data) return <Loading />;
  const monthLabel = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const threshold = data.threshold ?? 3.5;
  return <div className="space-y-7"><PageHeading eyebrow={todayLabel()} title="Good morning, team" subtitle="Here’s the service pulse across every branch." action={<Link href="/admin/qr-codes" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2f6fed] px-4 text-sm font-bold text-white shadow-lg shadow-[#2f6fed]/15 transition hover:bg-[#2459c7]"><QrCode className="h-4 w-4" /> Manage QR codes</Link>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">{[{ label: "Total reviews", value: data.kpis.total.toLocaleString(), note: `${data.kpis.positive} positif · ${data.kpis.negative} perlu perhatian`, color: "text-[#2f6fed]" }, { label: "Average rating", value: data.kpis.average.toFixed(2), note: "Across all dimensions", color: "text-amber-500", icon: "★" }, { label: "Open reviews", value: data.kpis.open, note: "New + Open status", color: "text-sky-600" }, { label: "Reviews today", value: data.kpis.today, note: "Live submissions", color: "text-sky-600" }, { label: "This month", value: data.kpis.month.toLocaleString(), note: monthLabel, color: "text-violet-600" }, { label: "Positive reviews", value: data.kpis.positive.toLocaleString(), note: `Rating ${threshold} or higher`, color: "text-emerald-600" }, { label: "Needs attention", value: data.kpis.negative.toLocaleString(), note: `Rating under ${threshold}`, color: "text-rose-600" }].map((item) => <div key={item.label} className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] shadow-slate-200/40"><div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{item.label}</p>{item.icon ? <span className="text-amber-400">{item.icon}</span> : null}</div><p className={`text-3xl font-bold tracking-tight ${item.color}`}>{item.value}</p><p className="mt-2 text-[11px] text-slate-400">{item.note}</p></div>)}</div><div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-6"><div className="mb-6 flex items-start justify-between"><div><p className="text-sm font-bold">Review activity</p><p className="mt-1 text-xs text-slate-400">Daily volume and average rating · last 14 days</p></div><div className="flex gap-2 text-[11px] text-slate-400"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2f6fed]" /> Reviews</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#79a8ff]" /> Rating</span></div></div><div className="grid gap-4 sm:grid-cols-2 mb-4">{(() => { const daysWithData = data.trend.filter((d) => d.count > 0); const total14 = data.trend.reduce((s, d) => s + d.count, 0); const avg14 = daysWithData.length ? Math.round((daysWithData.reduce((s, d) => s + d.average, 0) / daysWithData.length) * 100) / 100 : 0; return [{ label: "14-day total reviews", value: total14.toLocaleString(), color: "text-[#2f6fed]" }, { label: "14-day avg rating", value: avg14.toFixed(2), color: "text-amber-500", icon: "★" }].map((item) => <div key={item.label} className="rounded-xl border border-white/70 bg-white/75 backdrop-blur-xl p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className={`mt-1 text-2xl font-bold ${item.color}`}>{item.value}{item.icon ? <span className="ml-1 text-amber-400">{item.icon}</span> : null}</p></div>); })()}</div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend}><defs><linearGradient id="reviewFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f6fed" stopOpacity={0.25} /><stop offset="100%" stopColor="#2f6fed" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1ef" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} /><YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} /><YAxis yAxisId="right" orientation="right" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} /><Tooltip contentStyle={{ border: "0", borderRadius: 12, boxShadow: "0 12px 30px rgba(15,23,42,.12)" }} /><Area yAxisId="left" type="monotone" dataKey="count" stroke="#2f6fed" strokeWidth={3} fill="url(#reviewFill)" /><Area yAxisId="right" type="monotone" dataKey="average" stroke="#79a8ff" strokeWidth={2} fill="none" /></AreaChart></ResponsiveContainer></div></div><div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-6"><div className="mb-6 flex items-start justify-between"><div><p className="text-sm font-bold">Rating breakdown</p><p className="mt-1 text-xs text-slate-400">How customers score their experience</p></div><Star className="h-4 w-4 fill-amber-400 text-amber-400" /></div><div className="mb-7 grid grid-cols-[auto_1fr] items-center gap-x-5"><div><p className="text-4xl font-bold text-slate-900">{data.dimensions.overall.toFixed(2)}</p><p className="mt-1 text-xs text-slate-400">out of 5.0</p></div><div className="space-y-2">{data.ratingDistribution.map((item) => <div key={item.rating} className="flex items-center gap-2 text-xs"><span className="w-5 text-slate-500">{item.rating}★</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${item.percentage}%` }} /></div><span className="w-7 text-right text-slate-400">{item.percentage}%</span></div>)}</div></div><div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-5">{[["Installation", data.dimensions.installation], ["Grooming", data.dimensions.grooming], ["Service", data.dimensions.service]].map(([label, value]) => <div key={label as string}><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-800">{Number(value).toFixed(2)}</p></div>)}</div></div></div><div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6"><div><p className="text-sm font-bold">Latest reviews</p><p className="mt-1 text-xs text-slate-400">Fresh feedback from customers</p></div><Link href="/admin/reviews" className="text-xs font-bold text-[#2f6fed]">View all →</Link></div><div className="divide-y divide-slate-100">{data.recentReviews.slice(0, 5).map((review) => <Link href={`/admin/reviews?id=${review.id}`} key={review.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${review.overall >= 4 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{review.overall.toFixed(1)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{review.comment || "No comment"}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><StatusBadge status={review.status} /> {review.receiptNo}</p></div><span className="hidden text-xs text-slate-400 sm:block">{moneyDate(review.createdAt)}</span></Link>)}</div></div><div className="rounded-2xl border border-rose-100 bg-[#fffafa] shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]"><div className="flex items-center justify-between border-b border-rose-100 px-5 py-5"><div><p className="text-sm font-bold text-slate-900">Alert center</p><p className="mt-1 text-xs text-slate-400">Negative reviews to act on</p></div><Link href="/admin/alerts" className="text-xs font-bold text-rose-600">Open alerts →</Link></div><div className="grid grid-cols-3 border-b border-rose-100"><div className="p-4"><p className="text-2xl font-bold text-rose-600">{data.alertSummary.critical}</p><p className="mt-1 text-[11px] text-slate-400">Critical</p></div><div className="border-x border-rose-100 p-4"><p className="text-2xl font-bold text-amber-500">{data.alertSummary.attention}</p><p className="mt-1 text-[11px] text-slate-400">Attention</p></div><div className="p-4"><p className="text-2xl font-bold text-emerald-600">{data.alertSummary.resolved}</p><p className="mt-1 text-[11px] text-slate-400">Resolved</p></div></div><div className="space-y-4 p-5">{data.alerts.filter((alert) => alert.status === "open").slice(0, 3).map((alert) => <Link href={`/admin/reviews?id=${alert.reviewId}`} key={alert.id} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" /><div><p className="text-sm font-semibold text-slate-700">{alert.receiptNo}</p><p className="mt-1 text-xs text-slate-400">{alert.branchName} · {alert.message}</p></div></Link>)}{!data.alerts.filter((alert) => alert.status === "open").length ? <p className="text-sm text-slate-500">Tidak ada alert saat ini. Semua aman.</p> : null}</div></div></div></div>;
}

function ReviewDetailModal({ reviewId, onClose, onStatusChange }: { reviewId: number; onClose: () => void; onStatusChange: () => void }) {
  const { data: detail, isLoading } = trpc.admin.review.useQuery({ id: reviewId });
  const update = trpc.admin.updateReviewStatus.useMutation();
  const saveNote = trpc.admin.updateReviewNote.useMutation();
  const markRead = trpc.admin.markReviewRead.useMutation();
  const utils = trpc.useUtils();
  const { data: currentUser } = trpc.auth.me.useQuery();
  const [resolveNote, setResolveNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Hanya super_admin yang boleh archive (V2: privilege admin tidak termasuk archive)
  const canArchive = currentUser?.role === "super_admin";

  useEffect(() => {
    // Isi textarea dengan note tersimpan kalau review sudah pernah di-resolve
    if (detail?.note) setResolveNote(detail.note);
  }, [detail?.note]);

  useEffect(() => {
    // Buka detail = dianggap dibaca -> unread dot hilang (owner request item 1).
    if (detail && detail.status === "new" && !detail.readAt) {
      markRead.mutate({ id: detail.id }, { onSuccess: () => { utils.admin.reviews.invalidate(); utils.admin.review.invalidate({ id: detail.id }); } });
    }
  }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Catatan resolve: simpan juga saat admin blur textarea tanpa ganti status (item 2).
  const commitNote = () => {
    if (!detail) return;
    const next = resolveNote.trim() || null;
    if ((detail.note ?? null) === next) return;
    saveNote.mutate({ id: detail.id, note: next }, { onSuccess: () => { utils.admin.review.invalidate({ id: detail.id }); utils.admin.reviews.invalidate(); utils.admin.reviewHistory.invalidate({ id: detail.id }); } });
  };

  if (isLoading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#2f6fed]" />
              <p className="mt-3 text-sm text-slate-500 font-medium">Memuat detail review...</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-700">Review tidak dapat ditampilkan.</p>
              <p className="mt-1 text-xs text-slate-500">Review ini di luar jangkauan status akun Anda, atau sudah dihapus.</p>
              <button onClick={onClose} className="mt-4 h-10 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">Tutup</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const handleStatus = (status: "new" | "open" | "resolved" | "archived") => {
    update.mutate(
      // note dikirim hanya saat resolve; status lain jangan kirim note
      // supaya server tidak menyentuh catatan tersimpan (item 2: note persist).
      { id: detail.id, status, ...(status === "resolved" ? { note: resolveNote.trim() || null } : {}) },
      { onSuccess: () => onStatusChange() }
    );
  };
  // V2 UI: status efektif cuma Open/Resolved (+Archived utk super admin).
  // "new" tidak lagi jadi tombol — ia badge "New" di samping Open.
  const statusOptions: ("new" | "open" | "resolved" | "archived")[] = canArchive
    ? ["open", "resolved", "archived"]
    : ["open", "resolved"];
  // Bukan super admin: gak bisa archive, gak bisa balik ke new (once resolved)
  // Cermin aturan server (db.ts::updateReviewStatus). Server = sumber kebenaran:
  //   invariant semua role : resolved/archived ↛ new
  //   archived             : super_admin only
  //   new (bukan no-op)    : super_admin only, dan cuma dari open
  const canSet = (st: "new" | "open" | "resolved" | "archived") => {
    if (st === "new" && (detail.status === "resolved" || detail.status === "archived")) return false;
    if (st === "archived") return canArchive;
    if (st === "new" && !canArchive && detail.status !== "new") return false;
    return true;
  };
  const isLocked = (st: string) => !canSet(st as never);
  // "new" = secara efektif Open (+badge New). Dipakai utk highlight tombol status aktif.
  const effectiveStatus = detail.status === "new" ? "open" : detail.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-slate-900">{detail.receiptNo}</span>
              <StatusBadge status={detail.status} />
              <button onClick={() => setHistoryOpen(true)} title="Riwayat perubahan" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-[#2f6fed] hover:text-[#2f6fed]">
                <History className="h-3.5 w-3.5" /> History
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">ID Review #{detail.id} · Diterima pada {moneyDateTime(detail.createdAt)}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 text-xs">
          <span className="text-slate-400 font-medium">Store</span>
          <p className="font-bold text-slate-800 mt-0.5">{detail.storeName ?? detail.branch?.name ?? "N/A"}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Score & Sub-Rating</h4>
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-700 text-sm font-bold border border-amber-200">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span>Overall {detail.overall.toFixed(2)} / 5.0</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
              <p className="text-xs text-slate-400 font-semibold">Hasil Pemasangan</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{detail.installationRating}</p>
              <p className="text-[10px] text-amber-400">{stars(detail.installationRating)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
              <p className="text-xs text-slate-400 font-semibold">Grooming Tim</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{detail.groomingRating}</p>
              <p className="text-[10px] text-amber-400">{stars(detail.groomingRating)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
              <p className="text-xs text-slate-400 font-semibold">Pelayanan Tim</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{detail.serviceRating}</p>
              <p className="text-[10px] text-amber-400">{stars(detail.serviceRating)}</p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Komentar & Masukan Pelanggan</h4>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
            {detail.comment ? detail.comment : <span className="italic text-slate-400">Tidak ada komentar tertulis.</span>}
          </div>
        </div>

        {detail.alerts && detail.alerts.length > 0 ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
            <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2">Warning Alerts</h4>
            <div className="space-y-2">
              {detail.alerts.map((a) => (
                <div key={a.id} className="text-xs text-rose-600 flex items-center justify-between">
                  <span>{a.message} ({a.severity})</span>
                  <span className="font-semibold">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#dbe7ff] bg-[#f6f9ff] p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#2f6fed] mb-2">Catatan Resolve <span className="font-medium normal-case text-slate-400">(opsional)</span></h4>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            onBlur={commitNote}
            rows={3}
            placeholder="Tulis catatan tindak lanjut di sini… (tersimpan otomatis saat keluar dari kolom)"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2f6fed] resize-y"
          />
          {saveNote.isSuccess && (detail.note ?? null) === (resolveNote.trim() || null) ? <p className="mt-2 text-[11px] font-semibold text-emerald-600">Catatan tersimpan.</p> : detail.note ? <p className="mt-2 text-[11px] text-slate-400">Note tersimpan: <span className="text-slate-600">{detail.note}</span></p> : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs font-semibold text-slate-500">Ubah Status:</span>
          <div className="flex gap-2">
            {statusOptions.map((st) => (
              <button
                key={st}
                disabled={
                  effectiveStatus === st ||
                  update.isPending ||
                  !canSet(st)
                }
                title={
                  !canSet(st) && st === "archived"
                    ? "Hanya super admin yang dapat meng-archive review"
                    : undefined
                }
                onClick={() => handleStatus(st)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition ${
                  effectiveStatus === st
                    ? "bg-[#2f6fed] text-white"
                    : isLocked(st)
                      ? "cursor-not-allowed bg-slate-200 text-slate-400 line-through decoration-slate-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st === "archived" ? "Archived" : st === "resolved" ? "Resolved" : st === "new" ? "New" : "Open"}
              </button>
            ))}
          </div>
        </div>
        {historyOpen ? <ReviewHistoryModal reviewId={detail.id} isSuperAdmin={canArchive} onClose={() => setHistoryOpen(false)} /> : null}
      </div>
    </div>
  );
}

/**
 * Riwayat perubahan sebuah review (audit log). Item 3 owner: edit/hapus entri
 * HANYA super admin — tombolnya tidak dirender untuk role lain, dan server
 * memaksa superAdminProcedure (lapisan kedua).
 */
function ReviewHistoryModal({ reviewId, isSuperAdmin, onClose }: { reviewId: number; isSuperAdmin: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.admin.reviewHistory.useQuery({ id: reviewId });
  const editEntry = trpc.admin.editReviewHistory.useMutation({ onSuccess: () => utils.admin.reviewHistory.invalidate({ id: reviewId }) });
  const deleteEntry = trpc.admin.deleteReviewHistory.useMutation({ onSuccess: () => utils.admin.reviewHistory.invalidate({ id: reviewId }) });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#2f6fed]" />
            <h3 className="text-sm font-bold text-slate-900">Riwayat Perubahan</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#2f6fed]" /> Memuat riwayat…</div>
        ) : !entries?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Belum ada riwayat tercatat untuk review ini.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <input value={editText} onChange={(e) => setEditText(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-[#2f6fed]" />
                    <div className="flex gap-2">
                      <button disabled={!editText.trim() || editEntry.isPending} onClick={() => { editEntry.mutate({ id: entry.id, action: editText }); setEditingId(null); }} className="rounded-lg bg-[#2f6fed] px-3 py-1 text-xs font-bold text-white disabled:opacity-50">Simpan</button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">Batal</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{entry.action}</p>
                      {entry.metadata ? <p className="mt-0.5 break-words text-[11px] text-slate-400">{entry.metadata}</p> : null}
                      <p className="mt-1 text-[11px] text-slate-400">{entry.userName ?? "sistem"} · {moneyDateTime(entry.createdAt)}</p>
                    </div>
                    {isSuperAdmin ? (
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => { setEditingId(entry.id); setEditText(entry.action); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-[#2f6fed]" title="Edit entri"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { if (window.confirm("Hapus entri riwayat ini?")) deleteEntry.mutate({ id: entry.id }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Hapus entri"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReviewsPage({ externalDetailId, onExternalConsumed }: { externalDetailId: number | null; onExternalConsumed: () => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"new" | "open" | "resolved" | "archived" | undefined>();
  const [storeCode, setStoreCode] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<null | "date" | "store" | "rating" | "status">(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<number[]>([]);
  const [detailReviewId, setDetailReviewId] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "ods" | "csv">("xlsx");
  // debounce search — biar tiap ketik tidak langsung refetch & unmount (masalah keyboard Android)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: reviewsResponse, isLoading } = trpc.admin.reviews.useQuery({ search: debouncedSearch || undefined, status, storeCode, page, pageSize });
  const reviews = reviewsResponse?.items ?? [];
  const total = reviewsResponse?.total ?? 0;
  const totalPages = reviewsResponse?.totalPages ?? 1;
  const storeOptions = reviewsResponse?.storeOptions ?? [];

  const statusRank: Record<string, number> = { new: 1, open: 1, resolved: 2, archived: 3 };
  // sortKey null = urutan default server (terbaru dulu). Jangan di-sort ulang di client.
  const sortedReviews = sortKey === null ? reviews : [...reviews].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "date") return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    if (sortKey === "store") return ((a.storeName ?? a.branchName ?? "")).localeCompare((b.storeName ?? b.branchName ?? "")) * dir;
    if (sortKey === "rating") return (a.overall - b.overall) * dir;
    return ((statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)) * dir;
  });
  type SortCol = "date" | "store" | "rating" | "status";
  // Klik 1: asc | klik 2: desc | klik 3: reset ke default (date terbaru). Owner request.
  const toggleSort = (key: SortCol) => {
    // Klik pertama di kolom mana pun = asc (selalu ada perubahan keliatan; date desc = posisi default).
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortKey(null);
  };
  const SortIcon = ({ col }: { col: SortCol }) => {
    const active = sortKey ?? "date"; // default = date desc
    const activeDir = sortKey ? sortDir : "desc";
    return <span className="ml-1 inline-block text-[9px]">{active === col ? (activeDir === "asc" ? "▲" : "▼") : "↕"}</span>;
  };

  const { data: currentUser } = trpc.auth.me.useQuery();
  const deleteOne = trpc.admin.deleteReview.useMutation();
  const deleteAll = trpc.admin.deleteAllReviews.useMutation();
  const utils = trpc.useUtils();
  const exportQuery = trpc.admin.exportReviews.useQuery({ search: debouncedSearch || undefined, status, storeCode }, { enabled: false });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam && !isNaN(Number(idParam))) {
      setDetailReviewId(Number(idParam));
    }
  }, []);

  // Bell notifikasi -> klik item -> buka modal detail review-nya dari halaman ini.
  useEffect(() => {
    if (externalDetailId) {
      setDetailReviewId(externalDetailId);
      onExternalConsumed();
    }
  }, [externalDetailId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Item 5: dropdown Export menutup saat klik di luar area-nya.
  const exportRef = useClickOutside(() => setExportOpen(false));

  // JANGAN unmount saat loading (bikin input hilang & keyboard Android nutup).
  // Data lama tetap tampil; hanya spinner halus di area list.
  const canDelete = currentUser?.role === "super_admin";
  const refresh = () => { setSelected([]); utils.admin.reviews.invalidate(); utils.dashboard.overview.invalidate(); };
  const download = async (format: "xlsx" | "ods" | "csv") => {
    try {
      setExportOpen(false);
      const result = await exportQuery.refetch();
      const rows = result.data;
      if (!rows) return;
      const label = (v: unknown) => String(v ?? "");
      const data = rows.map((row) => ({
        "Tanggal": label(row.date).slice(0, 10),
        "No. Receipt": label(row.receiptNo),
        "Store": label(row.storeName ?? row.branchName),
        "Store Code": label(row.storeCode ?? row.branchCode),
        "QR": label(row.qrName),
        "Tim": label(row.teamName),
        "Pemasangan": row.installationRating,
        "Grooming": row.groomingRating,
        "Pelayanan": row.serviceRating,
        "Overall": Number(row.overall).toFixed(2),
        "Komentar": label(row.comment),
        "Status": label(row.status),
      }));
      // xlsx (~400KB) di-load on-demand: dulu di-bundle ke chunk awal dan bikin
      // first paint blank beberapa detik saat aset belum ada di cache.
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 50 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reviews");
      const ext = format === "xlsx" ? "xlsx" : format === "ods" ? "ods" : "csv";
      XLSX.writeFile(wb, `reviews-export.${ext}`, { compression: true });
    } catch {
      // export failed
    }
  };
  const removeSelected = async () => { if (!selected.length || !window.confirm("Delete " + selected.length + " selected review(s)?")) return; await Promise.all(selected.map((id) => deleteOne.mutateAsync({ id }))); refresh(); };
  const removeAll = async () => { if (!window.confirm("Delete ALL reviews and their alerts? This cannot be undone.")) return; await deleteAll.mutateAsync(); refresh(); };

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Voice of customer" title="Reviews" subtitle="Review every customer signal and turn feedback into action." action={<div className="flex flex-wrap gap-2"><div className="relative" ref={exportRef}><button onClick={() => setExportOpen(!exportOpen)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white/75 px-4 text-sm font-bold text-slate-700"><Download className="h-4 w-4" /> Export <ChevronDown className={`h-4 w-4 transition ${exportOpen ? "rotate-180" : ""}`} /></button>{exportOpen ? <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl"><button onClick={() => { setExportFormat("xlsx"); download("xlsx"); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4 text-emerald-600" /> XLSX (.xlsx)</button><button onClick={() => { setExportFormat("ods"); download("ods"); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4 text-orange-500" /> ODS (.ods)</button><button onClick={() => { setExportFormat("csv"); download("csv"); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4 text-blue-500" /> CSV (.csv)</button></div> : null}</div>{canDelete ? <><button disabled={!selected.length || deleteOne.isPending} onClick={removeSelected} className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Delete selected</button><button disabled={deleteAll.isPending} onClick={removeAll} className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" /> Delete all</button></> : null}</div>} />
      <div className="flex flex-wrap gap-3 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search receipt or comment" className="h-10 w-full text-sm outline-none" />
        </div>
        <select value={storeCode ?? ""} onChange={(e) => { setStoreCode(e.target.value || undefined); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white/75 px-3 text-sm text-slate-600">
          <option value="">All stores</option>
          {storeOptions.map((store) => <option value={store.code} key={store.code}>{store.name}</option>)}
        </select>
        <select value={status ?? ""} onChange={(e) => { setStatus((e.target.value || undefined) as typeof status); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white/75 px-3 text-sm text-slate-600">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          {canDelete ? <option value="archived">Archived</option> : null}
        </select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/75 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                {canDelete ? <th className="w-12 px-5 py-4"><input type="checkbox" checked={reviews.length > 0 && selected.length === reviews.length} onChange={(e) => setSelected(e.target.checked ? reviews.map((review) => review.id) : [])} /></th> : null}
                <th className="px-5 py-4"><button onClick={() => toggleSort("date")} className="inline-flex items-center uppercase tracking-wider hover:text-slate-600">Date<SortIcon col="date" /></button></th>
                <th className="px-5 py-4">Receipt</th>
                <th className="px-5 py-4"><button onClick={() => toggleSort("store")} className="inline-flex items-center uppercase tracking-wider hover:text-slate-600">Store<SortIcon col="store" /></button></th>
                <th className="px-5 py-4"><button onClick={() => toggleSort("rating")} className="inline-flex items-center uppercase tracking-wider hover:text-slate-600">Rating<SortIcon col="rating" /></button></th>
                <th className="px-5 py-4">Comment</th>
                <th className="px-5 py-4"><button onClick={() => toggleSort("status")} className="inline-flex items-center uppercase tracking-wider hover:text-slate-600">Status<SortIcon col="status" /></button></th>
                <th className="px-5 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedReviews.map((review) => (
                <tr key={review.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setDetailReviewId(review.id)}>
                  {canDelete ? <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(review.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, review.id] : current.filter((id) => id !== review.id))} /></td> : null}
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{moneyDateTime(review.createdAt)}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800">{review.receiptNo}</td>
                  <td className="px-5 py-4"><p className="font-medium text-slate-700">{review.storeName ?? review.branchName ?? "Unassigned"}</p><p className="text-xs text-slate-400">{review.storeCode ? `${review.storeCode} · ${review.qrName}` : review.qrName}</p></td>
                  <td className="px-5 py-4"><p className="font-bold text-slate-800">{review.overall.toFixed(2)}</p><p className="text-[11px] tracking-tight text-amber-400">{stars(review.overall)}</p></td>
                  <td className="max-w-[260px] truncate px-5 py-4 text-slate-500">{review.comment || "—"}</td>
                  <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}><StatusBadge status={review.status} unread={review.unread} /></td>
                  <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setDetailReviewId(review.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#2f6fed] hover:text-[#2f6fed]">
                        <Eye className="h-3.5 w-3.5" /> Detail
                      </button>
                      {/* V2: dropdown ganti status di row dihapus (owner request) —
                          perpindahan status cuma lewat modal Detail (state machine one-way). */}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!reviews.length ? <Empty text="Review tidak ditemukan." /> : null}

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Baris per halaman:</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Menampilkan {total === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} dari {total} review
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-xs font-semibold text-slate-600 px-2">
              Halaman {page} dari {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {detailReviewId ? (
        <ReviewDetailModal
          reviewId={detailReviewId}
          onClose={() => setDetailReviewId(null)}
          onStatusChange={() => {
            utils.admin.reviews.invalidate();
            utils.admin.review.invalidate({ id: detailReviewId });
            utils.dashboard.overview.invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function AlertsPage() {
  const { data: alerts, isLoading } = trpc.admin.alerts.useQuery();
  const resolve = trpc.admin.resolveAlert.useMutation();
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveAlertId, setResolveAlertId] = useState<number | null>(null);
  // V2: admin harus lihat isi review dulu sebelum mark resolved
  const [detailAlertId, setDetailAlertId] = useState<number | null>(null);
  // Item 8 owner: search + pagination biar daftar alert panjang tetap mudah dibaca.
  const [alertSearch, setAlertSearch] = useState("");
  const [alertPage, setAlertPage] = useState(1);
  const alertPageSize = 10;

  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    const q = alertSearch.trim().toLowerCase();
    if (!q) return alerts;
    return alerts.filter((a) => `${a.receiptNo} ${a.message} ${a.comment ?? ""} ${a.storeName ?? ""} ${a.branchName ?? ""}`.toLowerCase().includes(q));
  }, [alerts, alertSearch]);
  const alertTotalPages = Math.ceil(filteredAlerts.length / alertPageSize) || 1;
  const pagedAlerts = filteredAlerts.slice((Math.min(alertPage, alertTotalPages) - 1) * alertPageSize, Math.min(alertPage, alertTotalPages) * alertPageSize);

  if (isLoading || !alerts) return <Loading />;

  const handleResolve = (id: number) => {
    setResolveAlertId(id);
    setResolveNote("");
    setModalOpen(true);
  };

  const confirmResolve = () => {
    if (resolveAlertId) {
      resolve.mutate(
        { id: resolveAlertId, note: resolveNote.trim() || undefined },
        {
          onSuccess: () => {
            utils.admin.alerts.invalidate();
            utils.admin.reviews.invalidate();
            utils.dashboard.overview.invalidate();
            setModalOpen(false);
            setResolveAlertId(null);
            setResolveNote("");
          },
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Action queue"
        title="Alert center"
        subtitle="Resolve low-rating signals before they become recurring issues."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Critical reviews"
          value={alerts.filter((a) => a.status === "open" && a.severity === "critical").length}
          tone="rose"
        />
        <SummaryCard
          label="Open attention"
          value={alerts.filter((a) => a.status === "open" && a.severity !== "critical").length}
          tone="amber"
        />
        <SummaryCard
          label="Resolved"
          value={alerts.filter((a) => a.status === "resolved").length}
          tone="green"
        />
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/75 p-3 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={alertSearch} onChange={(e) => { setAlertSearch(e.target.value); setAlertPage(1); }} placeholder="Search receipt, pesan alert, komentar, store…" className="h-10 w-full text-sm outline-none" />
        </div>
        {alertSearch ? <button onClick={() => { setAlertSearch(""); setAlertPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">Reset</button> : null}
      </div>
      <div className="space-y-3">
        {pagedAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex flex-wrap items-center gap-4 rounded-2xl border bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] ${
              alert.status === "open" ? "border-rose-100" : "border-white/70 opacity-70"
            }`}
          >
            <div
              className={`grid h-11 w-11 place-items-center rounded-xl ${
                alert.status === "open" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
              }`}
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-[180px] flex-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailAlertId(alert.reviewId)}
                  className="font-bold text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-[#2f6fed]"
                >
                  {alert.receiptNo}
                </button>
                <StatusBadge status={alert.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">{alert.storeName ?? alert.branchName} · {alert.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                Rating overall {Number(alert.overall).toFixed(2)} · {moneyDate(alert.createdAt)}
              </p>
              {/* V2: admin harus tahu isi review sebelum mark resolved */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>Install <b className="text-slate-700">{(alert.installationRating ?? 0).toFixed(1)}</b></span>
                <span>Groom <b className="text-slate-700">{(alert.groomingRating ?? 0).toFixed(1)}</b></span>
                <span>Service <b className="text-slate-700">{(alert.serviceRating ?? 0).toFixed(1)}</b></span>
              </div>
              {alert.comment ? (
                <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs italic text-slate-600">
                  “{alert.comment}”
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-400 italic">Pelanggan tidak menulis komentar.</p>
              )}
              {alert.note && (
                <p className="mt-1 text-xs text-slate-400">
                  Note: <span className="text-slate-600">{alert.note}</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={() => setDetailAlertId(alert.reviewId)}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#2f6fed] hover:text-[#2f6fed]"
              >
                <Eye className="h-3.5 w-3.5" /> Lihat review
              </button>
              {alert.status === "open" ? (
                <button
                  onClick={() => handleResolve(alert.id)}
                  className="rounded-xl bg-[#2f6fed] px-4 py-2.5 text-xs font-bold text-white"
                >
                  Mark resolved
                </button>
              ) : (
                <span className="text-center text-xs font-semibold text-emerald-600">Resolved</span>
              )}
            </div>
          </div>
        ))}
        {!pagedAlerts.length ? (
          <Empty text={alertSearch ? "Tidak ada alert yang cocok dengan pencarian." : "Tidak ada alert saat ini. Semua aman."} />
        ) : null}
      </div>
      {filteredAlerts.length > alertPageSize ? (
        <div className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/75 px-5 py-3 text-xs text-slate-500 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]">
          <span>Menampilkan {(Math.min(alertPage, alertTotalPages) - 1) * alertPageSize + 1}-{Math.min(Math.min(alertPage, alertTotalPages) * alertPageSize, filteredAlerts.length)} dari {filteredAlerts.length} alert</span>
          <div className="flex items-center gap-2">
            <button disabled={alertPage <= 1} onClick={() => setAlertPage((p) => Math.max(1, p - 1))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span className="font-semibold text-slate-600">Halaman {Math.min(alertPage, alertTotalPages)} dari {alertTotalPages}</span>
            <button disabled={alertPage >= alertTotalPages} onClick={() => setAlertPage((p) => Math.min(alertTotalPages, p + 1))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      {/* Resolve Alert Modal */}
      {modalOpen && resolveAlertId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setModalOpen(false)}>
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Resolve Alert</h2>
                <p className="mt-1 text-sm text-slate-500">Add a note before marking this alert as resolved.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2 text-sm font-semibold text-slate-700">
                Note (optional)
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  rows={4}
                  placeholder="Catatan tindak lanjut..."
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-[#2f6fed] resize-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button onClick={() => setModalOpen(false)} className="h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">
                Cancel
              </button>
              <button
                onClick={confirmResolve}
                disabled={resolve.isPending}
                className="h-11 rounded-xl bg-[#2f6fed] px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {resolve.isPending ? "Resolving..." : "Mark resolved"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail review dari alert — admin baca isi dulu sebelum mark resolved */}
      {detailAlertId ? (
        <ReviewDetailModal
          reviewId={detailAlertId}
          onClose={() => setDetailAlertId(null)}
          onStatusChange={() => {
            utils.admin.alerts.invalidate();
            utils.admin.reviews.invalidate();
            utils.dashboard.overview.invalidate();
            setDetailAlertId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function QRCodesPage() {
  const { data: qrs, isLoading } = trpc.admin.qrCodes.useQuery();
  const utils = trpc.useUtils();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useClickOutside(() => setDownloadOpen(false));

  if (isLoading || !qrs) return <Loading />;
  const universal = qrs.find((row) => !row.branchName) ?? qrs[0];
  if (!universal) {
    return (
      <div className="space-y-6">
        <PageHeading eyebrow="Offline → online bridge" title="QR codes" subtitle="Kelola kode QR untuk pelanggan mengisi review." />
        <div className="rounded-2xl border border-white/70 bg-white/75 p-12 text-center text-sm text-slate-400">
          Belum ada QR universal. Tambahkan satu baris di tabel <code>qr_codes</code> dengan <code>branchId</code> NULL.
        </div>
      </div>
    );
  }

  const { qr } = universal;
  const qrUrl = typeof window !== "undefined" ? window.location.origin + "/r/" + qr.code : "/r/" + qr.code;

  const download = async (format: "svg" | "png" | "jpg") => {
    if (format === "svg") {
      const svg = document.getElementById("qr-" + qr.code);
      if (!svg) return;
      const source = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([source], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = qr.code + ".svg";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (format === "png") {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      // replace near-white pixels with transparent
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 240 && g > 240 && b > 240) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const mime = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve as BlobCallback, mime, 1));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = qr.code + "." + format;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { qr: qrData } = universal;
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Offline → online bridge" title="QR code" subtitle="Satu QR code universal — pelanggan mengisi review tanpa pilih branch; admin menetapkan branch dari dashboard." />
      <div className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-slate-900">{qr.name}</p>
            <p className="mt-1 text-xs text-slate-400">Semua branch · <span className="font-semibold text-[#2f6fed]">{qr.code}</span></p>
          </div>
          <StatusBadge status={qr.status === "active" ? "resolved" : "archived"} />
        </div>

        <div className="my-6 flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeCanvas
              ref={canvasRef}
              value={qrUrl}
              size={512}
              level="H"
              bgColor="#FFFFFF"
              fgColor="#000000"
              includeMargin
            />
          </div>
          <p className="mx-auto w-fit max-w-full truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{qrUrl}</p>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <div className="relative" ref={downloadRef}>
            <button onClick={() => setDownloadOpen(!downloadOpen)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> Download <ChevronDown className={`h-3.5 w-3.5 transition ${downloadOpen ? "rotate-180" : ""}`} />
            </button>
            {downloadOpen ? (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
                <button onClick={() => { download("svg"); setDownloadOpen(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FileText className="h-4 w-4 text-blue-500" /> SVG (.svg)
                </button>
                <button onClick={() => { void download("png"); setDownloadOpen(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FileImage className="h-4 w-4 text-emerald-600" /> PNG (.png) — transparan
                </button>
                <button onClick={() => { void download("jpg"); setDownloadOpen(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FileImage className="h-4 w-4 text-orange-500" /> JPG (.jpg) — putih
                </button>
              </div>
            ) : null}
          </div>
          <Link href={"/r/" + qr.code} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">
            <ExternalLink className="h-3.5 w-3.5" /> Buka Halaman
          </Link>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Cetak & pasang QR ini di lokasi layanan. Setiap pelanggan memindai QR yang sama — admin mengklasifikasikan setiap ulasan secara manual.</p>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { data, isLoading } = trpc.dashboard.overview.useQuery({});
  // Ringkasan 7 hari dirender server-side secara deterministik & instan -> query biasa,
  // auto-load bareng halaman. Dulu mutation + tombol "AI Summarize"; LLM-nya sudah dibuang.
  const recap = trpc.admin.analyticsRecap.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading || !data) return <Loading />;

  const storeRows = [...(data.storeAnalytics ?? [])].sort((a, b) => b.reviews - a.reviews);
  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Performance intelligence" title="Analytics & Leaderboard" subtitle={`Performa setiap store berdasarkan jumlah review dan rerata rating (threshold ${Number(data.threshold).toFixed(1)}).`} action={<button onClick={() => recap.refetch()} disabled={recap.isFetching} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dbe7ff] bg-white/80 px-4 text-sm font-bold text-[#0f2f5f] transition hover:bg-[#f6f9ff] disabled:opacity-60"><RefreshCw className={recap.isFetching ? "h-4 w-4 animate-spin text-[#2f6fed]" : "h-4 w-4 text-[#2f6fed]"} /> Refresh</button>} />
      <div className="rounded-2xl border border-[#dbe7ff] bg-[#f6f9ff] p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#2f6fed]" />
          <p className="text-sm font-bold text-slate-900">Summary Review</p>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#2f6fed]">7 hari terakhir</span>
        </div>
        {recap.isError ? (
          <p className="text-sm text-rose-600">Gagal memuat summary: {recap.error.message}</p>
        ) : recap.isFetching && !recap.data ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#2f6fed]" /> Memuat summary…
          </div>
        ) : recap.data?.stats ? (
          (() => {
            const st = recap.data.stats;
            const f2 = (n: number) => n.toFixed(2);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total review</p><p className="mt-1 text-2xl font-bold text-slate-900">{st.total}</p></div>
                  <div className="rounded-xl bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rata-rata</p><p className="mt-1 text-2xl font-bold text-[#2f6fed]">{f2(st.average)}<span className="text-sm font-semibold text-slate-400">/5</span></p></div>
                  <div className="rounded-xl bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Positif</p><p className="mt-1 text-2xl font-bold text-emerald-600">{st.good}</p></div>
                  <div className="rounded-xl bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Belum di-resolve</p><p className="mt-1 text-2xl font-bold text-amber-600">{st.pending}</p></div>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#dbe7ff] bg-white/70">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <tr><th className="px-4 py-2.5">Store</th><th className="px-4 py-2.5 text-right">Review</th><th className="px-4 py-2.5 text-right">Rata-rata</th><th className="px-4 py-2.5 text-right">Pending</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {st.stores.map((row) => (
                        <tr key={row.name}>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{row.name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{row.n}</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900">{f2(row.average)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.pending ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{row.pending}</span> : <span className="text-xs text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-slate-500">{recap.data?.summary}</p>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">Store Performance Ranking</p>
              <p className="mt-1 text-xs text-slate-400">Urutan berdasarkan jumlah review per store (terbanyak ke teratas)</p>
            </div>
            <QrCode className="h-5 w-5 text-[#2f6fed]" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={storeRows} layout="vertical" margin={{ left: 10, right: 12 }}>
                <CartesianGrid horizontal={false} stroke="#edf1ef" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} width={160} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ border: "0", borderRadius: 12 }} />
                <Bar dataKey="reviews" fill="#2f6fed" radius={[0, 8, 8, 0]} barSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-6">
          <p className="text-sm font-bold">Dimension Scorecard</p>
          <p className="mt-1 text-xs text-slate-400">Skor rata-rata berdasarkan 3 aspek penilaian utama</p>
          <div className="mt-7 space-y-6">
            {[
              ["Hasil Pemasangan / Installation", data.dimensions.installation, "bg-[#2f6fed]"],
              ["Grooming & Sikap Tim", data.dimensions.grooming, "bg-[#8bb947]"],
              ["Kualitas Pelayanan", data.dimensions.service, "bg-[#d19b37]"],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-700">{label}</span>
                  <span className="font-bold text-slate-900">{Number(value).toFixed(2)} / 5.0</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(value) / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3 border-t border-slate-100 pt-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Threshold & Alerts</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Positive threshold</span>
              <span className="font-bold text-emerald-600">&ge; {Number(data.threshold).toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Negative threshold</span>
              <span className="font-bold text-rose-600">&lt; {Number(data.threshold).toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Open alerts</span>
              <span className="font-bold text-rose-600">{data.alertSummary.critical + data.alertSummary.attention}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Sumber data</span>
              <span className="font-bold text-slate-900">{storeRows.length} store</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-6">
        <p className="text-sm font-bold text-slate-900">Store Review Summary</p>
        <p className="mt-0.5 text-xs text-slate-400">Detail review per store code beserta rerata rating</p>
        <div className="mt-4 divide-y divide-slate-100">
          {storeRows.map((store, idx) => (
            <div key={store.code} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-200 text-slate-700" : idx === 2 ? "bg-amber-800/10 text-amber-800" : "bg-slate-50 text-slate-400"}`}>
                  #{idx + 1}
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{store.name}</p>
                  <p className="text-xs text-slate-400">{store.code}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-base font-bold text-slate-900">{store.reviews}</span>
                <p className="text-[10px] text-amber-400">{stars(store.average)}</p>
              </div>
            </div>
          ))}
          {!storeRows.length ? <p className="py-4 text-center text-xs text-slate-400">Belum ada data store.</p> : null}
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const { data, isLoading } = trpc.admin.settings.useQuery();
  const update = trpc.admin.updateSettings.useMutation();
  const deleteArchived = trpc.admin.deleteArchivedReviews.useMutation();
  const { data: currentUser } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  if (isLoading || !data) return <Loading />;
  const value = (key: string, fallback: string) => form[key] ?? fallback;
  const setValue = (key: string, next: string) => setForm((current) => ({ ...current, [key]: next }));
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    update.mutate({ companyName: value("companyName", data.companyName), reviewPageTitle: value("reviewPageTitle", data.reviewPageTitle), thankYouMessage: value("thankYouMessage", data.thankYouMessage), negativeThreshold: Number(value("negativeThreshold", String(data.negativeThreshold))), timezone: value("timezone", data.timezone), primaryColor: data.primaryColor }, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2200); } });
  };
  const handleDeleteArchived = () => {
    if (!window.confirm("Hapus SEMUA review yang sudah di-archive? Aksi ini permanen dan tidak bisa dibatalkan.")) return;
    deleteArchived.mutate(undefined, { onSuccess: (res) => { utils.admin.settings.invalidate(); utils.admin.reviews.invalidate(); utils.dashboard.overview.invalidate(); alert(`Berhasil menghapus ${res.deleted} review archived.`); } });
  };
  return <div className="space-y-6"><PageHeading eyebrow="Workspace configuration" title="Settings" subtitle="Shape the experience customers see and the rules your team uses." /><form onSubmit={save} className="max-w-3xl rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><Input label="Company name" value={value("companyName", data.companyName)} onChange={(next) => setValue("companyName", next)} placeholder="Service Solution" /><Input label="Review page title" value={value("reviewPageTitle", data.reviewPageTitle)} onChange={(next) => setValue("reviewPageTitle", next)} placeholder="Bagikan pengalaman Anda" /><Input label="Negative threshold" value={value("negativeThreshold", String(data.negativeThreshold))} onChange={(next) => setValue("negativeThreshold", next)} placeholder="3.5" /><Input label="Timezone" value={value("timezone", data.timezone)} onChange={(next) => setValue("timezone", next)} placeholder="Asia/Jakarta" /></div><div className="mt-5"><label className="block space-y-2 text-sm font-semibold text-slate-700">Thank-you message<textarea value={value("thankYouMessage", data.thankYouMessage)} onChange={(event) => setValue("thankYouMessage", event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-[#2f6fed]" /></label></div><div className="mt-6 flex items-center gap-3"><button disabled={update.isPending} className="h-11 rounded-xl bg-[#2f6fed] px-5 text-sm font-bold text-white disabled:opacity-60">{update.isPending ? "Saving..." : "Save changes"}</button>{saved ? <span className="text-sm font-semibold text-emerald-600">Settings saved.</span> : null}</div><p className="mt-5 text-xs leading-5 text-slate-400">Changes are stored in the database and reflected on the public QR review page.</p></form>{currentUser?.role === "super_admin" ? <div className="max-w-3xl rounded-2xl border border-rose-100 bg-rose-50/50 p-5 sm:p-8"><h3 className="text-sm font-bold text-rose-700">Danger zone</h3><p className="mt-1 text-xs text-rose-500">Menghapus review yang sudah di-archive tidak bisa dibatalkan. Data yang terhapus hilang permanen.</p><button disabled={deleteArchived.isPending} onClick={handleDeleteArchived} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" /> {deleteArchived.isPending ? "Menghapus..." : "Delete archived reviews"}</button></div> : null}</div>;
}
function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2f6fed]">{eyebrow}</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-500">{subtitle}</p></div>{action}</div>; }
function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "rose" | "amber" | "green" }) { const style = { rose: "text-rose-600 bg-rose-50", amber: "text-amber-600 bg-amber-50", green: "text-emerald-600 bg-emerald-50" }[tone]; return <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-5 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]"><div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${style}`}><Bell className="h-4 w-4" /></div><p className="text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }
function StatusBadge({ status, unread }: { status: string; unread?: boolean }) {
  // Owner 2026-09-11: status UI cuma Open/Resolved. "new" tampil sebagai Open +
  // badge kecil "New"; unread (belum pernah dibuka) = titik biru.
  if (status === "new")
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold capitalize text-amber-700">open</span>
        <span className="inline-flex rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-700">New</span>
        {unread ? <span className="h-2 w-2 rounded-full bg-blue-500" title="Belum dibuka" /> : null}
      </span>
    );
  const style = status === "open" ? "bg-amber-50 text-amber-700" : status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600";
  return (
    <span className="inline-flex items-center gap-1.5">
      {unread ? <span className="h-2 w-2 rounded-full bg-blue-500" title="Belum dibuka" /> : null}
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${style}`}>{status}</span>
    </span>
  );
}
function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block space-y-2 text-sm font-semibold text-slate-700">{label}<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#2f6fed] focus:ring-4 focus:ring-[#2f6fed]/10" /></label>; }
function FormCard({ title, onSubmit, children }: { title: string; onSubmit: (e: React.FormEvent) => void; children: React.ReactNode }) { return <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-[#cfe0ff] bg-[#f6f9ff] p-5 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-sm font-bold text-[#0f2f5f]">{title}</p></div>{children}</form>; }
function Empty({ text }: { text: string }) { return <div className="px-6 py-12 text-center text-sm text-slate-400">{text}</div>; }
function Loading() { return <div className="space-y-7 animate-pulse"><div className="flex items-end justify-between"><div><div className="h-3 w-28 rounded bg-[#d9e8e3]" /><div className="mt-3 h-9 w-64 rounded bg-[#d9e8e3]" /><div className="mt-3 h-4 w-80 rounded bg-[#e8f0ed]" /></div><div className="h-11 w-36 rounded-xl bg-[#d9e8e3]" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 rounded-2xl bg-white/75 backdrop-blur-xl shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]" />)}</div><div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><div className="h-80 rounded-2xl bg-white/75 backdrop-blur-xl shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]" /><div className="h-80 rounded-2xl bg-white/75 backdrop-blur-xl shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]" /></div></div>; }
function MessageMark() { return <div className="relative h-5 w-5"><div className="absolute inset-0 rounded-full border-[2.5px] border-current" /><div className="absolute bottom-[-2px] left-[3px] h-2 w-2 rotate-45 border-b-[2.5px] border-l-[2.5px] border-current bg-[#79a8ff]" /></div>; }
