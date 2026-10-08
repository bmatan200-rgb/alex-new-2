import React from 'react';
import {
  Sparkles,
  Calendar,
  Phone,
  MapPin,
  Clock,
  User,
  LogOut,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { UserSession } from '../types';
import { businessAdminIconAssetUrl, getBusinessAdminIconDetails } from '../utils/businessAdminIcons';

interface HeaderProps {
  activeTab?: 'booking' | 'admin';
  onSelectTab?: (tab: 'booking' | 'admin') => void;
  onOpenMyBooking: () => void;
  currentUser: UserSession | null;
  onOpenAuthModal?: (role?: 'admin' | 'customer') => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSelectTab,
  onOpenMyBooking,
  currentUser,
  onOpenAuthModal,
  onLogout,
}) => {
  const { tenant, salonInfo, scheduleSettings, primaryColor } = useTenant();
  const businessIcon = getBusinessAdminIconDetails(tenant.adminIcon || '');

  return (
    <header className="relative bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 transition-all shadow-xs">
      {/* Top status bar */}
      <div className="bg-slate-950 text-purple-200 text-xs py-1.5 px-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 border-b border-purple-900/40 font-medium">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>
          <span className="text-white font-semibold">יומן תורים פעיל בזמן אמת</span>
          <span className="text-purple-400 hidden md:inline">|</span>
          <span className="hidden md:flex items-center gap-1 text-purple-300">
            <Clock className="w-3.5 h-3.5 inline text-purple-400" /> ראשון-חמישי {scheduleSettings.businessOpen}-{scheduleSettings.businessClose}
          </span>
        </div>

        {/* User Session Status Chip */}
        {currentUser ? (
          <div className="flex items-center gap-2">
            <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-700 flex items-center gap-1">
              <User className="w-3 h-3 text-purple-300" />
              <span>שלום, {currentUser.name}</span>
            </span>
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
            onClick={() => onOpenAuthModal?.('customer')}
            className="text-purple-300 hover:text-white text-[10px] font-bold underline cursor-pointer"
          >
            רישום / כניסה
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between gap-3">
          {/* Logo & Brand */}
          <div
            onClick={() => onSelectTab?.('booking')}
            className="flex items-center gap-3.5 cursor-pointer select-none group"
          >
            {/* Large, Elegant Salon Logo */}
            {businessIcon && <div
              className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-0.5 shadow-md flex-shrink-0 group-hover:scale-105 transition-all duration-300 border border-purple-500/30"
              style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0f172a 100%)` }}
            >
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex flex-col items-center justify-center relative overflow-hidden">
                <img className="h-full w-full rounded-[14px] object-cover" src={businessAdminIconAssetUrl(tenant.adminIcon || '', tenant.name) || undefined} alt={`סמל ${tenant.name}`} />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-purple-200 flex items-center justify-center shadow-sm">
                <Sparkles className="w-3 h-3 text-purple-600" />
              </div>
            </div>}

            <div className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 font-['Rubik',sans-serif]">
                  {tenant.name}
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                {tenant.tagline || salonInfo.tagline}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="my-booking-search-btn"
              onClick={onOpenMyBooking}
              type="button"
              className="px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-800 bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 rounded-2xl transition cursor-pointer border border-slate-200 shadow-xs flex items-center gap-2 active:scale-95"
              title="איתור או ביטול תור לפי טלפון"
            >
              <Calendar className="w-4 h-4 text-purple-600" />
              <span>התור שלי / ביטול</span>
            </button>
          </div>
        </div>

        {/* Quick info strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-purple-600" />
              <a
                href={`tel:${salonInfo.phone}`}
                className="hover:text-purple-700 font-medium transition text-slate-700"
                dir="ltr"
              >
                {salonInfo.phone}
              </a>
            </div>
            {salonInfo.address ? (
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-slate-700 font-medium">
                  {salonInfo.address}{salonInfo.city ? `, ${salonInfo.city}` : ''}
                </span>
              </div>
            ) : null}
          </div>

          <div className="text-purple-900 font-semibold hidden sm:flex items-center gap-1 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>הזמנת תורים אונליין 24/7</span>
          </div>
        </div>
      </div>
    </header>
  );
};
