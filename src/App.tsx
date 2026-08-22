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
} from 'lucide-react';
import { Appointment, UserSession, Service } from './types';
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
} from './lib/firebase';
import { formatDurationMinutes, formatILS } from './utils/dateUtils';
import { Header } from './components/Header';
import { TorModalFlow } from './components/TorModalFlow';
import { ConfirmationModal } from './components/ConfirmationModal';
import { AdminDashboard } from './components/AdminDashboard';
import { MyBookingModal } from './components/MyBookingModal';
import { SalonInfoSection } from './components/SalonInfoSection';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => getStoredUserSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => !getStoredUserSession());
  const [authPromptRole, setAuthPromptRole] = useState<'admin' | 'customer'>('customer');

  const [activeTab, setActiveTab] = useState<'booking' | 'admin'>(() => {
    const session = getStoredUserSession();
    return session?.isAdmin ? 'admin' : 'booking';
  });

  const [isTorModalOpen, setIsTorModalOpen] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredAppointments());
  const [services, setServices] = useState<Service[]>(() => getStoredServices());
  const [isMyBookingOpen, setIsMyBookingOpen] = useState(false);

  // Subscribe to real-time Firestore appointments & services updates
  useEffect(() => {
    const unsubscribeAppointments = subscribeAppointments((remoteAppointments) => {
      setAppointments(remoteAppointments);
      try {
        localStorage.setItem('alex_beauty_appointments_v5', JSON.stringify(remoteAppointments));
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

    return () => {
      unsubscribeAppointments();
      unsubscribeServices();
    };
  }, []);

  // Background settings, appointments synchronization, and keep-alive to server scheduler
  useEffect(() => {
    // Initial fetch from server to get any backend env Twilio keys
    fetch('/api/whatsapp/settings')
      .then((res) => res.json())
      .then((data) => {
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
      })
      .catch(() => {});

    const doSyncAndCheck = () => {
      const liveSettings = getStoredReminderSettings();
      fetch('/api/whatsapp/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: liveSettings }),
      }).catch(() => {});

      if (appointments && appointments.length > 0) {
        // Sync appointments to server background scheduler for hands-free 20:56 and 08:00 dispatch
        fetch('/api/whatsapp/sync-appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            appointments,
            sentLog: getSentRemindersLog()
          }),
        }).catch(() => {});

        // Also run client-side background check for instant redundancy
        autoDispatchAllPendingReminders(appointments).catch(() => {});
      }
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
  }, [appointments]);

  const handleLogin = (session: UserSession) => {
    saveUserSession(session);
    setCurrentUser(session);
    setIsAuthModalOpen(false);

    if (session.isAdmin) {
      setActiveTab('admin');
    } else {
      setActiveTab('booking');
    }
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
    if (role === 'admin') {
      const adminSession: UserSession = {
        name: 'אלכס (מנהלת)',
        phone: '054-6307114',
        isAdmin: true,
        loggedInAt: new Date().toISOString(),
      };
      saveUserSession(adminSession);
      setCurrentUser(adminSession);
      setActiveTab('admin');
    } else {
      const clientSession: UserSession = {
        name: currentUser?.isAdmin ? 'לקוח/ה' : (currentUser?.name || 'לקוח/ה'),
        phone: currentUser?.isAdmin ? '050-1234567' : (currentUser?.phone || '050-1234567'),
        isAdmin: false,
        loggedInAt: new Date().toISOString(),
      };
      saveUserSession(clientSession);
      setCurrentUser(clientSession);
      setActiveTab('booking');
    }
  };

  const handleBookSuccess = async (newAppointment: Appointment) => {
    // Optimistic local update
    saveAppointment(newAppointment);
    setAppointments((prev) => [newAppointment, ...prev.filter((a) => a.id !== newAppointment.id)]);
    setConfirmedAppointment(newAppointment);

    // Automatically send WhatsApp booking confirmation / reminder immediately on booking day
    try {
      await autoDispatchAppointmentBooking(newAppointment);
    } catch (err) {
      console.warn('Auto dispatch WhatsApp on booking error:', err);
    }

    try {
      await addAppointmentToFirestore(newAppointment);
    } catch (err) {
      console.error('Error saving appointment to Firestore:', err);
    }
  };

  const handleCancelAppointment = async (id: number | string) => {
    cancelAppointment(id);
    setAppointments((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: 'cancelled' as const } : app))
    );

    try {
      await cancelAppointmentInFirestore(id);
    } catch (err) {
      console.error('Error cancelling appointment in Firestore:', err);
    }
  };

  const handleDeleteAppointment = async (id: number | string) => {
    deleteAppointmentPermanently(id);
    setAppointments((prev) => prev.filter((app) => app.id !== id));

    try {
      await deleteAppointmentInFirestore(id);
    } catch (err) {
      console.error('Error deleting appointment in Firestore:', err);
    }
  };

  const handleAddManualAppointment = async (newApp: Appointment) => {
    saveAppointment(newApp);
    setAppointments((prev) => [newApp, ...prev.filter((a) => a.id !== newApp.id)]);

    try {
      await addAppointmentToFirestore(newApp);
    } catch (err) {
      console.error('Error adding manual appointment to Firestore:', err);
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

  const mainService = services[0] || SERVICES[0];

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 flex flex-col font-['Heebo',sans-serif]">
      {/* Top Navigation Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'admin' && !currentUser?.isAdmin) {
            handleQuickSwitchRole('admin');
          } else {
            setActiveTab(tab);
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
        {activeTab === 'booking' ? (
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
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                מניקור מכשירי מדויק וחיזוק הציפורן הטבעית במבנה אנטומי
              </p>
            </div>

            {/* Specialist Card matching video */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider px-1 block">
                אשת צוות
              </span>
              
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 p-0.5 shadow-md">
                      <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-white font-black text-lg">
                        A
                      </div>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>

                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">
                      {SALON_INFO.ownerName}
                    </h2>
                    <p className="text-xs text-purple-700 font-bold">
                      מומחית ללק ג'ל ומבנה אנטומי
                    </p>
                  </div>
                </div>

                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  זמינה לתורים
                </span>
              </div>
            </div>

            {/* Big Action Button "בחירת טיפול" matching video */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={() => setIsTorModalOpen(true)}
                className="w-full py-5 px-6 rounded-3xl bg-white border-2 border-purple-500/80 hover:border-purple-600 hover:bg-purple-50/40 shadow-lg shadow-purple-500/10 hover:shadow-xl hover:shadow-purple-500/20 text-slate-950 font-black text-lg sm:text-xl transition-all cursor-pointer flex items-center justify-between group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition">
                    <Calendar className="w-5 h-5 text-purple-100" />
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-slate-950 group-hover:text-purple-700 transition">
                      בחירת טיפול ותור
                    </span>
                    <span className="block text-xs text-slate-500 font-medium">
                      לק ג'ל במבנה אנטומי • {mainService.price} ₪ ({formatDurationMinutes(mainService.duration_minutes || 110)})
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
                <span className="text-slate-500 block">א'-ה' 09:20-20:30</span>
              </div>
            </div>

            {/* Highlights info */}
            <div className="pt-2">
              <SalonInfoSection />
            </div>
          </div>
        ) : (
          /* Admin View */
          <section id="admin-dashboard-section" className="animate-in fade-in duration-200">
            {currentUser?.isAdmin ? (
              <AdminDashboard
                appointments={appointments}
                services={services}
                onAddAppointment={handleAddManualAppointment}
                onCancelAppointment={handleCancelAppointment}
                onDeleteAppointment={handleDeleteAppointment}
                onSwitchToClientView={() => handleQuickSwitchRole('customer')}
                onUpdateServices={handleUpdateServices}
              />
            ) : (
              <div className="text-center py-12 px-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto border border-purple-200">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">ממשק מנהלת (Alex)</h3>
                <p className="text-xs text-slate-500">
                  צפייה במאחורי הקלעים, ניהול יומן התורים, חסימת שעות, תזכורות WhatsApp ודוחות.
                </p>
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleQuickSwitchRole('admin')}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-md shadow-purple-600/30 cursor-pointer transition flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>כניסה ישירה כמנהלת (Alex)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAuthModal('admin')}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 cursor-pointer"
                  >
                    הזדהות עם מספר טלפון
                  </button>
                </div>
              </div>
            )}
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
        <div className="flex items-center justify-center gap-4 pt-2 text-slate-400">
          <span>© {new Date().getFullYear()} כל הזכויות שמורות ל-{SALON_INFO.name}</span>
          <span>•</span>
          <button
            type="button"
            onClick={() => {
              if (currentUser?.isAdmin) {
                setActiveTab(activeTab === 'booking' ? 'admin' : 'booking');
              } else {
                handleOpenAuthModal('admin');
              }
            }}
            className="hover:text-purple-700 underline cursor-pointer transition font-medium"
          >
            {currentUser?.isAdmin
              ? activeTab === 'booking'
                ? 'מעבר למאחורי הקלעים'
                : 'חזרה לתצוגת לקוח'
              : 'כניסת מנהלת (0546307114)'}
          </button>
        </div>
      </footer>

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
      />

      {/* Video-Style Step-by-Step Booking Modal */}
      <TorModalFlow
        isOpen={isTorModalOpen}
        onClose={() => setIsTorModalOpen(false)}
        services={services}
        appointments={appointments}
        currentUser={currentUser}
        onBookSuccess={handleBookSuccess}
      />

      {/* Booking Confirmation Celebration Modal */}
      <ConfirmationModal
        appointment={confirmedAppointment}
        onClose={() => setConfirmedAppointment(null)}
      />
    </div>
  );
}
