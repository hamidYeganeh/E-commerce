import {z} from "zod";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(`${s}T00:00:00Z`))&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s);
export const periodInput=z.object({from:date.optional(),to:date.optional(),year:z.coerce.number().int().min(1300).max(1600).optional()}).refine(d=>!d.from||!d.to||d.from<=d.to).refine(d=>!d.from||!d.to||(Date.parse(d.to)-Date.parse(d.from))/86400000<=3660,"حداکثر بازه ده سال است.");
export function persianYear(date:Date){return Number(new Intl.DateTimeFormat("en-US-u-ca-persian",{year:"numeric",timeZone:"Asia/Tehran"}).format(date));}
export function persianYearStart(year:number){for(let day=18;day<=24;day++){const d=new Date(Date.UTC(year+621,2,day,12));if(persianYear(d)===year)return d.toISOString().slice(0,10);}throw new Error("INVALID_PERSIAN_YEAR");}
export function reportDates(input:unknown,now=new Date()){
 const d=periodInput.parse(input),today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const end=d.year?new Date(Date.parse(persianYearStart(d.year+1))-86400000).toISOString().slice(0,10):d.to??today;
 const start=d.year?persianYearStart(d.year):d.from??new Date(Date.parse(end)-29*86400000).toISOString().slice(0,10);
 const days=(Date.parse(end)-Date.parse(start))/86400000+1;
 if(days<1||days>3661)throw new Error("INVALID_PERIOD");
 return{from:start,to:end,previousFrom:new Date(Date.parse(start)-days*86400000).toISOString().slice(0,10),previousTo:new Date(Date.parse(start)-86400000).toISOString().slice(0,10),days};
}
