import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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

  const [loadError,setLoadError]=useState('');
  const generation=useRef(0);
  const fetchTenantData = useCallback(async () => {
    const current=++generation.current;
    setLoading(true); setLoadError(''); setServices([]);
    setScheduleSettings({businessOpen:'',businessClose:'',fridayOpen:'',fridayClose:'',durationMinutes:60});
    try {
      const q=getActiveQueryTenant();
      const res=await fetch('/api/tenant/current'+(q?'?tenant='+encodeURIComponent(q):''));
      const data=await res.json();
      if(!res.ok || !data.success) throw new Error(data.error || 'העסק לא נמצא או אינו פעיל');
      if(current!==generation.current) return;
      localStorage.setItem('active_tenant_id_v1',data.tenant.id);
      const p=data.tenant;
      const digits=String(p.phone||'').replace(/\D/g,'');
      localStorage.setItem('tenant_profile__'+p.id,JSON.stringify({...p,whatsappNumber:digits.startsWith('0')?'972'+digits.slice(1):digits,openingHours:[]}));
      setTenant(data.tenant);
      setServices(data.config.services || []);
      setScheduleSettings(data.config.scheduleSettings);
    } catch(err:any) {if(current===generation.current)setLoadError(err.message);}
    finally {if(current===generation.current)setLoading(false);}
  },[getActiveQueryTenant]);
  useEffect(()=>{void fetchTenantData();return ()=>{generation.current++;};},[fetchTenantData]);

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

  const effectiveTenantId = tenant.id;
  if(loading) return <div dir="rtl" className="p-12 text-center">טוען את העסק…</div>;
  if(loadError) return <div dir="rtl" className="p-12 text-center"><p>{loadError}</p><button onClick={fetchTenantData}>ניסיון נוסף</button></div>;

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
