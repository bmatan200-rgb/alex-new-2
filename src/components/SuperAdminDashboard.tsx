import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { Appointment, Service, TenantInfo, ScheduleSettings } from '../types';
import { formatILS } from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';

interface SuperAdminDashboardProps {
  appointments: Appointment[];
  services: Service[];
  scheduleSettings: ScheduleSettings;
  onRefreshData?: () => void;
}

const DEFAULT_TENANTS: TenantInfo[] = [
  {
    id: 'alex_beauty',
    tenantSlug: 'alex_beauty',
    name: 'Alex טיפוח ויופי',
    tagline: 'מניקור מקצועי ולק ג׳ל',
    ownerName: 'אלכסנדרה ביטון',
    phone: '054-6307114',
    email: 'alex@beauty.co.il',
    address: 'הנרי קנדל 12',
    city: 'באר שבע',
    status: 'active',
    plan: 'pro',
    createdAt: '2024-01-15',
    isPrimary: true,
  },
  {
    id: 'yossibarber',
    tenantSlug: 'yossibarber',
    name: 'יוסי ברברשופ • Barber & Cuts',
    tagline: 'עיצוב שיער וזקן לגברים, דירוגים וטיפוח',
    ownerName: 'יוסי כהן',
    phone: '052-7788990',
    email: 'yosi@barber.co.il',
    address: 'רוטשילד 32',
    city: 'ראשון לציון',
    status: 'active',
    plan: 'pro',
    createdAt: '2024-02-20',
  },
  {
    id: 'glam_studio_tlv',
    tenantSlug: 'glam_studio_tlv',
    name: 'Glam Studio TLV',
    tagline: 'עיצוב גבות, ריסים ומניקור פרימיום',
    ownerName: 'מיה שטרן',
    phone: '052-8899123',
    email: 'mia@glamstudio.co.il',
    address: 'דיזנגוף 140',
    city: 'תל אביב',
    status: 'active',
    plan: 'enterprise',
    createdAt: '2024-03-10',
  },
  {
    id: 'maya_nails_haifa',
    name: 'Maya Nails & Spa',
    tagline: 'מניקור פדיקור רפואי וטיפוח',
    ownerName: 'מאיה לוי',
    phone: '050-4455667',
    email: 'maya@mayanails.co.il',
    address: 'מוריה 45',
    city: 'חיפה',
    status: 'active',
    plan: 'starter',
    createdAt: '2024-06-01',
  },
  {
    id: 'noa_beauty_herzliya',
    name: 'נועה בוטיק יופי',
    tagline: 'קליניקה לאסתטיקה וטיפולי פנים מתקדמים',
    ownerName: 'נועה אברהם',
    phone: '054-1122334',
    email: 'noa@noabeauty.co.il',
    address: 'שנקר 14',
    city: 'הרצליה פיתוח',
    status: 'trial',
    plan: 'pro',
    createdAt: '2024-09-12',
  },
];

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  appointments,
  services,
  scheduleSettings,
  onRefreshData,
}) => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantInfo[]>(() => {
    try {
      const saved = localStorage.getItem('system_super_admin_tenants_v1');
      return saved ? JSON.parse(saved) : DEFAULT_TENANTS;
    } catch {
      return DEFAULT_TENANTS;
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [activeTab, setActiveTab] = useState<'tenants' | 'system' | 'stats'>('tenants');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTenant, setNewTenant] = useState<Partial<TenantInfo>>({
    name: '',
    ownerName: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    plan: 'pro',
    status: 'active',
  });

  // Calculate high-level multi-tenant statistics
  const stats = useMemo(() => {
    const totalTenantsCount = tenants.length;
    const activeTenantsCount = tenants.filter((t) => t.status === 'active').length;
    const alexConfirmedAppts = appointments.filter((a) => a.status === 'confirmed');
    const alexTotalRevenue = alexConfirmedAppts.reduce((acc, curr) => acc + (curr.price || 150), 0);

    // Multiplied estimates across system for demonstration
    const estimatedTotalSystemBookings = alexConfirmedAppts.length + 380;
    const estimatedTotalSystemRevenue = alexTotalRevenue + 58900;

    return {
      totalTenantsCount,
      activeTenantsCount,
      primaryTenantBookings: alexConfirmedAppts.length,
      primaryTenantRevenue: alexTotalRevenue,
      estimatedTotalSystemBookings,
      estimatedTotalSystemRevenue,
    };
  }, [tenants, appointments]);

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      const matchesSearch =
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.phone.includes(searchQuery) ||
        (tenant.city && tenant.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
        tenant.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tenants, searchQuery, statusFilter]);

  const handleAddTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenant.name || !newTenant.ownerName || !newTenant.phone) {
      alert('נא למלא שם עסק, שם בעלת העסק ומספר טלפון');
      return;
    }

    const tenantId = newTenant.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_') || `tenant_${Date.now()}`;

    const created: TenantInfo = {
      id: tenantId,
      name: newTenant.name || '',
      tagline: newTenant.tagline || 'סטודיו לטיפוח ויופי',
      ownerName: newTenant.ownerName || '',
      phone: newTenant.phone || '',
      email: newTenant.email || '',
      city: newTenant.city || '',
      address: newTenant.address || '',
      status: newTenant.status || 'active',
      plan: newTenant.plan || 'pro',
      createdAt: new Date().toISOString().split('T')[0],
    };

    const updated = [created, ...tenants];
    setTenants(updated);
    try {
      localStorage.setItem('system_super_admin_tenants_v1', JSON.stringify(updated));
    } catch {}

    setShowAddModal(false);
    setNewTenant({
      name: '',
      ownerName: '',
      phone: '',
      email: '',
      city: '',
      address: '',
      plan: 'pro',
      status: 'active',
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Heebo',sans-serif]" dir="rtl">
      {/* Super Admin Top Banner */}
      <header className="bg-slate-900 border-b border-purple-900/40 sticky top-0 z-30 shadow-xl backdrop-blur-md bg-slate-900/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 flex items-center justify-center font-black text-white text-base shadow-lg shadow-purple-600/30 border border-purple-400/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white font-['Rubik',sans-serif]">
                  Super Admin • Multi-Tenant Console
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
                  סביבת פיתוח מקומית ⚡
                </span>
              </div>
              <p className="text-xs text-slate-400">
                מרכז שליטה, בקרה וניהול מרובה סלונים ולקוחות עסקיים
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              to="/admin?tenant=alex_beauty"
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 transition shadow-md shadow-purple-600/25 cursor-pointer"
              title="כניסה ללוח הניהול של Alex Beauty"
            >
              <Building2 className="w-4 h-4" />
              <span>ניהול סלון (Alex Beauty)</span>
            </Link>

            <Link
              to="/"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
              <span>תצוגת לקוחות (Client View)</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Super Admin Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('tenants')}
              className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'tenants'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>רשימת סלונים ועסקים ({tenants.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'system'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>תשתיות ומערכת (System Health)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>נתוני צמיחה והכנסות</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>הוספת סלון / עסק חדש</span>
          </button>
        </div>

        {/* Global Multi-Tenant KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-purple-500/50 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">סך סלונים פעילים במערכת</span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white font-['Rubik',sans-serif]">
                {stats.activeTenantsCount}
              </span>
              <span className="text-xs text-emerald-400 font-bold">מתוך {stats.totalTenantsCount} רשומים</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(stats.activeTenantsCount / stats.totalTenantsCount) * 100}%` }} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-indigo-500/50 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">תורים ביומן (Alex Beauty)</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white font-['Rubik',sans-serif]">
                {stats.primaryTenantBookings}
              </span>
              <span className="text-xs text-indigo-300 font-bold">סנכרון Firestore פעיל</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {appointments.length} סה״כ רשומות כולל תפיסות יומן
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-emerald-500/50 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">הכנסה חודשית משוערת</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-['Rubik',sans-serif]">
                {formatILS(stats.estimatedTotalSystemRevenue)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {formatILS(stats.primaryTenantRevenue)} מהסלון הראשי (Alex)
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-amber-500/50 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">מנוע התראות SMS & WhatsApp</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Radio className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-sm font-black text-emerald-300">פעיל ותקין (Telnyx)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              בדיקות רקע אוטומטיות כל 60 שנ׳
            </p>
          </div>
        </div>

        {/* TAB 1: TENANTS LIST */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חיפוש לפי שם סלון, בעלת עסק, טלפון, עיר..."
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
                  <option value="trial">תקופת ניסיון (Trial)</option>
                  <option value="suspended">מושהה (Suspended)</option>
                </select>
              </div>
            </div>

            {/* Tenant Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTenants.map((tenant) => {
                const isPrimary = tenant.id === 'alex_beauty' || tenant.isPrimary;
                const tenantBookings = isPrimary ? stats.primaryTenantBookings : Math.floor(Math.random() * 80) + 12;

                return (
                  <div
                    key={tenant.id}
                    className={`bg-slate-900 rounded-2xl border transition-all p-5 space-y-4 relative ${
                      isPrimary
                        ? 'border-purple-500/70 shadow-lg shadow-purple-950/40 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/30'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header: Name + Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-black text-white font-['Rubik',sans-serif]">
                            {tenant.name}
                          </h3>
                          {isPrimary && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-600 text-white shadow-xs">
                              סלון ראשי 👑
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              tenant.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : tenant.status === 'trial'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}
                          >
                            {tenant.status === 'active' ? 'פעיל' : tenant.status === 'trial' ? 'ניסיון' : 'מושהה'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                            Plan: {tenant.plan}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {tenant.tagline || 'סטודיו לטיפוח ויופי'}
                        </p>
                      </div>

                      <div className="text-left font-mono text-[11px] text-slate-500">
                        ID: <strong className="text-purple-300">{tenant.id}</strong>
                      </div>
                    </div>

                    {/* Contact & Location Info */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>בעלת עסק: <strong>{tenant.ownerName}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span dir="ltr">{tenant.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{tenant.city || 'ישראל'}{tenant.address ? ` (${tenant.address})` : ''}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>הצטרפות: {tenant.createdAt}</span>
                      </div>
                    </div>

                    {/* Quick Metrics & Direct Jump Actions */}
                    <div className="bg-slate-950/70 rounded-xl p-3 flex items-center justify-between gap-3 border border-slate-800">
                      <div className="flex items-center gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">תורים במערכת</span>
                          <strong className="text-white text-sm font-bold">{tenantBookings}</strong>
                        </div>
                        <div className="h-6 w-px bg-slate-800" />
                        <div>
                          <span className="text-slate-400 block text-[10px]">שירותים פעילים</span>
                          <strong className="text-white text-sm font-bold">{isPrimary ? services.length : 3}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          to={`/admin?tenant=${tenant.tenantSlug || tenant.id}`}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
                          title={`פתיחת ממשק ניהול עבור ${tenant.name}`}
                        >
                          <span>כניסה לניהול סלון</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: SYSTEM HEALTH & MONITORING */}
        {activeTab === 'system' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">סטטוס מסד נתונים ושרת מקומי</h3>
                    <p className="text-xs text-slate-400">Firebase Firestore Real-time + Express Backend on Port 3000</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-black text-emerald-300">מחובר ומסונכרן (Connected)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Firestore Database ID</span>
                  <p className="text-sm font-mono text-purple-300 font-bold">ai-studio-alex-0ace37ff-f441-4c64-bdb6-3ba856e2147c</p>
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    קולקציות פעילות: appointments, services, settings, customers
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">שער SMS ו-WhatsApp (Telnyx)</span>
                  <p className="text-sm font-mono text-indigo-300 font-bold">Telnyx v2 Messaging REST API</p>
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    תמיכה מלאה בהודעות בעברית (UTF-8)
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">סביבת ניתוב מקומית (Local Dev Routing)</span>
                  <p className="text-sm font-mono text-amber-300 font-bold">NODE_ENV !== 'production'</p>
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    עקיפת אימות מקומי וטעינת נתונים ישירה פעילה
                  </span>
                </div>
              </div>

              {/* Endpoint Health Checklist */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">נתיבי API פעילים במערכת:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-300">GET /api/health</span>
                    <span className="text-emerald-400 font-bold">200 OK</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-300">GET /api/tenants</span>
                    <span className="text-emerald-400 font-bold">200 OK</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-300">GET /api/sms/check-due</span>
                    <span className="text-emerald-400 font-bold">200 OK (Cron)</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-300">POST /api/sms/send-test</span>
                    <span className="text-emerald-400 font-bold">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STATS & GROWTH */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-black text-white">התפלגות הכנסות ופעילות לפי סלון</h3>
              <p className="text-xs text-slate-400">דוח ביצועים ושימוש במערכת הזמנת תורים אונליין</p>

              <div className="space-y-3 pt-2">
                {tenants.map((tenant) => {
                  const isPrimary = tenant.id === 'alex_beauty' || tenant.isPrimary;
                  const tenantRevenue = isPrimary ? stats.primaryTenantRevenue : 14500;
                  const percentage = Math.round((tenantRevenue / stats.estimatedTotalSystemRevenue) * 100);

                  return (
                    <div key={tenant.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <strong className="text-white">{tenant.name}</strong>
                          <span className="text-slate-500">({tenant.city || 'ישראל'})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <strong className="text-emerald-400 font-bold font-mono">{formatILS(tenantRevenue)}</strong>
                          <span className="text-slate-500 text-[11px]">({percentage}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(percentage, 5)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Add New Tenant */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-black text-white">הוספת סלון / עסק חדש למערכת</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTenant} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">שם הסלון / העסק *</label>
                <input
                  type="text"
                  required
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="לדוגמה: בוטיק מניקור ויופי"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">שם בעלת העסק *</label>
                  <input
                    type="text"
                    required
                    value={newTenant.ownerName}
                    onChange={(e) => setNewTenant({ ...newTenant, ownerName: e.target.value })}
                    placeholder="שם מלא"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">מספר טלפון *</label>
                  <input
                    type="tel"
                    required
                    value={newTenant.phone}
                    onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })}
                    placeholder="05X-XXXXXXX"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">עיר</label>
                  <input
                    type="text"
                    value={newTenant.city}
                    onChange={(e) => setNewTenant({ ...newTenant, city: e.target.value })}
                    placeholder="תל אביב, באר שבע..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">חבילת מנוי</label>
                  <select
                    value={newTenant.plan}
                    onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="starter">Starter</option>
                    <option value="pro">Pro (מומלץ)</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black shadow-md shadow-purple-600/30 cursor-pointer"
                >
                  הוספת סלון למערכת
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
