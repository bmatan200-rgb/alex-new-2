import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
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
  getStoredServices,
  saveStoredServices,
  getStoredScheduleSettings,
  saveStoredScheduleSettings,
} from './utils/storage';
import {
  subscribeAppointments,
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
import { formatDurationMinutes, formatILS, deduplicateAppointments, isAppointmentInPast } from './utils/dateUtils';
import { Header } from './components/Header';
import { TorModalFlow } from './components/TorModalFlow';
import { ConfirmationModal } from './components/ConfirmationModal';
import { CancelAppointmentConfirmModal } from './components/CancelAppointmentConfirmModal';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginPage } from './components/AdminLoginPage';
import { MyBookingModal } from './components/MyBookingModal';
import { SalonInfoSection } from './components/SalonInfoSection';
import { AuthModal } from './components/AuthModal';
import { TermsOfServiceModal } from './components/TermsOfServiceModal';
import { ExistingBookingChoiceModal } from './components/ExistingBookingChoiceModal';

export default function App() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => getStoredUserSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);

  const [isTorModalOpen, setIsTorModalOpen] = useState(false);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredAppointments());
  const [services, setServices] = useState<Service[]>(() => getStoredServices());
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(() => getStoredScheduleSettings());
  const [isMyBookingOpen, setIsMyBookingOpen] = useState(false);
  const [customerApptToCancel, setCustomerApptToCancel] = useState<Appointment | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Subscribe to real-time Firestore appointments & services & scheduleSettings updates
  useEffect(() => {
    const unsubscribeAppointments = subscribeAppointments((remoteAppointments) => {
      const deduped = deduplicateAppointments(remoteAppointments);
      setAppointments(deduped);
      try {
        localStorage.setItem('alex_beauty_appointments_v5', JSON.stringify(deduped));
      } catch {
        // Ignore localStorage quota errors
      }
    });

    const unsubscribeServices = subscribeServices((remoteServices) => {
      if (remoteServices && remoteServices.length > 0) {
        setServices(remoteServices);
        saveStoredServices(remoteServices);
      }
    });

    const unsubscribeSchedule = subscribeScheduleSettings((remoteSettings) => {
      if (remoteSettings) {
        setScheduleSettings(remoteSettings);
        saveStoredScheduleSettings(remoteSettings);
      }
    });

    return () => {
      unsubscribeAppointments();
      unsubscribeServices();
      unsubscribeSchedule();
    };
  }, []);

  // Customer Login / Registration callback
  const handleCustomerLogin = (session: UserSession) => {
    const cleanSession: UserSession = {
      ...session,
      isAdmin: false, // Customer login is always regular customer
    };
    saveUserSession(cleanSession);
    setCurrentUser(cleanSession);
    setIsAuthModalOpen(false);
    showToast(`ברוכה הבאה, ${cleanSession.name}! כעת ניתן לקבוע תור.`);
  };

  // Admin Login callback from dedicated /admin route
  const handleAdminLoginSuccess = (session: UserSession) => {
    setCurrentUser(session);
    showToast(`שלום ${session.name}, התחברת בהצלחה לממשק המנהל!`);
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Firebase signOut warning:', err);
    }
    clearUserSession();
    try {
      localStorage.removeItem('alex_admin_session_token');
    } catch {
      // ignore
    }
    setCurrentUser(null);
    showToast('התנתקת בהצלחה מהמערכת');
  };

  const handleBookSuccess = async (newAppointment: Appointment) => {
    saveAppointment(newAppointment);
    setAppointments((prev) => deduplicateAppointments([newAppointment, ...prev]));
    setConfirmedAppointment(newAppointment);
  };

  const handleCancelAppointment = async (id: number | string) => {
    const idStr = String(id);
    const apptToCancel = appointments.find((a) => String(a.id) === idStr);
    cancelAppointment(idStr);
    setAppointments((prev) =>
      deduplicateAppointments(
        prev.map((app) =>
          String(app.id) === idStr ||
          (apptToCancel &&
            app.appointment_date === apptToCancel.appointment_date &&
            app.start_time === apptToCancel.start_time)
            ? { ...app, status: 'cancelled' as const }
            : app
        )
      )
    );
    showToast('התור בוטל בהצלחה והשעה שוחררה ביומן 🌸', 'success');

    try {
      await cancelAppointmentInFirestore(
        idStr,
        apptToCancel?.customer_phone,
        apptToCancel?.appointment_date,
        apptToCancel?.start_time
      );
    } catch (err) {
      console.error('Error cancelling appointment in Firestore:', err);
    }
  };

  const handleDeleteAppointment = async (id: number | string) => {
    const idStr = String(id);
    const apptToDelete = appointments.find((a) => String(a.id) === idStr);
    deleteAppointmentPermanently(idStr);
    setAppointments((prev) =>
      prev.filter(
        (app) =>
          String(app.id) !== idStr &&
          !(
            apptToDelete &&
            app.appointment_date === apptToDelete.appointment_date &&
            app.start_time === apptToDelete.start_time
          )
      )
    );
    showToast('הרשומה נמחקה בהצלחה', 'success');

    try {
      await deleteAppointmentInFirestore(
        idStr,
        apptToDelete?.appointment_date,
        apptToDelete?.start_time
      );
    } catch (err) {
      console.error('Error deleting appointment in Firestore:', err);
    }
  };

  const handleAddManualAppointment = async (newApp: Omit<Appointment, 'id'>) => {
    try {
      const savedId = await addAppointmentToFirestore(newApp as any);
      const appWithId = { ...newApp, id: savedId } as Appointment;
      saveAppointment(appWithId);
      setAppointments((prev) => deduplicateAppointments([appWithId, ...prev]));
    } catch (err: any) {
      console.error('Error adding manual appointment to Firestore:', err);
      alert('שגיאה בשמירת התור / התנגשות תורים: ' + err?.message);
    }
  };

  const handleUpdateServices = async (updatedServices: Service[]) => {
    setServices(updatedServices);
    saveStoredServices(updatedServices);

    try {
      await saveServicesToFirestore(updatedServices);
    } catch (err) {
      console.error('Error saving updated services to Firestore:', err);
    }
  };

  const handleUpdateScheduleSettings = async (updatedSettings: ScheduleSettings) => {
    setScheduleSettings(updatedSettings);
    saveStoredScheduleSettings(updatedSettings);

    try {
      await saveScheduleSettingsToFirestore(updatedSettings);
    } catch (err) {
      console.error('Error saving schedule settings to Firestore:', err);
    }
  };

  const mainService = services[0] || SERVICES[0];

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

  const isUserAdmin = Boolean(currentUser && currentUser.isAdmin);

  return (
    <>
      <Routes>
        {/* ==================================================================== */}
        {/* ROUTE 1: CLIENT MAIN SCREEN (/) - CLEAN CUSTOMER BOOKING EXPERIENCE   */}
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
                onLogout={handleLogout}
              />

              {/* Main Content Container */}
              <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Salon Brand Title */}
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 bg-purple-100/80 text-purple-900 text-xs font-black px-3.5 py-1 rounded-full border border-purple-200">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>מערכת הזמנת תורים אונליין</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight font-['Rubik',sans-serif]">
                      <span className="text-purple-600">Alex</span> <span>טיפוח ויופי</span>
                    </h1>
                  </div>

                  {/* Active Customer Bookings Alert Card with Direct Cancel Action & Add Another Appointment */}
                  {customerActiveBookings.length > 0 && (
                    <div className="bg-purple-50/80 border-2 border-purple-200 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xs animate-in fade-in">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-black text-purple-950">
                            יש לך {customerActiveBookings.length === 1 ? 'תור משוריין במערכת' : `${customerActiveBookings.length} תורים משוריינים במערכת`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleRequestBooking}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>קביעת תור נוסף</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsMyBookingOpen(true)}
                            className="text-xs text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                          >
                            הצג הכל
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                        {customerActiveBookings.map((app) => (
                          <div
                            key={app.id}
                            className="bg-white rounded-2xl p-3.5 border border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900">
                                  {app.service_name}
                                </span>
                                <span className="text-[11px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-md">
                                  {app.start_time} - {app.end_time}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                                <Calendar className="w-3.5 h-3.5 text-purple-600" />
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

                  {/* Interactive Booking Button Card with delicate 2-pulse purple halo animation */}
                  <div className="space-y-3">
                    <button
                      id="main-book-button"
                      type="button"
                      onClick={handleRequestBooking}
                      className="group w-full bg-white rounded-[28px] sm:rounded-[34px] py-6 px-5 sm:py-8 sm:px-7 border-[2.5px] border-purple-500 hover:border-purple-600 transition-all duration-300 flex items-center justify-between gap-4 sm:gap-6 cursor-pointer shadow-md hover:shadow-xl hover:shadow-purple-500/20 active:scale-[0.99] text-right relative z-10 animate-delicate-purple-halo"
                    >
                      {/* Right: Purple squircle icon + Titles */}
                      <div className="flex items-center gap-4 sm:gap-5">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center text-white shadow-lg shadow-purple-600/35 group-hover:scale-105 transition-transform shrink-0">
                          <Calendar className="w-8 h-8 sm:w-10 sm:h-10" />
                        </div>

                        <div className="text-right">
                          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight font-['Rubik',sans-serif] group-hover:text-purple-700 transition-colors">
                            קביעת תור
                          </h2>
                          <p className="text-sm sm:text-base text-slate-600 font-semibold mt-1 sm:mt-1.5" dir="rtl">
                            {mainService.name} • {formatILS(mainService.price)} ({formatDurationMinutes(mainService.duration_minutes)})
                          </p>
                        </div>
                      </div>

                      {/* Left: Chevron button in circle */}
                      <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-purple-50 group-hover:bg-purple-100 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:-translate-x-1 transition-all shrink-0 shadow-xs">
                        <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
                      </div>
                    </button>

                    {/* Under-card search / existing booking link */}
                    <button
                      type="button"
                      onClick={() => setIsMyBookingOpen(true)}
                      className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-purple-700 font-bold transition cursor-pointer mx-auto py-1"
                    >
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <span>בירור או ביטול תור קיים</span>
                    </button>
                  </div>

                  {/* 2 Quick Info Badges matching the design */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col items-center text-center space-y-1">
                      <div className="w-7 h-7 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-0.5">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700">כתובת</span>
                      <span className="text-xs text-slate-500 font-medium">{SALON_INFO.address}</span>
                    </div>

                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col items-center text-center space-y-1">
                      <div className="w-7 h-7 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-0.5">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700">שעות פתיחה</span>
                      <span className="text-xs text-slate-500 font-medium">א'-ה' 09:20-20:30</span>
                    </div>
                  </div>

                  {/* Salon Details & Address Card */}
                  <SalonInfoSection />
                </div>
              </main>

              {/* Client Footer */}
              <footer className="bg-white border-t border-slate-200/90 py-8 px-4 mt-12 text-center text-xs text-slate-500 space-y-3 shadow-xs">
                <div className="flex items-center justify-center gap-2 text-slate-800 font-bold">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-sm text-slate-900 font-bold">
                    <span className="text-purple-600 font-black">Alex</span> <span>טיפוח ויופי</span>
                  </span>
                  <span>•</span>
                  <span>קביעת תורים חכמה ומהירה</span>
                </div>
                <p className="text-slate-600">
                  טלפון לבירורים:{' '}
                  <a
                    href={`tel:${SALON_INFO.phone}`}
                    className="text-purple-700 hover:underline font-bold"
                    dir="ltr"
                  >
                    {SALON_INFO.phone}
                  </a>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-2 text-slate-400">
                  <span>© {new Date().getFullYear()} כל הזכויות שמורות ל-{SALON_INFO.name}</span>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen(true)}
                    className="hover:text-purple-700 underline cursor-pointer transition font-medium text-slate-500"
                  >
                    תקנון ותנאי שימוש
                  </button>
                  {isUserAdmin && (
                    <>
                      <span>•</span>
                      <Link
                        to="/admin/dashboard"
                        className="text-purple-600 hover:text-purple-800 font-bold underline transition"
                      >
                        מעבר לממשק ניהול
                      </Link>
                    </>
                  )}
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
        {/* ROUTE 2: DEDICATED ADMIN LOGIN PAGE (/admin)                         */}
        {/* ==================================================================== */}
        <Route
          path="/admin"
          element={
            isUserAdmin ? (
              <Navigate to="/admin/dashboard" replace />
            ) : (
              <AdminLoginPage onLoginSuccess={handleAdminLoginSuccess} />
            )
          }
        />

        {/* ==================================================================== */}
        {/* ROUTE 3: PROTECTED ADMIN DASHBOARD (/admin/dashboard)                */}
        {/* ==================================================================== */}
        <Route
          path="/admin/dashboard"
          element={
            isUserAdmin ? (
              <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-['Heebo',sans-serif]" dir="rtl">
                {/* Admin Top Banner / Navbar */}
                <header className="bg-slate-950 text-white px-4 sm:px-8 py-3.5 border-b border-purple-900/40 sticky top-0 z-30 shadow-md">
                  <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-xs">
                        A
                        <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 border border-slate-950 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-black text-sm text-purple-200">
                          <ShieldCheck className="w-4 h-4 text-purple-400" />
                          <span>לוח ניהול ובקרה • {SALON_INFO.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">
                          מחוברת כמנהלת: {currentUser?.email || currentUser?.name || 'אלכס'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        to="/"
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-200 hover:text-white border border-slate-800 text-xs font-bold transition flex items-center gap-1.5"
                        title="צפייה באתר הלקוחות הרגיל"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                        <span>לאתר הלקוחות</span>
                      </Link>

                      <button
                        type="button"
                        onClick={handleLogout}
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
                    onAddAppointment={handleAddManualAppointment}
                    onCancelAppointment={handleCancelAppointment}
                    onDeleteAppointment={handleDeleteAppointment}
                    onSwitchToClientView={() => navigate('/')}
                    onLogout={handleLogout}
                    onUpdateServices={handleUpdateServices}
                    scheduleSettings={scheduleSettings}
                    onUpdateScheduleSettings={handleUpdateScheduleSettings}
                  />
                </main>
              </div>
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

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
