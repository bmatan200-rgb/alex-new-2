import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Appointment } from '../types';
import { SERVICES } from '../utils/storage';
import { AdminDashboard } from './AdminDashboard';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  onCancelAppointment: (id: number | string) => void;
  onDeleteAppointment: (id: number | string) => void;
  onAddManualAppointment: (newApp: Appointment) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  appointments,
  onCancelAppointment,
  onDeleteAppointment,
  onAddManualAppointment,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#121212] rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#262626] max-h-[90vh] overflow-y-auto relative text-[#e2e2e2]">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 left-4 p-2 text-[#888888] hover:text-[#e2e2e2] hover:bg-[#1f1f1f] rounded-full transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <AdminDashboard
          appointments={appointments}
          services={SERVICES}
          onAddAppointment={onAddManualAppointment}
          onCancelAppointment={onCancelAppointment}
          onDeleteAppointment={onDeleteAppointment}
        />
      </div>
    </div>
  );
};
