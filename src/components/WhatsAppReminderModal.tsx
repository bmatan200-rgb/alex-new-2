import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  Bell,
  CheckCircle2,
  Send,
  Sparkles,
  Settings,
  Volume2,
  ShieldCheck,
  Copy,
  Check,
  Smartphone,
  User,
  Calendar,
  Clock,
  Zap,
  Moon,
  Sun,
  Eye,
  EyeOff,
  RotateCcw,
  Tag,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Info,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Appointment, WhatsAppReminderSettings } from '../types';
import { SALON_INFO } from '../utils/storage';
import {
  getStoredReminderSettings,
  saveReminderSettings,
  buildCustomerBookingConfirmationText,
  buildCustomerTodayReminderText,
  buildCustomer1DayReminderText,
  buildCustomerReminderText,
  buildAlex1DayReminderText,
  buildAlexBookingText,
  createWhatsAppDirectLink,
  openWhatsAppDirect,
  playNotificationChime,
  triggerBrowserPushNotification,
  DEFAULT_REMINDER_SETTINGS,
  formatIsraeliPhoneToE164,
} from '../utils/whatsappReminder';

interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleAppointment?: Appointment;
  initialTab?: 'templates' | 'immediate_send' | 'automation';
}

export const WhatsAppReminderModal: React.FC<WhatsAppReminderModalProps> = ({
  isOpen,
  onClose,
  sampleAppointment,
  initialTab = 'templates',
}) => {
  const [settings, setSettings] = useState<WhatsAppReminderSettings>(() => getStoredReminderSettings());
  const [activeTab, setActiveTab] = useState<'templates' | 'immediate_send' | 'automation'>(
    initialTab === ('how_it_works' as any) ? 'templates' : initialTab
  );
  const [templateSubTab, setTemplateSubTab] = useState<'1day_evening' | 'today_morning' | 'booking' | '2hours' | 'alex'>(
    'today_morning'
  );
  const [testPhoneNumber, setTestPhoneNumber] = useState<string>(SALON_INFO.phone);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      if ((initialTab as any) === 'how_it_works') {
        setActiveTab('templates');
      } else {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, initialTab]);

  const fetchDiagnostics = async () => {
    setIsDiagnosing(true);
    try {
      const res = await fetch('/api/whatsapp/diagnose');
      const data = await res.json();
      setDiagnostics(data);
    } catch (err) {
      console.warn('Failed to load diagnostics:', err);
    } finally {
      setIsDiagnosing(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'automation') {
      fetchDiagnostics();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const demoAppt: Appointment = sampleAppointment || {
    id: 999999,
    customer_name: 'שרה לוי',
    customer_phone: '050-1234567',
    service_id: 1,
    service_name: "לק ג'ל",
    price: 150,
    appointment_date: new Date().toISOString().split('T')[0],
    start_time: '12:00',
    end_time: '13:50',
    status: 'confirmed',
    notes: 'הגעה בפעם הראשונה',
  };

  const customerTodayPreviewText = buildCustomerTodayReminderText(
    demoAppt,
    settings.customerTodayTemplate
  );
  const customer1DayPreviewText = buildCustomer1DayReminderText(
    demoAppt,
    settings.customer1DayTemplate
  );
  const customerBookingPreviewText = buildCustomerBookingConfirmationText(
    demoAppt,
    settings.customerBookingConfirmationTemplate
  );
  const customer2HoursPreviewText = buildCustomerReminderText(
    demoAppt,
    settings.customerTemplate
  );
  const alexPreviewText = buildAlex1DayReminderText(demoAppt, settings.alexTemplate);

  const handleSave = () => {
    saveReminderSettings(settings);
    onClose();
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTestSound = () => {
    playNotificationChime();
  };

  const handleRequestPushPermission = async () => {
    const granted = await triggerBrowserPushNotification(
      '🔔 בדיקת התראה - Alex טיפוח ויופי',
      `התראות הדפדפן מופעלות בהצלחה! תקבלי תזכורות אוטומטיות יום לפני ב-20:00 ובבוקר התור ב-08:00.`
    );
    if (granted) {
      setSettings((prev) => ({ ...prev, browserNotificationsEnabled: true }));
      saveReminderSettings({ ...settings, browserNotificationsEnabled: true });
    }
  };

  const handleTestDirectWhatsApp = (target: 'today' | 'customer_1day' | 'booking' | '2hours' | 'alex') => {
    let phone = demoAppt.customer_phone;
    let text = customer1DayPreviewText;

    if (target === 'customer_1day') {
      phone = demoAppt.customer_phone;
      text = customer1DayPreviewText;
    } else if (target === 'today') {
      phone = demoAppt.customer_phone;
      text = customerTodayPreviewText;
    } else if (target === 'booking') {
      phone = demoAppt.customer_phone;
      text = customerBookingPreviewText;
    } else if (target === '2hours') {
      phone = demoAppt.customer_phone;
      text = customer2HoursPreviewText;
    } else if (target === 'alex') {
      phone = SALON_INFO.whatsappNumber;
      text = alexPreviewText;
    }

    openWhatsAppDirect(phone, text);
  };

  const insertVariableTag = (tag: string, field: keyof WhatsAppReminderSettings) => {
    const currentValue = (settings[field] as string) || '';
    const textarea = textareaRef.current;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = currentValue.substring(0, start) + tag + currentValue.substring(end);
      setSettings({ ...settings, [field]: newValue });

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 50);
    } else {
      setSettings({ ...settings, [field]: currentValue + ' ' + tag });
    }
  };

  const handleResetCurrentTemplate = (field: keyof WhatsAppReminderSettings) => {
    const defaultVal = DEFAULT_REMINDER_SETTINGS[field] as string;
    setSettings((prev) => ({ ...prev, [field]: defaultVal }));
    setResetSuccess(String(field));
    setTimeout(() => setResetSuccess(null), 2500);
  };

  // Immediate send to test number
  const handleTestAutomatedApi = async () => {
    setTestResult({ status: 'loading', message: 'שולח הודעה מיידית דרך השרת...' });
    try {
      const rawTargetPhone = testPhoneNumber.trim() || SALON_INFO.whatsappNumber;
      const targetPhone = formatIsraeliPhoneToE164(rawTargetPhone);
      const serverRes = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhone,
          message: `[הודעת בדיקה מיידית - ${SALON_INFO.name}]\n${customer1DayPreviewText}`,
          provider: settings.provider,
          instanceId: settings.instanceId,
          apiKey: settings.apiKey,
          webhookUrl: settings.webhookUrl,
          twilioAccountSid: settings.twilioAccountSid,
          twilioAuthToken: settings.twilioAuthToken,
          twilioPhoneNumber: settings.twilioPhoneNumber,
          twilioType: settings.twilioType || 'sms',
          reminderType: '1day',
          appointment: demoAppt,
        }),
      });

      const serverData = await serverRes.json();
      if (serverData.success) {
        const providerName = settings.provider === 'twilio' ? `Twilio (${settings.twilioType === 'sms' ? 'SMS' : 'WhatsApp'})` : settings.provider;
        setTestResult({
          status: 'success',
          message: `ההודעה נשלחה מיידית בהצלחה דרך ${providerName} למספר ${targetPhone}! (SID: ${serverData.data?.sid || 'ok'})`,
        });
      } else {
        setTestResult({
          status: 'error',
          message: serverData.error || 'שגיאה בשליחה דרך השרת. בדקי את פרטי ה-API והטלפון.',
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: `שגיאת רשת: ${err?.message || 'נכשלה הפעולה'}`,
      });
    }
  };

  // Immediate send for tomorrow batch
  const handleTestEveningBatch = async () => {
    setTestResult({ status: 'loading', message: `שולח מיידית תזכורות לכל תורי מחר...` });
    try {
      const res = await fetch('/api/whatsapp/test-1day-evening', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          status: 'success',
          message: `השליחה המיידית בוצעה בהצלחה! ${data.message || `נשלחו ${data.sentCount || 0} תזכורות.`}`,
        });
      } else {
        setTestResult({ status: 'error', message: data.error || 'נכשלה השליחה המיידית' });
      }
    } catch (err: any) {
      setTestResult({ status: 'error', message: `שגיאת תקשורת: ${err?.message || 'נכשלה הפעולה'}` });
    }
  };

  // Immediate send for today batch
  const handleTestMorningBatch = async () => {
    setTestResult({ status: 'loading', message: `שולח מיידית תזכורות לכל תורי היום...` });
    try {
      const res = await fetch('/api/whatsapp/test-today-morning', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          status: 'success',
          message: `השליחה המיידית בוצעה בהצלחה! ${data.message || `נשלחו ${data.sentCount || 0} תזכורות.`}`,
        });
      } else {
        setTestResult({ status: 'error', message: data.error || 'נכשלה השליחה המיידית' });
      }
    } catch (err: any) {
      setTestResult({ status: 'error', message: `שגיאת תקשורת: ${err?.message || 'נכשלה הפעולה'}` });
    }
  };

  const variableButtons = [
    { label: 'שם הלקוח/ה', tag: '{customer_name}' },
    { label: 'תאריך התור', tag: '{appointment_date}' },
    { label: 'שעת התור', tag: '{start_time}' },
    { label: 'שם השירות', tag: '{service_name}' },
    { label: 'שם הקליניקה', tag: '{salon_name}' },
    { label: 'טלפון הקליניקה', tag: '{phone}' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-purple-200 flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-purple-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <MessageCircle className="w-6 h-6 fill-white/20" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>ניהול תזכורות SMS ו-WhatsApp</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-300">
                  קרון אוטומטי פעיל (08:00 ו-20:00)
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                עריכת נוסח ההודעות, שליחה מיידית בלחיצת כפתור והגדרות ספק SMS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-full transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Info Banner on Fixed Schedules */}
        <div className="mx-5 sm:mx-6 mt-4 p-3 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-indigo-700 shrink-0" />
            <div className="text-indigo-950 font-medium">
              <span className="font-bold">שעות שליחה אוטומטיות קבועות (node-cron): </span>
              <span>☀️ 08:00 בבוקר (לתורי היום) | 🌙 20:00 בערב (לתורי מחר) לפי שעון ישראל.</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 sm:px-6 pt-3 border-b border-slate-100 text-xs font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`pb-3 px-3 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
              activeTab === 'templates'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>1. עריכת נוסח ההודעות</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('immediate_send')}
            className={`pb-3 px-3 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
              activeTab === 'immediate_send'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-500" />
            <span>2. שליחה מיידית ובדיקות ⚡</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('automation')}
            className={`pb-3 px-3 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
              activeTab === 'automation'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>3. הגדרות Twilio / API</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 sm:p-6 space-y-5 flex-1">
          {/* TAB 1: MESSAGE TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              {/* Sub tabs for templates */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-bold overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setTemplateSubTab('today_morning')}
                  className={`flex-1 py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    templateSubTab === 'today_morning'
                      ? 'bg-white text-amber-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>1. בוקר התור (08:00 בדיוק) ☀️</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateSubTab('1day_evening')}
                  className={`flex-1 py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    templateSubTab === '1day_evening'
                      ? 'bg-white text-indigo-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>2. ערב יום לפני (20:00)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateSubTab('booking')}
                  className={`flex-1 py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    templateSubTab === 'booking'
                      ? 'bg-white text-emerald-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>3. אישור קביעת תור</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateSubTab('2hours')}
                  className={`flex-1 py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    templateSubTab === '2hours'
                      ? 'bg-white text-blue-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>4. שעתיים לפני</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateSubTab('alex')}
                  className={`flex-1 py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    templateSubTab === 'alex'
                      ? 'bg-white text-purple-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>5. התראה לאלכס</span>
                </button>
              </div>

              {/* Template 1: Evening 1-Day Before (20:00) */}
              {templateSubTab === '1day_evening' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Moon className="w-4 h-4 text-indigo-600" />
                        <span>נוסח תזכורת ערב (יום לפני התור):</span>
                      </label>
                      <span className="text-[11px] bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-md font-bold">
                        נשלחת אוטומטית ב-20:00
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetCurrentTemplate('customer1DayTemplate')}
                        className="text-[11px] text-slate-500 hover:text-indigo-600 font-bold flex items-center gap-1 cursor-pointer"
                        title="שחזור נוסח ברירת המחדל"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>שחזר נוסח מקורי</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(customer1DayPreviewText, 'customer1day')}
                        className="text-[11px] text-purple-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'customer1day' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>העתק נוסח</span>
                      </button>
                    </div>
                  </div>

                  {/* Variables Tags Toolbar */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-indigo-600" />
                      <span>תגיות להוספה מהירה בלחיצה (מוחלפות אוטומטית בפרטי התור):</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {variableButtons.map((btn) => (
                        <button
                          key={btn.tag}
                          type="button"
                          onClick={() => insertVariableTag(btn.tag, 'customer1DayTemplate')}
                          className="px-2 py-1 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-[11px] font-medium border border-slate-200 hover:border-indigo-300 transition cursor-pointer"
                        >
                          <span className="font-mono text-indigo-600 font-bold">{btn.tag}</span> - {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={7}
                    value={settings.customer1DayTemplate || DEFAULT_REMINDER_SETTINGS.customer1DayTemplate}
                    onChange={(e) => setSettings({ ...settings, customer1DayTemplate: e.target.value })}
                    className="w-full p-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-sans leading-relaxed focus:bg-white focus:border-indigo-600 outline-none shadow-2xs"
                  />

                  {resetSuccess === 'customer1DayTemplate' && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>הנוסח שוחזר בהצלחה לברירת המחדל!</span>
                    </div>
                  )}

                  {/* Message Preview */}
                  <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-2xl text-[11px] text-slate-700 space-y-1.5">
                    <span className="font-bold text-indigo-950 block">תצוגה מקדימה של הודעת הערב (20:00):</span>
                    <div className="bg-white p-3 rounded-xl border border-indigo-200/80 shadow-xs whitespace-pre-line leading-relaxed">
                      {customer1DayPreviewText}
                    </div>
                  </div>
                </div>
              )}

              {/* Template 2: Morning Day-Of (08:00) */}
              {templateSubTab === 'today_morning' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Sun className="w-4 h-4 text-amber-600" />
                        <span>נוסח תזכורת בוקר (יום התור):</span>
                      </label>
                      <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                        נשלחת אוטומטית ב-08:00
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetCurrentTemplate('customerTodayTemplate')}
                        className="text-[11px] text-slate-500 hover:text-amber-600 font-bold flex items-center gap-1 cursor-pointer"
                        title="שחזור נוסח ברירת המחדל"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>שחזר נוסח מקורי</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(customerTodayPreviewText, 'today_customer')}
                        className="text-[11px] text-purple-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'today_customer' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>העתק נוסח</span>
                      </button>
                    </div>
                  </div>

                  {/* Variables Tags Toolbar */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-600" />
                      <span>תגיות להוספה מהירה בלחיצה:</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {variableButtons.map((btn) => (
                        <button
                          key={btn.tag}
                          type="button"
                          onClick={() => insertVariableTag(btn.tag, 'customerTodayTemplate')}
                          className="px-2 py-1 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-700 rounded-lg text-[11px] font-medium border border-slate-200 hover:border-amber-300 transition cursor-pointer"
                        >
                          <span className="font-mono text-amber-600 font-bold">{btn.tag}</span> - {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={7}
                    value={settings.customerTodayTemplate || DEFAULT_REMINDER_SETTINGS.customerTodayTemplate}
                    onChange={(e) => setSettings({ ...settings, customerTodayTemplate: e.target.value })}
                    className="w-full p-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-sans leading-relaxed focus:bg-white focus:border-amber-600 outline-none shadow-2xs"
                  />

                  {resetSuccess === 'customerTodayTemplate' && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>הנוסח שוחזר בהצלחה לברירת המחדל!</span>
                    </div>
                  )}

                  {/* Message Preview */}
                  <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl text-[11px] text-slate-700 space-y-1.5">
                    <span className="font-bold text-amber-950 block">תצוגה מקדימה של הודעת הבוקר (08:00):</span>
                    <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-xs whitespace-pre-line leading-relaxed">
                      {customerTodayPreviewText}
                    </div>
                  </div>
                </div>
              )}

              {/* Template 3: Booking Confirmation */}
              {templateSubTab === 'booking' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span>נוסח אישור קביעת תור מיידי ללקוח/ה:</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetCurrentTemplate('customerBookingConfirmationTemplate')}
                        className="text-[11px] text-slate-500 hover:text-emerald-600 font-bold flex items-center gap-1 cursor-pointer"
                        title="שחזור נוסח ברירת המחדל"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>שחזר נוסח מקורי</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(customerBookingPreviewText, 'booking')}
                        className="text-[11px] text-purple-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'booking' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>העתק נוסח</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      <span>תגיות להוספה מהירה בלחיצה:</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {variableButtons.map((btn) => (
                        <button
                          key={btn.tag}
                          type="button"
                          onClick={() => insertVariableTag(btn.tag, 'customerBookingConfirmationTemplate')}
                          className="px-2 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-lg text-[11px] font-medium border border-slate-200 hover:border-emerald-300 transition cursor-pointer"
                        >
                          <span className="font-mono text-emerald-600 font-bold">{btn.tag}</span> - {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={7}
                    value={settings.customerBookingConfirmationTemplate || DEFAULT_REMINDER_SETTINGS.customerBookingConfirmationTemplate}
                    onChange={(e) => setSettings({ ...settings, customerBookingConfirmationTemplate: e.target.value })}
                    className="w-full p-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-sans leading-relaxed focus:bg-white focus:border-emerald-600 outline-none shadow-2xs"
                  />

                  {resetSuccess === 'customerBookingConfirmationTemplate' && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>הנוסח שוחזר בהצלחה לברירת המחדל!</span>
                    </div>
                  )}

                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-2xl text-[11px] text-slate-700 space-y-1.5">
                    <span className="font-bold text-emerald-950 block">תצוגה מקדימה של הודעת אישור ההזמנה:</span>
                    <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-xs whitespace-pre-line leading-relaxed">
                      {customerBookingPreviewText}
                    </div>
                  </div>
                </div>
              )}

              {/* Template 4: 2 Hours Before */}
              {templateSubTab === '2hours' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>נוסח תזכורת שעתיים לפני התור:</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetCurrentTemplate('customerTemplate')}
                        className="text-[11px] text-slate-500 hover:text-blue-600 font-bold flex items-center gap-1 cursor-pointer"
                        title="שחזור נוסח ברירת המחדל"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>שחזר נוסח מקורי</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(customer2HoursPreviewText, '2hours')}
                        className="text-[11px] text-purple-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === '2hours' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>העתק נוסח</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-blue-600" />
                      <span>תגיות להוספה מהירה בלחיצה:</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {variableButtons.map((btn) => (
                        <button
                          key={btn.tag}
                          type="button"
                          onClick={() => insertVariableTag(btn.tag, 'customerTemplate')}
                          className="px-2 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[11px] font-medium border border-slate-200 hover:border-blue-300 transition cursor-pointer"
                        >
                          <span className="font-mono text-blue-600 font-bold">{btn.tag}</span> - {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={7}
                    value={settings.customerTemplate || DEFAULT_REMINDER_SETTINGS.customerTemplate}
                    onChange={(e) => setSettings({ ...settings, customerTemplate: e.target.value })}
                    className="w-full p-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-sans leading-relaxed focus:bg-white focus:border-blue-600 outline-none shadow-2xs"
                  />

                  {resetSuccess === 'customerTemplate' && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>הנוסח שוחזר בהצלחה לברירת המחדל!</span>
                    </div>
                  )}

                  <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl text-[11px] text-slate-700 space-y-1.5">
                    <span className="font-bold text-blue-950 block">תצוגה מקדימה של תזכורת שעתיים לפני:</span>
                    <div className="bg-white p-3 rounded-xl border border-blue-200/80 shadow-xs whitespace-pre-line leading-relaxed">
                      {customer2HoursPreviewText}
                    </div>
                  </div>
                </div>
              )}

              {/* Template 5: Alex Template */}
              {templateSubTab === 'alex' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-purple-600" />
                      <span>תבנית הודעת תזכורת לאלכס:</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetCurrentTemplate('alexTemplate')}
                        className="text-[11px] text-slate-500 hover:text-purple-600 font-bold flex items-center gap-1 cursor-pointer"
                        title="שחזור נוסח ברירת המחדל"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>שחזר נוסח מקורי</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(alexPreviewText, 'alex')}
                        className="text-[11px] text-purple-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'alex' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>העתק נוסח</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={6}
                    value={settings.alexTemplate || DEFAULT_REMINDER_SETTINGS.alexTemplate}
                    onChange={(e) => setSettings({ ...settings, alexTemplate: e.target.value })}
                    className="w-full p-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-sans leading-relaxed focus:bg-white focus:border-purple-600 outline-none shadow-2xs"
                  />

                  {resetSuccess === 'alexTemplate' && (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>הנוסח שוחזר בהצלחה לברירת המחדל!</span>
                    </div>
                  )}

                  <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-2xl text-[11px] text-slate-700 space-y-1.5">
                    <span className="font-bold text-purple-950 block">תצוגה מקדימה של ההודעה לאלכס:</span>
                    <div className="bg-white p-3 rounded-xl border border-purple-200/80 shadow-xs whitespace-pre-line leading-relaxed">
                      {alexPreviewText}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMMEDIATE SEND & TESTS */}
          {activeTab === 'immediate_send' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                <span className="font-bold text-amber-950 text-sm flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>כפתורי שליחה מיידית של תזכורות (SMS / WhatsApp)</span>
                </span>
                <p className="text-amber-900 leading-relaxed">
                  השתמשי בכפתורים אלו לשליחה ישירה ומיידית בכל עת, ללא צורך להמתין לשעות הקרון הקבועות.
                </p>
              </div>

              {/* Immediate Batch Triggers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                    <Moon className="w-4 h-4 text-indigo-600" />
                    <span>שליחה מיידית לתורי מחר</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    שולח מיד את תזכורת הערב לכל הלקוחות שקבעו תור ליום מחר.
                  </p>
                  <button
                    type="button"
                    disabled={testResult.status === 'loading'}
                    onClick={handleTestEveningBatch}
                    className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>שליחה מיידית לתורי מחר ⚡</span>
                  </button>
                </div>

                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                    <Sun className="w-4 h-4 text-amber-600" />
                    <span>שליחה מיידית לתורי היום</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    שולח מיד את תזכורת הבוקר לכל הלקוחות עם תור להיום.
                  </p>
                  <button
                    type="button"
                    disabled={testResult.status === 'loading'}
                    onClick={handleTestMorningBatch}
                    className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>שליחה מיידית לתורי היום ⚡</span>
                  </button>
                </div>
              </div>

              {/* Direct test to a single number */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-purple-600" />
                  <span>שליחת הודעת בדיקה למספר טלפון ספציפי:</span>
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="tel"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    placeholder="050-1234567"
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-purple-600"
                  />
                  <button
                    type="button"
                    disabled={testResult.status === 'loading'}
                    onClick={handleTestAutomatedApi}
                    className="py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>שליחה למספר זה</span>
                  </button>
                </div>
              </div>

              {testResult.message && (
                <div
                  className={`p-3.5 rounded-2xl text-xs font-medium whitespace-pre-line leading-relaxed ${
                    testResult.status === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                      : 'bg-red-50 text-red-900 border border-red-300'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUTOMATION & TWILIO API */}
          {activeTab === 'automation' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-2">
                <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-purple-600" />
                  <span>הגדרות ספק לשליחה אוטומטית (Twilio / Green API / Webhook)</span>
                </span>
                <p className="text-slate-600 leading-relaxed">
                  השרת מפעיל משימות node-cron ברקע לשליחה אוטומטית לפי שעון ישראל (08:00 בבוקר ו-20:00 בערב).
                </p>
              </div>

              {/* Automated Schedule Settings */}
              <div className="p-4 bg-gradient-to-r from-amber-50/70 to-orange-50/70 rounded-2xl border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
                  <span className="font-bold text-amber-950 flex items-center gap-1.5 text-sm">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>תזמון שליחה אוטומטי ללקוחות (node-cron)</span>
                  </span>
                  <span className="text-[11px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                    שעון ישראל 🇮🇱
                  </span>
                </div>

                {/* Option 1: Same day at 08:00 AM */}
                <div className="p-3 bg-white/90 rounded-xl border border-amber-100 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Sun className="w-4 h-4 text-amber-500" />
                      <span className="font-bold text-slate-900 text-xs">
                        תזכורת בוקר ביום התור
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md">
                        מופעל כברירת מחדל
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      נשלחת אוטומטית ביום התור לכל הלקוחות עם תור להיום.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[11px] font-bold text-slate-700">שעת שליחה:</label>
                      <input
                        type="time"
                        value={settings.morningReminderTime || '08:00'}
                        onChange={(e) => {
                          const updated = { ...settings, morningReminderTime: e.target.value };
                          setSettings(updated);
                          saveReminderSettings(updated);
                        }}
                        className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-xs font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none cursor-pointer"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={settings.notifyCustomerToday !== false}
                      onChange={(e) => {
                        const updated = { ...settings, notifyCustomerToday: e.target.checked };
                        setSettings(updated);
                        saveReminderSettings(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Option 2: Evening 1 day before */}
                <div className="p-3 bg-white/90 rounded-xl border border-amber-100 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Moon className="w-4 h-4 text-indigo-500" />
                      <span className="font-bold text-slate-900 text-xs">
                        תזכורת ערב יום לפני התור
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded-md">
                        אופציונלי
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      שליחת תזכורת מוקדמת נוספת בערב שלפני יום התור.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[11px] font-bold text-slate-700">שעת שליחה:</label>
                      <input
                        type="time"
                        value={settings.eveningReminderTime || '20:00'}
                        onChange={(e) => {
                          const updated = { ...settings, eveningReminderTime: e.target.value };
                          setSettings(updated);
                          saveReminderSettings(updated);
                        }}
                        className="px-2 py-1 rounded-lg border border-indigo-200 bg-white text-xs font-bold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={settings.notifyCustomer1DayBefore === true}
                      onChange={(e) => {
                        const updated = { ...settings, notifyCustomer1DayBefore: e.target.checked };
                        setSettings(updated);
                        saveReminderSettings(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>

              {/* Provider Selection */}
              <div>
                <label className="block font-bold text-slate-800 mb-1.5">בחירת ספק השליחה:</label>
                <select
                  value={settings.provider || 'twilio'}
                  onChange={(e) => setSettings({ ...settings, provider: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-purple-600 outline-none cursor-pointer"
                >
                  <option value="twilio">⭐ Twilio (WhatsApp & SMS רשמי ומאובטח)</option>
                  <option value="greenapi">Green-API (חיבור WhatsApp Web ישיר)</option>
                  <option value="ultramsg">UltraMsg (חיבור WhatsApp API)</option>
                  <option value="webhook">Webhook (Make / Zapier / n8n)</option>
                  <option value="direct">שליחה ידנית בלבד (פתיחת וואטסאפ במכשיר)</option>
                </select>
              </div>

              {/* 1. Twilio Provider Form */}
              {settings.provider === 'twilio' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-purple-600" />
                      <span>פרטי חשבון Twilio</span>
                    </span>

                    {/* Channel Selector: WhatsApp vs SMS */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, twilioType: 'whatsapp' })}
                        className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          settings.twilioType !== 'sms'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, twilioType: 'sms' })}
                        className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          settings.twilioType === 'sms'
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        SMS
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Account SID
                      </label>
                      <input
                        type="text"
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={settings.twilioAccountSid || ''}
                        onChange={(e) => setSettings({ ...settings, twilioAccountSid: e.target.value.trim() })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Auth Token
                      </label>
                      <div className="relative">
                        <input
                          type={showTwilioToken ? 'text' : 'password'}
                          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          value={settings.twilioAuthToken || ''}
                          onChange={(e) => setSettings({ ...settings, twilioAuthToken: e.target.value.trim() })}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTwilioToken(!showTwilioToken)}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showTwilioToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      מספר השולח ב-Twilio (From Number)
                    </label>
                    <input
                      type="text"
                      placeholder={
                        settings.twilioType === 'sms'
                          ? '+1234567890 (Twilio Phone Number)'
                          : 'whatsapp:+14155238886 (Twilio Sandbox / Number)'
                      }
                      value={settings.twilioPhoneNumber || ''}
                      onChange={(e) => setSettings({ ...settings, twilioPhoneNumber: e.target.value.trim() })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      {settings.twilioType === 'sms'
                        ? 'מספר הטלפון הווירטואלי שלך ב-Twilio (ברירת מחדל: +15599345376)'
                        : 'עבור WhatsApp Sandbox: whatsapp:+14155238886'}
                    </span>
                  </div>

                  {/* Live Twilio Diagnostics Box */}
                  <div className="mt-3 p-3.5 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>אבחון חיבור ובקרה חי ל-Twilio</span>
                      </span>
                      <button
                        type="button"
                        onClick={fetchDiagnostics}
                        disabled={isDiagnosing}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isDiagnosing ? 'animate-spin' : ''}`} />
                        <span>רענן אבחון</span>
                      </button>
                    </div>

                    {diagnostics ? (
                      <div className="space-y-2.5 text-[11px]">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block">סטטוס אימות:</span>
                            <span className="font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              מחובר ומאומת תקין ✓
                            </span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block">סוג חשבון:</span>
                            <span className="font-bold text-amber-700">
                              {diagnostics.twilio?.accountInfo?.type === 'Trial' ? 'חשבון התנסות (Trial)' : 'חשבון מלא (Full)'}
                            </span>
                          </div>
                        </div>

                        {diagnostics.twilio?.quotaExceeded && (
                          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 space-y-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-amber-950">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>התראה על מגבלת חשבון Twilio (Trial) להיום</span>
                            </div>
                            <p className="leading-relaxed">
                              חשבון Twilio הגיע למגבלת <strong>50 הודעות ליום</strong> שמוגדרת לחשבונות חינמיים.
                              המכסה תתאפס אוטומטית מחר, או מיד עם טעינת יתרה בחשבון Twilio.
                            </p>
                            <p className="font-medium text-[11px] text-amber-800">
                              💡 <strong>פתרון מיידי:</strong> ניתן לשלוח תזכורות בלחיצה אחת על אייקון הוואטסאפ (💬) בשורת כל תור ביומן ללא כל תלות ב-Twilio ובחינם!
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-lg text-slate-500 text-center text-xs">
                        טוען נתוני אבחון מול Twilio...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Green API Provider */}
              {settings.provider === 'greenapi' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed text-[11px]">
                    <strong>חיבור Green-API:</strong> הירשמי ב-green-api.com, סרקי את ה-QR קוד עם הוואטסאפ של הקליניקה, והזיני את ה-Instance ID וה-API Token.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">IdInstance *</label>
                      <input
                        type="text"
                        placeholder="למשל: 1101827463"
                        value={settings.instanceId || ''}
                        onChange={(e) => setSettings({ ...settings, instanceId: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">ApiTokenInstance *</label>
                      <input
                        type="text"
                        placeholder="טוקן ה-API שלך"
                        value={settings.apiKey || ''}
                        onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. UltraMsg Provider */}
              {settings.provider === 'ultramsg' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed text-[11px]">
                    <strong>חיבור UltraMsg:</strong> הירשמי ב-ultramsg.com, קבלי Instance ID ו-Token.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Instance ID *</label>
                      <input
                        type="text"
                        placeholder="instance12345"
                        value={settings.instanceId || ''}
                        onChange={(e) => setSettings({ ...settings, instanceId: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Token *</label>
                      <input
                        type="text"
                        placeholder="טוקן הגישה"
                        value={settings.apiKey || ''}
                        onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Webhook Provider */}
              {(settings.provider === 'webhook' || settings.provider === 'make') && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed text-[11px]">
                    <strong>חיבור Webhook (Make.com / Zapier / n8n):</strong> הדביקי כאן את כתובת ה-Webhook. המערכת תשלח בקשת POST עם פרטי התור והטקסט המדויק.
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Webhook URL *</label>
                    <input
                      type="url"
                      placeholder="https://hook.eu1.make.com/..."
                      value={settings.webhookUrl || ''}
                      onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-purple-600 outline-none font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 sm:p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-slate-600 hover:text-slate-900 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            סגירה
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 bg-slate-950 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-purple-500/40 shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <span>שמירת הגדרות ונוסחים</span>
          </button>
        </div>
      </div>
    </div>
  );
};
