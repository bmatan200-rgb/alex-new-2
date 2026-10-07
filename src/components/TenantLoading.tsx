import React, { useEffect, useState } from 'react';

export function TenantLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return <div dir="rtl" role="status" aria-label="העמוד נטען" aria-busy="true" className="min-h-screen bg-slate-50 p-6 sm:p-10">
    <div aria-hidden="true" className="max-w-lg mx-auto space-y-6 pt-12 motion-safe:animate-pulse">
      <div className="h-8 w-40 rounded-xl bg-slate-200 mx-auto" />
      <div className="h-36 rounded-3xl bg-slate-200/60" />
      <div className="h-12 rounded-2xl bg-slate-200/60" />
      <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-200/60" />)}</div>
    </div>
    <p className="h-6 mt-8 text-center text-sm text-slate-500" aria-live="polite">{slow ? 'רק רגע…' : ''}</p>
  </div>;
}
