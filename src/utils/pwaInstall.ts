export interface InstallPromptEvent extends Event {
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
}
let pending:InstallPromptEvent|null=null;
let manifest='';
const currentManifest=()=>typeof document!=='undefined'?document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href||'':'';
// Register before React/tenant loading so Chromium's one-shot event is not missed.
if(typeof window!=='undefined'){
 window.addEventListener('beforeinstallprompt',(e:Event)=>{
  const path=window.location.pathname;
  if(path!=='/')return; // Management pages retain their native browser install action.
  e.preventDefault();pending=e as InstallPromptEvent;manifest=currentManifest();
  window.dispatchEvent(new Event('pwa-install-ready'));
 });
 window.addEventListener('appinstalled',()=>{pending=null;});
}
export function availableInstallPrompt(){return manifest===currentManifest()?pending:null;}
export function clearInstallPrompt(){pending=null;}
export function installBrowser(userAgent:string,platform='',touchPoints=0){
 if(/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1))return 'ios';
 if(/SamsungBrowser/i.test(userAgent))return 'samsung';
 if(/; wv\)|FBAN|FBAV|Instagram/i.test(userAgent))return 'in-app';
 if(/Android/i.test(userAgent))return 'android';
 return 'desktop';
}
