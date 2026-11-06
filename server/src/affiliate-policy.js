export const MONTHLY_PLAN={name:'LiveTV mensual',amount:27500,durationDays:30,maxConnections:1};
export function commissionEligible(user,now=Date.now()){
 return Boolean(user&&user.status==='active'&&user.role!=='admin'&&user.expires_at&&new Date(user.expires_at).getTime()>now);
}
export function wholeGs(value){const n=Number(value);if(!['number','string'].includes(typeof value)||typeof value==='string'&&!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n<1||n>1000000000)throw Object.assign(Error('Ingresá un monto entero válido en guaraníes'),{status:400});return n;}
export function commissionAmount(amount){return Math.floor(wholeGs(amount)/2);}
