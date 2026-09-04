import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Calendar,
  Lock,
  ShieldCheck,
  Clock,
  MapPin,
  ArrowLeft,
  ChevronLeft,
  Phone,
  Heart,
  CheckCircle2,
  MessageCircle,
  User,
  Search,
  Check,
  Trash2,
  AlertTriangle,
  CalendarPlus,
  Plus,
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
  isAdminPhone,
} from './utils/storage';
import {
  autoDispatchAppointmentBooking,
  autoDispatchAllPendingReminders,
  getStoredReminderSettings,
  saveReminderSettings,
  getSentRemindersLog,
} from './utils/whatsappReminder';
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
  onAuthStateChanged,
  FirebaseUser,
} from './lib/firebase';
import { formatDurationMinutes, formatILS, deduplicateAppointments } from './utils/dateUtils';
import { Header } from './components/Header';
import { TorModalFlow } from './components/TorModalFlow';
import { ConfirmationModal } from './components/ConfirmationModal';
import { AdminDashboard } from './components/AdminDashboard';
import { MyBookingModal } from './components/MyBookingModal';
import { SalonInfoSection } from './components/SalonInfoSection';
import { AuthModal } from './components/AuthModal';
import { TermsOfServiceModal } from './components/TermsOfServiceModal';
import { ExistingBookingChoiceModal } from './components/ExistingBookingChoiceModal';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => getStoredUserSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    const session = getStoredUserSession();
    if (!session) return true;
    if (!session.isAdmin && !session.acceptedTerms) return true;
    return false;
  });
  const [authPromptRole, setAuthPromptRole] = useState<'admin' | 'customer'>('customer');
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);

  // תמיד מתחילים בתצוגת לקוח. מעבר לממשק הניהול קורה רק אחרי
  // ש-onAuthStateChanged מאשר שיש משתמשת מחוברת ב-Firebase.
  const [activeTab, setActiveTab] = useState<'booking' | 'admin'>('booking');

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

  // Background settings, appointments synchronization, and keep-alive to server scheduler
  useEffect(() => {
    if (!firebaseUser) return;

    const authHeaders = async (): Promise<Record<string, string>> => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await firebaseUser.getIdToken()}`,
    });

    const initFetch = async () => {
      try {
        const h = await authHeaders();
        const res = await fetch('/api/whatsapp/settings', { headers: h });
        const data = await res.json();
        if (data.success && data.settings) {
          const current = getStoredReminderSettings();
          if (!current.twilioAccountSid && data.settings.twilioAccountSid) {
            saveReminderSettings({
              ...current,
              twilioAccountSid: data.settings.twilioAccountSid,
              twilioAuthToken: data.settings.twilioAuthToken || current.twilioAuthToken,
              twilioPhoneNumber: data.settings.twilioPhoneNumber || current.twilioPhoneNumber,
              twilioType: data.settings.twilioType || current.twilioType,
            });
          }
        }
      } catch (err) {}
    };
    initFetch();

    const doSyncAndCheck = async () => {
      try {
        const h = await authHeaders();
        const liveSettings = getStoredReminderSettings();
        fetch('/api/whatsapp/sync-settings', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ settings: liveSettings }),
        }).catch(() => {});

        if (appointments && appointments.length > 0) {
          // Sync appointments to server background scheduler for hands-free 20:56 and 08:00 dispatch
          fetch('/api/whatsapp/sync-appointments', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ 
              appointments,
              sentLog: getSentRemindersLog()
            }),
          }).catch(() => {});
        }
      } catch (err) {}
    };

    // Immediate run on load/changes
    doSyncAndCheck();

    // Run every 20 seconds
    const interval = setInterval(doSyncAndCheck, 20000);

    // Run immediately when user returns to tab / unlocks phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        doSyncAndCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [appointments, firebaseUser]);

  const isUserAdmin = Boolean(firebaseUser);

  const handleLogin = (session: UserSession) => {
    // הסשן המקומי משמש לנוחות בלבד (שם וטלפון של הלקוחה).
    // הרשאת הניהול נקבעת ע"י onAuthStateChanged, לא כאן.
    const cleanSession: UserSession = { ...session, isAdmin: false };

    saveUserSession(cleanSession);
    setCurrentUser(cleanSession);
    setIsAuthModalOpen(false);
    setActiveTab(session.isAdmin ? 'admin' : 'booking');
  };

  const handleLogout = () => {
    clearUserSession();
    setCurrentUser(null);
    setActiveTab('booking');
    setAuthPromptRole('customer');
    setIsAuthModalOpen(true);
  };

  const handleOpenAuthModal = (role: 'admin' | 'customer' = 'customer') => {
    setAuthPromptRole(role);
    setIsAuthModalOpen(true);
  };

  const handleQuickSwitchRole = (role: 'admin' | 'customer') => {
    const current = currentUser || getStoredUserSession();

    // מעבר לממשק הניהול מותנה בהתחברות אמיתית ב-Firebase בלבד.
    // מספר טלפון אינו הוכחת זהות — הוא מוצג באתר עצמו.
    if (role === 'admin') {
      if (firebaseUser) {
        setActiveTab('admin');
      } else {
        setAuthPromptRole('admin');
        setIsAuthModalOpen(true);
      }
      return;
    }

    {
      const clientSession: UserSession = {
        name: current?.name || 'לקוח/ה',
        phone: current?.phone || '',
        isAdmin: false,
        loggedInAt: new Date().toISOString(),
      };
      saveUserSession(clientSession);
      setCurrentUser(clientSession);
      setActiveTab('booking');
    }
  };

  const handleBookSuccess = async (newAppointment: Appointment) => {
    saveAppointment(newAppointment);
    setAppointments((prev) => deduplicateAppointments([newAppointment, ...prev]));
    setConfirmedAppointment(newAppointment);
  };

  const handleCancelAppointment = async (id: number | string) => {
    const idStr = String(id);
    const apptToCancel = appointments.find(a => String(a.id) === idStr);
    cancelAppointment(idStr);
    setAppointments((prev) =>
      deduplicateAppointments(
        prev.map((app) =>
          String(app.id) === idStr ||
          (apptToCancel && app.appointment_date === apptToCancel.appointment_date && app.start_time === apptToCancel.start_time)
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
    const apptToDelete = appointments.find(a => String(a.id) === idStr);
    deleteAppointmentPermanently(idStr);
    setAppointments((prev) =>
      prev.filter(
        (app) =>
          String(app.id) !== idStr &&
          !(apptToDelete && app.appointment_date === apptToDelete.appointment_date && app.start_time === apptToDelete.start_time)
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
  const customerActiveBookings = cleanUserPhone && cleanUserPhone.length >= 7
    ? appointments.filter((app) => {
        const cleanAppPhone = app.customer_phone.replace(/\D/g, '');
        return cleanAppPhone === cleanUserPhone && app.status !== 'cancelled';
      })
    : [];

  const handleRequestBooking = () => {
    if (customerActiveBookings.length > 0) {
      setIsChoiceModalOpen(true);
    } else {
      setIsTorModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 flex flex-col font-['Heebo',sans-serif]">
      {/* Top Navigation Header */}
      <Header
        isAdmin={isUserAdmin}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'admin') {
            if (isUserAdmin) {
              setActiveTab('admin');
            } else {
              handleOpenAuthModal('admin');
            }
          } else {
            setActiveTab('booking');
          }
        }}
        onOpenMyBooking={() => setIsMyBookingOpen(true)}
        currentUser={currentUser}
        onOpenAuthModal={handleOpenAuthModal}
        onQuickSwitchRole={handleQuickSwitchRole}
        onLogout={handleLogout}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {activeTab === 'booking' || !isUserAdmin ? (
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
                          className="w-full sm:w-auto px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
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

            {/* Big Action Button "בחירת טיפול" matching video */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handleRequestBooking}
                className="w-full px-6 rounded-3xl bg-white border-2 border-purple-500/80 hover:border-purple-600 hover:bg-purple-50/40 shadow-lg shadow-purple-500/10 hover:shadow-xl hover:shadow-purple-500/20 text-slate-950 font-black text-lg sm:text-xl transition-all cursor-pointer flex items-center justify-between group active:scale-[0.99] h-[150px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition">
                    <Calendar className="w-5 h-5 text-purple-100" />
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="block font-black text-slate-950 group-hover:text-purple-700 transition">
                        {customerActiveBookings.length > 0 ? 'קביעת תור נוסף' : 'בחירת טיפול ותור'}
                      </span>
                      {customerActiveBookings.length > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                          תור נוסף
                        </span>
                      )}
                    </div>
                    <span className="block text-xs text-slate-500 font-medium">
                      {customerActiveBookings.length > 0
                        ? 'שרייני תור נוסף לטיפול אחר או למועד נוסף מראש ✨'
                        : `${mainService.name} • ${mainService.price} ₪ (${formatDurationMinutes(mainService.duration_minutes || scheduleSettings.durationMinutes || 90)})`}
                    </span>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-purple-600 group-hover:text-white text-slate-600 flex items-center justify-center transition">
                  <ChevronLeft className="w-5 h-5" />
                </div>
              </button>

              {/* Secondary Option for Existing Bookings */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setIsMyBookingOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>בירור או ביטול תור קיים</span>
                </button>
              </div>
            </div>

            {/* Salon Details Cards */}
            <div className="grid grid-cols-2 gap-2.5 pt-4 text-xs">
              <div className="p-3 bg-white rounded-2xl border border-slate-200 text-center space-y-1">
                <MapPin className="w-4 h-4 text-purple-600 mx-auto" />
                <span className="font-bold text-slate-900 block">כתובת</span>
                <span className="text-slate-500 block truncate">{SALON_INFO.address}</span>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-slate-200 text-center space-y-1">
                <Clock className="w-4 h-4 text-purple-600 mx-auto" />
                <span className="font-bold text-slate-900 block">שעות פתיחה</span>
                <span className="text-slate-500 block">א'-ה' {scheduleSettings.businessOpen}-{scheduleSettings.businessClose}</span>
              </div>
            </div>

            {/* Highlights info */}
            <div className="pt-2">
              <SalonInfoSection scheduleSettings={scheduleSettings} />
            </div>
          </div>
        ) : (
          /* Admin View - strictly for verified admin phone numbers */
          <section id="admin-dashboard-section" className="animate-in fade-in duration-200">
            <AdminDashboard
              appointments={appointments}
              services={services}
              onAddAppointment={handleAddManualAppointment}
              onCancelAppointment={handleCancelAppointment}
              onDeleteAppointment={handleDeleteAppointment}
              onSwitchToClientView={() => handleQuickSwitchRole('customer')}
              onUpdateServices={handleUpdateServices}
              scheduleSettings={scheduleSettings}
              onUpdateScheduleSettings={handleUpdateScheduleSettings}
            />
          </section>
        )}
      </main>

      {/* Footer */}
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
              <button
                type="button"
                onClick={() => {
                  setActiveTab(activeTab === 'booking' ? 'admin' : 'booking');
                }}
                className="hover:text-purple-700 underline cursor-pointer transition font-medium"
              >
                {activeTab === 'booking' ? 'מעבר לממשק מנהל' : 'חזרה לתצוגת לקוח'}
              </button>
            </>
          )}
        </div>
      </footer>

      {/* Terms of Service Modal */}
      <TermsOfServiceModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      {/* Auth / Registration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={handleLogin}
        canDismiss={Boolean(currentUser)}
        initialRolePrompt={authPromptRole}
      />

      {/* Lookup Modal */}
      <MyBookingModal
        isOpen={isMyBookingOpen}
        onClose={() => setIsMyBookingOpen(false)}
        appointments={appointments}
        onCancelAppointment={handleCancelAppointment}
        currentUser={currentUser}
        onOpenBookingModal={() => {
          setIsMyBookingOpen(false);
          handleRequestBooking();
        }}
      />

      {/* Choice Modal: When customer already has an active appointment */}
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

      {/* Video-Style Step-by-Step Booking Modal */}
      <TorModalFlow
        isOpen={isTorModalOpen}
        onClose={() => setIsTorModalOpen(false)}
        services={services}
        appointments={appointments}
        currentUser={currentUser}
        onBookSuccess={handleBookSuccess}
        scheduleSettings={scheduleSettings}
        onCancelAppointment={handleCancelAppointment}
      />

      {/* Booking Confirmation Celebration Modal */}
      <ConfirmationModal
        appointment={confirmedAppointment}
        onClose={() => setConfirmedAppointment(null)}
        onBookAnother={() => {
          setConfirmedAppointment(null);
          handleRequestBooking();
        }}
      />

      {/* Customer Direct Appointment Cancellation Confirmation Modal */}
      {customerApptToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-slate-900 font-['Rubik',sans-serif]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="space-y-0.5 text-right flex-1">
                <h3 className="text-lg font-black text-slate-900">
                  ביטול תור
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  האם את/ה בטוח/ה שברצונך לבטל את התור?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-xs space-y-1.5 text-right">
              <div className="flex justify-between">
                <span className="text-slate-500">טיפול:</span>
                <span className="font-bold text-slate-900">{customerApptToCancel.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">תאריך ושעה:</span>
                <span className="font-bold text-slate-900">{customerApptToCancel.appointment_date} בשעה {customerApptToCancel.start_time}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleCancelAppointment(customerApptToCancel.id);
                  setCustomerApptToCancel(null);
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                כן, בטל תור
              </button>
              <button
                type="button"
                onClick={() => setCustomerApptToCancel(null)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                חזרה ולא לבטל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-950 text-white px-5 py-3 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-2.5 text-xs font-bold animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
