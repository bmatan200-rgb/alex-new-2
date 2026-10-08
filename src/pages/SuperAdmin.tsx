import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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
  Image as ImageIcon,
  Upload,
  LogOut,
  UserCircle2,
} from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, auth, signOut } from '../lib/firebase';
import { clearAdminSession } from '../utils/storage';
import { Appointment, Service, TenantInfo, ScheduleSettings } from '../types';
import { formatILS } from '../utils/dateUtils';
import { BUSINESS_ICON_CATEGORIES, BUSINESS_ICON_COLORS, BUSINESS_ICON_SYMBOLS, businessAdminIconId, businessAdminIconPreviewAsset, getBusinessAdminIconDetails } from '../utils/businessAdminIcons';

const COLOR_PALETTES = [
  { name: 'סגול + לילך', value: '#7c3aed', secondary: '#c4b5fd' },
  { name: 'ורוד + אפרסק', value: '#db2777', secondary: '#fdba74' },
  { name: 'טורקיז + מנטה', value: '#0f766e', secondary: '#6ee7b7' },
  { name: 'כחול + תכלת', value: '#2563eb', secondary: '#7dd3fc' },
  { name: 'שחור + זהב', value: '#18181b', secondary: '#f59e0b' },
  { name: 'בורדו + ורוד', value: '#9f1239', secondary: '#fda4af' },
  { name: 'ירוק + ליים', value: '#15803d', secondary: '#bef264' },
  { name: 'כתום + שמנת', value: '#ea580c', secondary: '#fed7aa' },
  { name: 'אינדיגו + סגול', value: '#4338ca', secondary: '#a78bfa' },
  { name: 'אפור + כחול', value: '#334155', secondary: '#38bdf8' },
];

export const SuperAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [signedInEmail, setSignedInEmail] = useState<string>(() => auth.currentUser?.email || '');
  const [superAdminAuthorized, setSuperAdminAuthorized] = useState(false);
  const authHeaders = async (json = false) => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : (localStorage.getItem('alex_admin_session_token') || '');
    return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [activeTab, setActiveTab] = useState<'onboarding' | 'tenants' | 'system'>('tenants');

  // Form State
  const [tenantId, setTenantId] = useState('');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#7c3aed');
  const [secondaryColor, setSecondaryColor] = useState('#c4b5fd');
  const [plan, setPlan] = useState<'starter' | 'pro' | 'enterprise'>('pro');
  const [coverImage, setCoverImage] = useState('');
  const [adminIcon, setAdminIcon] = useState('');
  const [iconSymbol, setIconSymbol] = useState('');
  const [iconCategory, setIconCategory] = useState<string>('hair');
  const [iconColor, setIconColor] = useState('purple');
  const [coverImageError, setCoverImageError] = useState('');
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [lastSaveWasEdit, setLastSaveWasEdit] = useState(false);

  // Dynamic Services List in Onboarding Form
  const [services, setServices] = useState<Array<{ id: number; name: string; price: number; duration_minutes: number; description?: string }>>([]);

  const [businessOpen, setBusinessOpen] = useState('');
  const [businessClose, setBusinessClose] = useState('');
  const [fridayOpen, setFridayOpen] = useState('');
  const [fridayClose, setFridayClose] = useState('');

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

      // Delete only through the protected Super Admin API
      const deleteRes = await fetch(`/api/super-admin/tenants/${targetId}`, { method: 'DELETE', headers: await authHeaders() });
      const deleteData = await deleteRes.json().catch(() => ({}));
      if (!deleteRes.ok || !deleteData.success) throw new Error(deleteData.error || 'מחיקת העסק נכשלה');

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

  // V23: verify the server-side role before showing or loading any Super Admin data.
  // The page location itself never implies privilege.
  const verifySuperAdminAndFetch = async (user: typeof auth.currentUser) => {
    try {
      setLoading(true);
      setLoadError('');
      setSuperAdminAuthorized(false);

      if (!user) {
        navigate('/admin', { replace: true });
        return;
      }

      const fresh = await user.getIdToken(true);
      try { localStorage.setItem('alex_admin_session_token', fresh); } catch {}

      const profileRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${fresh}` } });
      const profileData = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok || !profileData?.success) throw new Error(profileData?.error || `HTTP ${profileRes.status}`);

      const profile = profileData.user || {};
      if (profile.role !== 'super_admin') {
        const targetTenant = profile.tenantId ? encodeURIComponent(profile.tenantId) : '';
        navigate(targetTenant ? `/admin/dashboard?tenant=${targetTenant}` : '/admin', { replace: true });
        return;
      }

      setSuperAdminAuthorized(true);
      setSignedInEmail(user.email || profile.email || '');

      const res = await fetch('/api/tenants', { headers: { Authorization: `Bearer ${fresh}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      if (Array.isArray(data.tenants)) setTenants(data.tenants);
    } catch (err: any) {
      console.warn('Notice loading Super Admin:', err);
      setSuperAdminAuthorized(false);
      setLoadError(err?.message || 'אימות Super Admin נכשל');
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => verifySuperAdminAndFetch(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSignedInEmail(user?.email || '');
      verifySuperAdminAndFetch(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSuperAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Firebase signOut warning:', err);
    } finally {
      clearAdminSession();
      setSignedInEmail('');
      navigate('/admin', { replace: true });
    }
  };

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
      { id: nextId, name: '', price: 0, duration_minutes: 60, description: '' },
    ]);
  };

  // Remove Service
  const handleRemoveService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  // Update Service
  const handleUpdateService = (index: number, field: string, value: any) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  const handleCoverUpload = (file?: File) => {
    if (!file) return;
    setCoverImageError('');
    if (!file.type.startsWith('image/')) { setCoverImageError('יש לבחור קובץ תמונה'); return; }
    if (file.size > 8 * 1024 * 1024) { setCoverImageError('התמונה גדולה מדי. עד 8MB לפני דחיסה.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Keep the image comfortably below both the API body limit and Firestore's 1MB document limit.
        // Reduce JPEG quality progressively so a cover selected on a phone reliably persists to the tenant.
        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 360000 && quality > 0.34) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 420000) {
          setCoverImageError('התמונה גדולה מדי גם לאחר דחיסה. נסה תמונה קטנה יותר.');
          return;
        }
        setCoverImage(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const resetTenantForm = () => {
    setEditingTenantId(null);
    setTenantId(''); setName(''); setTagline(''); setOwnerName(''); setPhone(''); setEmail(''); setOwnerPassword('');
    setCity(''); setAddress(''); setCustomDomain(''); setPrimaryColor('#7c3aed'); setSecondaryColor('#c4b5fd');
    setPlan('pro'); setCoverImage(''); setCoverImageError(''); setServices([]);
    setAdminIcon(''); setIconSymbol(''); setIconCategory('hair'); setIconColor('purple');
    setBusinessOpen(''); setBusinessClose(''); setFridayOpen(''); setFridayClose(''); setCreatedResult(null);
  };

  const handleEditTenant = async (tenant: TenantInfo) => {
    setIsLoadingEdit(true);
    try {
      const res = await fetch(`/api/super-admin/tenants/${encodeURIComponent(tenant.id)}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'לא ניתן לטעון את העסק');
      const t = data.tenant || tenant;
      const c = data.config || {};
      setEditingTenantId(tenant.id);
      setAdminIcon(t.adminIcon || '');
      const iconDetails = getBusinessAdminIconDetails(t.adminIcon || '');
      setIconSymbol(iconDetails?.symbol.id || ''); setIconCategory(BUSINESS_ICON_SYMBOLS.find((symbol) => symbol.id === iconDetails?.symbol.id)?.category || 'hair'); setIconColor(iconDetails?.color.id || 'purple');
      setTenantId(tenant.id);
      setName(t.name || ''); setTagline(t.tagline || ''); setOwnerName(t.ownerName || ''); setPhone(t.phone || '');
      setEmail(t.email || ''); setCity(t.city || ''); setAddress(t.address || ''); setCustomDomain(t.customDomain || '');
      setPrimaryColor(t.primaryColor || '#7c3aed'); setSecondaryColor(t.secondaryColor || '#c4b5fd');
      setPlan(t.plan || 'pro'); setCoverImage(t.coverImage || '');
      setServices(Array.isArray(c.services) ? c.services : []);
      const sch = c.scheduleSettings || {};
      setBusinessOpen(sch.businessOpen || ''); setBusinessClose(sch.businessClose || '');
      setFridayOpen(sch.fridayOpen || ''); setFridayClose(sch.fridayClose || '');
      setCreatedResult(null);
      setActiveTab('onboarding');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      alert('שגיאה בטעינת העסק לעריכה: ' + (err?.message || 'שגיאה לא ידועה'));
    } finally { setIsLoadingEdit(false); }
  };

  // Submit new tenant
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert('נא להזין שם עסק ומספר טלפון');
      return;
    }
    const iconOwner = adminIcon ? tenants.find((t) => t.id !== editingTenantId && t.adminIcon === adminIcon) : null;
    if (iconOwner) { alert(`האייקון כבר הוקצה לעסק ${iconOwner.name}. יש לבחור אייקון אחר.`); return; }

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
        tagline: tagline.trim(),
        ownerName: (ownerName || name).trim(),
        phone: phone.trim(),
        email: email.trim(),
        city: city.trim(),
        address: address.trim(),
        primaryColor,
        secondaryColor,
        customDomain: customDomain.trim().toLowerCase(),
        coverImage,
        adminIcon: adminIcon || null,
        plan,
        services,
        scheduleSettings: {
          businessOpen,
          businessClose,
          fridayOpen,
          fridayClose,
          durationMinutes: services[0]?.duration_minutes || 60,
        },
      };

      const res = await fetch(editingTenantId ? `/api/super-admin/tenants/${encodeURIComponent(editingTenantId)}` : '/api/super-admin/tenants', {
        method: editingTenantId ? 'PUT' : 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        const savedTenantId = editingTenantId || finalTenantId;
        if (email.trim() && ownerPassword) {
          const ownerRes = await fetch(`/api/super-admin/tenants/${encodeURIComponent(savedTenantId)}/owner-account`, {
            method: 'POST', headers: await authHeaders(true),
            body: JSON.stringify({ email: email.trim(), password: ownerPassword, displayName: (ownerName || name).trim() }),
          });
          const ownerData = await ownerRes.json().catch(() => ({}));
          if (!ownerRes.ok || !ownerData.success) throw new Error(ownerData.error || 'העסק נשמר, אך יצירת חשבון בעל העסק נכשלה');
          setOwnerPassword('');
        }
        setLastSaveWasEdit(!!editingTenantId);
        setCreatedResult({
          tenantId: editingTenantId || finalTenantId,
          testUrl: data.testUrl || `/?tenant=${encodeURIComponent(finalTenantId)}`,
          adminUrl: data.adminUrl || `/admin?tenant=${encodeURIComponent(finalTenantId)}`,
          name: name.trim(),
          customDomain: customDomain.trim(),
        });
        fetchTenants();
      } else {
        alert((editingTenantId ? 'שגיאה בשמירת העסק: ' : 'שגיאה ביצירת סלון: ') + (data.error || 'נא לנסות שוב'));
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
  const isAdminIconTaken = (symbolId: string, colorId: string) => {
    const iconId = businessAdminIconId(symbolId, colorId);
    return tenants.some((t) => t.id !== editingTenantId && t.adminIcon === iconId);
  };
  const selectedIconDetails = getBusinessAdminIconDetails(adminIcon);

  // Never render privileged Super Admin controls until the server has explicitly
  // confirmed this Firebase identity as the one global Super Admin account.
  if (!superAdminAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-purple-600" />
          <h1 className="text-lg font-black text-slate-950">מאמת הרשאת Super Admin...</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {loadError || (loading ? 'המערכת בודקת את החשבון המחובר מול השרת.' : 'החשבון הזה אינו מורשה למסך Super Admin. מעביר לניהול העסק שלך...')}
          </p>
          {loadError && (
            <button
              type="button"
              onClick={() => navigate('/admin', { replace: true })}
              className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white"
            >
              חזרה להתחברות
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-['Heebo',sans-serif]" dir="rtl">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xl backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 flex items-center justify-center font-black text-white text-base shadow-lg shadow-purple-600/30 border border-purple-400/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-950 font-['Rubik',sans-serif]">
                  Super Admin • Multi-Tenant SaaS Platform
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  גרסת SaaS ללא הגבלה ⚡
                </span>
              </div>
              <p className="text-xs text-slate-500">
                מרכז שליטה ובקרת מרובה סלונים, יצירת עסקים והגדרת דומיינים מותאמים
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2" title="החשבון המחובר כעת">
              <UserCircle2 className="w-4 h-4 text-purple-600" />
              <span className="max-w-[220px] truncate">{signedInEmail || 'מאמת חשבון...'}</span>
              {superAdminAuthorized && (
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black">Super Admin</span>
              )}
            </div>

            <Link
              to={`/admin?tenant=${encodeURIComponent((tenants.find(t => t.isPrimary || t.id === 'alex_beauty')?.tenantSlug || tenants.find(t => t.isPrimary || t.id === 'alex_beauty')?.id || 'alex_beauty'))}`}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 transition shadow-md shadow-purple-600/25 cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>לוח ניהול {tenants.find(t => t.isPrimary || t.id === 'alex_beauty')?.name || 'Alex Beauty'}</span>
            </Link>

            <Link
              to="/"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
              <span>תצוגת לקוחות</span>
            </Link>

            <button
              type="button"
              onClick={handleSuperAdminLogout}
              className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="התנתקות והחלפת משתמש"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>התנתק</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'עסקים במערכת', value: tenants.length, icon: Building2 },
            { label: 'עסקים פעילים', value: tenants.filter(t => t.status === 'active').length, icon: Activity },
            { label: 'סה״כ תורים', value: tenants.reduce((n,t) => n + (t.totalAppointments || 0), 0), icon: Calendar },
            { label: 'הכנסות מדווחות', value: formatILS(tenants.reduce((n,t) => n + (t.totalRevenue || 0), 0)), icon: TrendingUp },
          ].map(({label,value,icon:Icon}) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><Icon className="h-5 w-5" /></div>
              <div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-bold text-slate-500">{label}</div>
            </div>
          ))}
        </section>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { resetTenantForm(); setActiveTab('onboarding'); }}
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
                      {lastSaveWasEdit ? 'השינויים בעסק ' : 'הסלון '}&quot;{createdResult.name}&quot;{lastSaveWasEdit ? ' נשמרו בהצלחה! ✅' : ' נוצר בהצלחה במערכת! 🎉'}
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
                  <span>{editingTenantId ? `עריכת העסק: ${name || editingTenantId}` : 'הגדרת סלון ועסק חדש ב-SaaS Multi-Tenant'}</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  הזינו את פרטי הסלון, בחרו צבעי מיתוג, הגדירו שירותים וקבלו באופן מיידי סביבת עבודה נפרדת עם ניתוב מבודד.
                </p>
              </div>

              <form onSubmit={handleSubmit} autoComplete="off" className="space-y-8">
                
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
                        disabled={!!editingTenantId}
                        onChange={(e) => setTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        placeholder="לדוגמה: david_barber"
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
                        placeholder="לדוגמה: מקצועיות, שירות וחוויה"
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
                        name="new-business-owner-email"
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="salon@beauty.co.il"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">סיסמה זמנית לבעל העסק</label>
                      <input
                        type="password"
                        name="new-business-owner-password"
                        autoComplete="new-password"
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder={editingTenantId ? "השאר ריק כדי לא לשנות סיסמה" : "לפחות 6 תווים"}
                        minLength={6}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:border-purple-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">הסיסמה נשמרת רק ב-Firebase Authentication ולא במסד הנתונים.</p>
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

                  <div className="rounded-3xl border border-indigo-800/70 bg-slate-950 p-4 sm:p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl shadow-lg" style={{ backgroundColor: selectedIconDetails?.color.value || '#334155' }}>
                        {adminIcon ? <img className="h-full w-full object-contain" alt={BUSINESS_ICON_SYMBOLS.find((symbol) => symbol.id === iconSymbol)?.label || 'סמל העסק'} src={businessAdminIconPreviewAsset(iconSymbol) || undefined} /> : <span className="flex h-full items-center justify-center px-1 text-center text-[10px] font-bold text-slate-400">ללא סמל</span>}
                      </div>
                      <div>
                        <h4 className="font-black text-white">אייקון ניהול לבעל העסק</h4>
                        <p className="text-xs text-slate-400">בוחרים סמל וצבע. כל שילוב יכול להיות מוקצה לעסק אחד בלבד.</p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-200">1. בחרו סמל</span>
                        <span className="text-slate-500">{BUSINESS_ICON_SYMBOLS.filter((symbol) => symbol.category === iconCategory).length} סמלים בתחום · {BUSINESS_ICON_SYMBOLS.length * BUSINESS_ICON_COLORS.length - tenants.filter((t) => t.id !== editingTenantId && t.adminIcon).length} שילובים פנויים</span>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setAdminIcon(''); setIconSymbol(''); }} aria-pressed={!adminIcon} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${!adminIcon ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}>{adminIcon ? 'בטל בחירת סמל' : 'ללא סמל'}</button>
                        {BUSINESS_ICON_CATEGORIES.map((category) => <button key={category.id} type="button" onClick={() => setIconCategory(category.id)} aria-pressed={iconCategory === category.id} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${iconCategory === category.id ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}>{category.label}{category.id !== 'classic' && <span className="mr-1 text-slate-500">({BUSINESS_ICON_SYMBOLS.filter((symbol) => symbol.category === category.id).length})</span>}</button>)}
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {BUSINESS_ICON_SYMBOLS.filter((symbol) => symbol.category === iconCategory).map((symbol) => {
                          const taken = isAdminIconTaken(symbol.id, iconColor);
                          const selected = Boolean(adminIcon) && iconSymbol === symbol.id;
                          const preview = businessAdminIconPreviewAsset(symbol.id);
                          return <button key={symbol.id} type="button" disabled={taken} onClick={() => { setIconSymbol(symbol.id); if (!taken) setAdminIcon(businessAdminIconId(symbol.id, iconColor)); }} title={taken ? `${symbol.label} בצבע שנבחר כבר הוקצה` : symbol.label} aria-label={symbol.label} aria-pressed={selected} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-[10px] font-bold transition ${selected ? 'border-white ring-2 ring-indigo-500 bg-slate-800 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'} ${taken ? 'opacity-30 cursor-not-allowed' : ''}`}>{preview && <img className="h-8 w-8 object-contain" alt="" src={preview} />}<span className="line-clamp-1 w-full">{symbol.label}</span>{taken && <span className="absolute inset-0 flex items-center justify-center text-2xl text-rose-300">×</span>}</button>;
                        })}
                      </div>
                    </div>
                    {adminIcon ? <div>
                      <div className="mb-2 text-xs font-bold text-slate-200">2. בחרו צבע</div>
                      <div className="flex flex-wrap gap-2">
                        {BUSINESS_ICON_COLORS.map((color) => {
                          const taken = isAdminIconTaken(iconSymbol, color.id);
                          const selected = iconColor === color.id;
                          return <button key={color.id} type="button" disabled={taken} onClick={() => { setIconColor(color.id); if (!taken) setAdminIcon(businessAdminIconId(iconSymbol, color.id)); }} title={taken ? `${color.label} כבר בשימוש עם הסמל הזה` : color.label} aria-label={color.label} aria-pressed={selected} className={`h-9 w-9 rounded-xl border-2 transition ${selected ? 'border-white scale-110 ring-2 ring-indigo-500' : 'border-slate-700'} ${taken ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'}`} style={{ backgroundColor: color.value }} />;
                        })}
                      </div>
                    </div> : <p className="text-xs text-slate-400">לא יוצג סמל בעסק. אפליקציית ההתקנה תשתמש באייקון ברירת המחדל.</p>}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_.65fr] gap-4">
                    <div className="relative min-h-56 overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-xl">
                      {coverImage ? (
                        <img src={coverImage} alt="תמונת כותרת" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }} />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                      <div className="absolute bottom-0 right-0 left-0 p-5 text-white">
                        <div className="text-2xl font-black">{name || 'שם העסק'}</div>
                        <div className="text-sm text-white/80">{tagline || 'הזמנת תורים אונליין'}</div>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                      <div className="flex items-center gap-2 font-black text-white"><ImageIcon className="w-4 h-4 text-purple-400" /> תמונת Cover של העסק</div>
                      <p className="text-[11px] text-slate-400">תופיע בראש אפליקציית הלקוחות עם תנועה עדינה. אם לא תועלה תמונה, יוצג Gradient מצבעי העסק.</p>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-500/60 bg-purple-500/10 px-4 py-4 font-bold text-purple-200 hover:bg-purple-500/20">
                        <Upload className="w-4 h-4" /> העלאת תמונה
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleCoverUpload(e.target.files?.[0])} />
                      </label>
                      <input value={coverImage.startsWith('data:') ? '' : coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="או הדבק קישור לתמונה" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                      {coverImage && <button type="button" onClick={() => setCoverImage('')} className="text-xs font-bold text-rose-300">הסר תמונה</button>}
                      {coverImageError && <p className="text-[11px] font-bold text-rose-400">{coverImageError}</p>}
                    </div>
                  </div>

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
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="w-12 h-12 rounded-xl cursor-pointer border border-slate-700 bg-transparent p-1"
                          title="צבע משני"
                        />
                        <div
                          className="flex-1 py-2 px-3 rounded-xl text-white font-bold text-center shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
                        >
                          תצוגה מקדימה
                        </div>
                      </div>

                      {/* Presets */}
                      <div className="flex items-center gap-2 flex-wrap pt-2">
                        <span className="text-slate-500 text-[11px] block w-full">פלטות צבעים מובילות:</span>
                        {COLOR_PALETTES.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => { setPrimaryColor(c.value); setSecondaryColor(c.secondary); }}
                            className={`w-8 h-8 rounded-lg border-2 transition ${
                              primaryColor === c.value ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                            }`}
                            title={c.name}
                            style={{ background: `linear-gradient(135deg, ${c.value} 0 50%, ${c.secondary} 50% 100%)` }}
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
                            <option value={15}>15 דק׳</option>
                            <option value={20}>20 דק׳</option>
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
                  {editingTenantId && (
                    <button type="button" onClick={resetTenantForm} className="px-5 py-3 rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 font-bold text-sm hover:bg-slate-800">
                      ביטול עריכה
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-purple-600/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (editingTenantId ? 'שומר שינויים...' : 'יוצר סלון ושומר הגדרות...') : (editingTenantId ? '💾 שמירת שינויים בעסק' : '🚀 יצירת סלון ופריסת סביבה חדשה')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loadError && (
          <div dir="rtl" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">
            <div className="font-bold">טעינת העסקים נכשלה</div>
            <div className="mt-1 text-sm">{loadError}</div>
            <button type="button" onClick={fetchTenants} className="mt-3 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white">נסה שוב</button>
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
                // Build a deployment-safe customer URL for every current/future tenant.
                // Relative URL keeps the active Render/custom-domain origin instead of localhost.
                const customerSiteUrl = `/?tenant=${encodeURIComponent(tenantSlug)}`;

                return (
                  <div
                    key={t.id}
                    className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(() => { const icon = getBusinessAdminIconDetails(t.adminIcon || ''); const preview = icon && businessAdminIconPreviewAsset(icon.symbol.id); return icon && preview ? <img className="h-8 w-8 rounded-xl bg-slate-800 p-1 object-contain" src={preview} alt={`סמל ${t.name}`} title={`אייקון הניהול של ${t.name}`} /> : null; })()}
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
                          href={customerSiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"
                        >
                          <ExternalLink className="w-3 h-3 text-purple-400" />
                          <span>אתר לקוחות</span>
                        </a>

                        <button
                          type="button"
                          disabled={isLoadingEdit}
                          onClick={() => handleEditTenant(t)}
                          className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-700 text-indigo-200 hover:text-white border border-indigo-800 rounded-lg text-xs font-bold flex items-center gap-1 transition disabled:opacity-50"
                        >
                          <Settings className="w-3 h-3" />
                          <span>עריכת עסק</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/admin/dashboard?tenant=${encodeURIComponent(tenantSlug)}`)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                          title={`פתיחת אדמין של ${t.name}`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>אדמין עסק</span>
                        </button>
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
