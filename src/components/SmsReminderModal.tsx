import { smsDeliveryView } from '../utils/smsDeliveryView';
import { useTenant } from '../context/TenantContext';
import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  MessageSquare,
  History,
  RotateCcw,
  Loader2,
  Calendar,
  Sun,
  Moon,
  Info,
  Check,
  Zap,
} from 'lucide-react';
import {
  SmsReminderSettings,
  SmsLogEntry,
  getStoredSmsSettings,
  saveSmsSettings,
  fetchServerSmsSettings,
  triggerBatchSms,
  sendTestSms,
  fetchSmsLogs,
  checkSmsDelivery,
  DEFAULT_SMS_SETTINGS,
} from '../utils/smsService';


interface SmsReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: SmsReminderSettings) => void;
  initialTab?: 'timing' | 'templates' | 'manual' | 'logs';
}

export const SmsReminderModal: React.FC<SmsReminderModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialTab = 'timing',
}) => {
  const { salonInfo: SALON_INFO } = useTenant();
  const [activeTab, setActiveTab] = useState<'timing' | 'templates' | 'manual' | 'logs'>(initialTab);
  const [settings, setSettings] = useState<SmsReminderSettings>(() => getStoredSmsSettings());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState(SALON_INFO.whatsappNumber || '0546307114');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

  // Batch trigger state
  const [isSendingBatch, setIsSendingBatch] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

  // Logs state
  const [logs, setLogs] = useState<SmsLogEntry[]>([]);
  const [checkingLog, setCheckingLog] = useState<string | null>(null);
  const [deliveryErrors, setDeliveryErrors] = useState<Record<string,string>>({});
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      // Immediately initialize with latest local storage
      setSettings(getStoredSmsSettings());
      fetchServerSmsSettings().then((remote) => {
        if (remote) setSettings(remote);
      });
      loadLogs();
    }
  }, [isOpen, initialTab]);

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    const fetchedLogs = await fetchSmsLogs();
    setLogs(fetchedLogs);
    setIsLoadingLogs(false);
  };

  const handleCheckDelivery = async (id: string) => {
    setCheckingLog(id);
    setDeliveryErrors(old => ({...old,[id]:''}));
    try {
      const result=await checkSmsDelivery(id);
      if (result.success && result.log) setLogs(old=>old.map(log=>log.id===id?result.log!:log));
      else setDeliveryErrors(old=>({...old,[id]:result.error || 'בדיקת המסירה נכשלה'}));
    } finally { setCheckingLog(null); }
  };

  if (!isOpen) return null;

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveSmsSettings(settings);
      setSaveSuccess(true);
      if (onSaved) onSaved(settings);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`שגיאה בשמירת הגדרות: ${err?.message || 'אנא נסה שוב'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone) {
      setTestResult({ status: 'error', message: 'נא להזין מספר טלפון תקין' });
      return;
    }
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const sampleMessage = `היי בדיקה 🌸\nהודעת SMS לבדיקת מערכת התזכורות של ${SALON_INFO.name} ✨\nשירות לקוחות: ${SALON_INFO.phone}`;
      const res = await sendTestSms(testPhone, sampleMessage);
      if (res.success) {
        setTestResult({ status: res.data?.status === 'failed' ? 'error' : 'success', message: res.data?.status === 'failed' ? `הספק דיווח על כישלון: ${res.data?.errorMessage || 'בדוק ביומן SMS'}` : `ההודעה התקבלה אצל ספק ה־SMS עבור ${testPhone}. בדוק את המסירה ביומן SMS` });
        loadLogs();
      } else {
        setTestResult({ status: 'error', message: res.error || 'שגיאה בשליחת SMS' });
      }
    } catch (err: any) {
      setTestResult({ status: 'error', message: err?.message || 'שגיאה בשליחה' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleTriggerBatch = async (type: 'today' | '1day') => {
    const label = type === 'today' ? 'תורי היום' : 'תורי מחר';
    setIsSendingBatch(type);
    setBatchResult(null);
    try {
      const res = await triggerBatchSms(type);
      if (res.success) {
        setBatchResult({
          status: 'success',
          message: res.message || `התזכורות עבור ${label} התקבלו אצל ספק ה־SMS; טרם אומתה מסירה`,
        });
        loadLogs();
      } else {
        setBatchResult({
          status: 'error',
          message: res.error || res.message || `שגיאה בשליחת תזכורות ל${label}`,
        });
      }
    } catch (err: any) {
      setBatchResult({
        status: 'error',
        message: err?.message || 'שגיאה בשליחת תזכורות',
      });
    } finally {
      setIsSendingBatch(null);
    }
  };

  const insertVariable = (tag: string, field: 'morningTemplate' | 'eveningTemplate') => {
    setSettings((prev) => ({
      ...prev,
      [field]: prev[field] + tag,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                <span>מערכת תזכורות SMS אוטומטיות</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  פעיל ומתוזמן ⚡
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                שליחה אוטומטית של הודעות SMS לתורי הלקוחות לפי השעות שאת קובעת
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-4 pt-3 gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('timing')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'timing'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>זמני שליחה ואוטומציה</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'templates'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>נוסחי הודעות SMS</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'manual'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>שליחה יזומה ובדיקות</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('logs');
              loadLogs();
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>יומן שליחות</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: TIMING & SCHEDULING */}
          {activeTab === 'timing' && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-950 space-y-1">
                  <p className="font-bold">כיצד עובד התזמון האוטומטי?</p>
                  <p>
                    שרת האפליקציה בודק את התורים באופן קבוע ושולח SMS אוטומטי בדיוק בשעות שתגדירי כאן.
                    כל תור מקבל הודעה אחת בלבד ללא כפילויות.
                  </p>
                </div>
              </div>

              {/* Master Toggle */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-slate-900">שליחת SMS אוטומטית ברקע</h4>
                  <p className="text-xs text-slate-500">הפעלת המנוע האוטומטי לשליחת תזכורות</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSendEnabled}
                    onChange={(e) => setSettings({ ...settings, autoSendEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Morning Reminder (Today) */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Sun className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">תזכורת בוקר (יום התור)</h4>
                      <p className="text-xs text-slate-500">שליחת SMS לכל הלקוחות שיש להם תור היום</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notifyCustomerToday}
                      onChange={(e) => setSettings({ ...settings, notifyCustomerToday: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700">שעת שליחה בבוקר:</span>
                  <input
                    type="time"
                    value={settings.morningReminderTime || '08:00'}
                    onChange={(e) => setSettings({ ...settings, morningReminderTime: e.target.value })}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-500">(לפי שעון ישראל)</span>
                </div>
              </div>

              {/* Evening Reminder (1 Day Before) */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <Moon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">תזכורת ערב (יום לפני התור)</h4>
                      <p className="text-xs text-slate-500">שליחת SMS לכל הלקוחות שיש להם תור מחר</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notifyCustomer1DayBefore}
                      onChange={(e) => setSettings({ ...settings, notifyCustomer1DayBefore: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700">שעת שליחה בערב:</span>
                  <input
                    type="time"
                    value={settings.eveningReminderTime || '20:00'}
                    onChange={(e) => setSettings({ ...settings, eveningReminderTime: e.target.value })}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-500">(לפי שעון ישראל)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="space-y-5">
              {/* Morning Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>נוסח SMS לתזכורת בוקר (יום התור):</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, morningTemplate: DEFAULT_SMS_SETTINGS.morningTemplate })
                    }
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>שחזר ברירת מחדל</span>
                  </button>
                </div>

                {/* Variable chips */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {['{customer_name}', '{start_time}', '{appointment_date}', '{service_name}', '{phone}'].map(
                    (tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertVariable(tag, 'morningTemplate')}
                        className="text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        + {tag}
                      </button>
                    )
                  )}
                </div>

                <textarea
                  rows={4}
                  value={settings.morningTemplate}
                  onChange={(e) => setSettings({ ...settings, morningTemplate: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:bg-white focus:border-indigo-500 outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Evening Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>נוסח SMS לתזכורת ערב (יום לפני התור):</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, eveningTemplate: DEFAULT_SMS_SETTINGS.eveningTemplate })
                    }
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>שחזר ברירת מחדל</span>
                  </button>
                </div>

                {/* Variable chips */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {['{customer_name}', '{start_time}', '{appointment_date}', '{service_name}', '{phone}'].map(
                    (tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertVariable(tag, 'eveningTemplate')}
                        className="text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        + {tag}
                      </button>
                    )
                  )}
                </div>

                <textarea
                  rows={4}
                  value={settings.eveningTemplate}
                  onChange={(e) => setSettings({ ...settings, eveningTemplate: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:bg-white focus:border-indigo-500 outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 3: MANUAL & TESTS */}
          {activeTab === 'manual' && (
            <div className="space-y-6">
              {/* Batch Actions */}
              <div className="space-y-3">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>שליחה מרוכזת מיידית לכל התורים</span>
                </h4>
                <p className="text-xs text-slate-500">
                  בלחיצה אחת המערכת תשלח הודעת SMS מותאמת אישית לכל לקוחה ברשימה
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isSendingBatch !== null}
                    onClick={() => handleTriggerBatch('today')}
                    className="p-4 bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSendingBatch === 'today' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Sun className="w-5 h-5" />
                    )}
                    <span>שלח SMS עכשיו לכל תורי היום ☀️</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSendingBatch !== null}
                    onClick={() => handleTriggerBatch('1day')}
                    className="p-4 bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSendingBatch === '1day' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Moon className="w-5 h-5" />
                    )}
                    <span>שלח SMS עכשיו לכל תורי מחר 🌙</span>
                  </button>
                </div>

                {batchResult && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                      batchResult.status === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {batchResult.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{batchResult.message}</span>
                  </div>
                )}
              </div>

              {/* Single Test SMS */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  <span>בדיקת שליחת SMS לטלפון שלך</span>
                </h4>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="054-XXXXXXX"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:border-indigo-500 outline-none"
                  />
                  <button
                    type="button"
                    disabled={isSendingTest}
                    onClick={handleSendTest}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isSendingTest ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>שלח SMS בדיקה</span>
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                      testResult.status === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {testResult.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-900">יומן שליחות הודעות אחרונות</h4>
                <button
                  type="button"
                  onClick={loadLogs}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>רענן יומן</span>
                </button>
              </div>

              {isLoadingLogs ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <span className="text-xs font-bold">טוען יומן שליחות...</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                  טרם נשלחו הודעות ביומן הנוכחי
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900">{log.recipientName}</span>
                          <span className="text-slate-500 font-mono" dir="ltr">
                            {log.recipientPhone}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                            {log.reminderType === 'morning_today'
                              ? 'בוקר (היום)'
                              : log.reminderType === 'evening_1day'
                              ? 'ערב (מחר)'
                              : 'יזום'}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-1">{log.messageText}</p>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.sentAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                        </span>
                      </div>
                      <div className="shrink-0 max-w-[48%] space-y-2 text-right">
                        <span className={`px-2 py-1 rounded-lg font-bold block text-[11px] ${
                          smsDeliveryView(log.status,Boolean(log.deliveryCheckedAt || log.providerStatus)).tone === 'success' ? 'bg-emerald-100 text-emerald-800' :
                          smsDeliveryView(log.status).tone === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'
                        }`}>
                          {smsDeliveryView(log.status,Boolean(log.deliveryCheckedAt || log.providerStatus)).label}
                        </span>
                        {log.errorMessage && <p className="text-rose-700 break-words" dir="auto">{log.errorMessage}</p>}
                        <button type="button" disabled={checkingLog !== null} onClick={()=>handleCheckDelivery(log.id)}
                          className="text-indigo-700 underline font-bold disabled:opacity-50">
                          {checkingLog===log.id?'בודק אצל הספק…':'בדוק מסירה'}
                        </button>
                        {log.providerMessageId && <p className="text-[10px] text-slate-500 break-all" dir="ltr">{log.provider}: {log.providerMessageId}</p>}
                        {log.deliveryCheckedAt && <p className="text-[10px] text-slate-500">נבדק: {new Date(log.deliveryCheckedAt).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}</p>}
                        {deliveryErrors[log.id] && <p role="alert" className="text-rose-700">{deliveryErrors[log.id]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                <Check className="w-3.5 h-3.5" />
                <span>ההגדרות נשמרו ותוזמנו בהצלחה!</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              סגור
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveSettings}
              className="px-5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>שמור הגדרות ותזמון</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
