import {readJson,HttpFailure} from '../utils/readRequest';
import { TenantLoading } from '../components/TenantLoading';
import { pwaMetadata, pwaRoleForPath } from '../utils/pwa';
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
  // The platform control panel must remain available even when the primary
  // business is suspended; it is the place where a Super Admin can reactivate it.
  const isSuperAdminPath = location.pathname === '/super-admin' || location.pathname.startsWith('/super-admin/');

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
  }, [location.search]);

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
  const [loadStatus,setLoadStatus]=useState(0);
  const [resolvedQuery,setResolvedQuery]=useState<string|null>(null);
  const resolved=useRef<string|null>(null);
  const generation=useRef(0);
  const fetchTenantData = useCallback(async () => {
    const current=++generation.current;
    setLoading(resolved.current!==activeQuery); setLoadError(''); setLoadStatus(0);
    try {
      const q=activeQuery;
      const data=await readJson('/api/tenant/current'+(q?'?tenant='+encodeURIComponent(q):''));
      if(current!==generation.current)return;
      try{localStorage.setItem('active_tenant_id_v1',data.tenant.id);}catch{}
      const p=data.tenant;
      const digits=String(p.phone||'').replace(/\D/g,'');
      try{localStorage.setItem('tenant_profile__'+p.id,JSON.stringify({...p,whatsappNumber:digits.startsWith('0')?'972'+digits.slice(1):digits,openingHours:[]}));}catch{}
      resolved.current=q;setResolvedQuery(q);
      setTenant(data.tenant);
      setServices(data.config.services || []);
      setScheduleSettings(data.config.scheduleSettings);
    } catch(err:any) {if(current===generation.current){setLoadError(err.message);setLoadStatus(err instanceof HttpFailure?err.status:0);}}
    finally {if(current===generation.current)setLoading(false);}
  },[activeQuery]);
  useEffect(()=>{
    if (isSuperAdminPath) {
      generation.current++;
      setLoadError('');
      setLoading(false);
      return;
    }
    void fetchTenantData();
    return ()=>{generation.current++;};
  },[fetchTenantData,isSuperAdminPath]);

  useEffect(()=>{
    if(isSuperAdminPath)return;
    const reconnect=()=>void fetchTenantData();
    const timer=loadError && (loadStatus===0||loadStatus>=500||loadStatus===429)?setTimeout(reconnect,5000):undefined;
    window.addEventListener('online',reconnect);
    return ()=>{clearTimeout(timer);window.removeEventListener('online',reconnect);};
  },[loadError,loadStatus,isSuperAdminPath,fetchTenantData]);

  // Apply tenant branding colors dynamically to CSS custom variables
  useEffect(() => {
    const color = tenant.primaryColor || '#9333ea';
    const root = document.documentElement;
    root.style.setProperty('--tenant-primary', color);
    root.style.setProperty('--tenant-primary-light', `${color}1a`);
    root.style.setProperty('--tenant-primary-glow', `${color}33`);
  }, [tenant.primaryColor]);

  useEffect(() => {
    const role = pwaRoleForPath(location.pathname);
    const metadata = pwaMetadata(role, activeQuery || tenant.id, tenant.name, tenant.adminIcon,tenant.appShortName);
    document.title = role === 'customer' ? `${tenant.name} | קביעת תורים` : metadata.name;
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', metadata.name.slice(0, 30));
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest && manifest.getAttribute('href') !== metadata.manifestHref) manifest.setAttribute('href', metadata.manifestHref);
    let icon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if(!icon){icon=document.createElement('link');icon.rel='apple-touch-icon';document.head.appendChild(icon);}
    icon.setAttribute('href',metadata.appleIcon);
  }, [location.pathname, activeQuery, tenant.id, tenant.name, tenant.adminIcon,tenant.appShortName]);

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
  if((loading || (resolvedQuery!==activeQuery && !loadError)) && !isSuperAdminPath) return <TenantLoading />;
  if(loadError && !isSuperAdminPath && (resolvedQuery!==activeQuery || (loadStatus>=400 && loadStatus<500 && loadStatus!==429))) return <div dir="rtl" className="p-12 text-center"><p>{loadError}</p><button onClick={fetchTenantData}>ניסיון נוסף</button></div>;

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
      {loadError&&!isSuperAdminPath&&<div role="status" dir="rtl" className="bg-amber-100 p-3 text-center text-amber-950">החיבור לשרת נותק זמנית. מנסה להתחבר מחדש…</div>}
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
