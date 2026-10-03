import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Search,
  ExternalLink,
  Settings,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Smartphone,
  Radio,
  RefreshCw,
  Database,
  Activity,
  Layers,
  ChevronRight,
  Filter,
  Copy,
  Check,
  Trash2,
  Palette,
  Globe,
  X,
} from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Appointment, Service, TenantInfo, ScheduleSettings } from '../types';
import { formatILS } from '../utils/dateUtils';

const COLOR_PALETTES = [
  { name: 'סגול מלכותי (Purple)', value: '#9333ea', bgClass: 'bg-purple-600' },
  { name: 'ורוד מגנטה (Rose)', value: '#ec4899', bgClass: 'bg-pink-600' },
  { name: 'טורקיז אוקיינוס (Teal)', value: '#0d9488', bgClass: 'bg-teal-600' },
  { name: 'כחול שמיים (Sky)', value: '#0ea5e9', bgClass: 'bg-sky-600' },
  { name: 'זהב ענבר (Amber)', value: '#d97706', bgClass: 'bg-amber-600' },
  { name: 'אינדיגו פרימיום (Indigo)', value: '#4f46e5', bgClass: 'bg-indigo-600' },
];

export const SuperAdminPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [activeTab, setActiveTab] = useState<'onboarding' | 'tenants' | 'system'>('onboarding');

  // Form State
  const [tenantId, setTenantId] = useState('');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#9333ea');
  const [plan, setPlan] = useState<'starter' | 'pro' | 'enterprise'>('pro');

  // Dynamic Services List in Onboarding Form
  const [services, setServices] = useState<Array<{ id: number; name: string; price: number; duration_minutes: number; description?: string }>>([
    { id: 1, name: "לק ג'ל", price: 150, duration_minutes: 90, description: 'מניקור יסודי ומריחת לק ג׳ל מקצועי' },
    { id: 2, name: 'מניקור ספא ומבנה אנטומי', price: 180, duration_minutes: 105, description: 'חיזוק ציפורן טבעית ומבנה אנטומי מושלם' },
  ]);

  const [businessOpen, setBusinessOpen] = useState('09:20');
  const [businessClose, setBusinessClose] = useState('20:30');
  const [fridayOpen, setFridayOpen] = useState('09:20');
  const [fridayClose, setFridayClose] = useState('15:00');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    tenantId: string;
    testUrl: string;
    adminUrl: string;
    name: string;
    customDomain?: string;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Delete Tenant Modal State
  const [tenantToDelete, setTenantToDelete] = useState<TenantInfo | null>(null);
  const [verificationPhone, setVerificationPhone] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const REQUIRED_DELETE_PHONE = '0543111408';
  const isPhoneMatch = verificationPhone.trim().replace(/[-\s]/g, '') === REQUIRED_DELETE_PHONE;

  const handleConfirmDelete = async () => {
    if (!tenantToDelete || !isPhoneMatch || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const targetId = tenantToDelete.id;

      // 1. Delete from Firestore directly
      await deleteDoc(doc(db, 'tenants', targetId));
      try {
        await deleteDoc(doc(db, 'tenants', targetId, 'settings', 'config'));
      } catch (e) {
        // subcollection cleanup
      }

      // 2. Also notify backend endpoint if available
      try {
        await fetch(`/api/super-admin/tenants/${targetId}`, { method: 'DELETE' });
      } catch (e) {
        // ignore server network error if firestore delete succeeded
      }

      // 3. Immediately remove from UI state
      setTenants((prev) => prev.filter((t) => t.id !== targetId));
      setTenantToDelete(null);
      setVerificationPhone('');
    } catch (err: any) {
      console.error('Error deleting tenant:', err);
      setDeleteError(err?.message || 'שגיאה בעת מחיקת הסלון מ-Firestore');
    } finally {
      setIsDeleting(false);
    }
  };

  // Fetch tenants from API
  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tenants)) {
          setTenants(data.tenants);
        }
      }
    } catch (err) {
      console.warn('Notice loading tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // Auto-generate slug when name changes if tenantId is empty or matches previous auto-slug
  const handleNameChange = (val: string) => {
    setName(val);
    if (!tenantId || tenantId === name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')) {
      const slug = val
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_');
      setTenantId(slug);
    }
  };

  // Add Service to list
  const handleAddService = () => {
    const nextId = services.length > 0 ? Math.max(...services.map((s) => s.id)) + 1 : 1;
    setServices([
      ...services,
      { id: nextId, name: 'טיפול חדש', price: 150, duration_minutes: 60, description: 'תיאור השירות' },
    ]);
  };

  // Remove Service
  const handleRemoveService = (index: number) => {
    if (services.length <= 1) {
      alert('חובה לפחות שירות אחד עבור הסלון');
      return;
    }
    setServices(services.filter((_, i) => i !== index));
  };

  // Update Service
  const handleUpdateService = (index: number, field: string, value: any) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  // Submit new tenant
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert('נא להזין שם עסק ומספר טלפון');
      return;
    }

    const finalTenantId = (tenantId || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_') || `tenant_${Date.now()}`;

    setIsSubmitting(true);
    try {
      const payload = {
        tenantId: finalTenantId,
        name: name.trim(),
        tagline: tagline.trim() || 'סטודיו לטיפוח ויופי',
        ownerName: (ownerName || name).trim(),
        phone: phone.trim(),
        email: email.trim(),
        city: city.trim(),
        address: address.trim(),
        primaryColor,
        customDomain: customDomain.trim().toLowerCase(),
        plan,
        services,
        scheduleSettings: {
          businessOpen,
          businessClose,
          fridayOpen,
          fridayClose,
          durationMinutes: services[0]?.duration_minutes || 90,
        },
      };

      const res = await fetch('/api/super-admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setCreatedResult({
          tenantId: finalTenantId,
          testUrl: data.testUrl || `http://localhost:3000?tenant=${finalTenantId}`,
          adminUrl: data.adminUrl || `http://localhost:3000/admin?tenant=${finalTenantId}`,
          name: name.trim(),
          customDomain: customDomain.trim(),
        });
        fetchTenants();
      } else {
        alert('שגיאה ביצירת סלון: ' + (data.error || 'נא לנסות שוב'));
      }
    } catch (err: any) {
      alert('שגיאת תקשורת עם השרת: ' + err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 3000);
  };

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.phone.includes(searchQuery) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.city && t.city.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tenants, searchQuery, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Heebo',sans-serif]" dir="rtl">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-purple-900/40 sticky top-0 z-30 shadow-xl backdrop-blur-md bg-slate-900/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 flex items-center justify-center font-black text-white text-base shadow-lg shadow-purple-600/30 border border-purple-400/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white font-['Rubik',sans-serif]">
                  Super Admin • Multi-Tenant SaaS Platform
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  גרסת SaaS ללא הגבלה ⚡
                </span>
              </div>
              <p className="text-xs text-slate-400">
                מרכז שליטה ובקרת מרובה סלונים, יצירת עסקים והגדרת דומיינים מותאמים
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              to="/admin?tenant=alex_beauty"
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 transition shadow-md shadow-purple-600/25 cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>לוח ניהול סלון (Alex Beauty)</span>
            </Link>

            <Link
              to="/"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
              <span>תצוגת לקוחות</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('onboarding')}
              className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'onboarding'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>יצירת סלון חדש (Onboarding Wizard)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tenants')}
              className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'tenants'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>רשימת סלונים פעילים ({tenants.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'system'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>תשתיות ו-Middleware</span>
            </button>
          </div>
        </div>

        {/* TAB 1: ONBOARDING WIZARD */}
        {activeTab === 'onboarding' && (
          <div className="space-y-6">
            
            {/* Success Alert Banner when a tenant was just created */}
            {createdResult && (
              <div className="bg-emerald-950/80 border-2 border-emerald-500/80 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl animate-in fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-emerald-200 font-['Rubik',sans-serif]">
                      הסלון &quot;{createdResult.name}&quot; נוצר בהצלחה במערכת! 🎉
                    </h3>
                    <p className="text-xs text-emerald-300">
                      הקונפיגורציה נשמרה ב-Firestore תחת <code>/tenants/{createdResult.tenantId}</code> והדומיין מופה.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {/* Test Customer View Link */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-emerald-800/60 space-y-2">
                    <span className="text-xs text-emerald-400 font-bold block">🔗 קישור בדיקה מקומי ללקוחות (Customer Booking View):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createdResult.testUrl}
                        className="bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2 flex-1 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(createdResult.testUrl, 'client')}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        {copiedLink === 'client' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink === 'client' ? 'הועתק!' : 'העתקה'}</span>
                      </button>
                      <a
                        href={createdResult.testUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>פתיחה</span>
                      </a>
                    </div>
                  </div>

                  {/* Test Admin Dashboard Link */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-emerald-800/60 space-y-2">
                    <span className="text-xs text-purple-300 font-bold block">🛡️ קישור בדיקה מקומי ללוח הניהול (Tenant Admin Dashboard):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createdResult.adminUrl}
                        className="bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-xl px-3 py-2 flex-1 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(createdResult.adminUrl, 'admin')}
                        className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        {copiedLink === 'admin' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink === 'admin' ? 'הועתק!' : 'העתקה'}</span>
                      </button>
                      <a
                        href={createdResult.adminUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>פתיחה</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Onboarding Form Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl">
              <div className="space-y-1 border-b border-slate-800 pb-4">
                <h2 className="text-xl sm:text-2xl font-black text-white font-['Rubik',sans-serif] flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-purple-400" />
                  <span>הגדרת סלון ועסק חדש ב-SaaS Multi-Tenant</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  הזינו את פרטי הסלון, בחרו צבעי מיתוג, הגדירו שירותים וקבלו באופן מיידי סביבת עבודה נפרדת עם ניתוב מבודד.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* SECTION 1: GENERAL INFO & TENANT ID */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    <span>1. פרטי העסק ומזהה ייחודי (Tenant ID)</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">שם העסק / הסלון *</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="לדוגמה: בוטיק מניקור בלה"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">
                        מזהה מערכת ייחודי (Tenant Slug) *
                      </label>
                      <input
                        type="text"
                        required
                        value={tenantId}
                        onChange={(e) => setTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        placeholder="bella_beauty"
                        className="w-full bg-slate-950 border border-slate-700 font-mono text-purple-300 rounded-xl px-3.5 py-2.5 focus:border-purple-500 focus:outline-none font-bold"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">משמש ב-URL: ?tenant={tenantId || 'slug'}</span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">סלוגן / כותרת משנה</label>
                      <input
                        type="text"
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                        placeholder="מניקור פרימיום וטיפוח"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">שם בעלת העסק *</label>
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="שם מלא"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">טלפון לבירורים והזמנות *</label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="05X-XXXXXXX"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">אימייל מנהלת</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="salon@beauty.co.il"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">עיר</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="תל אביב, חיפה, באר שבע..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">כתובת הסלון</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="רחוב ומספר בית"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">חבילת SaaS</label>
                      <select
                        value={plan}
                        onChange={(e) => setPlan(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-bold focus:border-purple-500 focus:outline-none"
                      >
                        <option value="starter">Starter (עד 100 תורים בחודש)</option>
                        <option value="pro">Pro (ללא הגבלה + SMS אוטומטי)</option>
                        <option value="enterprise">Enterprise (דומיין מותאם + ריבוי עמדות)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: BRANDING & CUSTOM DOMAIN */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    <span>2. מיתוג ויזואלי ודומיין מותאם (Custom Domain)</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    {/* Color Picker */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <label className="block text-slate-300 font-bold">צבע מיתוג ראשי (Primary Brand Color)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="w-12 h-12 rounded-xl cursor-pointer border border-slate-700 bg-transparent p-1"
                        />
                        <input
                          type="text"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="bg-slate-900 border border-slate-700 font-mono text-xs rounded-xl px-3 py-2 text-white w-28 uppercase"
                        />
                        <div
                          className="flex-1 py-2 px-3 rounded-xl text-white font-bold text-center shadow-sm"
                          style={{ backgroundColor: primaryColor }}
                        >
                          תצוגה מקדימה של כפתור
                        </div>
                      </div>

                      {/* Presets */}
                      <div className="flex items-center gap-2 flex-wrap pt-2">
                        <span className="text-slate-500 text-[11px] block w-full">פלטות צבעים מובילות:</span>
                        {COLOR_PALETTES.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setPrimaryColor(c.value)}
                            className={`w-7 h-7 rounded-lg ${c.bgClass} border-2 transition ${
                              primaryColor === c.value ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                            }`}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Custom Domain Mapping */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-indigo-400" />
                        <span>דומיין מותאם (Custom Domain / Subdomain)</span>
                      </label>
                      <input
                        type="text"
                        value={customDomain}
                        onChange={(e) => setCustomDomain(e.target.value)}
                        placeholder="לדוגמה: my-nails.co.il או studio.domain.com"
                        className="w-full bg-slate-900 border border-slate-700 font-mono text-xs rounded-xl px-3.5 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-400">
                        ה-Middleware של השרת <code>resolveTenantDomain</code> יזהה אוטומטית כניסות מדומיין זה ויכוון ישירות לסלון המתאים ללא צורך בפרמטר.
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: DYNAMIC SERVICES LIST */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>3. רשימת שירותים ומחירון ({services.length})</span>
                    </h3>

                    <button
                      type="button"
                      onClick={handleAddService}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>הוספת שירות</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {services.map((srv, idx) => (
                      <div
                        key={srv.id}
                        className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs"
                      >
                        <div className="sm:col-span-4">
                          <label className="text-[10px] text-slate-400 block mb-1">שם השירות</label>
                          <input
                            type="text"
                            required
                            value={srv.name}
                            onChange={(e) => handleUpdateService(idx, 'name', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-purple-500 font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-slate-400 block mb-1">מחיר (₪)</label>
                          <input
                            type="number"
                            required
                            value={srv.price}
                            onChange={(e) => handleUpdateService(idx, 'price', Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-purple-500 font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-slate-400 block mb-1">משך (דקות)</label>
                          <select
                            value={srv.duration_minutes}
                            onChange={(e) => handleUpdateService(idx, 'duration_minutes', Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-purple-500 font-bold"
                          >
                            <option value={30}>30 דק׳</option>
                            <option value={45}>45 דק׳</option>
                            <option value={60}>שעה (60 דק׳)</option>
                            <option value={75}>1:15 (75 דק׳)</option>
                            <option value={90}>1:30 (90 דק׳)</option>
                            <option value={105}>1:45 (105 דק׳)</option>
                            <option value={120}>שעתיים (120 דק׳)</option>
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-slate-400 block mb-1">תיאור קצר</label>
                          <input
                            type="text"
                            value={srv.description || ''}
                            onChange={(e) => handleUpdateService(idx, 'description', e.target.value)}
                            placeholder="תיאור הטיפול"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-purple-500"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveService(idx)}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition"
                            title="מחיקת שירות"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 4: SCHEDULE & WORKING HOURS */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>4. שעות פעילות וקבלת קהל</span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">פתיחה א׳-ה׳</label>
                      <input
                        type="time"
                        value={businessOpen}
                        onChange={(e) => setBusinessOpen(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-bold mb-1">סגירה א׳-ה׳</label>
                      <input
                        type="time"
                        value={businessClose}
                        onChange={(e) => setBusinessClose(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-bold mb-1">פתיחה יום שישי</label>
                      <input
                        type="time"
                        value={fridayOpen}
                        onChange={(e) => setFridayOpen(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-bold mb-1">סגירה יום שישי</label>
                      <input
                        type="time"
                        value={fridayClose}
                        onChange={(e) => setFridayClose(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* SUBMIT BUTTON */}
                <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-purple-600/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? 'יוצר סלון ושומר הגדרות...' : '🚀 יצירת סלון ופריסת סביבה חדשה'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: TENANTS LIST */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חיפוש לפי שם סלון, בעלת עסק, טלפון, עיר, סלאג..."
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pr-10 pl-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 font-bold"
                >
                  <option value="all">כל הסטטוסים ({tenants.length})</option>
                  <option value="active">פעיל בלבד</option>
                  <option value="trial">תקופת ניסיון</option>
                  <option value="suspended">מושהה</option>
                </select>
              </div>
            </div>

            {/* Grid of Tenants */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTenants.map((t) => {
                const tenantSlug = t.tenantSlug || t.id;
                const localTestClientUrl = `http://localhost:3000?tenant=${tenantSlug}`;
                const localTestAdminUrl = `http://localhost:3000/admin?tenant=${tenantSlug}`;

                return (
                  <div
                    key={t.id}
                    className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-black text-white font-['Rubik',sans-serif]">
                            {t.name}
                          </h3>
                          {t.id === 'alex_beauty' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white">
                              ברירת מחדל 👑
                            </span>
                          )}
                          <span
                            className="w-3 h-3 rounded-full border border-white/20"
                            style={{ backgroundColor: t.primaryColor || '#9333ea' }}
                            title={`צבע מותאם: ${t.primaryColor}`}
                          />
                        </div>
                        <p className="text-xs text-slate-400">{t.tagline || 'סטודיו לטיפוח ויופי'}</p>
                      </div>

                      <span className="text-[11px] font-mono text-purple-300 bg-purple-950/60 px-2 py-1 rounded-lg border border-purple-800/60">
                        {tenantSlug}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        <span>בעלים: <strong>{t.ownerName}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span dir="ltr">{t.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t.city || 'ישראל'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{t.customDomain || 'ללא דומיין'}</span>
                      </div>
                    </div>

                    {/* Direct Launch Actions & Tenant Management */}
                    <div className="bg-slate-950 rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap border border-slate-800">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={localTestClientUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"
                        >
                          <ExternalLink className="w-3 h-3 text-purple-400" />
                          <span>אתר לקוחות (?tenant={tenantSlug})</span>
                        </a>

                        <Link
                          to={`/admin?tenant=${t.tenantSlug || t.id}`}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>ניהול סלון</span>
                        </Link>
                      </div>

                      {/* Delete Salon Button (Requirement 1 & 2: Hidden/disabled for default core tenant alex_beauty) */}
                      {t.id !== 'alex_beauty' && !(t as any).isDefault && !(t as any).isPrimary && (
                        <button
                          type="button"
                          onClick={() => {
                            setTenantToDelete(t);
                            setVerificationPhone('');
                            setDeleteError(null);
                          }}
                          className="px-3 py-1.5 bg-red-950/70 hover:bg-red-600 text-red-300 hover:text-white border border-red-800/80 hover:border-red-500 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                          title={`מחיקת ${t.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          <span>מחיקת סלון</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM ARCHITECTURE */}
        {activeTab === 'system' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">מבנה נתונים ו-Middleware בשרת Express</h3>
                  <p className="text-xs text-slate-400">ארכיטקטורת Multi-Tenant מבודדת מלאה</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-purple-300 font-bold block">1. נתיב פרופיל ומיתוג:</span>
                  <p className="text-slate-400">/tenants/{'{tenantId}'}</p>
                  <p className="text-[11px] text-slate-500">שם עסק, טלפון, צבע מיתוג, סלוגן, סטטוס</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-indigo-300 font-bold block">2. נתיב קונפיגורציה:</span>
                  <p className="text-slate-400">/tenants/{'{tenantId}'}/settings/config</p>
                  <p className="text-[11px] text-slate-500">שירותים, מחירון, משך תורים, שעות פעילות</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-emerald-300 font-bold block">3. נתיב תורים ביומן:</span>
                  <p className="text-slate-400">/tenants/{'{tenantId}'}/appointments</p>
                  <p className="text-[11px] text-slate-500">תורים מוזמנים ונעילות משבצת ביומן הסלון</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CONFIRMATION MODAL FOR TENANT DELETION (Requirements 3, 4, 5, 6) */}
      {tenantToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-red-500/60 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl shadow-red-950/50 text-right">
            
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-950/80 border border-red-500/50 text-red-400 flex items-center justify-center font-black">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-white font-['Rubik',sans-serif]">
                    מחיקת סלון: {tenantToDelete.name}
                  </h3>
                  <span className="text-xs font-mono text-purple-300">
                    מזהה מערכת: {tenantToDelete.id}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setTenantToDelete(null);
                    setVerificationPhone('');
                    setDeleteError(null);
                  }
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Red Warning Banner (Requirement 5) */}
            <div className="bg-red-950/80 border-2 border-red-600/80 rounded-2xl p-4 text-red-200 text-xs sm:text-sm font-bold flex items-start gap-3 shadow-inner">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-black text-sm">
                  אזהרה: פעולה זו תמחק את הסלון וכל הנתונים שלו לצמיתות!
                </p>
                <p className="text-[11px] text-red-300 mt-1">
                  הפרופיל, הגדרות השירותים, שעות הפעילות וכל התורים השמורים של סלון זה יוסרו מבסיס הנתונים.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-950 border border-red-500 text-red-200 text-xs">
                {deleteError}
              </div>
            )}

            {/* Phone Verification Input (Requirement 4) */}
            <div className="space-y-2">
              <label className="block text-xs sm:text-sm font-bold text-slate-200">
                הקלידו את מספר הטלפון המאמת (<span className="text-emerald-400 font-mono" dir="ltr">0543111408</span>) לאישור המחיקה:
              </label>
              <input
                type="tel"
                value={verificationPhone}
                onChange={(e) => setVerificationPhone(e.target.value)}
                placeholder="0543111408"
                dir="ltr"
                className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl px-4 py-3 text-white font-mono text-center text-base tracking-widest font-bold focus:outline-none shadow-inner"
              />
              <p className="text-[11px] text-slate-400 text-right">
                {isPhoneMatch ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 justify-end">
                    <span>מספר טלפון אומת בהצלחה</span>
                    <Check className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span>הכפתור יופעל רק לאחר הקלדת מספר הטלפון המדויק: 0543111408</span>
                )}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTenantToDelete(null);
                  setVerificationPhone('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm transition cursor-pointer"
              >
                ביטול
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!isPhoneMatch || isDeleting}
                className={`px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition ${
                  isPhoneMatch && !isDeleting
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 cursor-pointer active:scale-95'
                    : 'bg-red-950/40 text-red-400/50 border border-red-900/30 cursor-not-allowed opacity-60'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'מוחק סלון...' : 'אישור מחיקה'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
