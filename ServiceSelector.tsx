import React from 'react';
import { Sparkles, Clock, CheckCircle2, ShieldCheck, Heart } from 'lucide-react';
import { Service } from '../types';
import { formatILS, formatDurationMinutes } from '../utils/dateUtils';

interface ServiceSelectorProps {
  services: Service[];
  selectedServiceId: number;
  onSelectService: (serviceId: number) => void;
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  services,
  selectedServiceId,
  onSelectService,
}) => {
  const currentService = services[0] || {
    id: 1,
    name: "לק ג'ל",
    duration_minutes: 110,
    price: 150,
    description: 'מניקור משולב ומבנה אנטומי',
  };

  return (
    <div className="space-y-3.5">
      {/* Prominent Floating Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-purple-200/90 shadow-[0_4px_16px_rgba(168,85,247,0.12)] transition-all hover:shadow-[0_6px_20px_rgba(168,85,247,0.18)] hover:-translate-y-0.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-950 to-purple-950 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/40 shadow-xs">
            1
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-900 font-['Rubik',sans-serif]">
              פרטי הטיפול
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          </div>
        </div>

        {/* Floating Feature Tag */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-50 via-white to-purple-50 border border-purple-200 text-purple-950 text-xs font-bold shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-spin-slow" />
          <span>מבנה אנטומי יסודי ומקצועי</span>
        </div>
      </div>

      {/* Floating Service Card with 3D Elevated Icon */}
      <div
        id="single-service-card"
        onClick={() => onSelectService(currentService.id)}
        className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05)] hover:shadow-[0_15px_30px_-5px_rgba(147,51,234,0.12)] relative overflow-hidden transition-all duration-300 cursor-pointer hover:border-purple-300 group"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3.5">
              {/* Floating Elevated Icon Badge */}
              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-950 via-purple-950 to-black text-purple-300 border border-purple-400/60 flex items-center justify-center shadow-[0_6px_16px_rgba(168,85,247,0.35)] group-hover:scale-105 group-hover:shadow-[0_8px_20px_rgba(168,85,247,0.5)] transition-all duration-300 flex-shrink-0">
                <Sparkles className="w-6 h-6 text-purple-300 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-black text-slate-900 tracking-tight font-['Rubik',sans-serif]">
                    {currentService.name}
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100/70 text-purple-900 border border-purple-200">
                    מבנה אנטומי
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {currentService.description}
                </p>
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2.5 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <div className="text-right sm:text-left">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 font-['Rubik',sans-serif] tracking-tight">
                {formatILS(currentService.price)}
              </div>
              <div className="flex items-center gap-1 text-xs text-purple-700 font-bold sm:justify-end mt-0.5 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                <span>{formatDurationMinutes(currentService.duration_minutes)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 text-purple-200 text-xs px-3.5 py-1.5 rounded-full font-bold border border-purple-500/40 shadow-[0_4px_10px_rgba(168,85,247,0.25)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
              <span>נבחר לקביעה</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
