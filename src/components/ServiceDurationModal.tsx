import React, { useState, useMemo } from 'react';
import {
  Clock,
  Sparkles,
  CheckCircle2,
  X,
  Calendar,
  AlertCircle,
  Save,
  HelpCircle,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { ScheduleSettings, Service } from '../types';
import {
  formatDurationMinutes,
  formatILS,
  getAllStandardSlots,
} from '../utils/dateUtils';
import {
  DEFAULT_SCHEDULE_SETTINGS,
  getStoredScheduleSettings,
  saveStoredScheduleSettings,
} from '../utils/storage';
import { saveScheduleSettingsToFirestore } from '../lib/firebase';

interface ServiceDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  onSaveServices: (updatedServices: Service[]) => void;
  scheduleSettings?: ScheduleSettings;
  onUpdateScheduleSettings?: (newSettings: ScheduleSettings) => void;
}

const PRESET_DURATIONS = [
  { minutes: 60, label: 'שעה (60 דק׳)' },
  { minutes: 75, label: 'שעה ו-15 דק׳ (75 דק׳)' },
  { minutes: 90, label: 'שעה וחצי (90 דק׳) ⭐' },
  { minutes: 105, label: 'שעה ו-45 דק׳ (105 דק׳)' },
  { minutes: 110, label: 'שעה ו-50 דק׳ (110 דק׳)' },
  { minutes: 120, label: 'שעתיים (120 דק׳)' },
  { minutes: 150, label: 'שעתיים וחצי (150 דק׳)' },
];

export const ServiceDurationModal: React.FC<ServiceDurationModalProps> = ({
  isOpen,
  onClose,
  services,
  onSaveServices,
  scheduleSettings,
  onUpdateScheduleSettings,
}) => {
  const currentService = services[0] || {
    id: 1,
    name: "לק ג'ל",
    duration_minutes: 90,
    price: 150,
    category: 'nails',
    description: 'מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם',
  };

  const initialSchedule = scheduleSettings || getStoredScheduleSettings();

  const [name, setName] = useState(currentService.name);
  const [durationMinutes, setDurationMinutes] = useState(currentService.duration_minutes || 90);
  const [price, setPrice] = useState(currentService.price || 150);
  const [description, setDescription] = useState(currentService.description || '');

  // Salon Working Hours
  const [businessOpen, setBusinessOpen] = useState(initialSchedule.businessOpen || '09:20');
  const [businessClose, setBusinessClose] = useState(initialSchedule.businessClose || '20:30');
  const [fridayOpen, setFridayOpen] = useState(initialSchedule.fridayOpen || '09:20');
  const [fridayClose, setFridayClose] = useState(initialSchedule.fridayClose || '15:00');

  const [isSavedToast, setIsSavedToast] = useState(false);

  // Sync state when modal opens or service changes
  React.useEffect(() => {
    if (isOpen) {
      const sched = scheduleSettings || getStoredScheduleSettings();
      setName(currentService.name);
      setDurationMinutes(currentService.duration_minutes || 90);
      setPrice(currentService.price || 150);
      setDescription(currentService.description || '');
      setBusinessOpen(sched.businessOpen || '09:20');
      setBusinessClose(sched.businessClose || '20:30');
      setFridayOpen(sched.fridayOpen || '09:20');
      setFridayClose(sched.fridayClose || '15:00');
      setIsSavedToast(false);
    }
  }, [isOpen, currentService, scheduleSettings]);

  // Live slots simulation based on selected duration and working hours
  const weekdaySampleSlots = useMemo(() => {
    return getAllStandardSlots('2026-08-23', durationMinutes, businessOpen, businessClose, fridayClose);
  }, [durationMinutes, businessOpen, businessClose, fridayClose]);

  const fridaySampleSlots = useMemo(() => {
    return getAllStandardSlots('2026-08-28', durationMinutes, fridayOpen, fridayClose, fridayClose);
  }, [durationMinutes, fridayOpen, fridayClose]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const safeDuration = Math.max(15, Math.min(360, Number(durationMinutes) || 90));

    const updatedService: Service = {
      ...currentService,
      name: name.trim() || "לק ג'ל",
      duration_minutes: safeDuration,
      price: Math.max(0, Number(price) || 0),
      description: description.trim(),
    };

    const updatedList = [updatedService, ...services.slice(1)];
    onSaveServices(updatedList);

    const updatedSchedule: ScheduleSettings = {
      businessOpen: businessOpen || '09:20',
      businessClose: businessClose || '20:30',
      fridayOpen: fridayOpen || '09:20',
      fridayClose: fridayClose || '15:00',
      durationMinutes: safeDuration,
    };

    saveStoredScheduleSettings(updatedSchedule);
    saveScheduleSettingsToFirestore(updatedSchedule);
    onUpdateScheduleSettings?.(updatedSchedule);

    setIsSavedToast(true);

    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleResetToDefault = () => {
    setDurationMinutes(90);
    setPrice(150);
    setName("לק ג'ל");
    setDescription('מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם');
    setBusinessOpen('09:20');
    setBusinessClose('20:30');
    setFridayOpen('09:20');
    setFridayClose('15:00');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-950 to-purple-950 text-purple-300 border border-purple-400/40 flex items-center justify-center shadow-md">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 font-['Rubik',sans-serif]">
                הגדרת שעות פעילות ומשך טיפול
              </h3>
              <p className="text-xs text-slate-500">
                עריכת שעות הפעילות והפרשי הזמן בין תור לתור (שעה וחצי / 90 דק׳)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-6 flex-1 text-right font-['Rubik',sans-serif]">
          {isSavedToast && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>ההגדרות ושעות הפעילות נשמרו בהצלחה! היומן עודכן בזמן אמת.</span>
            </div>
          )}

          {/* Duration Section */}
          <div className="space-y-3.5 bg-purple-50/60 p-4 sm:p-5 rounded-2xl border border-purple-200/80">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>הפרש שעות ומשך טיפול (בדקות)</span>
              </label>
              <span className="text-xs font-black text-purple-950 bg-purple-200/80 px-3 py-1 rounded-full border border-purple-300 shadow-xs">
                {formatDurationMinutes(durationMinutes)}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              בחרו משך זמן מהיר או הזינו מספר דקות מדויק. לפי משך זה נבנים מרווחי השעות ביומן (למשל: 1:30 דקות = 90 דקות לכל תור).
            </p>

            {/* Presets Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
              {PRESET_DURATIONS.map((preset) => {
                const isSelected = durationMinutes === preset.minutes;
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => setDurationMinutes(preset.minutes)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                      isSelected
                        ? 'bg-slate-950 text-purple-200 border-purple-500 shadow-md shadow-purple-950/20 ring-2 ring-purple-500/40'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Minutes Input & Slider */}
            <div className="pt-3 border-t border-purple-200/60 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                    הגדרה ידנית:
                  </span>
                  <input
                    type="number"
                    min="15"
                    max="300"
                    step="5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 text-center focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <span className="text-xs text-slate-600 font-medium">דקות</span>
                </div>

                <span className="text-xs font-bold text-purple-800">
                  {durationMinutes === 90 ? '✨ מוגדר ל-1:30 שעות (ברירת מחדל מושלמת)' : `הפרש של ${durationMinutes} דקות בין תור לתור`}
                </span>
              </div>

              <input
                type="range"
                min="30"
                max="240"
                step="5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-bold px-1">
                <span>30 דק׳</span>
                <span>60 דק׳ (שעה)</span>
                <span className="text-purple-700 font-black">90 דק׳ (1:30)</span>
                <span>120 דק׳ (שעתיים)</span>
                <span>180 דק׳</span>
                <span>240 דק׳</span>
              </div>
            </div>
          </div>

          {/* Salon Working Hours Section */}
          <div className="space-y-3.5 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-600" />
                <span>שעות פעילות העסק (ימי חול ושישי)</span>
              </label>
              <span className="text-[11px] font-bold text-slate-500">
                שבת - סגור למנוחה
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Weekdays Hours */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>ימי חול (ראשון - חמישי)</span>
                  <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                    פעילות מלאה
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                      שעת פתיחה
                    </label>
                    <input
                      type="time"
                      value={businessOpen}
                      onChange={(e) => setBusinessOpen(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                      שעת סגירה
                    </label>
                    <input
                      type="time"
                      value={businessClose}
                      onChange={(e) => setBusinessClose(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Friday Hours */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>יום שישי (ערב שבת)</span>
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                    חצי יום
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                      שעת פתיחה
                    </label>
                    <input
                      type="time"
                      value={fridayOpen}
                      onChange={(e) => setFridayOpen(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                      שעת סגירה
                    </label>
                    <input
                      type="time"
                      value={fridayClose}
                      onChange={(e) => setFridayClose(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Simulation Box */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-purple-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>תצוגה מקדימה: שעות שייווצרו ביומן ({weekdaySampleSlots.length} תורים ביום חול)</span>
              </span>
              <span className="text-xs font-mono font-bold bg-purple-950/80 border border-purple-500/40 text-purple-200 px-2.5 py-1 rounded-lg">
                {businessOpen} - {businessClose} ({formatDurationMinutes(durationMinutes)})
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {weekdaySampleSlots.length > 0 ? (
                weekdaySampleSlots.map((slot, idx) => (
                  <span
                    key={slot}
                    className="text-xs font-black px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-purple-200 shadow-xs font-['Rubik',sans-serif]"
                  >
                    {idx + 1}. {slot}
                  </span>
                ))
              ) : (
                <span className="text-xs text-red-400">
                  משך הזמן ארוך מדי משעות הפעילות שנבחרו
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <span>יום שישי ({fridayOpen} - {fridayClose}):</span>
              <span className="font-bold text-purple-300">
                {fridaySampleSlots.length} תורים ({fridaySampleSlots.join(', ') || 'אין תורים'})
              </span>
            </div>
          </div>

          {/* Price & Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                מחיר הטיפול (₪)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-purple-500"
                  required
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600">
                  ₪
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                שם הטיפול
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              תיאור הטיפול (מופיע ללקוחות)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>שחזור לברירת מחדל (1:30 שעות / 90 דק׳ | 150 ₪ | 09:20-20:30)</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>שמירת שעות ומשך טיפול</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
