export function canonicalPhone(value: string = ''): string {
  let s=value.replace(/\D/g,'');
  if(s.startsWith('00972')) s=s.slice(2);
  if(s.startsWith('9720')) s='972'+s.slice(4);
  if(s.startsWith('0')) s='972'+s.slice(1);
  return s;
}
