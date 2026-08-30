const fs = require('fs');

const code = `import React, { useState, useEffect } from 'react';
import { Clock, Moon, Sun, Save, Zap, Settings, RefreshCw, XCircle, CheckCircle } from 'lucide-react';
import { WhatsAppReminderSettings } from '../types';
import { getStoredReminderSettings, saveReminderSettings, formatIsraeliPhoneToE164 } from '../utils/whatsappReminder';
import { secureFetch } from '../utils/apiClient';

interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppReminderModal: React.FC<WhatsAppReminderModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [settings, setSettings] = useState<WhatsAppReminderSettings>(() => getStoredReminderSettings());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(getStoredReminderSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Save locally & to backend
      const updated = {
        ...settings,
        eveningReminderTime: settings.eveningReminderTime || '20:56',
        morningReminderTime: settings.morningReminderTime || '08:00',
      };
      
      saveReminderSettings(updated);

      await secureFetch('/api/whatsapp/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updated }),
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-3xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">הגדרות תזכורות והודעות אוטומטיות</h2>
              <p className="text-xs text-slate-500 font-medium">מרכז שליטה אחיד לשליחת הודעות למטופלות</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Main Toggle */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="font-bold text-emerald-900 text-sm">הפעלה גלובלית - שליחה אוטומטית</h3>
                <p className="text-xs text-emerald-700">כאשר דלוק, המערכת תשלח הודעות ברקע ללא התערבותך.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.autoSendEnabled}
                onChange={(e) => setSettings({ ...settings, autoSendEnabled: e.target.checked })}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Day Before Reminder */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Moon className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-sm">תזכורת ערב קודם (יום לפני)</h3>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">הפעל תזכורת זו</span>
                  <input
                    type="checkbox"
                    checked={settings.notifyCustomer1DayBefore}
                    onChange={(e) => setSettings({ ...settings, notifyCustomer1DayBefore: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-500">שעת שליחה מתוכננת</label>
                  <input
                    type="time"
                    required
                    value={settings.eveningReminderTime || '20:56'}
                    onChange={(e) => setSettings({ ...settings, eveningReminderTime: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-500">נוסח ההודעה</label>
                  <textarea
                    rows={4}
                    value={settings.customer1DayTemplate || ''}
                    onChange={(e) => setSettings({ ...settings, customer1DayTemplate: e.target.value })}
                    placeholder="היי {customer_name}, תזכורת לתור מחר בשעה {start_time}..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 resize-none focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Same Day Reminder */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Sun className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm">תזכורת בוקר (ביום הטיפול)</h3>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">הפעל תזכורת זו</span>
                  <input
                    type="checkbox"
                    checked={settings.notifyCustomerToday}
                    onChange={(e) => setSettings({ ...settings, notifyCustomerToday: e.target.checked })}
                    className="w-4 h-4 accent-amber-600"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-500">שעת שליחה מתוכננת</label>
                  <input
                    type="time"
                    required
                    value={settings.morningReminderTime || '08:00'}
                    onChange={(e) => setSettings({ ...settings, morningReminderTime: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:border-amber-500 outline-none transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-500">נוסח ההודעה</label>
                  <textarea
                    rows={4}
                    value={settings.customerTodayTemplate || ''}
                    onChange={(e) => setSettings({ ...settings, customerTodayTemplate: e.target.value })}
                    placeholder="היי {customer_name}, תזכורת לתור היום בשעה {start_time}..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 resize-none focus:border-amber-500 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-3xl flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            * משתנים לשימוש בנוסחים: <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{'{customer_name}'}</code>, <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{'{start_time}'}</code>, <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{'{date}'}</code>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'שומר...' : saveSuccess ? 'נשמר בהצלחה!' : 'שמור הגדרות עכשיו'}
          </button>
        </div>
      </div>
    </div>
  );
};
`
fs.writeFileSync('src/components/WhatsAppReminderModal.tsx', code);
