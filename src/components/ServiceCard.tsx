import React from 'react';
import { Sparkles, CheckCircle2, Clock, ShieldCheck, HeartHandshake } from 'lucide-react';
import { Service } from '../types';

interface ServiceCardProps {
  service: Service;
  isSelected: boolean;
  onSelect: () => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  isSelected,
  onSelect,
}) => {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-[#e2e2e2] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#d4af37]" />
          <span className="tracking-wide">תפריט טיפולים</span>
        </h2>
        <span className="text-xs text-[#888888] font-medium tracking-wide">
          שירות יחיד וממוקד
        </span>
      </div>

      {/* The Single Menu Button Card */}
      <button
        id="single-service-select-btn"
        type="button"
        onClick={onSelect}
        className={`w-full text-right p-5 sm:p-6 rounded-2xl transition-all duration-300 relative overflow-hidden border cursor-pointer ${
          isSelected
            ? 'bg-gradient-to-br from-[#161616] via-[#121212] to-[#1a1a1a] border-[#d4af37] shadow-xl shadow-black/60 ring-1 ring-[#d4af37]/40'
            : 'bg-[#121212] hover:bg-[#161616] border-[#262626] shadow-md hover:border-[#d4af37]/50'
        }`}
      >
        {/* Top Gold Accent Ribbon */}
        <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#8c7322]" />

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2.5 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[#d4af37] text-black text-xs font-bold px-3 py-0.5 rounded-full shadow-xs uppercase tracking-wider">
                טיפול הדגל
              </span>
              <span className="bg-[#1a1a1a] text-[#d4af37] text-xs font-medium px-2.5 py-0.5 rounded-full border border-[#d4af37]/30 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {service.durationMinutes} דקות
              </span>
              <span className="bg-[#1a1a1a] text-[#888888] text-xs font-medium px-2.5 py-0.5 rounded-full border border-[#262626]">
                מניקור מקצועי
              </span>
            </div>

            <div className="flex items-baseline gap-2 pt-1">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-[#e2e2e2] font-['Rubik',sans-serif] tracking-wide">
                {service.name}
              </h3>
            </div>

            <p className="text-sm text-[#a0a0a0] leading-relaxed font-normal">
              {service.description}
            </p>

            {/* Feature Bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs text-[#c0c0c0]">
              {service.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#d4af37] flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Price & Selection Callout */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center pt-3 sm:pt-0 border-t sm:border-t-0 border-[#262626] gap-3 sm:min-w-[140px]">
            <div className="text-right">
              <div className="text-xs text-[#888888] font-medium tracking-wide">מחיר מיוחד</div>
              <div className="text-3xl font-black text-[#d4af37] font-['Rubik',sans-serif]">
                {service.price} ₪
              </div>
            </div>

            <div
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all duration-300 ${
                isSelected
                  ? 'bg-[#d4af37] text-black shadow-md shadow-[#d4af37]/20 hover:bg-[#e2c158]'
                  : 'bg-[#1a1a1a] text-[#d4af37] border border-[#d4af37]/40 hover:bg-[#d4af37] hover:text-black'
              }`}
            >
              {isSelected ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-black" />
                  <span>נבחר לתור</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  <span>בחרי שירות זה</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Trust Guarantee Badge */}
        <div className="mt-4 pt-3 border-t border-[#262626] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#888888]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>סטריליזציה ברמה רפואית מלאה</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HeartHandshake className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>אחריות תיקונים לשבוע ראשון ללא עלות</span>
          </div>
        </div>
      </button>
    </div>
  );
};
