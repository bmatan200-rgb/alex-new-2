import React from 'react';
import {
  Sparkles,
  Calendar,
  Lock,
  Phone,
  MapPin,
  Clock,
  User,
  ShieldCheck,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';
import { SALON_INFO, isAdminPhone } from '../utils/storage';
import { UserSession } from '../types';

interface HeaderProps {
  activeTab: 'booking' | 'admin';
  onSelectTab: (tab: 'booking' | 'admin') => void;
  onOpenMyBooking: () => void;
  currentUser: UserSession | null;
  onOpenAuthModal: (role?: 'admin' | 'customer') => void;
  onQuickSwitchRole?: (role: 'admin' | 'customer') => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenMyBooking,
  currentUser,
  onOpenAuthModal,
  onQuickSwitchRole,
  onLogout,
}) => {
  const isUserAdmin = Boolean(currentUser && currentUser.isAdmin && isAdminPhone(currentUser.phone));

  const handleAdminTabClick = () => {
    if (isUserAdmin) {
      onSelectTab('admin');
    }
  };

  const handleCustomerTabClick = () => {
    onSelectTab('booking');
  };

  return (
    <header className="relative bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 transition-all shadow-xs">
      {/* Top status bar & Role Switcher */}
      <div className="bg-slate-950 text-purple-200 text-xs py-1.5 px-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 border-b border-purple-900/40 font-medium">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>
          <span className="text-white font-semibold">יומן תורים פעיל בזמן אמת</span>
          <span className="text-purple-400 hidden md:inline">|</span>
          <span className="hidden md:flex items-center gap-1 text-purple-300">
            <Clock className="w-3.5 h-3.5 inline text-purple-400" /> ראשון-חמישי 09:20-20:30
          </span>
        </div>

        {/* Quick View Mode Switcher Pill - ONLY visible to verified Admin (0546307114 / 0543111408) */}
        {isUserAdmin && (
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-0.5 rounded-xl border border-purple-500/30">
            <span className="text-[10px] text-purple-300 font-bold px-1.5 hidden sm:inline">מצב תצוגה:</span>
            
            <button
              type="button"
              onClick={handleCustomerTabClick}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'booking'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3 h-3" />
              <span>תצוגת לקוח</span>
            </button>

            <button
              type="button"
              onClick={handleAdminTabClick}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="מעבר לצפייה וניהול כמנהלת"
            >
              <ShieldCheck className="w-3 h-3 text-purple-300" />
              <span>תצוגת מנהל</span>
            </button>
          </div>
        )}

        {/* User Session Status Chip */}
        {currentUser ? (
          <div className="flex items-center gap-2">
            {isUserAdmin ? (
              <span className="bg-purple-900/90 text-purple-200 px-2 py-0.5 rounded-full text-[10px] font-black border border-purple-400 flex items-center gap-1 shadow-[0_0_8px_rgba(168,85,247,0.4)]">
                <ShieldCheck className="w-3 h-3 text-purple-300" />
                <span>מנהלת: {currentUser.name}</span>
              </span>
            ) : (
              <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-700 flex items-center gap-1">
                <User className="w-3 h-3 text-purple-300" />
                <span>שלום, {currentUser.name}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="text-purple-300 hover:text-white text-[10px] flex items-center gap-0.5 underline cursor-pointer"
              title="החלפת משתמש / התנתקות"
            >
              <LogOut className="w-2.5 h-2.5" />
              <span>החלף</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenAuthModal('customer')}
            className="text-purple-300 hover:text-white text-[10px] font-bold underline cursor-pointer"
          >
            רישום / כניסה
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Logo & Brand */}
          <div
            onClick={() => onSelectTab('booking')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            {/* Clean Logo Badge */}
            <div className="relative w-12 h-12 rounded-2xl bg-black p-0.5 shadow-sm flex-shrink-0 group-hover:scale-105 transition-all duration-300 border border-slate-800">
              <div className="w-full h-full bg-black rounded-[14px] flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-white font-black tracking-tight text-base font-['Rubik',sans-serif] leading-none">
                  Alex
                </span>
                <span className="text-[7px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">
                  BEAUTY
                </span>
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border-2 border-black flex items-center justify-center shadow-sm">
                <Sparkles className="w-2.5 h-2.5 text-slate-900" />
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 font-['Rubik',sans-serif] flex items-center gap-1.5">
                  <span className="text-slate-900">
                    Alex טיפוח ויופי
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                {SALON_INFO.tagline}
              </p>
            </div>
          </div>

          {/* Nav Switcher & Action Buttons */}
          <div className="flex items-center gap-2">
            {isUserAdmin ? (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  id="tab-booking-btn"
                  type="button"
                  onClick={handleCustomerTabClick}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'booking'
                      ? 'bg-slate-950 text-white shadow-sm font-extrabold border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>הזמנת תור</span>
                </button>

                <button
                  id="tab-admin-btn"
                  type="button"
                  onClick={handleAdminTabClick}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'admin'
                      ? 'bg-slate-950 text-white shadow-sm font-extrabold border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                      : 'text-purple-700 hover:text-purple-900 font-bold bg-purple-50/70 border border-purple-200/60'
                  }`}
                  title="מעבר לצפייה וניהול כמנהלת"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>ממשק מנהל</span>
                </button>
              </div>
            ) : null}

            <button
              id="my-booking-search-btn"
              onClick={onOpenMyBooking}
              type="button"
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 rounded-xl transition cursor-pointer border border-slate-200 shadow-xs flex items-center gap-1.5"
              title="איתור תור לפי טלפון"
            >
              <Calendar className="w-3.5 h-3.5 text-purple-600" />
              <span>התור שלי</span>
            </button>
          </div>
        </div>

        {/* Quick info strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-purple-600" />
              <a
                href={`tel:${SALON_INFO.phone}`}
                className="hover:text-purple-700 font-medium transition text-slate-700"
                dir="ltr"
              >
                {SALON_INFO.phone}
              </a>
            </div>
            {SALON_INFO.address ? (
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-slate-700 font-medium">{SALON_INFO.address}</span>
              </div>
            ) : null}
          </div>

          <div className="text-purple-900 font-semibold hidden sm:flex items-center gap-1 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>מניקור מקצועי & לק ג'ל</span>
          </div>
        </div>
      </div>
    </header>
  );
};
