import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check, Loader2, MessageCircle, ShieldCheck, Star, Store, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";

function Stars({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-800">{label}</legend>
      <div className="flex gap-2" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            onClick={() => onChange(star)}
            aria-label={`${star} dari 5 bintang`}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition active:scale-95 ${star <= value ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 bg-white/75 backdrop-blur-xl text-slate-300 hover:border-amber-200 hover:text-amber-300"}`}
          >
            <Star className={`h-7 w-7 ${star <= value ? "fill-current" : ""}`} />
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">{value ? `${value} / 5` : "Pilih rating Anda"}</p>
    </fieldset>
  );
}

export default function PublicReview() {
  const [, params] = useRoute("/r/:code");
  const code = params?.code ?? "";
  const { data, isLoading, error } = trpc.customer.context.useQuery({ code }, { retry: false });
  const submit = trpc.customer.submit.useMutation();
  const [receiptNo, setReceiptNo] = useState("");
  const [teamId, setTeamId] = useState<number | undefined>();
  const [installation, setInstallation] = useState(0);
  const [grooming, setGrooming] = useState(0);
  const [service, setService] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [clientError, setClientError] = useState("");

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center bg-[#f3f7ff]"><Loader2 className="h-8 w-8 animate-spin text-[#2f6fed]" /></div>;
  }
  if (error || !data || data.state === "invalid") return <StatusPage icon={<XCircle className="h-8 w-8" />} title="QR Code tidak ditemukan" body="Pastikan Anda memindai QR Code resmi dari cabang kami." />;
  if (data.state === "disabled") return <StatusPage icon={<XCircle className="h-8 w-8" />} title="QR Code tidak aktif" body="QR Code tidak aktif. Silakan minta bantuan tim layanan kami." />;
  if (data.state === "inactive_branch") return <StatusPage icon={<Store className="h-8 w-8" />} title="Branch tidak tersedia" body="Branch ini sedang tidak tersedia untuk menerima review." />;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setClientError("");
    if (!receiptNo.trim() || !installation || !grooming || !service) {
      setClientError("Lengkapi nomor receipt dan seluruh rating sebelum mengirim.");
      return;
    }
    submit.mutate({ code, receiptNo, installationRating: installation, groomingRating: grooming, serviceRating: service, comment: comment || undefined, teamId }, {
      onSuccess: (result) => {
        if (result.duplicate) setClientError("Review untuk receipt ini sudah pernah dikirim.");
        else setSubmitted(true);
      },
      onError: (mutationError) => setClientError(mutationError.message || "Review belum dapat dikirim. Coba lagi."),
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f3f7ff] px-4 py-8 sm:py-12">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center">
          <div className="w-full rounded-[2rem] bg-white/75 backdrop-blur-xl p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#e3f2ee] text-[#2f6fed]"><Check className="h-8 w-8" /></div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-[#2f6fed]">Review terkirim</p>
            <h1 className="mb-4 text-3xl font-bold tracking-tight text-slate-900">Terima kasih!</h1>
            <p className="mx-auto max-w-sm text-base leading-7 text-slate-500">{data.settings.thankYouMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f7ff] px-4 py-5 sm:py-10">
      <main className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center justify-between px-1">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-[#2f6fed]"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f6fed]">{data.settings.companyName}</span>
        </div>
        <section className="overflow-hidden rounded-[2rem] bg-white/75 backdrop-blur-xl shadow-xl shadow-slate-200/70">
          <div className="bg-[#0f2f5f] px-6 py-8 text-white sm:px-9">
            <div className="mb-7 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/75 backdrop-blur-xl/10"><MessageCircle className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Customer feedback</p><p className="text-sm text-white/70">Kami ingin mendengar pengalaman Anda</p></div></div>
            <h1 className="max-w-sm text-3xl font-bold leading-tight tracking-tight">{data.settings.reviewPageTitle}</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-8 p-6 sm:p-9">
            <div className="rounded-2xl border border-[#dbe7ff] bg-[#f7faff] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2f6fed]" /><div><p className="text-sm font-semibold text-slate-800">Feedback Anda aman bersama kami</p></div></div></div>
            <label className="block space-y-3"><span className="text-sm font-semibold text-slate-800">No. Receipt</span><input value={receiptNo} onChange={(event) => setReceiptNo(event.target.value)} placeholder="No receipt pembelian anda" className="h-13 w-full rounded-2xl border border-slate-200 bg-white/75 backdrop-blur-xl px-4 text-base outline-none transition focus:border-[#2f6fed] focus:ring-4 focus:ring-[#2f6fed]/10" /></label>
            {data.teams && data.teams.length > 0 ? (
              <label className="block space-y-3">
                <span className="text-sm font-semibold text-slate-800">Tim Instalasi <span className="font-normal text-slate-400">(opsional)</span></span>
                <select
                  value={teamId ?? ""}
                  onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-13 w-full rounded-2xl border border-slate-200 bg-white/75 backdrop-blur-xl px-4 text-base text-slate-700 outline-none transition focus:border-[#2f6fed] focus:ring-4 focus:ring-[#2f6fed]/10"
                >
                  <option value="">Pilih Tim yang Mengerjakan (Opsional)</option>
                  {data.teams.map((t: { id: number; name: string }) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="space-y-7"><Stars value={installation} onChange={setInstallation} label="Bagaimana hasil pemasangan tim kami?" /><Stars value={grooming} onChange={setGrooming} label="Bagaimana penampilan dan kerapian tim instalasi kami?" /><Stars value={service} onChange={setService} label="Bagaimana pelayanan tim kami?" /></div>
            <label className="block space-y-3"><span className="text-sm font-semibold text-slate-800">Kritik, saran, atau komentar <span className="font-normal text-slate-400">(opsional)</span></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} placeholder="Ceritakan pengalaman Anda..." className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none transition focus:border-[#2f6fed] focus:ring-4 focus:ring-[#2f6fed]/10" /></label>
            {clientError ? <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{clientError}</div> : null}
            <button type="submit" disabled={submit.isPending} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2f6fed] text-base font-bold text-white shadow-lg shadow-[#2f6fed]/20 transition hover:bg-[#2459c7] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">{submit.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Kirim Review</button>
            <p className="text-center text-xs leading-5 text-slate-400">Dengan mengirim review, Anda membantu kami meningkatkan kualitas layanan.</p>
          </form>
        </section>
      </main>
    </div>
  );
}

function StatusPage({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="min-h-screen bg-[#f3f7ff] px-4 py-8"><div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center"><div className="w-full rounded-[2rem] bg-white/75 backdrop-blur-xl p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12"><div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-rose-500">{icon}</div><h1 className="mb-3 text-2xl font-bold tracking-tight text-slate-900">{title}</h1><p className="mb-8 leading-7 text-slate-500">{body}</p><Link href="/" className="inline-flex h-11 items-center rounded-xl bg-[#2f6fed] px-5 text-sm font-bold text-white">Kembali ke beranda</Link></div></div></div>;
}
