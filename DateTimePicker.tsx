import React from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Appointment } from '../types';
import {
  buildNextDays,
  formatHebrewFullDate,
  toISODateString,
} from '../utils/dateUtils';

interface DateTimePickerProps {
  selectedDate: string;
  selectedTime: string;
  onSelectDate: (date: string) => void;
  onSelectTime: (time: string) => void;
  appointments: Appointment[];
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  selectedDate,
  selectedTime,
  onSelectDate,
  onSelectTime,
  appointments,
}) => {
  const days = buildNextDays(21);

  return (
    <div className="w-full bg-[#121212] rounded-2xl p-5 sm:p-6 border border-[#262626] shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#e2e2e2] flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-[#d4af37]" />
          <span className="tracking-wide">בחירת תאריך ושעה לתור</span>
        </h2>
        <span className="text-xs text-[#d4af37] font-medium bg-[#1a1a1a] px-2.5 py-1 rounded-full border border-[#d4af37]/30">
          זמינות בזמן אמת
        </span>
      </div>

      {/* Date Carousel */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {days.map((item) => {
          const isSelected = item.iso === selectedDate;

          return (
            <button
              key={item.iso}
              id={`date-slot-${item.iso}`}
              type="button"
              disabled={item.isClosed}
              onClick={() => {
                onSelectDate(item.iso);
                onSelectTime('');
              }}
              className={`flex-shrink-0 flex flex-col items-center justify-center w-16 sm:w-18 py-3 px-1 rounded-xl transition-all border text-center cursor-pointer ${
                item.isClosed
                  ? 'bg-[#0a0a0a] text-[#444444] border-[#1c1c1c] cursor-not-allowed opacity-50'
                  : isSelected
                  ? 'bg-[#d4af37] text-black border-[#d4af37] shadow-lg shadow-[#d4af37]/20 scale-105 font-bold'
                  : 'bg-[#161616] hover:bg-[#1e1e1e] text-[#e2e2e2] border-[#262626] hover:border-[#d4af37]/50 hover:text-[#d4af37]'
              }`}
            >
              <span className="text-[11px] font-semibold">
                {item.weekday}
              </span>
              <span className="text-lg sm:text-xl font-extrabold my-0.5 font-['Rubik',sans-serif]">
                {item.dayOfMonth}
              </span>
              {item.isClosed ? (
                <span className="text-[10px] text-[#555555]">סגור</span>
              ) : item.isToday ? (
                <span
                  className={`text-[10px] font-bold px-1.5 rounded-full ${
                    isSelected ? 'bg-black text-[#d4af37]' : 'bg-[#222222] text-[#d4af37] border border-[#d4af37]/30'
                  }`}
                >
                  היום
                </span>
              ) : (
                <span className="text-[10px] opacity-60 text-[#888]">
                  {item.month}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Date Summary */}
      <div className="bg-[#161616] rounded-xl p-3 border border-[#262626] flex items-center justify-between text-xs sm:text-sm text-[#e2e2e2]">
        <div className="font-semibold text-[#e2e2e2] flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-[#d4af37]" />
          <span className="text-[#888888]">תאריך נבחר:</span>
          <span className="font-bold text-[#d4af37]">{formatHebrewFullDate(selectedDate)}</span>
        </div>
      </div>
    </div>
  );
};
