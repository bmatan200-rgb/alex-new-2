import React from 'react';
import { motion } from 'motion/react';
import {
  Clock,
  Phone,
  MessageCircle,
  User,
  Sparkles,
  MapPin,
  Navigation,
} from 'lucide-react';
import { SALON_INFO } from '../utils/storage';

import { ScheduleSettings } from '../types';

interface SalonInfoSectionProps {
  scheduleSettings?: ScheduleSettings;
}

export const SalonInfoSection: React.FC<SalonInfoSectionProps> = ({ scheduleSettings }) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1],
      },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className="space-y-4 pt-2"
    >
      {/* Clean Section Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between flex-wrap gap-2"
      >
        <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-sm transition-transform hover:-translate-y-0.5">
          <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-base font-bold text-slate-900 font-['Rubik',sans-serif]">
            מידע ויצירת קשר
          </h3>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold shadow-xs">
          <User className="w-3.5 h-3.5 text-slate-600" />
          <span>{SALON_INFO.ownerName}</span>
        </div>
      </motion.div>

      {/* Information & Opening Hours Card */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05)] space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
          {/* Contact Details */}
          <motion.div
            variants={itemVariants}
            className="space-y-3.5 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-purple-50/40 rounded-2xl border border-slate-200/80 flex flex-col justify-between shadow-2xs"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white border border-purple-200 text-purple-950 font-black text-xs mb-2 shadow-2xs">
                <Phone className="w-3.5 h-3.5 text-purple-600" />
                <span>יצירת קשר ובירורים</span>
              </div>
              <p className="text-slate-700 font-medium leading-relaxed">
                לכל שאלה, שינוי מועד או בירור בנוגע לטיפול ניתן לפנות ישירות לאלכס:
              </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              <a
                href={`tel:${SALON_INFO.phone}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-800 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer shadow-xs hover:-translate-y-0.5"
                title="חיוג טלפוני"
              >
                <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <span dir="ltr">{SALON_INFO.phone}</span>
              </a>

              <a
                href={`https://wa.me/${SALON_INFO.whatsappNumber}?text=${encodeURIComponent(
                  `שלום ${SALON_INFO.ownerName} מה נשמע? 👋 פונה אלייך דרך המערכת...`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer hover:-translate-y-0.5"
                title="שליחת הודעת WhatsApp"
              >
                <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center">
                  <MessageCircle className="w-3.5 h-3.5" />
                </div>
                <span>וואטסאפ מהיר</span>
              </a>

              {SALON_INFO.address ? (
                <a
                  href={`https://waze.com/ul?q=${encodeURIComponent(SALON_INFO.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 hover:text-sky-900 rounded-xl text-xs font-bold transition-all border border-sky-200 cursor-pointer shadow-xs hover:-translate-y-0.5"
                  title="ניווט בוויז"
                >
                  <div className="w-6 h-6 rounded-lg bg-sky-200/60 text-sky-800 flex items-center justify-center">
                    <Navigation className="w-3.5 h-3.5" />
                  </div>
                  <span>{SALON_INFO.address} (Waze)</span>
                </a>
              ) : null}
            </div>
          </motion.div>

          {/* Opening Hours */}
          <motion.div
            variants={itemVariants}
            className="space-y-2.5 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-purple-50/40 rounded-2xl border border-slate-200/80 shadow-2xs"
          >
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white border border-purple-200 text-purple-950 font-black text-xs mb-1 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-purple-600" />
              <span>שעות פעילות הקליניקה</span>
            </div>

            
            <div className="flex justify-between items-center py-2 border-b border-slate-200/70">
              <span className="font-semibold text-slate-700">ראשון - חמישי</span>
              <span className="font-black text-slate-900 font-['Rubik',sans-serif] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                {scheduleSettings?.businessOpen || '09:20'} - {scheduleSettings?.businessClose || '20:30'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-200/70">
              <span className="font-semibold text-slate-700">שישי</span>
              <span className="font-black text-slate-900 font-['Rubik',sans-serif] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                {scheduleSettings?.fridayOpen || '09:20'} - {scheduleSettings?.fridayClose || '15:00'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-200/70 last:border-0">
              <span className="font-semibold text-slate-700">שבת</span>
              <span className="font-black text-slate-900 font-['Rubik',sans-serif] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                סגור (מנוחה)
              </span>
            </div>

          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};
