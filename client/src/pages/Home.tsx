import { ArrowRight, BarChart3, QrCode, ShieldCheck, Sparkles, Store } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { data: routes, isLoading } = trpc.customer.activeRoutes.useQuery();

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7faf8] text-slate-900">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#0f2f5f] text-[#79a8ff]">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black tracking-tight text-[#0f2f5f]">Service Solution</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2f6fed]">Experience OS</p>
          </div>
        </Link>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/75 backdrop-blur-xl px-4 py-2.5 text-sm font-bold text-slate-700 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] transition hover:border-[#2f6fed] hover:text-[#2f6fed]"
        >
          Open workspace <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <main>
        <section className="relative mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
          <div className="pointer-events-none absolute -right-20 top-0 h-96 w-96 rounded-full bg-[#d9e7ff] blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-[#e8f0ff] blur-3xl" />

          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/75 backdrop-blur-xl px-3 py-1.5 text-xs font-bold text-[#2f6fed] shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)]">
              <Sparkles className="h-3.5 w-3.5" /> Customer feedback, operationalized
            </div>
            <h1 className="text-5xl font-bold leading-[1.04] tracking-[-0.05em] text-[#0f2f5f] sm:text-7xl">
              Every review is a <span className="text-[#2f6fed]">signal</span> to get better.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg leading-8 text-slate-500">
              A QR-first customer review system that connects branch teams, service quality, and action-ready analytics in one calm workspace.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/admin"
                className="inline-flex h-13 items-center gap-2 rounded-2xl bg-[#0f2f5f] px-5 text-sm font-bold text-white shadow-xl shadow-[#0f2f5f]/15 transition hover:-translate-y-0.5"
              >
                <BarChart3 className="h-4 w-4 text-[#79a8ff]" /> Explore dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              {routes && routes.length > 0 ? (
                <Link
                  href={`/r/${routes[0].code}`}
                  className="inline-flex h-13 items-center gap-2 rounded-2xl border border-slate-200 bg-white/75 backdrop-blur-xl px-5 text-sm font-bold text-slate-700 shadow-[0_18px_60px_-28px_rgba(37,99,235,.35)] transition hover:border-[#2f6fed] hover:text-[#2f6fed]"
                >
                  <QrCode className="h-4 w-4" /> Try customer flow
                </Link>
              ) : null}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#2f6fed]" /> Real-time review capture
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#2f6fed]" /> Branch-aware QR routing
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-white/70 bg-white/75 backdrop-blur-xl">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-3">
            <Feature
              icon={<QrCode />}
              title="Scan → branch context"
              body="Every branch QR resolves on the server, so customers never have to choose a branch manually."
            />
            <Feature
              icon={<BarChart3 />}
              title="Feedback → insight"
              body="Track ratings by branch, team, and QR source with live analytics from the database."
            />
            <Feature
              icon={<ShieldCheck />}
              title="Insight → action"
              body="Low scores trigger alerts automatically, with status workflows for the team to resolve."
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="rounded-[2rem] bg-[#e8f0ff] p-7 sm:p-12">
            <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2f6fed]">Review locations</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f2f5f]">Try the QR review experience</h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">
                  These working routes are connected to the live database. Open one to see the branch locked to the QR.
                </p>
              </div>
              <Link href="/admin/qr-codes" className="inline-flex items-center gap-2 text-sm font-bold text-[#2f6fed]">
                Manage QR codes <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8">
              {isLoading ? (
                <p className="text-sm text-slate-500">Memuat lokasi…</p>
              ) : routes && routes.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {routes.map((route) => (
                    <RouteLink key={route.code} code={route.code} name={route.name} branchName={route.branchName} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#cfe0ff] bg-white/75 p-6 text-center">
                  <p className="text-sm font-semibold text-[#0f2f5f]">Belum ada QR aktif</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Tambahkan QR code dari menu Manage QR codes agar pelanggan bisa mulai mengirim review.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-5 pb-10 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>Customer Review & Service Quality Management</span>
        <span>Built for better service moments.</span>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f0ff] text-[#2f6fed]">{icon}</div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
    </div>
  );
}

function RouteLink({ code, name, branchName }: { code: string; name: string; branchName: string }) {
  return (
    <Link
      href={`/r/${code}`}
      className="flex items-center justify-between rounded-2xl border border-[#cfe0ff] bg-white/75 p-4 transition hover:-translate-y-0.5 hover:bg-white"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-[#0f2f5f]">
          <Store className="h-3.5 w-3.5 shrink-0 text-[#2f6fed]" /> {name}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">
          {branchName} · /r/{code}
        </p>
      </div>
      <div className="ml-3 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0f2f5f] text-[#79a8ff]">
        <QrCode className="h-4 w-4" />
      </div>
    </Link>
  );
}
