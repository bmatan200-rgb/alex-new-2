import React, { useMemo } from 'react';
import { Clock, AlertCircle, Sun, Sunset, Moon, Check, Lock, Sparkles } from 'lucide-react';
import {
  isSlotInPast,
  getAllStandardSlots,
  minutesToTime,
  timeToMinutes,
  formatDurationMinutes,
} from '../utils/dateUtils';

interface SlotSelectorProps {
  slots?: string[]; // Kept for backwards compatibility
  availableSlots?: string[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  selectedDate: string;
  durationMinutes: number;
}

export const SlotSelector: React.FC<SlotSelectorProps> = ({
  slots,
  availableSlots: propAvailableSlots,
  selectedSlot,
  onSelectSlot,
  selectedDate,
  durationMinutes,
}) => {
  const effectiveAvailable = propAvailableSlots || slots || [];

  // All standard schedule slots for this day (e.g. 09:20, 11:10, 13:00, 14:50, 16:40, 18:30)
  const allDaySlots = useMemo(() => {
    return getAllStandardSlots(selectedDate, durationMinutes);
  }, [selectedDate, durationMinutes]);

  // Group slots into time periods (Morning, Afternoon, Evening)
  const morningSlots = allDaySlots.filter((slot) => {
    const hour = parseInt(slot.split(':')[0], 10);
    return hour < 12;
  });

  const afternoonSlots = allDaySlots.filter((slot) => {
    const hour = parseInt(slot.split(':')[0], 10);
    return hour >= 12 && hour < 16;
  });

  const eveningSlots = allDaySlots.filter((slot) => {
    const hour = parseInt(slot.split(':')[0], 10);
    return hour >= 16;
  });

  const renderSlotButton = (slot: string) => {
    const isSelected = slot === selectedSlot;
    const isAvailable = effectiveAvailable.includes(slot);
    const inPast = isSlotInPast(selectedDate, slot);
    const isBooked = !isAvailable && !inPast;
    const isDisabled = inPast || isBooked;

    return (
      <button
        key={slot}
        id={`time-slot-${slot.replace(':', '-')}`}
        type="button"
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) {
            onSelectSlot(slot);
          }
        }}
        className={`relative p-3.5 rounded-2xl border text-right transition-all duration-200 flex flex-col justify-between gap-2 group ${
          isSelected
            ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-purple-950 text-white border-purple-500 shadow-[0_8px_20px_rgba(168,85,247,0.45)] -translate-y-1 scale-[1.02] ring-2 ring-purple-500/50 font-bold'
            : isBooked
            ? 'bg-slate-100/80 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
            : inPast
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
            : 'bg-white hover:bg-purple-50/70 text-slate-800 border-slate-200 hover:border-purple-300 shadow-xs cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isSelected ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
            }`}>
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="font-['Rubik',sans-serif] text-base font-black tracking-tight">
              {slot}
            </span>
          </div>

          {isSelected && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500 text-white text-[10px] font-black flex items-center gap-1 shadow-[0_0_8px_rgba(168,85,247,0.8)]">
              <Check className="w-3 h-3 stroke-[3]" />
              <span>נבחר</span>
            </span>
          )}

          {isBooked && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              <span>תפוס</span>
            </span>
          )}

          {inPast && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              <span>תפוס</span>
            </span>
          )}

          {!isDisabled && !isSelected && (
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-100 transition-colors shadow-2xs">
              פנוי
            </span>
          )}
        </div>

        <div className="text-[11px] font-medium flex items-center justify-between w-full pt-1.5 border-t border-slate-100/90">
          <span className={isSelected ? 'text-purple-200 font-bold' : 'text-slate-600 font-medium'}>
            שעה: {slot}
          </span>
          <span className={isSelected ? 'text-purple-300 font-black' : 'text-slate-500'}>
            כ-{formatDurationMinutes(durationMinutes)}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Prominent Floating Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-purple-200/90 shadow-[0_4px_16px_rgba(168,85,247,0.12)] transition-all hover:shadow-[0_6px_20px_rgba(168,85,247,0.18)] hover:-translate-y-0.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-950 to-purple-950 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/40 shadow-xs">
            3
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-900 font-['Rubik',sans-serif]">
              בחרו שעה פנויה
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          </div>
        </div>

        {/* Floating Available Slots & Duration Info Badge */}
        <div className="flex items-center gap-2 flex-wrap">
          {effectiveAvailable.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold shadow-xs animate-in fade-in">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>{effectiveAvailable.length} שעות פנויות היום</span>
            </span>
          )}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold shadow-xs">
            <Clock className="w-3.5 h-3.5 text-slate-600" />
            <span>משך טיפול: {formatDurationMinutes(durationMinutes)}</span>
          </div>
        </div>
      </div>

      {allDaySlots.length === 0 ? (
        <div className="p-6 bg-slate-50/80 rounded-3xl border border-slate-200 text-center space-y-2 text-xs text-slate-600 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center mx-auto shadow-sm">
            <AlertCircle className="w-6 h-6" />
          </div>
          <p className="font-bold text-slate-900 text-sm">הקליניקה סגורה בתאריך זה</p>
          <p>בשבתות הקליניקה סגורה למנוחה. אנא בחרו יום אחר מהקרוסלה למעלה.</p>
        </div>
      ) : (
        <div className="space-y-5 bg-gradient-to-b from-slate-50/80 via-slate-50/40 to-slate-50/90 p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-inner">
          {/* Morning Slots with Prominent Floating Header */}
          {morningSlots.length > 0 && (
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-amber-300/80 shadow-[0_4px_12px_rgba(245,158,11,0.15)] text-amber-950 font-black text-xs transition-all hover:-translate-y-0.5">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-xs">
                  <Sun className="w-3.5 h-3.5" />
                </div>
                <span className="tracking-wide">בוקר (החל מ-09:20)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {morningSlots.map((slot) => renderSlotButton(slot))}
              </div>
            </div>
          )}

          {/* Afternoon Slots with Prominent Floating Header */}
          {afternoonSlots.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-slate-200/60">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-orange-300/80 shadow-[0_4px_12px_rgba(249,115,22,0.15)] text-orange-950 font-black text-xs transition-all hover:-translate-y-0.5">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center shadow-xs">
                  <Sunset className="w-3.5 h-3.5" />
                </div>
                <span className="tracking-wide">צהריים (12:00 - 16:00)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {afternoonSlots.map((slot) => renderSlotButton(slot))}
              </div>
            </div>
          )}

          {/* Evening Slots with Prominent Floating Header */}
          {eveningSlots.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-slate-200/60">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-purple-300/80 shadow-[0_4px_12px_rgba(168,85,247,0.15)] text-purple-950 font-black text-xs transition-all hover:-translate-y-0.5">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 text-white flex items-center justify-center shadow-xs">
                  <Moon className="w-3.5 h-3.5" />
                </div>
                <span className="tracking-wide">אחר הצהריים וערב (16:00 ומעלה)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {eveningSlots.map((slot) => renderSlotButton(slot))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
