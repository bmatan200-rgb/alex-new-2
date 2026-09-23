import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  Phone,
  MessageCircle,
  Calendar,
  Clock,
  UserPlus,
  RefreshCw,
  Download,
  Trash2,
  CalendarPlus,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  LayoutGrid,
  List,
  ExternalLink,
  X,
  Sparkles,
  ArrowUpDown,
} from 'lucide-react';
import { Customer, Appointment } from '../types';
import {
  fetchAdminCustomers,
  subscribeCustomers,
  upsertCustomerToFirestore,
  deleteCustomer,
  auth,
} from '../lib/firebase';
import { SALON_INFO } from '../utils/storage';
import { toIsraeliDateString } from '../utils/dateUtils';

interface CustomerDirectoryProps {
  appointments: Appointment[];
  onOpenManualBookingForCustomer?: (customer: { name: string; phone: string }) => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const CustomerDirectory: React.FC<CustomerDirectoryProps> = ({
  appointments,
  onOpenManualBookingForCustomer,
  onShowToast,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [sortBy, setSortBy] = useState<'last_active' | 'created' | 'name' | 'appointments'>('last_active');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // New customer form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Initial Load & Real-time Subscription
  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminCustomers();
      if (data && data.length > 0) {
        setCustomers(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch admin customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();

    // Setup real-time listener if authenticated in Firebase
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeCustomers(
        (updatedList) => {
          if (updatedList && updatedList.length > 0) {
            setCustomers((prev) => {
              // Merge with existing calculated appointments data
              const map = new Map<string, Customer>();
              prev.forEach((c) => map.set(c.phone.replace(/\D/g, ''), c));
              updatedList.forEach((c) => {
                const clean = c.phone.replace(/\D/g, '');
                const existing = map.get(clean);
                map.set(clean, {
                  ...c,
                  totalAppointments: existing?.totalAppointments,
                  lastAppointmentDate: existing?.lastAppointmentDate,
                });
              });
              return Array.from(map.values());
            });
          }
        },
        (error) => {
          console.warn('[CustomerDirectory] Realtime subscription notice:', error?.message);
        }
      );
    } catch {
      // ignore
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // 2. Cross-reference appointments with customers to ensure real-time accuracy
  const enrichedCustomers = useMemo(() => {
    // Map appointments by clean phone
    const apptsMap: Record<string, { count: number; lastDate: string; name: string }> = {};

    appointments.forEach((appt) => {
      const clean = appt.customer_phone.replace(/\D/g, '');
      if (!clean || clean.length < 7) return;

      // Ignore admin calendar blocks
      if (
        appt.customer_phone === 'חסימת יומן' ||
        appt.customer_phone === 'שריון יזום' ||
        (appt.customer_name && appt.customer_name.includes('🔒'))
      ) {
        return;
      }

      if (!apptsMap[clean]) {
        apptsMap[clean] = {
          count: 0,
          lastDate: appt.appointment_date || '',
          name: appt.customer_name || '',
        };
      }

      if (appt.status !== 'cancelled') {
        apptsMap[clean].count += 1;
      }

      if (appt.appointment_date && appt.appointment_date > apptsMap[clean].lastDate) {
        apptsMap[clean].lastDate = appt.appointment_date;
      }
    });

    const combinedMap = new Map<string, Customer>();

    // Add Firestore customers
    customers.forEach((c) => {
      const clean = c.phone.replace(/\D/g, '');
      const apptInfo = apptsMap[clean];
      combinedMap.set(clean, {
        ...c,
        totalAppointments: apptInfo ? apptInfo.count : (c.totalAppointments || 0),
        lastAppointmentDate: apptInfo ? apptInfo.lastDate : (c.lastAppointmentDate || ''),
      });
    });

    // Auto-discover any clients in appointments not yet in customers list
    Object.entries(apptsMap).forEach(([phone, info]) => {
      if (!combinedMap.has(phone)) {
        combinedMap.set(phone, {
          id: `cust_${phone}`,
          full_name: info.name || 'לקוח/ה',
          phone,
          created_at: info.lastDate ? `${info.lastDate}T09:00:00.000Z` : new Date().toISOString(),
          last_login_at: new Date().toISOString(),
          notes: '',
          totalAppointments: info.count,
          lastAppointmentDate: info.lastDate,
        });
      }
    });

    return Array.from(combinedMap.values());
  }, [customers, appointments]);

  // 3. Filter & Sort
  const filteredAndSortedCustomers = useMemo(() => {
    let result = enrichedCustomers.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const cleanPhone = c.phone.replace(/\D/g, '');
      const cleanQuery = q.replace(/\D/g, '');
      return (
        c.full_name.toLowerCase().includes(q) ||
        (cleanQuery && cleanPhone.includes(cleanQuery)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    });

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.full_name.localeCompare(b.full_name, 'he');
      }
      if (sortBy === 'appointments') {
        return (b.totalAppointments || 0) - (a.totalAppointments || 0);
      }
      if (sortBy === 'created') {
        return (b.created_at || '').localeCompare(a.created_at || '');
      }
      // default: last_active
      const timeA = a.last_login_at || a.created_at || '';
      const timeB = b.last_login_at || b.created_at || '';
      return timeB.localeCompare(timeA);
    });

    return result;
  }, [enrichedCustomers, searchQuery, sortBy]);

  // Format phone to WhatsApp link
  const getWhatsAppLink = (phone: string, customerName: string) => {
    const clean = phone.replace(/\D/g, '');
    let waNumber = clean;
    if (clean.startsWith('0')) {
      waNumber = '972' + clean.slice(1);
    } else if (!clean.startsWith('972')) {
      waNumber = '972' + clean;
    }
    const text = encodeURIComponent(
      `היי ${customerName} יקרה ✨ כאן ${SALON_INFO.ownerName} מ-${SALON_INFO.name}. שמחה להיות בקשר!`
    );
    return `https://wa.me/${waNumber}?text=${text}`;
  };

  // Format phone for tel:
  const getCallLink = (phone: string) => {
    const clean = phone.replace(/[^\d+]/g, '');
    return `tel:${clean}`;
  };

  // Format date helper
  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        if (dateStr.includes('-')) return toIsraeliDateString(dateStr.split('T')[0]);
        return dateStr;
      }
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  // Add new customer handler
  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const clean = newPhone.replace(/\D/g, '');
    if (!newName.trim()) {
      setFormError('נא להזין שם מלא');
      return;
    }
    if (clean.length < 7) {
      setFormError('נא להזין מספר טלפון תקין (לפחות 7 ספרות)');
      return;
    }

    setIsSubmitting(true);
    try {
      await upsertCustomerToFirestore({
        full_name: newName.trim(),
        phone: newPhone.trim(),
        notes: newNotes.trim() || undefined,
      });

      onShowToast(`הלקוח/ה "${newName.trim()}" נשמרה בהצלחה בספר הלקוחות! ✨`, 'success');
      setIsAddModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewNotes('');
      // Reload
      await loadCustomers();
    } catch (err: any) {
      setFormError(err?.message || 'שגיאה בשמירת הלקוח/ה');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete customer handler
  const handleDeleteCustomer = async (customerId: string, name: string) => {
    try {
      const success = await deleteCustomer(customerId);
      if (success) {
        setCustomers((prev) => prev.filter((c) => c.id !== customerId));
        onShowToast(`הלקוח/ה "${name}" הוסר/ה מהרשימה`, 'info');
      } else {
        onShowToast('לא ניתן היה למחוק את הלקוח/ה', 'error');
      }
    } catch (err: any) {
      onShowToast(`שגיאה במחיקה: ${err?.message || ''}`, 'error');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (enrichedCustomers.length === 0) {
      onShowToast('אין לקוחות לייצוא', 'info');
      return;
    }

    const headers = ['שם מלא', 'מספר טלפון', 'תאריך הצטרפות', 'כניסה אחרונה', 'כמות תורים', 'תאריך תור אחרון', 'הערות'];
    const rows = enrichedCustomers.map((c) => [
      `"${c.full_name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      `"${formatDateDisplay(c.created_at)}"`,
      `"${formatDateDisplay(c.last_login_at)}"`,
      c.totalAppointments || 0,
      `"${c.lastAppointmentDate ? toIsraeliDateString(c.lastAppointmentDate) : ''}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `alex_customers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('קובץ לקוחות יוצא בהצלחה! 📥', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-purple-100 text-purple-700 rounded-2xl">
                <Users className="w-5 h-5" />
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                רשימת לקוחות
              </h2>
              <span className="px-2.5 py-0.5 bg-purple-600 text-white font-extrabold text-xs rounded-full shadow-xs">
                {enrichedCustomers.length} לקוחות
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>מאובטח למנהלת</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              צפייה וניהול בכל הלקוחות שנרשמו או קבעו תור בסטודיו, עם אפשרויות חיוג ושליחת וואטסאפ מהיר
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200"
              title="ייצוא רשימת הלקוחות לקובץ אקסל (CSV)"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>ייצוא לאקסל</span>
            </button>

            <button
              type="button"
              onClick={loadCustomers}
              disabled={isLoading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer border border-slate-200"
              title="רענון רשימת הלקוחות"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ לקוח/ה חדש/ה</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש מהיר לפי שם, טלפון או הערות..."
              className="w-full pr-10 pl-9 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-medium transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500 font-bold ml-1 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                <span>מיון:</span>
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 cursor-pointer"
              >
                <option value="last_active">פעילות אחרונה</option>
                <option value="created">תאריך הרשמה (חדש לישן)</option>
                <option value="appointments">כמות תורים (הכי פעיל)</option>
                <option value="name">שם (א'-ת')</option>
              </select>
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="תצוגת טבלה"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="תצוגת כרטיסיות"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Directory Content */}
      {filteredAndSortedCustomers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-800">
            {searchQuery ? 'לא נמצאו לקוחות התואמים לחיפוש' : 'אין עדיין לקוחות ברשימה'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'נסי לחפש לפי חלק מהשם או ספרות מתוך מספר הטלפון.'
              : 'כאשר לקוחות ייכנסו, יירשמו או יזמינו תור, הפרטים שלהם יישמרו כאן אוטומטית ב-Firestore.'}
          </p>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
            >
              ניקוי חיפוש
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              + הוספת לקוח/ה ראשונ/ה
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-3.5 px-4 font-black">שם מלא</th>
                  <th className="py-3.5 px-4 font-black">טלפון</th>
                  <th className="py-3.5 px-4 font-black">הצטרפות</th>
                  <th className="py-3.5 px-4 font-black">כניסה / פעילות</th>
                  <th className="py-3.5 px-4 font-black text-center">תורים</th>
                  <th className="py-3.5 px-4 font-black">תור אחרון</th>
                  <th className="py-3.5 px-4 font-black text-center">פעולות מהירות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedCustomers.map((cust) => {
                  const initials = cust.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2);

                  return (
                    <tr key={cust.id || cust.phone} className="hover:bg-purple-50/40 transition">
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-black text-xs flex items-center justify-center shadow-xs shrink-0">
                            {initials || 'ל'}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{cust.full_name}</span>
                            {cust.notes && (
                              <span className="text-[10px] text-slate-500 block truncate max-w-[150px]">
                                {cust.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 font-['Rubik',sans-serif] font-bold text-slate-800 dir-ltr text-right">
                        {cust.phone}
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-500" />
                          <span>{formatDateDisplay(cust.created_at)}</span>
                        </span>
                      </td>

                      {/* Last Active */}
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          <span>{formatDateDisplay(cust.last_login_at || cust.created_at)}</span>
                        </span>
                      </td>

                      {/* Total Appointments */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs ${
                            (cust.totalAppointments || 0) > 0
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {cust.totalAppointments || 0}
                        </span>
                      </td>

                      {/* Last Appointment Date */}
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {cust.lastAppointmentDate ? (
                          <span className="font-bold text-slate-800">
                            {toIsraeliDateString(cust.lastAppointmentDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">ללא תורים</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Direct WhatsApp */}
                          <a
                            href={getWhatsAppLink(cust.phone, cust.full_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition cursor-pointer"
                            title={`פתיחת וואטסאפ עם ${cust.full_name}`}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>

                          {/* Quick Call */}
                          <a
                            href={getCallLink(cust.phone)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 transition cursor-pointer"
                            title={`חיוג מהיר ל-${cust.full_name}`}
                          >
                            <Phone className="w-4 h-4" />
                          </a>

                          {/* Quick Book */}
                          {onOpenManualBookingForCustomer && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenManualBookingForCustomer({
                                  name: cust.full_name,
                                  phone: cust.phone,
                                })
                              }
                              className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200 transition cursor-pointer"
                              title={`קביעת תור מהיר עבור ${cust.full_name}`}
                            >
                              <CalendarPlus className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete customer */}
                          {cust.id && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(cust.id || null)}
                              className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg border border-slate-200 hover:border-red-200 transition cursor-pointer"
                              title="הסרת לקוח/ה"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedCustomers.map((cust) => {
            const initials = cust.full_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .substring(0, 2);

            return (
              <div
                key={cust.id || cust.phone}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:border-purple-300 transition space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-black text-sm flex items-center justify-center shadow-xs">
                        {initials || 'ל'}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-sm">{cust.full_name}</h4>
                        <span className="text-xs font-bold text-slate-500 font-['Rubik',sans-serif] dir-ltr inline-block">
                          {cust.phone}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                        (cust.totalAppointments || 0) > 0
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {cust.totalAppointments || 0} תורים
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-3 text-xs space-y-1.5 border border-slate-100">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-purple-500" />
                        <span>הצטרפות:</span>
                      </span>
                      <span className="font-bold">{formatDateDisplay(cust.created_at)}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Clock className="w-3.5 h-3.5 text-teal-600" />
                        <span>פעילות אחרונה:</span>
                      </span>
                      <span className="font-bold">
                        {formatDateDisplay(cust.last_login_at || cust.created_at)}
                      </span>
                    </div>

                    {cust.lastAppointmentDate && (
                      <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/60">
                        <span className="text-slate-500 font-medium">תור אחרון:</span>
                        <span className="font-black text-slate-900">
                          {toIsraeliDateString(cust.lastAppointmentDate)}
                        </span>
                      </div>
                    )}

                    {cust.notes && (
                      <div className="pt-1 text-[11px] text-slate-500 border-t border-slate-200/50">
                        <span className="font-bold text-slate-700">הערה: </span>
                        <span>{cust.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Actions in Card */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <a
                    href={getWhatsAppLink(cust.phone, cust.full_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-200 transition cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>

                  <a
                    href={getCallLink(cust.phone)}
                    className="py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-blue-200 transition cursor-pointer"
                    title="חיוג"
                  >
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    <span>חיוג</span>
                  </a>

                  {onOpenManualBookingForCustomer && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenManualBookingForCustomer({
                          name: cust.full_name,
                          phone: cust.phone,
                        })
                      }
                      className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl border border-purple-200 transition cursor-pointer"
                      title="קביעת תור"
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </button>
                  )}

                  {cust.id && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(cust.id || null)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition cursor-pointer"
                      title="מחיקה"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Add New Customer */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-purple-100 space-y-4"
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </span>
                <h3 className="text-lg font-black text-slate-900">הוספת לקוח/ה לספר הלקוחות</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddCustomerSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  שם מלא של הלקוח/ה <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="למשל: דניאל לוי"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  מספר טלפון <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="למשל: 050-1234567"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dir-ltr text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  הערות או העדפות (אופציונלי)
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="למשל: אוהבת גווני ניוד, ציפורניים רגישות..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'שומר ב-Firestore...' : 'שמירה ב-Firestore ✨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-red-100 space-y-4 text-center"
            dir="rtl"
          >
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">הסרת לקוח/ה מרשימת הלקוחות?</h3>
              <p className="text-xs text-slate-500">
                פעולה זו תמחק את כרטיס הלקוח/ה מאוסף הלקוחות ב-Firestore.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = enrichedCustomers.find((c) => c.id === deleteConfirmId);
                  handleDeleteCustomer(deleteConfirmId, target?.full_name || 'לקוח/ה');
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
              >
                כן, למחוק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
