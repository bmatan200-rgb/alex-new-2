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
} from 'lucide-react';
import { Service } from '../types';
import {
  formatDurationMinutes,
  formatILS,
  getAllStandardSlots,
} from '../utils/dateUtils';

interface ServiceDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  onSaveServices: (updatedServices: Service[]) => void;
}

const PRESET_DURATIONS = [
  { minutes: 60, label: 'שעה (60 דק׳)' },
  { minutes: 75, label: 'שעה ו-15 דק׳ (75 דק׳)' },
  { minutes: 90, label: 'שעה וחצי (90 דק׳)' },
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
}) => {
  const currentService = services[0] || {
    id: 1,
    name: "לק ג'ל",
    duration_minutes: 110,
    price: 150,
    category: 'nails',
    description: 'מניקור יסודי משולב, חיזוק במבנה אנטומי ומריחת לק ג׳ל עמיד ואיכותי בגימור מושלם',
  };

  const [name, setName] = useState(currentService.name);
  const [durationMinutes, setDurationMinutes] = useState(currentService.duration_minutes || 110);
  const [price, setPrice] = useState(currentService.price || 150);
  const [description, setDescription] = useState(currentService.description || '');
  const [isSavedToast, setIsSavedToast] = useState(false);

  // Sync state when modal opens or service changes
  React.useEffect(() => {
    if (isOpen) {
      setName(currentService.name);
      setDurationMinutes(currentService.duration_minutes || 110);
      setPrice(currentService.price || 150);
      setDescription(currentService.description || '');
      setIsSavedToast(false);
    }
  }, [isOpen, currentService]);

  // Live slots simulation based on the selected duration
  const sampleSlots = useMemo(() => {
    // Standard weekday test (e.g. 2026-08-23 is Sunday)
    return getAllStandardSlots('2026-08-23', durationMinutes);
  }, [durationMinutes]);

  const fridaySampleSlots = useMemo(() => {
    // Friday test (e.g. 2026-08-28 is Friday)
    return getAllStandardSlots('2026-08-28', durationMinutes);
  }, [durationMinutes]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedService: Service = {
      ...currentService,
      name: name.trim() || "לק ג'ל",
      duration_minutes: Math.max(15, Math.min(360, Number(durationMinutes) || 110)),
      price: Math.max(0, Number(price) || 0),
      description: description.trim(),
    };

    const updatedList = [updatedService, ...services.slice(1)];
    onSaveServices(updatedList);
    setIsSavedToast(true);

    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleResetToDefault = () => {
    setDurationMinutes(110);
    setPrice(150);
    setName("לק ג'ל");
    setDescription('מניקור יסודי משולב, חיזוק במבנה אנטומי ומריחת לק ג׳ל עמיד ואיכותי בגימור מושלם');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-950 to-purple-950 text-purple-300 border border-purple-400/40 flex items-center justify-center shadow-md">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 font-['Rubik',sans-serif]">
                הגדרת משך טיפול ומחיר
              </h3>
              <p className="text-xs text-slate-500">
                שינוי משך הטיפול מעדכן מידית את מרווחי השעות ביומן ובהזמנת התורים
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
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-6 flex-1">
          {isSavedToast && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>ההגדרות נשמרו בהצלחה! היומן עודכן.</span>
            </div>
          )}

          {/* Duration Section */}
          <div className="space-y-3 bg-purple-50/50 p-4 sm:p-5 rounded-2xl border border-purple-100">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-900 flex items-center gap-2 font-['Rubik',sans-serif]">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>משך הטיפול (בדקות)</span>
              </label>
              <span className="text-xs font-black text-purple-900 bg-purple-100 px-3 py-1 rounded-full border border-purple-200">
                {formatDurationMinutes(durationMinutes)}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              בחרו משך זמן מהיר או הזינו מספר דקות מדויק. לפי משך זה יחושבו כל התורים הפנויים ביומן.
            </p>

            {/* Presets Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
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
            <div className="pt-3 border-t border-purple-100/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                  הגדרה ידנית:
                </span>
                <input
                  type="number"
                  min="20"
                  max="300"
                  step="5"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                  className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 text-center focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <span className="text-xs text-slate-600 font-medium">דקות טיפול</span>
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
              <div className="flex justify-between text-[10px] text-slate-600 font-bold px-1">
                <span>30 דק׳</span>
                <span>60 דק׳</span>
                <span>90 דק׳</span>
                <span>120 דק׳</span>
                <span>180 דק׳</span>
                <span>240 דק׳</span>
              </div>
            </div>
          </div>

          {/* Schedule Simulation Box */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-600" />
                <span>תצוגה מקדימה: שעות שייווצרו ביומן ({sampleSlots.length} תורים ביום רגיל)</span>
              </span>
              <span className="text-[11px] font-bold text-slate-700">
                09:20 - 20:30
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {sampleSlots.length > 0 ? (
                sampleSlots.map((slot, idx) => (
                  <span
                    key={slot}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 shadow-xs font-['Rubik',sans-serif]"
                  >
                    {idx + 1}. {slot}
                  </span>
                ))
              ) : (
                <span className="text-xs text-red-500">
                  משך הזמן ארוך מדי משעות הפעילות
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200 flex items-center justify-between">
              <span>יום שישי (09:20 - 15:00):</span>
              <span className="font-bold text-purple-700">
                {fridaySampleSlots.length} תורים ({fridaySampleSlots.join(', ')})
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
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>שחזור לברירת מחדל (110 דק׳ / 150 ₪)</span>
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
                <span>שמירת שינויים</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
