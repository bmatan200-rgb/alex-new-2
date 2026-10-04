import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Calendar,
  Clock,
  ArrowLeft,
  CalendarPlus,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  Search,
  MapPin,
  Trash2,
  Building2,
  Layers,
} from 'lucide-react';
import { Appointment, ScheduleSettings, Service, UserSession } from './types';
import {
  SALON_INFO,
  SERVICES,
  getStoredAppointments,
  saveAppointment,
  cancelAppointment,
  deleteAppointmentPermanently,
  getStoredUserSession,
  saveUserSession,
  clearUserSession,
  getStoredAdminSession,
  saveAdminSession,
  clearAdminSession,
  getStoredServices,
  saveStoredServices,
  getStoredScheduleSettings,
  saveStoredScheduleSettings,
} from './utils/storage';
import {
  subscribeAppointments,
  tenantApi,
  addAppointmentToFirestore,
  cancelAppointmentInFirestore,
  deleteAppointmentInFirestore,
  subscribeServices,
  saveServicesToFirestore,
  subscribeScheduleSettings,
  saveScheduleSettingsToFirestore,
  auth,
  signOut,
} from './lib/firebase';
import { formatILS, deduplicateAppointments, isAppointmentInPast } from './utils/dateUtils';
import { TenantProvider, useTenant } from './context/TenantContext';
import { Header } from './components/Header';
import { TorModalFlow } from './components/TorModalFlow';
import { ConfirmationModal } from './components/ConfirmationModal';
import { CancelAppointmentConfirmModal } from './components/CancelAppointmentConfirmModal';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginPage } from './components/AdminLoginPage';
import { SuperAdminPage } from './pages/SuperAdmin';
import { MyBookingModal } from './components/MyBookingModal';
import { SalonInfoSection } from './components/SalonInfoSection';
import { AuthModal } from './components/AuthModal';
import { TermsOfServiceModal } from './components/TermsOfServiceModal';
import { ExistingBookingChoiceModal } from './components/ExistingBookingChoiceModal';

// Explicit Tenant Admin Route View handling Local Development & Multi-Tenant param
function AdminRouteView({
  appointments,
  services,
  scheduleSettings,
  adminSession,
  onAdminLoginSuccess,
  onAdminLogout,
  onAddAppointment,
  onCancelAppointment,
  onDeleteAppointment,
  onUpdateServices,
  onUpdateScheduleSettings,
}: {
  appointments: Appointment[];
  services: Service[];
  scheduleSettings: ScheduleSettings;
  adminSession: UserSession | null;
  onAdminLoginSuccess: (session: UserSession) => void;
  onAdminLogout: () => void;
  onAddAppointment: (a: Omit<Appointment, 'id'>) => Promise<void>;
  onCancelAppointment: (id: string | number) => Promise<void>;
  onDeleteAppointment: (id: string | number) => Promise<void>;
  onUpdateServices: (s: Service[]) => Promise<void>;
  onUpdateScheduleSettings: (s: ScheduleSettings) => Promise<void>;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tenant, tenantId } = useTenant();
  const urlTenant = searchParams.get('tenant') || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tenant') : '');
  const requestedTenant = urlTenant || tenantId || tenant.id || 'alex_beauty';
  const tenantParam = adminSession?.role === 'business_admin' && adminSession.tenantId ? adminSession.tenantId : requestedTenant;

  const canAccess = Boolean(adminSession?.isAdmin && (adminSession.role === 'super_admin' || (adminSession.role === 'business_admin' && adminSession.tenantId === requestedTenant)));

  if (!canAccess) {
    return <AdminLoginPage onLoginSuccess={onAdminLoginSuccess} />;
  }

  const salonTitle = tenant.name || (tenantParam === 'alex_beauty' ? SALON_INFO.name : `סלון ${tenantParam}`);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-['Heebo',sans-serif]" dir="rtl">
      {/* Admin Top Banner / Navbar */}
      <header className="bg-slate-950 text-white px-4 sm:px-8 py-3.5 border-b border-purple-900/40 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="relative w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-xs"
              style={{ backgroundColor: tenant.primaryColor || '#9333ea' }}
            >
              {salonTitle.charAt(0)}
              <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 border border-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-black text-sm text-purple-200">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>לוח ניהול ובקרה • {salonTitle}</span>
                </div>
                {false && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Tenant: {tenantParam} (Local Dev ⚡)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                מחוברת כמנהלת: {adminSession?.email || adminSession?.name || tenant.ownerName || 'אלכסנדרה ביטון'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {adminSession?.role === 'super_admin' && (
              <Link
                to="/super-admin"
                className="px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 hover:text-white border border-indigo-800/80 text-xs font-bold transition flex items-center gap-1.5"
                title="כניסה ללוח Super Admin מרובה סלונים"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Super Admin</span>
              </Link>
            )}

            <Link
              to={`/?tenant=${tenantParam}`}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-200 hover:text-white border border-slate-800 text-xs font-bold transition flex items-center gap-1.5"
              title="צפייה באתר הלקוחות"
            >
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              <span>לאתר הלקוחות</span>
            </Link>

            <button
              type="button"
              onClick={onAdminLogout}
              className="px-3 py-1.5 rounded-xl bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-800/80 text-xs font-bold transition cursor-pointer"
              title="התנתקות מלוח הבקרה"
            >
              התנתקות
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        <AdminDashboard
          appointments={appointments}
          services={services}
          onAddAppointment={onAddAppointment}
          onCancelAppointment={onCancelAppointment}
          onDeleteAppointment={onDeleteAppointment}
          onSwitchToClientView={() => navigate(`/?tenant=${tenantParam}`)}
          onLogout={onAdminLogout}
          onUpdateServices={onUpdateServices}
          scheduleSettings={scheduleSettings}
          onUpdateScheduleSettings={onUpdateScheduleSettings}
        />
      </main>
    </div>
  );
}

function MainApp() {
  const navigate = useNavigate();
  const {
    tenantId,
    tenant,
    salonInfo,
    services,
    scheduleSettings,
    primaryColor,
    updateServices,
    updateScheduleSettings,
  } = useTenant();

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => getStoredUserSession());
  const [adminSession, setAdminSession] = useState<UserSession | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);

  const [isTorModalOpen, setIsTorModalOpen] = useState(false);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredAppointments());
  const [isMyBookingOpen, setIsMyBookingOpen] = useState(false);
  const [customerApptToCancel, setCustomerApptToCancel] = useState<Appointment | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Subscribe to real-time Firestore appointments for the dynamic tenantId
  useEffect(() => {
    // Keep the last tenant-scoped snapshot visible during a temporary Firestore
    // quota/network outage; the server remains authoritative for every mutation.
    setAppointments(getStoredAppointments());
    const unsubscribeAppointments = subscribeAppointments((remoteAppointments) => {
      const deduped = deduplicateAppointments(remoteAppointments);
      setAppointments(deduped);
      try {
        localStorage.setItem(`appointments_${tenantId}`, JSON.stringify(deduped));
      } catch {}
    }, undefined, tenantId);

    const unsubscribeServices = subscribeServices((remoteServices) => {
      if (Array.isArray(remoteServices)) {
        updateServices(remoteServices);
        saveStoredServices(remoteServices);
      }
    }, tenantId);

    const unsubscribeSchedule = subscribeScheduleSettings((remoteSettings) => {
      if (remoteSettings) {
        updateScheduleSettings(remoteSettings);
        saveStoredScheduleSettings(remoteSettings);
      }
    }, tenantId);

    return () => {
      unsubscribeAppointments();
      unsubscribeServices();
      unsubscribeSchedule();
    };
  }, [tenantId]);

  // Synchronize Firebase Auth state for Admin session
  useEffect(() => {
    let active=true;
    const unsubscribe=auth.onAuthStateChanged(async user=>{
      try {
        if(!user) throw new Error('Signed out');
        const result=await tenantApi('/api/auth/me');
        if(!active) return;
        const profile=result.user;
        const session:UserSession={name:user.displayName || user.email || '',phone:'',email:user.email || '',isAdmin:true,role:profile.role,tenantId:profile.tenantId,uid:profile.uid,loggedInAt:new Date().toISOString()};
        saveAdminSession(session);setAdminSession(session);
      }catch {if(active){clearAdminSession();setAdminSession(null);}}
    });
    return ()=>{active=false;unsubscribe();};
  },[tenantId]);

  // Customer Login / Registration callback
  const handleCustomerLogin = (session: UserSession) => {
    const cleanSession: UserSession = {
      ...session,
      isAdmin: false,
    };
    saveUserSession(cleanSession);
    setCurrentUser(cleanSession);
    setIsAuthModalOpen(false);
    showToast(`שלום ${cleanSession.name}! כעת ניתן לקבוע תור.`);
  };

  // Customer Logout handler
  const handleCustomerLogout = () => {
    clearUserSession();
    setCurrentUser(null);
    showToast('התנתקת מחשבון הלקוח');
  };

  // Admin Login callback
  const handleAdminLoginSuccess = (session: UserSession) => {
    saveAdminSession(session);
    setAdminSession(session);
    showToast(`שלום ${session.name}, התחברת בהצלחה לממשק המנהל!`);
  };

  // Admin Logout handler
  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Firebase signOut warning:', err);
    }
    clearAdminSession();
    setAdminSession(null);
    showToast('התנתקת בהצלחה מממשק המנהל');
    navigate(`/admin?tenant=${tenantId}`);
  };

  const handleBookSuccess = async (newAppointment: Appointment) => {
    saveAppointment(newAppointment);
    setAppointments((prev) => deduplicateAppointments([newAppointment, ...prev]));
    setConfirmedAppointment(newAppointment);
  };

  const handleCancelAppointment = async (id:number|string) => {
    const a=appointments.find(a=>String(a.id)===String(id));
    try {
      await cancelAppointmentInFirestore(id,a?.customer_phone,a?.appointment_date,a?.start_time,tenantId);
      deleteAppointmentPermanently(id);
      setAppointments(prev=>prev.filter(a=>String(a.id)!==String(id)));
      showToast('התור בוטל והשעה שוחררה ביומן');
    } catch(err:any){showToast(err.message || 'ביטול התור נכשל','error');throw err;}
  };
  const handleDeleteAppointment = async(id:number|string)=>{
    try {
      await deleteAppointmentInFirestore(id,undefined,undefined,tenantId);
      deleteAppointmentPermanently(id);
      setAppointments(prev=>prev.filter(a=>String(a.id)!==String(id)));
      showToast('התור הוסר מהיומן');
    }catch(err:any){showToast(err.message || 'מחיקת התור נכשלה','error');throw err;}
  };

  const handleAddManualAppointment = async (newApp: Omit<Appointment, 'id'>) => {
    try {
      const savedId = await addAppointmentToFirestore(newApp as any, tenantId);
      const appWithId = { ...newApp, id: savedId } as Appointment;
      saveAppointment(appWithId);
      setAppointments((prev) => deduplicateAppointments([appWithId, ...prev]));
    } catch (err: any) {
      console.error('Error adding manual appointment to Firestore:', err);
      throw err;
    }
  };

  const handleUpdateServices = async (updatedServices: Service[]) => {
    await saveServicesToFirestore(updatedServices,tenantId);
    updateServices(updatedServices);saveStoredServices(updatedServices);
  };
  const handleUpdateScheduleSettings = async (updatedSettings: ScheduleSettings) => {
    await saveScheduleSettingsToFirestore(updatedSettings,tenantId);
    updateScheduleSettings(updatedSettings);saveStoredScheduleSettings(updatedSettings);
  };
  const mainService = services[0];

  const cleanUserPhone = currentUser?.phone ? currentUser.phone.replace(/\D/g, '') : '';
  const customerActiveBookings =
    cleanUserPhone && cleanUserPhone.length >= 7
      ? appointments.filter((app) => {
          const cleanAppPhone = app.customer_phone.replace(/\D/g, '');
          return (
            cleanAppPhone === cleanUserPhone &&
            app.status !== 'cancelled' &&
            !isAppointmentInPast(app)
          );
        })
      : [];

  const handleRequestBooking = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    if (customerActiveBookings.length > 0) {
      setIsChoiceModalOpen(true);
    } else {
      setIsTorModalOpen(true);
    }
  };

  return (
    <>
      <Routes>
        {/* ==================================================================== */}
        {/* ROUTE 1: CLIENT MAIN SCREEN (/) - DYNAMIC MULTI-TENANT BOOKING       */}
        {/* ==================================================================== */}
        <Route
          path="/"
          element={
            <div className="min-h-screen bg-[#f8f9fa] text-slate-800 flex flex-col font-['Heebo',sans-serif]" dir="rtl">
              {/* Top Navigation Header */}
              <Header
                activeTab="booking"
                onSelectTab={() => {}}
                onOpenMyBooking={() => setIsMyBookingOpen(true)}
                currentUser={currentUser}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onLogout={handleCustomerLogout}
              />

              {/* Main Content Container */}
              <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Tenant-specific animated hero / cover */}
                  <section className="relative overflow-hidden rounded-[2rem] min-h-[230px] shadow-xl border border-white/70">
                    {tenant.coverImage ? (
                      <img src={tenant.coverImage} alt={tenant.name} className="absolute inset-0 h-full w-full object-cover animate-[tenantHero_14s_ease-in-out_infinite_alternate]" />
                    ) : (
                      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${tenant.secondaryColor || '#c4b5fd'})` }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
                    <div className="relative z-10 flex min-h-[230px] flex-col items-center justify-end p-6 text-center text-white">
                      <div className="mb-1 text-3xl font-black drop-shadow-lg">{tenant.name}</div>
                      <div className="text-sm font-bold text-white/85">{tenant.tagline || 'הזמנת תורים אונליין'}</div>
                    </div>
                  </section>

                  {/* Salon Brand Title */}
                  <div className="text-center space-y-2">
                    <div
                      className="inline-flex items-center gap-2 text-xs font-black px-3.5 py-1 rounded-full border shadow-2xs"
                      style={{
                        backgroundColor: `${primaryColor}15`,
                        color: primaryColor,
                        borderColor: `${primaryColor}30`,
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{tenant.tagline || 'מערכת הזמנת תורים אונליין'}</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight font-['Rubik',sans-serif]">
                      <span style={{ color: primaryColor }}>{tenant.name}</span>
                    </h1>
                  </div>

                  {/* Active Customer Bookings Alert Card */}
                  {customerActiveBookings.length > 0 && (
                    <div
                      className="border-2 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xs animate-in fade-in"
                      style={{
                        backgroundColor: `${primaryColor}0c`,
                        borderColor: `${primaryColor}30`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-black text-slate-900">
                            יש לך {customerActiveBookings.length === 1 ? 'תור משוריין במערכת' : `${customerActiveBookings.length} תורים משוריינים במערכת`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleRequestBooking}
                            className="px-3 py-1 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                            style={{ backgroundColor: primaryColor }}
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>קביעת תור נוסף</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsMyBookingOpen(true)}
                            className="text-xs hover:underline font-bold cursor-pointer"
                            style={{ color: primaryColor }}
                          >
                            הצג הכל
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                        {customerActiveBookings.map((app) => (
                          <div
                            key={app.id}
                            className="bg-white rounded-2xl p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900">
                                  {app.service_name}
                                </span>
                                <span
                                  className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                                  style={{
                                    backgroundColor: `${primaryColor}18`,
                                    color: primaryColor,
                                  }}
                                >
                                  {app.start_time} - {app.end_time}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                                <Calendar className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                                <span>תאריך: {app.appointment_date}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              <button
                                type="button"
                                onClick={() => setCustomerApptToCancel(app)}
                                className="w-full sm:w-auto px-3.5 py-1.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                                title="ביטול תור"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>ביטול תור</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interactive Booking Button Card */}
                  <div className="space-y-3">
                    <button
                      id="main-book-button"
                      type="button"
                      onClick={handleRequestBooking}
                      className="group w-full bg-white rounded-[28px] sm:rounded-[34px] py-6 px-5 sm:py-8 sm:px-7 border-[2.5px] transition-all duration-300 flex items-center justify-between gap-4 sm:gap-6 cursor-pointer shadow-md hover:shadow-xl active:scale-[0.99] text-right relative z-10"
                      style={{
                        borderColor: primaryColor,
                        boxShadow: `0 10px 25px -5px ${primaryColor}25`,
                      }}
                    >
                      {/* Right: Tenant Icon + Titles */}
                      <div className="flex items-center gap-4 sm:gap-5">
                        <div
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${primaryColor} 0%, #1e1b4b 100%)`,
                          }}
                        >
                          <Calendar className="w-8 h-8 sm:w-10 sm:h-10" />
                        </div>

                        <div className="text-right">
                          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight font-['Rubik',sans-serif]">
                            קביעת תור
                          </h2>
                          <p className="text-sm sm:text-base font-bold mt-1 sm:mt-1.5" style={{ color: primaryColor }} dir="rtl">
                            {mainService ? `${mainService.name} • ${mainService.price} ש״ח` : 'פרטי השירותים יעודכנו בקרוב'}
                          </p>
                        </div>
                      </div>

                      {/* Left: Chevron button in circle */}
                      <div
                        className="w-11 h-11 sm:w-13 sm:h-13 rounded-full border flex items-center justify-center group-hover:-translate-x-1 transition-all shrink-0 shadow-xs"
                        style={{
                          backgroundColor: `${primaryColor}12`,
                          borderColor: `${primaryColor}30`,
                          color: primaryColor,
                        }}
                      >
                        <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
                      </div>
                    </button>

                    {/* Under-card search / existing booking link */}
                    <button
                      type="button"
                      onClick={() => setIsMyBookingOpen(true)}
                      className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-bold transition cursor-pointer mx-auto py-1"
                    >
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <span>בירור או ביטול תור קיים</span>
                    </button>
                  </div>

                  {/* 2 Quick Info Badges */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col items-center text-center space-y-1">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center mb-0.5"
                        style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700">כתובת</span>
                      <span className="text-xs text-slate-500 font-medium">{salonInfo.address || 'הסלון המרכזי'}</span>
                    </div>

                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col items-center text-center space-y-1">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center mb-0.5"
                        style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                      >
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700">שעות פתיחה</span>
                      <span className="text-xs text-slate-500 font-medium">א׳-ה׳ {scheduleSettings.businessOpen}-{scheduleSettings.businessClose}</span>
                    </div>
                  </div>

                  {/* Salon Details & Address Card */}
                  <SalonInfoSection scheduleSettings={scheduleSettings} />
                </div>
              </main>

              {/* Client Footer */}
              <footer className="bg-white border-t border-slate-200/90 py-8 px-4 mt-12 text-center text-xs text-slate-500 space-y-3 shadow-xs">
                <div className="flex items-center justify-center gap-2 text-slate-800 font-bold">
                  <Sparkles className="w-4 h-4" style={{ color: primaryColor }} />
                  <span className="text-sm text-slate-900 font-bold">
                    <span style={{ color: primaryColor }}>{tenant.name}</span>
                  </span>
                  <span>•</span>
                  <span>קביעת תורים חכמה ומהירה</span>
                </div>
                <p className="text-slate-600">
                  טלפון לבירורים:{' '}
                  <a
                    href={`tel:${salonInfo.phone}`}
                    className="hover:underline font-bold"
                    style={{ color: primaryColor }}
                    dir="ltr"
                  >
                    {salonInfo.phone}
                  </a>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2 text-slate-400">
                  <span>© {new Date().getFullYear()} כל הזכויות שמורות ל-{tenant.name}</span>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen(true)}
                    className="hover:text-slate-700 underline cursor-pointer transition font-medium text-slate-500"
                  >
                    תקנון ותנאי שימוש
                  </button>
                </div>
              </footer>

              {/* Client Modals */}
              <TorModalFlow
                isOpen={isTorModalOpen}
                onClose={() => setIsTorModalOpen(false)}
                services={services}
                appointments={appointments}
                onBookSuccess={handleBookSuccess}
                currentUser={currentUser}
                scheduleSettings={scheduleSettings}
                onCancelAppointment={handleCancelAppointment}
              />

              <MyBookingModal
                isOpen={isMyBookingOpen}
                onClose={() => setIsMyBookingOpen(false)}
                appointments={appointments}
                currentUser={currentUser}
                onCancelAppointment={handleCancelAppointment}
              />

              <ExistingBookingChoiceModal
                isOpen={isChoiceModalOpen}
                onClose={() => setIsChoiceModalOpen(false)}
                existingAppointments={customerActiveBookings}
                onBookAnother={() => {
                  setIsChoiceModalOpen(false);
                  setIsTorModalOpen(true);
                }}
                onCancelExisting={(appt) => {
                  setIsChoiceModalOpen(false);
                  setCustomerApptToCancel(appt);
                }}
              />

              <CancelAppointmentConfirmModal
                isOpen={Boolean(customerApptToCancel)}
                appointment={customerApptToCancel}
                onClose={() => setCustomerApptToCancel(null)}
                onConfirm={async () => {
                  if (customerApptToCancel) {
                    await handleCancelAppointment(customerApptToCancel.id);
                    setCustomerApptToCancel(null);
                  }
                }}
              />

              <ConfirmationModal
                appointment={confirmedAppointment}
                onClose={() => setConfirmedAppointment(null)}
                onBookAnother={() => {
                  setConfirmedAppointment(null);
                  setIsTorModalOpen(true);
                }}
              />

              <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onLogin={handleCustomerLogin}
                canDismiss={true}
              />

              <TermsOfServiceModal
                isOpen={isTermsOpen}
                onClose={() => setIsTermsOpen(false)}
              />
            </div>
          }
        />

        {/* ==================================================================== */}
        {/* ROUTE 2: TENANT ADMIN DASHBOARD (/admin)                             */}
        {/* ==================================================================== */}
        <Route
          path="/admin"
          element={
            <AdminRouteView
              appointments={appointments}
              services={services}
              scheduleSettings={scheduleSettings}
              adminSession={adminSession}
              onAdminLoginSuccess={handleAdminLoginSuccess}
              onAdminLogout={handleAdminLogout}
              onAddAppointment={handleAddManualAppointment}
              onCancelAppointment={handleCancelAppointment}
              onDeleteAppointment={handleDeleteAppointment}
              onUpdateServices={handleUpdateServices}
              onUpdateScheduleSettings={handleUpdateScheduleSettings}
            />
          }
        />

        {/* ==================================================================== */}
        {/* ROUTE 3: ALIAS FOR ADMIN DASHBOARD (/admin/dashboard)                */}
        {/* ==================================================================== */}
        <Route
          path="/admin/dashboard"
          element={
            <AdminRouteView
              appointments={appointments}
              services={services}
              scheduleSettings={scheduleSettings}
              adminSession={adminSession}
              onAdminLoginSuccess={handleAdminLoginSuccess}
              onAdminLogout={handleAdminLogout}
              onAddAppointment={handleAddManualAppointment}
              onCancelAppointment={handleCancelAppointment}
              onDeleteAppointment={handleDeleteAppointment}
              onUpdateServices={handleUpdateServices}
              onUpdateScheduleSettings={handleUpdateScheduleSettings}
            />
          }
        />

        {/* ==================================================================== */}
        {/* ROUTE 4: SUPER ADMIN MULTI-TENANT SAAS ONBOARDING (/super-admin)     */}
        {/* ==================================================================== */}
        <Route path="/super-admin" element={<SuperAdminPage />} />

        {/* Fallback Catch-all Route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-700/80 shadow-emerald-900/30'
              : 'bg-red-950 text-red-100 border-red-700/80 shadow-red-900/30'
          }`}
          dir="rtl"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage.text}</span>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <MainApp />
    </TenantProvider>
  );
}
