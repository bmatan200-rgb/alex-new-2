import React from 'react';
import { Calendar as CalendarIcon, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayInfo } from '../types';
import { formatHebrewFullDate } from '../utils/dateUtils';

interface DatePickerCarouselProps {
  days: DayInfo[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export const DatePickerCarousel: React.FC<DatePickerCarouselProps> = ({
  days,
  selectedDate,
  onSelectDate,
}) => {
  return (
    <div className="space-y-3.5">
      {/* Prominent Floating Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-purple-200/90 shadow-[0_4px_16px_rgba(168,85,247,0.12)] transition-all hover:shadow-[0_6px_20px_rgba(168,85,247,0.18)] hover:-translate-y-0.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-950 to-purple-950 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/40 shadow-xs">
            2
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-900 font-['Rubik',sans-serif]">
              בחרו תאריך להגעה
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          </div>
        </div>

        {/* Floating Calendar Info Badge */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-slate-50 via-white to-purple-50/60 border border-slate-200 text-slate-800 text-xs font-bold shadow-xs">
          <CalendarIcon className="w-3.5 h-3.5 text-purple-600" />
          <span>21 ימים פתוחים לבחירה</span>
        </div>
      </div>

      {/* Days Horizontal Carousel with Floating Cards */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent -mx-1 px-1">
        {days.map((day) => {
          const isSelected = day.iso === selectedDate;

          return (
            <button
              key={day.iso}
              id={`date-select-${day.iso}`}
              type="button"
              disabled={day.isClosed}
              onClick={() => onSelectDate(day.iso)}
              className={`flex-shrink-0 flex flex-col items-center justify-center w-16 sm:w-18 py-3.5 rounded-2xl transition-all duration-200 border text-center cursor-pointer relative ${
                day.isClosed
                  ? 'bg-slate-100/70 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  : isSelected
                  ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-purple-950 text-white border-purple-500 shadow-[0_8px_20px_rgba(168,85,247,0.4)] -translate-y-1 scale-105 font-bold'
                  : 'bg-white hover:bg-purple-50/60 text-slate-800 border-slate-200 hover:border-purple-300 hover:-translate-y-0.5 shadow-xs'
              }`}
            >
              {day.isToday && (
                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-full mb-0.5 ${
                  isSelected ? 'bg-purple-500 text-white shadow-[0_0_6px_rgba(168,85,247,0.8)]' : 'bg-purple-100 text-purple-900'
                }`}>
                  היום
                </span>
              )}

              <span
                className={`text-[11px] font-bold ${
                  isSelected ? 'text-purple-300' : 'text-slate-500'
                }`}
              >
                {day.weekday}
              </span>

              <span className="text-lg sm:text-xl font-black my-0.5 font-['Rubik',sans-serif]">
                {day.dayOfMonth}
              </span>

              {day.isClosed ? (
                <span className="text-[10px] text-slate-400 font-medium">סגור</span>
              ) : (
                <span
                  className={`text-[10px] font-semibold ${
                    isSelected ? 'text-purple-200' : 'text-slate-400'
                  }`}
                >
                  {day.month}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Floating Selected Date Indicator Bar */}
      <div className="bg-gradient-to-r from-purple-50 via-white to-purple-50/60 rounded-2xl p-3.5 px-4 border border-purple-200/90 flex items-center justify-between text-xs text-slate-800 shadow-[0_4px_12px_rgba(147,51,234,0.06)]">
        <div className="flex items-center gap-2.5 font-medium">
          <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] font-bold uppercase tracking-wider">תאריך נבחר לתור:</span>
            <span className="font-black text-purple-950 text-sm font-['Rubik',sans-serif]">
              {formatHebrewFullDate(selectedDate)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
