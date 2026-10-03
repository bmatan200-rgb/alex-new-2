import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TenantInfo, Service, ScheduleSettings, SalonInfo } from '../types';
import { SALON_INFO, SERVICES, DEFAULT_SCHEDULE_SETTINGS } from '../utils/storage';

interface TenantContextValue {
  tenantId: string;
  tenant: TenantInfo;
  salonInfo: SalonInfo;
  services: Service[];
  scheduleSettings: ScheduleSettings;
  primaryColor: string;
  loading: boolean;
  refreshTenant: () => Promise<void>;
  updateServices: (newServices: Service[]) => void;
  updateScheduleSettings: (newSettings: ScheduleSettings) => void;
}

const defaultTenant: TenantInfo = {
  id: 'alex_beauty',
  tenantSlug: 'alex_beauty',
  name: 'Alex טיפוח ויופי',
  tagline: 'מניקור מקצועי ולק ג׳ל',
  ownerName: 'אלכסנדרה ביטון',
  phone: '054-6307114',
  email: 'alex@beauty.co.il',
  address: 'הנרי קנדל 12',
  city: 'באר שבע',
  primaryColor: '#9333ea', // default purple
  status: 'active',
  plan: 'pro',
  createdAt: '2024-01-15',
  isPrimary: true,
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();

  // Helper to extract ?tenant=... directly from location or window
  const getActiveQueryTenant = useCallback(() => {
    if (location && location.search) {
      const params = new URLSearchParams(location.search);
      const t = params.get('tenant');
      if (t) return t.trim();
    }
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tenant');
      if (t) return t.trim();
    }
    return '';
  }, [location]);

  const activeQuery = getActiveQueryTenant();

  const [tenant, setTenant] = useState<TenantInfo>(() => {
    if (activeQuery && activeQuery !== 'alex_beauty') {
      return {
        id: activeQuery,
        tenantSlug: activeQuery,
        name: activeQuery,
        tagline: 'הזמנת תורים אונליין',
        ownerName: `מנהלת ${activeQuery}`,
        phone: '050-0000000',
        primaryColor: '#9333ea',
        status: 'active',
        plan: 'pro',
        createdAt: new Date().toISOString().split('T')[0],
      };
    }
    return defaultTenant;
  });

  const [services, setServices] = useState<Service[]>(SERVICES);
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(DEFAULT_SCHEDULE_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTenantData = useCallback(async () => {
    const queryTenant = getActiveQueryTenant();
    const targetTenantId = queryTenant || 'alex_beauty';

    try {
      setLoading(true);

      // 1. First fetch directly from Firestore if available
      try {
        const tDocRef = doc(db, 'tenants', targetTenantId);
        const tSnap = await getDoc(tDocRef);
        if (tSnap.exists()) {
          const tData = tSnap.data();
          setTenant({
            id: tSnap.id,
            tenantSlug: tData.tenantSlug || tSnap.id,
            name: tData.name || tSnap.id,
            tagline: tData.tagline || 'סטודיו לטיפוח ויופי',
            ownerName: tData.ownerName || tData.name || 'מנהלת סטודיו',
            phone: tData.phone || '054-0000000',
            email: tData.email || '',
            address: tData.address || '',
            city: tData.city || '',
            primaryColor: tData.primaryColor || '#9333ea',
            status: tData.status || 'active',
            plan: tData.plan || 'pro',
            createdAt: tData.createdAt || '2024-01-01',
            customDomain: tData.customDomain || '',
            isPrimary: tSnap.id === 'alex_beauty',
          });
        }

        const cDocRef = doc(db, 'tenants', targetTenantId, 'settings', 'config');
        const cSnap = await getDoc(cDocRef);
        if (cSnap.exists()) {
          const cData = cSnap.data();
          if (cData.services && Array.isArray(cData.services) && cData.services.length > 0) {
            setServices(cData.services);
          }
          if (cData.scheduleSettings) {
            setScheduleSettings(cData.scheduleSettings);
          }
        }
      } catch (fErr) {
        console.warn(`[TenantContext] Firestore direct read note for ${targetTenantId}:`, fErr);
      }

      // 2. Fetch from Express endpoint /api/tenant/current
      const endpoint = queryTenant
        ? `/api/tenant/current?tenant=${encodeURIComponent(queryTenant)}`
        : '/api/tenant/current';

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tenant) {
          setTenant((prev) => ({
            ...prev,
            ...data.tenant,
            id: data.tenant.id || targetTenantId,
            tenantSlug: data.tenant.tenantSlug || data.tenant.id || targetTenantId,
          }));

          if (data.config?.services && Array.isArray(data.config.services) && data.config.services.length > 0) {
            setServices(data.config.services);
          }
          if (data.config?.scheduleSettings) {
            setScheduleSettings(data.config.scheduleSettings);
          }
        }
      }
    } catch (err) {
      console.warn('[TenantContext] Warning loading tenant from server:', err);
    } finally {
      setLoading(false);
    }
  }, [getActiveQueryTenant]);

  // Re-fetch whenever location search query or path changes
  useEffect(() => {
    fetchTenantData();
  }, [location.search, fetchTenantData]);

  // Apply tenant branding colors dynamically to CSS custom variables
  useEffect(() => {
    const color = tenant.primaryColor || '#9333ea';
    const root = document.documentElement;
    root.style.setProperty('--tenant-primary', color);
    root.style.setProperty('--tenant-primary-light', `${color}1a`);
    root.style.setProperty('--tenant-primary-glow', `${color}33`);
  }, [tenant.primaryColor]);

  const salonInfo: SalonInfo = {
    name: tenant.name,
    tagline: tenant.tagline || 'הזמנת תורים אונליין',
    ownerName: tenant.ownerName,
    phone: tenant.phone,
    whatsappNumber: tenant.phone.replace(/\D/g, '').startsWith('0')
      ? `972${tenant.phone.replace(/\D/g, '').slice(1)}`
      : tenant.phone.replace(/\D/g, ''),
    address: tenant.address || (tenant.id === 'alex_beauty' ? 'הנרי קנדל 12' : ''),
    city: tenant.city || '',
    openingHours: [
      { days: 'ראשון - חמישי', hours: `${scheduleSettings.businessOpen} - ${scheduleSettings.businessClose}` },
      { days: 'שישי', hours: `${scheduleSettings.fridayOpen} - ${scheduleSettings.fridayClose}` },
      { days: 'שבת', hours: 'סגור (מנוחה)' },
    ],
  };

  const updateServices = (newServices: Service[]) => {
    setServices(newServices);
  };

  const updateScheduleSettings = (newSettings: ScheduleSettings) => {
    setScheduleSettings(newSettings);
  };

  const effectiveTenantId = activeQuery || tenant.id || 'alex_beauty';

  return (
    <TenantContext.Provider
      value={{
        tenantId: effectiveTenantId,
        tenant,
        salonInfo,
        services,
        scheduleSettings,
        primaryColor: tenant.primaryColor || '#9333ea',
        loading,
        refreshTenant: fetchTenantData,
        updateServices,
        updateScheduleSettings,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
