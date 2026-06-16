import React, { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "./lib/supabase";

/* ════════════════════════════════════════════════════════════
   CONFIGURATION
   ════════════════════════════════════════════════════════════ */
const COMPANY = "Millewa Pumping";
const ADMIN_PIN = "2025"; // Change this PIN as needed
const DEFAULT_EMPLOYEE_PIN = "1234"; // Default PIN for all staff — admin can change per-person

const DEFAULT_STAFF = [
  "John Prictor",
  "Scottie Clark",
  "Nick Clark",
  "Iain Ellis",
  "Lewis Roberts",
  "James Butler",
  "Nat Symes",
  "Kieran Simmons",
  "Allister Robins",
];

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const STD_WEEK = 40;
const DEFAULT_START = "07:30";
const DEFAULT_FINISH = "16:00";
const DEFAULT_BREAK = 30;
const STD_DAY_HRS = 8;

const STATES = [
  { code:"VIC", name:"Victoria" },
  { code:"NSW", name:"New South Wales" },
  { code:"QLD", name:"Queensland" },
  { code:"SA",  name:"South Australia" },
  { code:"WA",  name:"Western Australia" },
  { code:"TAS", name:"Tasmania" },
  { code:"NT",  name:"Northern Territory" },
  { code:"ACT", name:"Australian Capital Territory" },
];
const STATE_COLORS = { VIC:"#1a237e", NSW:"#0277bd", QLD:"#7b1fa2", SA:"#c62828", WA:"#ef6c00", TAS:"#2e7d32", NT:"#4e342e", ACT:"#37474f" };
const JOB_TYPES = ["Standard","Pump Operations","Workshop Maintenance","Watermeter","Poly Welding","Administration","Fish Ecologist"];
const LEAVE_TYPES = [
  { code:"AL",  name:"Annual Leave",       color:"#2e86c1" },
  { code:"SL",  name:"Sick / Personal Leave", color:"#e74c3c" },
  { code:"LSL", name:"Long Service Leave",  color:"#8e44ad" },
  { code:"PH",  name:"Public Holiday",      color:"#27ae60" },
  { code:"CL",  name:"Compassionate Leave", color:"#d4ac0d" },
  { code:"WC",  name:"Workers Compensation",color:"#e67e22" },
  { code:"LWOP",name:"Leave Without Pay",   color:"#7f8c8d" },
  { code:"RDO", name:"Rostered Day Off",    color:"#1abc9c" },
  { code:"TOIL",name:"Time Off In Lieu",    color:"#5b2c6f" },
  { code:"OTH", name:"Other Leave",         color:"#566573" },
];
const CASUAL_LEAVE_CODES = ["LWOP","WC","OTH"];

/* ════════════ HELPERS ════════════ */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
// 15-minute interval time options for the full 24-hour clock
const TIME_OPTIONS=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=15)TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
const emptyJob = () => ({ start:"", finish:"", state:"", jobName:"", details:"Workshop", id:uid() });
const defaultJob = () => ({ start:DEFAULT_START, finish:DEFAULT_FINISH, state:"", jobName:"", details:"Workshop", id:uid() });
const emptyLeave = () => ({ type:"", hours:STD_DAY_HRS, note:"", id:uid() });
const emptyDay = (useDefaults=false) => ({ jobs:[useDefaults?defaultJob():emptyJob()], leave:null, breakMins:DEFAULT_BREAK, saved:false });

const WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];

// Auto-compute the upcoming Sunday (or today if today is Sunday) in YYYY-MM-DD
function getNextSunday(){
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday
  const offset = day === 0 ? 0 : 7 - day;
  const sun = new Date(today);
  sun.setDate(today.getDate() + offset);
  const y = sun.getFullYear();
  const m = String(sun.getMonth()+1).padStart(2,"0");
  const d = String(sun.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function nextWeekEnding(history){
  if(!history||!history.length)return getNextSunday();
  const last=history.reduce((max,h)=>h.weekEnding>max?h.weekEnding:max,"");
  if(!last)return getNextSunday();
  const d=new Date(last+"T00:00:00");d.setDate(d.getDate()+7);
  return d.toISOString().slice(0,10);
}

// Returns up to `maxWeeks` recent Sundays (including current) that the employee has NOT yet submitted
function getAvailableWeeks(history, maxWeeks=4){
  const submitted=new Set((history||[]).filter(h=>h.submittedAt).map(h=>h.weekEnding));
  const thisSunday=getNextSunday();
  const weeks=[];
  for(let i=0;i<maxWeeks;i++){
    const d=new Date(thisSunday+"T00:00:00");
    d.setDate(d.getDate()-7*i);
    // Format using local date parts to avoid UTC rollback in AU timezones
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const dd=String(d.getDate()).padStart(2,"0");
    const s=`${y}-${m}-${dd}`;
    if(!submitted.has(s))weeks.push(s);
  }
  return weeks; // most-recent first
}
const freshSheet=(name,we)=>({id:uid(),employeeName:name||"",weekEnding:we||getNextSunday(),days:Object.fromEntries(DAYS.map(d=>[d,emptyDay(WEEKDAYS.includes(d))])),submittedAt:null});

function calcH(s,f){if(!s||!f)return 0;const[sh,sm]=s.split(":").map(Number);const[fh,fm]=f.split(":").map(Number);const d=(fh*60+fm)-(sh*60+sm);return d>0?+(d/60).toFixed(2):0;}
function fH(h){if(!h)return"0h";const hrs=Math.floor(h),mins=Math.round((h-hrs)*60);return mins>0?`${hrs}h ${mins}m`:`${hrs}h`;}

function getDayDates(we){
  if(!we)return{};const end=new Date(we+"T00:00:00");const map={};
  DAYS.forEach((d,i)=>{const dt=new Date(end);dt.setDate(end.getDate()-(6-i));map[d]=`${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;});
  return map;
}
function fmtDateShort(ds){if(!ds)return"";const p=ds.split("/");return p.length===3?`${p[0]}/${p[1]}`:ds;}
function fmtAU(ds){if(!ds)return"";const p=ds.split("-");return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:ds;}

function getTotals(sheet,stdWeek=STD_WEEK,isCasual=false,paidBreak=false){
  let total=0,leaveHrs=0;const byDay={},byDayOT={},byState={},byJob={},byLeave={};
  DAYS.forEach(d=>{
    const day=sheet.days[d];
    const rawH=(day?.jobs||[]).reduce((s,j)=>{const h=calcH(j.start,j.finish);if(h>0&&j.state)byState[j.state]=(byState[j.state]||0)+h;if(h>0&&j.jobName){const key=`${j.jobName}|||${j.state||""}`;byJob[key]=(byJob[key]||0)+h;}return s+h;},0);
    // Break deducted only when 8h+ day AND break is not paid
    const breakH=(!paidBreak&&rawH>=STD_DAY_HRS)?DEFAULT_BREAK/60:0;
    const dh=Math.max(0,rawH-breakH);
    if(rawH>0&&breakH>0){const ratio=dh/rawH;(day?.jobs||[]).forEach(j=>{const h=calcH(j.start,j.finish);if(h>0){const ded=h-(h*ratio);if(j.state)byState[j.state]=Math.max(0,(byState[j.state]||0)-ded);if(j.jobName){const key=`${j.jobName}|||${j.state||""}`;byJob[key]=Math.max(0,(byJob[key]||0)-ded);}}});}
    if(day?.leave?.type){const lh=day.leave.hours||0;leaveHrs+=lh;byLeave[day.leave.type]=(byLeave[day.leave.type]||0)+lh;}
    byDay[d]=dh;
    const isWeekend=(d==="Saturday"||d==="Sunday");
    byDayOT[d]=isCasual?0:isWeekend?dh:Math.max(0,dh-STD_DAY_HRS);
    total+=dh;
  });
  const overtime=isCasual?0:Object.values(byDayOT).reduce((s,h)=>s+h,0);
  return{total,regular:isCasual?total:total-overtime,overtime,byDay,byDayOT,byState,byJob,leaveHrs,byLeave};
}

/* ════════════ STORAGE (Supabase) ════════════ */
// All persistence lives in Supabase. These helpers keep the same async
// signatures the rest of App.jsx already uses, so calling code is unchanged.
//
// Tables (see supabase/schema.sql):
//   timesheets            — one row per submitted/draft sheet
//   staff                 — name (pk), pin, profile JSONB
//   overtime_adjustments  — one row per TOIL add/deduct entry

function logErr(label,err){if(err)console.error(`[storage] ${label}`,err);}

// ── Timesheets ──────────────────────────────────────────────────────────────
// Top-level columns are derived from the sheet object; the full sheet is
// stored verbatim in the `data` JSONB column. On load we reconstruct the
// sheet from `data` (so all the per-day detail comes back intact).

function rowFromSheet(sheet){
  return {
    id:              sheet.id,
    employee_name:   sheet.employeeName,
    week_ending:     sheet.weekEnding,
    submitted_at:    sheet.submittedAt || null,
    approval_status: sheet.approvalStatus || null,
    data:            sheet,
  };
}
function sheetFromRow(row){
  // Prefer the JSONB blob (full fidelity); fall back to top-level cols if missing.
  if(row?.data && typeof row.data==="object") return row.data;
  return {
    id:              row.id,
    employeeName:    row.employee_name,
    weekEnding:      row.week_ending,
    submittedAt:     row.submitted_at,
    approvalStatus:  row.approval_status,
  };
}

async function saveTS(sheet){
  const{error}=await supabase.from("timesheets").upsert(rowFromSheet(sheet),{onConflict:"id"});
  logErr("saveTS",error);
  return error;
}
async function loadMySheets(name){
  const{data,error}=await supabase
    .from("timesheets").select("*").eq("employee_name",name);
  logErr("loadMySheets",error);
  return(data||[]).map(sheetFromRow);
}
async function loadAllAdmin(){
  const{data,error}=await supabase.from("timesheets").select("*");
  logErr("loadAllAdmin",error);
  return(data||[]).map(sheetFromRow);
}
async function delTS(sheet){
  const{error}=await supabase.from("timesheets").delete().eq("id",sheet.id);
  logErr("delTS",error);
}

// ── Staff list + PINs + profiles ────────────────────────────────────────────
// One row per staff member. Returning shapes match the old localStorage API:
//   loadStaffList()     -> string[] | null
//   loadEmployeePins()  -> { [name]: pin }
//   loadStaffProfiles() -> { [name]: profileObj }
// On save we upsert each row (and delete any rows no longer in the input).

async function loadStaffList(){
  const{data,error}=await supabase
    .from("staff").select("name,sort_order").order("sort_order");
  logErr("loadStaffList",error);
  if(!data||!data.length) return null;
  return data.map(r=>r.name);
}
async function saveStaffList(list){
  // Upsert each name with its sort_order; delete any rows not in the list.
  const rows=list.map((name,i)=>({name,sort_order:i}));
  const{error:upErr}=await supabase.from("staff")
    .upsert(rows,{onConflict:"name",ignoreDuplicates:false});
  logErr("saveStaffList:upsert",upErr);
  if(list.length){
    const{error:delErr}=await supabase.from("staff").delete().not("name","in",`(${list.map(n=>`"${n.replace(/"/g,'""')}"`).join(",")})`);
    logErr("saveStaffList:delete",delErr);
  }else{
    const{error:delErr}=await supabase.from("staff").delete().neq("name","");
    logErr("saveStaffList:delete-all",delErr);
  }
}
async function loadEmployeePins(){
  const{data,error}=await supabase.from("staff").select("name,pin");
  logErr("loadEmployeePins",error);
  const out={};
  for(const r of(data||[])) if(r.pin!=null) out[r.name]=r.pin;
  return out;
}
async function saveEmployeePins(pins){
  const rows=Object.entries(pins).map(([name,pin])=>({name,pin}));
  if(!rows.length)return;
  const{error}=await supabase.from("staff")
    .upsert(rows,{onConflict:"name",ignoreDuplicates:false});
  logErr("saveEmployeePins",error);
}
async function loadStaffProfiles(){
  const{data,error}=await supabase.from("staff").select("name,profile");
  logErr("loadStaffProfiles",error);
  const out={};
  for(const r of(data||[])) out[r.name]=r.profile||{};
  return out;
}
async function saveStaffProfiles(profiles){
  const rows=Object.entries(profiles).map(([name,profile])=>({name,profile:profile||{}}));
  if(!rows.length)return;
  const{error}=await supabase.from("staff")
    .upsert(rows,{onConflict:"name",ignoreDuplicates:false});
  logErr("saveStaffProfiles",error);
}

// ── Overtime adjustments ────────────────────────────────────────────────────
// Stored shape preserved for the rest of App.jsx:
//   { [employeeName]: [{ id, date, hours, note, type }, ...] }
// Each entry is one DB row. On save we diff and apply changes per employee.

async function loadOvertimeAdjustments(){
  const{data,error}=await supabase
    .from("overtime_adjustments").select("*").order("adj_date");
  logErr("loadOvertimeAdjustments",error);
  const out={};
  for(const r of(data||[])){
    (out[r.employee_name]=out[r.employee_name]||[]).push({
      id:r.id, date:r.adj_date, hours:Number(r.hours),
      note:r.note||"", type:r.adj_type,
    });
  }
  return out;
}
async function saveOvertimeAdjustments(adj){
  // Reload current state, diff, and apply minimal changes. Cheap for the
  // expected scale (dozens of entries per employee), and keeps the helper's
  // "pass me the whole object" API intact.
  const current=await loadOvertimeAdjustments();
  const currentIds=new Set(Object.values(current).flat().map(e=>e.id));
  const nextIds  =new Set(Object.values(adj    ).flat().map(e=>e.id));

  const toUpsert=[];
  for(const[empName,entries]of Object.entries(adj)){
    for(const e of entries){
      toUpsert.push({
        id:e.id, employee_name:empName, adj_date:e.date,
        hours:e.hours, note:e.note||null, adj_type:e.type,
      });
    }
  }
  const toDelete=[...currentIds].filter(id=>!nextIds.has(id));

  if(toUpsert.length){
    const{error}=await supabase.from("overtime_adjustments")
      .upsert(toUpsert,{onConflict:"id",ignoreDuplicates:false});
    logErr("saveOvertimeAdjustments:upsert",error);
  }
  if(toDelete.length){
    const{error}=await supabase.from("overtime_adjustments")
      .delete().in("id",toDelete);
    logErr("saveOvertimeAdjustments:delete",error);
  }
}

// ── Old data pruning ────────────────────────────────────────────────────────
// Remove timesheets with week_ending older than 5 years. Server-side this is
// just one query — vastly cheaper than the per-key localStorage version.

async function pruneOldData(){
  const cutoff=new Date();
  cutoff.setFullYear(cutoff.getFullYear()-5);
  const cutoffStr=cutoff.toISOString().slice(0,10);
  const{error}=await supabase.from("timesheets")
    .delete().lt("week_ending",cutoffStr);
  logErr("pruneOldData",error);
}

/* ════════════ PRINT CSS ════════════ */
const PRINT_CSS=`
@media print{body,html{margin:0;padding:0;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none!important;}.print-only{display:block!important;}.print-page{page-break-after:always;padding:20px;}.print-page:last-child{page-break-after:auto;}}
@media screen{.print-only{display:none!important;}}
.pdf-table{width:100%;border-collapse:collapse;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;margin-bottom:12px;}.pdf-table th,.pdf-table td{border:1px solid #ccc;padding:6px 8px;text-align:left;}.pdf-table th{background:#2c3e50;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;}.pdf-table tr:nth-child(even){background:#f8f7f5;}
.pdf-title{font-size:22px;font-weight:800;color:#1a2634;margin:0 0 4px;}.pdf-subtitle{font-size:11px;color:#7f8c8d;margin:0 0 16px;}.pdf-section{font-size:13px;font-weight:700;color:#2c3e50;margin:16px 0 6px;border-bottom:2px solid #e67e22;padding-bottom:3px;}
.pdf-meta{display:flex;gap:24px;margin-bottom:14px;font-size:12px;}.pdf-meta-label{font-weight:700;color:#7f8c8d;text-transform:uppercase;font-size:9px;letter-spacing:.5px;}.pdf-meta-value{font-weight:600;color:#2c3e50;margin-top:2px;}
.pdf-totals{display:flex;gap:16px;margin:12px 0;flex-wrap:wrap;}.pdf-total-box{background:#f5f3ef;border:1px solid #e6e2dc;border-radius:6px;padding:8px 14px;text-align:center;}.pdf-total-val{font-size:18px;font-weight:800;font-family:monospace;}.pdf-total-lbl{font-size:9px;font-weight:700;color:#7f8c8d;text-transform:uppercase;margin-top:2px;}
.pdf-sig{display:flex;gap:40px;margin-top:30px;}.pdf-sig-line{flex:1;border-bottom:1px solid #333;padding-bottom:4px;}.pdf-sig-label{font-size:10px;color:#7f8c8d;margin-top:4px;}
@keyframes mtpulse{0%,100%{opacity:1}50%{opacity:.25}}
`;

/* ════════════ STYLES ════════════ */
const S={
  shell:{minHeight:"100vh",background:"#f5f3ef",fontFamily:"'Segoe UI','SF Pro Text','Helvetica Neue',sans-serif",WebkitTapHighlightColor:"transparent",maxWidth:480,margin:"0 auto"},
  header:{background:"linear-gradient(135deg,#1a2634,#2c3e50)",padding:"18px 16px 14px",position:"sticky",top:0,zIndex:20},
  hTitle:{fontSize:20,fontWeight:800,color:"#fff",margin:0,letterSpacing:.5},
  hSub:{fontSize:10,color:"rgba(255,255,255,.45)",letterSpacing:2,textTransform:"uppercase",marginTop:2},
  hUser:{fontSize:11,color:"#e67e22",marginTop:4,fontWeight:600},
  tabs:{display:"flex",background:"#2c3e50",borderBottom:"3px solid #e67e22"},
  tab:a=>({flex:1,padding:"10px",textAlign:"center",fontSize:12,fontWeight:700,color:a?"#e67e22":"rgba(255,255,255,.5)",background:a?"rgba(230,126,34,.1)":"transparent",border:"none",borderBottom:a?"3px solid #e67e22":"3px solid transparent",marginBottom:-3,cursor:"pointer",textTransform:"uppercase",letterSpacing:.5,fontFamily:"inherit"}),
  card:{background:"#fff",borderRadius:12,margin:"0 12px 10px",border:"1px solid #e6e2dc",boxShadow:"0 1px 4px rgba(0,0,0,.04)",overflow:"hidden"},
  dayBar:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"linear-gradient(135deg,#2c3e50,#34495e)",color:"#fff",cursor:"pointer"},
  dayName:{fontWeight:700,fontSize:13,letterSpacing:.5,textTransform:"uppercase"},
  dayDate:{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.85)",marginLeft:8},
  badge:a=>({fontSize:12,fontWeight:700,fontFamily:"monospace",background:a?"rgba(230,126,34,.9)":"rgba(255,255,255,.12)",padding:"3px 10px",borderRadius:14}),
  leaveBadge:c=>({fontSize:10,fontWeight:700,color:"#fff",background:c,padding:"2px 8px",borderRadius:10}),
  jobRow:{padding:"10px 14px",borderBottom:"1px solid #f0ece6"},
  jobHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6},
  jobNum:{fontSize:11,fontWeight:700,color:"#95a5a6",textTransform:"uppercase",letterSpacing:.5},
  timeRow:{display:"grid",gridTemplateColumns:"1fr 1fr 50px",gap:8,alignItems:"center"},
  fieldRow:{marginTop:8},
  twoCol:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8},
  input:{width:"100%",boxSizing:"border-box",fontSize:16,padding:"10px 12px",borderRadius:8,border:"1px solid #ddd8d0",background:"#fafaf8",color:"#2c3e50",outline:"none",WebkitAppearance:"none",fontFamily:"inherit"},
  timeInput:{width:"100%",boxSizing:"border-box",fontSize:16,padding:"10px 8px",borderRadius:8,border:"1px solid #ddd8d0",background:"#fafaf8",color:"#2c3e50",outline:"none",WebkitAppearance:"none",fontFamily:"inherit",textAlign:"center"},
  select:{width:"100%",boxSizing:"border-box",fontSize:16,padding:"10px 12px",borderRadius:8,border:"1px solid #ddd8d0",background:"#fafaf8",color:"#2c3e50",outline:"none",WebkitAppearance:"none",fontFamily:"inherit",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2395a5a6' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center",paddingRight:32},
  hrsCell:{textAlign:"center",fontWeight:700,fontSize:13,color:"#2c3e50",fontFamily:"monospace"},
  label:{fontSize:10,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,marginBottom:3,display:"block"},
  addBtn:{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"10px",background:"none",border:"1px dashed #ccc7be",borderRadius:8,color:"#27ae60",fontSize:13,fontWeight:600,cursor:"pointer",margin:"6px 0 4px"},
  rmBtn:{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",alignItems:"center"},
  primary:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"16px",background:"linear-gradient(135deg,#e67e22,#d35400)",color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 12px rgba(230,126,34,.3)"},
  exportBtn:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"14px",background:"#fff",color:"#2c3e50",border:"2px solid #2c3e50",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8},
  totCard:{background:"linear-gradient(135deg,#1a2634,#2c3e50)",borderRadius:12,margin:"0 12px 10px",padding:"16px 18px",color:"#fff"},
  totRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"},
  totLbl:{fontSize:12,color:"rgba(255,255,255,.6)",fontWeight:600,textTransform:"uppercase",letterSpacing:.5},
  totVal:c=>({fontSize:18,fontWeight:800,color:c,fontFamily:"monospace"}),
  otBadge:{display:"inline-block",background:"#e74c3c",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,marginLeft:6},
  stateCard:{background:"#fff",borderRadius:12,margin:"0 12px 10px",border:"1px solid #e6e2dc",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.04)"},
  stateBar:{padding:"10px 14px",background:"#faf8f5",borderBottom:"1px solid #eee9e3",display:"flex",alignItems:"center",gap:6},
  stateRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderBottom:"1px solid #f5f2ed"},
  jobBreak:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 14px 6px 28px",borderBottom:"1px solid #f5f2ed",background:"#fdfcfa"},
  listItem:{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:8,border:"1px solid #e6e2dc",boxShadow:"0 1px 3px rgba(0,0,0,.04)"},
  backBtn:{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#7f8c8d",display:"flex",alignItems:"center",gap:4,padding:"12px 12px 4px",fontWeight:600},
  toast:{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#2c3e50",color:"#fff",padding:"12px 24px",borderRadius:10,fontSize:14,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,.3)",zIndex:100},
  empty:{textAlign:"center",color:"#95a5a6",fontSize:14,padding:"40px 20px",lineHeight:1.6},
  secTitle:{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#95a5a6",padding:"8px 16px 4px"},
  leaveToggle:{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"8px",background:"none",border:"1px dashed #e8d5a3",borderRadius:8,color:"#d4ac0d",fontSize:12,fontWeight:600,cursor:"pointer"},
  // Login
  loginShell:{minHeight:"100vh",background:"linear-gradient(135deg,#1a2634 0%,#2c3e50 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24},
  loginCard:{background:"#fff",borderRadius:16,padding:28,width:"100%",maxWidth:380,boxShadow:"0 8px 40px rgba(0,0,0,.3)"},
  loginTitle:{fontSize:24,fontWeight:800,color:"#1a2634",margin:"0 0 2px",textAlign:"center"},
  loginCompany:{fontSize:12,color:"#e67e22",fontWeight:700,textTransform:"uppercase",letterSpacing:2,textAlign:"center",marginBottom:24},
  loginDivider:{border:"none",borderTop:"1px solid #eee",margin:"16px 0"},
  staffBtn:(sel)=>({width:"100%",padding:"14px",marginBottom:6,borderRadius:10,border:sel?"2px solid #e67e22":"2px solid #e8e4df",background:sel?"#fdf3e8":"#fff",color:"#2c3e50",fontSize:15,fontWeight:sel?700:500,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all .15s"}),
  adminLink:{background:"linear-gradient(135deg,#2c3e50,#1a252f)",border:"none",borderRadius:10,cursor:"pointer",fontSize:14,color:"#fff",fontWeight:700,textAlign:"center",width:"100%",padding:"14px",marginTop:8,letterSpacing:.3,boxShadow:"0 2px 8px rgba(0,0,0,.18)"},
  pinInput:{width:"100%",boxSizing:"border-box",fontSize:24,padding:"14px",borderRadius:10,border:"2px solid #ddd8d0",textAlign:"center",letterSpacing:8,fontFamily:"monospace",color:"#2c3e50",outline:"none"},
  // Summary
  sumHeader:{background:"linear-gradient(135deg,#0d1b2a,#1b2838)",borderRadius:12,margin:"0 12px 10px",padding:"16px 18px",color:"#fff"},
  sumGrid:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10},
  sumStat:bg=>({background:bg,borderRadius:8,padding:"10px 12px",textAlign:"center"}),
  sumStatVal:{fontSize:18,fontWeight:800,fontFamily:"monospace",color:"#fff"},
  sumStatLbl:{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:"rgba(255,255,255,.6)",marginTop:2},
  empCard:{background:"#fff",borderRadius:12,margin:"0 12px 8px",border:"1px solid #e6e2dc",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.04)"},
  empHead:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"linear-gradient(135deg,#34495e,#3d566e)",color:"#fff",cursor:"pointer"},
  empName:{fontWeight:700,fontSize:14},
  dayRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderBottom:"1px solid #f0ece6",fontSize:13},
  dayLabel:{fontWeight:600,color:"#2c3e50",width:80},
  dayHrs:{fontWeight:700,fontFamily:"monospace",color:"#2c3e50",width:50,textAlign:"right"},
  dayJobs:{flex:1,fontSize:11,color:"#7f8c8d",padding:"0 10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
};

/* ════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ════════════════════════════════════════════════════════════ */
function LoginScreen({onLogin,staff,employeePins}){
  const[mode,setMode]=useState("staff"); // staff | pin | admin
  const[pin,setPin]=useState("");
  const[err,setErr]=useState("");
  const[sel,setSel]=useState("");

  const handleSelectName=(name)=>{setSel(name);setPin("");setErr("");setMode("pin");};

  const handlePinLogin=()=>{
    const expected=employeePins[sel]||DEFAULT_EMPLOYEE_PIN;
    if(pin===expected)onLogin({type:"staff",name:sel});
    else{setErr("Incorrect PIN");setPin("");setTimeout(()=>setErr(""),2000);}
  };

  const handleAdmin=()=>{
    if(pin===ADMIN_PIN)onLogin({type:"admin",name:"Admin"});
    else{setErr("Incorrect PIN");setPin("");setTimeout(()=>setErr(""),2000);}
  };

  const backToStaff=()=>{setMode("staff");setPin("");setErr("");setSel("");};

  return(
    <div style={S.loginShell}>
      <div style={{marginBottom:20,textAlign:"center"}}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e67e22" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div style={S.loginCard}>
        <div style={S.loginTitle}>Weekly Timesheet</div>
        <div style={S.loginCompany}>{COMPANY}</div>

        {mode==="staff"&&<div>
          <label style={{...S.label,marginBottom:8}}>Select your name</label>
          <div style={{maxHeight:340,overflowY:"auto",marginBottom:12}}>
            {staff.map(name=>(
              <button key={name} style={S.staffBtn(false)} onClick={()=>handleSelectName(name)}>
                {name}
              </button>
            ))}
          </div>
          <hr style={S.loginDivider}/>
          <button onClick={()=>{setMode("admin");setPin("");setErr("");}} style={S.adminLink}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{verticalAlign:"middle",marginRight:4}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Admin Login
          </button>
        </div>}

        {mode==="pin"&&<div>
          <div style={{fontSize:16,fontWeight:700,color:"#2c3e50",textAlign:"center",marginBottom:16}}>{sel}</div>
          <label style={{...S.label,marginBottom:8,textAlign:"center"}}>Enter Your PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e=>setPin(e.target.value.replace(/\D/g,""))}
            onKeyDown={e=>e.key==="Enter"&&handlePinLogin()}
            style={S.pinInput}
            placeholder="••••"
            autoFocus
          />
          {err&&<div style={{color:"#e74c3c",fontSize:12,fontWeight:600,textAlign:"center",marginTop:8}}>{err}</div>}
          <div style={{marginTop:14,display:"flex",gap:8}}>
            <button onClick={backToStaff} style={{...S.exportBtn,flex:1,marginTop:0}}>Back</button>
            <button onClick={handlePinLogin} style={{...S.primary,flex:1}}>Sign In</button>
          </div>
        </div>}

        {mode==="admin"&&<div>
          <label style={{...S.label,marginBottom:8,textAlign:"center"}}>Enter Admin PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e=>setPin(e.target.value.replace(/\D/g,""))}
            onKeyDown={e=>e.key==="Enter"&&handleAdmin()}
            style={S.pinInput}
            placeholder="••••"
            autoFocus
          />
          {err&&<div style={{color:"#e74c3c",fontSize:12,fontWeight:600,textAlign:"center",marginTop:8}}>{err}</div>}
          <div style={{marginTop:14,display:"flex",gap:8}}>
            <button onClick={backToStaff} style={{...S.exportBtn,flex:1,marginTop:0}}>Back</button>
            <button onClick={handleAdmin} style={{...S.primary,flex:1}}>Unlock</button>
          </div>
        </div>}
      </div>
      <div style={{marginTop:16,fontSize:10,color:"rgba(255,255,255,.3)",textAlign:"center"}}>Confidential · {COMPANY} © {new Date().getFullYear()}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   INTERACTIVE COMPONENTS
   ════════════════════════════════════════════════════════════ */
function JobEntry({job,idx,total,onChange,onRemove}){
  const hrs=calcH(job.start,job.finish);
  const[listening,setListening]=useState(false);
  const[interim,setInterim]=useState("");
  const[transcript,setTranscript]=useState([]);
  const recRef=useRef(null);
  const activeRef=useRef(false);
  const detailsRef=useRef(job.details);
  detailsRef.current=job.details;

  const SR=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);

  const startRec=()=>{
    if(!activeRef.current||!SR)return;
    const rec=new SR();
    rec.lang="en-AU";
    rec.continuous=false;    // false is more reliable on iOS Safari
    rec.interimResults=true;

    rec.onresult=(e)=>{
      let fin="",int="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal)fin+=e.results[i][0].transcript;
        else int+=e.results[i][0].transcript;
      }
      if(int)setInterim(int);
      if(fin){
        const cur=detailsRef.current||"";
        const next=(cur===""||cur==="Workshop")?fin.trim():(cur+" "+fin.trim());
        onChange("details",next);
        setTranscript(t=>[...t,fin.trim()]);
        setInterim("");
      }
    };

    rec.onend=()=>{
      setInterim("");
      // Auto-restart to give a continuous feel until user taps stop
      if(activeRef.current)setTimeout(startRec,120);
      else setListening(false);
    };

    rec.onerror=(e)=>{
      setInterim("");
      if(e.error==="no-speech"||e.error==="audio-capture"){
        if(activeRef.current)setTimeout(startRec,200);
      } else if(e.error!=="aborted"){
        activeRef.current=false;
        setListening(false);
      }
    };

    recRef.current=rec;
    try{rec.start();}catch(_){if(activeRef.current)setTimeout(startRec,300);}
  };

  const toggleVoice=()=>{
    if(!SR){alert("Voice input requires Chrome, Edge, or Safari.\nFirefox does not support this feature.");return;}
    if(activeRef.current){
      activeRef.current=false;
      try{recRef.current?.abort();}catch(_){}
      setListening(false);
      setInterim("");
    } else {
      activeRef.current=true;
      setListening(true);
      setTranscript([]);
      startRec();
    }
  };

  // Stop recognition if this component unmounts while listening
  useEffect(()=>()=>{
    activeRef.current=false;
    try{recRef.current?.abort();}catch(_){}
  },[]);

  return(
    <div style={S.jobRow}>
      {total>1&&<div style={S.jobHead}><span style={S.jobNum}>Job {idx+1}</span><button onClick={onRemove} style={S.rmBtn}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button></div>}
      <div style={S.timeRow}>
        <div><label style={S.label}>Start</label><select value={job.start||""} onChange={e=>onChange("start",e.target.value)} style={{...S.select,textAlign:"center",paddingRight:28}}><option value="">--:--</option>{TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><label style={S.label}>Finish</label><select value={job.finish||""} onChange={e=>onChange("finish",e.target.value)} style={{...S.select,textAlign:"center",paddingRight:28}}><option value="">--:--</option>{TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div style={{...S.hrsCell,paddingTop:18}}>{hrs>0?fH(hrs):"—"}</div>
      </div>
      <div style={S.fieldRow}>
        <label style={S.label}>Location &amp; Work Completed</label>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="text" placeholder="Site location, work done..." value={job.details} onChange={e=>onChange("details",e.target.value)} style={{...S.input,flex:1}}/>
          <button onClick={toggleVoice} title={listening?"Stop recording":"Tap to dictate"} style={{flexShrink:0,width:46,height:46,borderRadius:10,border:listening?"2px solid #e74c3c":"2px solid #ddd8d0",background:listening?"#fdf2f2":"#fafaf8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,transition:"border .2s,background .2s"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={listening?"#e74c3c":"#7f8c8d"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        </div>

        {/* Live interim preview */}
        {interim&&<div style={{marginTop:5,padding:"6px 10px",background:"#f0f4ff",borderRadius:8,border:"1px solid #c5d5f0",fontSize:12,color:"#2c3e50",fontStyle:"italic"}}>
          {interim}…
        </div>}

        {/* Listening status */}
        {listening&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#e74c3c",display:"inline-block",animation:"mtpulse 1s ease-in-out infinite"}}/>
          <span style={{fontSize:11,color:"#e74c3c",fontWeight:600}}>Listening — tap mic to stop</span>
        </div>}

        {/* Session transcript log */}
        {transcript.length>0&&<div style={{marginTop:6,padding:"6px 10px",background:"#f8f6f3",borderRadius:8,border:"1px solid #e6e2dc"}}>
          <div style={{fontSize:9,fontWeight:700,color:"#95a5a6",textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>Voice transcript</div>
          {transcript.map((t,i)=><div key={i} style={{fontSize:11,color:"#2c3e50",padding:"1px 0"}}>• {t}</div>)}
        </div>}
      </div>
    </div>
  );
}

function LeaveEntry({leave,onChange,onRemove}){
  const lt = LEAVE_TYPES.find(l => l.code === leave.type);
  const hoursOptions = [];
  for (let i = 1; i <= 160; i++) {
    const h = i * 0.25;
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    const lbl = mins > 0 ? hrs + "h " + mins + "m" : hrs + "h";
    hoursOptions.push({ value: h, label: lbl });
  }
  return (
    <div style={{padding:"10px 14px",background:"#fffbf0",borderTop:"2px dashed #f0e6c8"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:"#b7950b",textTransform:"uppercase",letterSpacing:.5}}>Leave</span>
        <button onClick={onRemove} style={{...S.rmBtn,border:"1px solid #f0d6d6",borderRadius:6,padding:"4px 10px",fontSize:11,color:"#c0392b",fontWeight:600}}>Remove</button>
      </div>
      <div>
        <label style={S.label}>Leave Type</label>
        <select value={leave.type || ""} onChange={e => onChange("type", e.target.value)} style={{...S.select,color:leave.type ? "#2c3e50" : "#aaa"}}>
          <option value="">Select...</option>
          {LEAVE_TYPES.map(l => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
      </div>
      <div style={S.twoCol}>
        <div>
          <label style={S.label}>Hours</label>
          <select value={leave.hours} onChange={e => onChange("hours", Number(e.target.value))} style={S.select}>
            {hoursOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Note</label>
          <input type="text" placeholder="Reason..." value={leave.note || ""} onChange={e => onChange("note", e.target.value)} style={S.input} />
        </div>
      </div>
    </div>
  );
}

function DayCard({day,date,data,update,onSaveDay,isFullTime=true}){
  const rawHrs=(data.jobs||[]).reduce((s,j)=>s+calcH(j.start,j.finish),0);
  const breakH=rawHrs>0?DEFAULT_BREAK/60:0;
  const hrs=Math.max(0,rawHrs-breakH);
  const ch=(i,f,v)=>{const jobs=data.jobs.map((j,x)=>x===i?{...j,[f]:v}:j);update({...data,jobs,saved:false});};
  const add=()=>update({...data,jobs:[...data.jobs,emptyJob()],saved:false});
  const rm=i=>update({...data,jobs:data.jobs.filter((_,x)=>x!==i),saved:false});
  const prefill=()=>{const jobs=data.jobs.map(j=>({...j,start:j.start||DEFAULT_START,finish:j.finish||DEFAULT_FINISH}));update({...data,jobs,saved:false});};
  const[open,setOpen]=useState(true);
  const isSaved=!!data.saved;
  const isEditing=!isSaved;

  const leaveObj=data.leave&&typeof data.leave==="object"?data.leave:null;
  const lt=leaveObj&&leaveObj.type?LEAVE_TYPES.find(l=>l.code===leaveObj.type):null;

  const addLeave=()=>{
    update({...data,leave:{type:"",hours:STD_DAY_HRS,note:"",id:uid()},saved:false});
  };
  const removeLeave=()=>{
    update({...data,leave:null,saved:false});
  };
  const changeLeave=(f,v)=>{
    const cur=data.leave&&typeof data.leave==="object"?data.leave:{type:"",hours:STD_DAY_HRS,note:"",id:uid()};
    update({...data,leave:{...cur,[f]:v},saved:false});
  };

  const handleSave=()=>{
    update({...data,saved:true});
    if(onSaveDay) onSaveDay();
  };
  const handleEdit=()=>{update({...data,saved:false});};

  return(
    <div style={{...S.card,border:isSaved?"2px solid #27ae60":"1px solid #e6e2dc"}}>
      <div style={S.dayBar} onClick={()=>setOpen(!open)}>
        <div style={{display:"flex",alignItems:"center"}}>
          <span style={S.dayName}>{day}</span>
          {date && <span style={S.dayDate}>{date}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {isSaved && <span style={{fontSize:9,fontWeight:700,color:"#fff",background:"#27ae60",padding:"2px 8px",borderRadius:10}}>SAVED</span>}
          {lt && <span style={S.leaveBadge(lt.color)}>{lt.code}</span>}
          <span style={S.badge(hrs>0)}>{hrs > 0 ? fH(hrs) : "0h"}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.5" strokeLinecap="round" style={{transform:open?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      {open && <div>
        {isEditing ? <div>
          {data.jobs.map((j,i) => (
            <JobEntry key={j.id} job={j} idx={i} total={data.jobs.length} onChange={(f,v)=>ch(i,f,v)} onRemove={()=>rm(i)} />
          ))}
          {rawHrs > 0 && (
            <div style={{padding:"6px 14px 8px",background:"#f8f6f3",borderTop:"1px solid #eee9e3",borderBottom:"1px solid #eee9e3",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,fontWeight:600,color:"#7f8c8d"}}>30min lunch deducted</span>
              <span style={{fontSize:11,color:"#95a5a6",fontWeight:600}}>{fH(rawHrs)} → {fH(hrs)}</span>
            </div>
          )}
          <div style={{padding:"10px 14px 4px",borderTop:"1px solid #f0ece6"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Leave</div>
            {/* Start / Finish — always visible */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 50px",gap:8,alignItems:"center",marginBottom:10}}>
              <div>
                <label style={S.label}>Start</label>
                <select value={leaveObj?.start||""} onChange={e=>{const s=e.target.value;const cur=leaveObj||{type:"",hours:STD_DAY_HRS,note:"",id:uid()};const h=cur.finish?calcH(s,cur.finish):cur.hours;update({...data,leave:{...cur,start:s,hours:h||cur.hours},saved:false});}} style={{...S.select,textAlign:"center",paddingRight:28}}><option value="">--:--</option>{TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select>
              </div>
              <div>
                <label style={S.label}>Finish</label>
                <select value={leaveObj?.finish||""} onChange={e=>{const f=e.target.value;const cur=leaveObj||{type:"",hours:STD_DAY_HRS,note:"",id:uid()};const h=cur.start?calcH(cur.start,f):cur.hours;update({...data,leave:{...cur,finish:f,hours:h||cur.hours},saved:false});}} style={{...S.select,textAlign:"center",paddingRight:28}}><option value="">--:--</option>{TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select>
              </div>
              <div style={{...S.hrsCell,paddingTop:18}}>{leaveObj?.start&&leaveObj?.finish?fH(calcH(leaveObj.start,leaveObj.finish)):"—"}</div>
            </div>
            {/* Leave type pills */}
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {(isFullTime?LEAVE_TYPES:LEAVE_TYPES.filter(l=>CASUAL_LEAVE_CODES.includes(l.code))).map(l=>{
                const sel=leaveObj&&leaveObj.type===l.code;
                return(
                  <button key={l.code} onClick={()=>{if(sel){update({...data,leave:leaveObj?.start||leaveObj?.finish?{...leaveObj,type:""}:null,saved:false});}else{const cur=leaveObj||{start:DEFAULT_START,finish:DEFAULT_FINISH,hours:STD_DAY_HRS,note:"",id:uid()};update({...data,leave:{...cur,type:l.code},saved:false});}}}
                    style={{padding:"5px 11px",borderRadius:20,border:`2px solid ${l.color}`,background:sel?l.color:"#fff",color:sel?"#fff":"#7f8c8d",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                    {l.code}
                  </button>
                );
              })}
            </div>
            {leaveObj?.type&&(
              <div style={{marginTop:8}}>
                <label style={S.label}>Note</label>
                <input type="text" placeholder="Reason..." value={leaveObj.note||""} onChange={e=>changeLeave("note",e.target.value)} style={S.input}/>
              </div>
            )}
          </div>
          <div style={{padding:"8px 14px 12px"}}>
            <button onClick={handleSave} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"12px",background:"linear-gradient(135deg,#27ae60,#219a52)",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px rgba(39,174,96,.3)"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              {"Save " + day}
            </button>
          </div>
        </div> : <div>
          <div style={{padding:"10px 14px"}}>
            {data.jobs.filter(j=>j.start||j.finish).map((j,i) => {
              const filtered = data.jobs.filter(jj=>jj.start||jj.finish);
              return (
                <div key={j.id||i} style={{padding:"6px 0",borderBottom:i < filtered.length - 1 ? "1px solid #f0ece6" : "none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#2c3e50"}}>{j.start} – {j.finish}</span>
                    <span style={{fontSize:12,fontWeight:700,color:"#e67e22",fontFamily:"monospace"}}>{calcH(j.start,j.finish) ? fH(calcH(j.start,j.finish)) : ""}</span>
                  </div>
                  <div style={{fontSize:11,color:"#7f8c8d",marginTop:2}}>{[j.jobName,j.state,j.details].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              );
            })}
            {!data.jobs.some(j=>j.start||j.finish) && <div style={{fontSize:12,color:"#aaa",fontStyle:"italic",padding:"4px 0"}}>No hours recorded</div>}
            {lt && leaveObj && (
              <div style={{marginTop:6,padding:"6px 0",borderTop:"1px dashed #f0e6c8"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:lt.color}}>{lt.name}{leaveObj.note ? " — " + leaveObj.note : ""}</span>
                  <span style={{fontSize:12,fontWeight:700,color:lt.color,fontFamily:"monospace"}}>{fH(leaveObj.hours)}</span>
                </div>
                {(leaveObj.start||leaveObj.finish)&&<div style={{fontSize:11,color:"#95a5a6",marginTop:2}}>{leaveObj.start||"—"} – {leaveObj.finish||"—"}</div>}
              </div>
            )}
          </div>
          <div style={{padding:"8px 14px 12px"}}>
            <button onClick={handleEdit} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"12px",background:"#fff",color:"#2980b9",border:"2px solid #2980b9",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              {"Edit " + day}
            </button>
          </div>
        </div>}
      </div>}
    </div>
  );
}

function TotalsBar({sheet,isCasual=false,stdWeek=STD_WEEK,paidBreak=false}){const t=getTotals(sheet,stdWeek,isCasual,paidBreak);const otDays=isCasual?[]:DAYS.filter(d=>(t.byDayOT?.[d]||0)>0);const leaveEntries=Object.entries(t.byLeave).filter(([,h])=>h>0);return(<div style={S.totCard}>{isCasual?(<div style={S.totRow}><span style={{...S.totLbl,color:"#e67e22",fontSize:13}}>Total Hours (Casual)</span><span style={S.totVal("#e67e22")}>{fH(t.total)}</span></div>):(<><div style={S.totRow}><span style={{...S.totLbl,color:"#7ecfff"}}>Ordinary Earnings</span><span style={S.totVal("#7ecfff")}>{fH(t.regular)}</span></div><div style={{...S.totRow,borderTop:"1px solid rgba(255,255,255,.1)",paddingTop:8,marginTop:4}}><span style={{...S.totLbl,color:"#e74c3c"}}>Overtime Earnings{t.overtime>0&&<span style={S.otBadge}>OT</span>}</span><span style={S.totVal(t.overtime>0?"#e74c3c":"rgba(255,255,255,.3)")}>{t.overtime>0?fH(t.overtime):"0h"}</span></div>{otDays.length>0&&<div style={{paddingLeft:8,marginTop:2,marginBottom:4}}>{otDays.map(d=><div key={d} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,.55)",padding:"1px 0"}}><span>{d.slice(0,3)}</span><span style={{color:"#e74c3c",fontWeight:700}}>+{fH(t.byDayOT[d])}</span></div>)}</div>}</>)}{leaveEntries.length>0&&<>{leaveEntries.map(([c,h])=>{const lt=LEAVE_TYPES.find(l=>l.code===c);const col=lt?.color||"#d4ac0d";return(<div key={c} style={{...S.totRow,borderTop:"1px solid rgba(255,255,255,.1)",paddingTop:8,marginTop:4}}><span style={{...S.totLbl,color:col}}>{lt?.name||c}</span><span style={S.totVal(col)}>{fH(h)}</span></div>);})}</>}{!isCasual&&<div style={{...S.totRow,borderTop:"1px solid rgba(255,255,255,.15)",paddingTop:10,marginTop:6}}><span style={{...S.totLbl,color:"#e67e22",fontSize:13}}>Total Worked</span><span style={S.totVal("#e67e22")}>{fH(t.total)}</span></div>}</div>);}

function StateSummary({sheet}){const{byState,byJob}=getTotals(sheet);const states=Object.entries(byState).sort((a,b)=>b[1]-a[1]);if(!states.length)return null;const jbs={};Object.entries(byJob).forEach(([k,h])=>{const[n,s]=k.split("|||");if(s){if(!jbs[s])jbs[s]=[];jbs[s].push({name:n,hrs:h});}});return(<div style={S.stateCard}><div style={S.stateBar}><span style={{fontSize:12,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:1}}>Hours by State</span></div>{states.map(([c,h])=>(<div key={c}><div style={S.stateRow}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:4,background:STATE_COLORS[c]||"#95a5a6"}}/><span style={{fontSize:14,fontWeight:600,color:"#2c3e50"}}>{c}</span></div><span style={{fontSize:14,fontWeight:700,color:STATE_COLORS[c]||"#2c3e50",fontFamily:"monospace"}}>{fH(h)}</span></div>{(jbs[c]||[]).sort((a,b)=>b.hrs-a.hrs).map((j,i)=><div key={i} style={S.jobBreak}><span style={{fontSize:12,color:"#7f8c8d"}}>{j.name}</span><span style={{fontSize:12,fontWeight:600,color:"#95a5a6",fontFamily:"monospace"}}>{fH(j.hrs)}</span></div>)}</div>))}</div>);}

function LeaveSummary({sheet}){const{byLeave,leaveHrs}=getTotals(sheet);if(!leaveHrs)return null;return(<div style={S.stateCard}><div style={{...S.stateBar,background:"#fffbf0"}}><span style={{fontSize:12,fontWeight:700,color:"#b7950b",textTransform:"uppercase",letterSpacing:1}}>Leave — {fH(leaveHrs)}</span></div>{Object.entries(byLeave).sort((a,b)=>b[1]-a[1]).map(([c,h])=>{const lt=LEAVE_TYPES.find(l=>l.code===c);const col=lt?.color||"#2c3e50";return<div key={c} style={{...S.stateRow,borderLeft:`3px solid ${col}`,paddingLeft:10,marginLeft:4}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:col,flexShrink:0}}/><span style={{fontSize:13,fontWeight:700,color:col}}>{lt?.name||c}</span></div><span style={{fontSize:14,fontWeight:700,color:col,fontFamily:"monospace"}}>{fH(h)}</span></div>;})}</div>);}

/* ════════════════════════════════════════════════════════════
   PRINTABLE COMPONENTS
   ════════════════════════════════════════════════════════════ */
function PrintableTimesheet({sheet}){
  const dates=getDayDates(sheet.weekEnding);const t=getTotals(sheet);
  return(<div className="print-page" style={{fontFamily:"'Segoe UI',Arial,sans-serif"}}>
    <div className="pdf-title">{COMPANY} — Weekly Timesheet</div>
    <div className="pdf-subtitle">Standard Day: 7:30am – 4:00pm · 40-Hour Week · 30min Unpaid Lunch</div>
    <div className="pdf-meta"><div><div className="pdf-meta-label">Employee</div><div className="pdf-meta-value">{sheet.employeeName}</div></div><div><div className="pdf-meta-label">Week Ending</div><div className="pdf-meta-value">{fmtAU(sheet.weekEnding)}</div></div><div><div className="pdf-meta-label">Submitted</div><div className="pdf-meta-value">{sheet.submittedAt?new Date(sheet.submittedAt).toLocaleDateString("en-AU"):"—"}</div></div></div>
    <table className="pdf-table"><thead><tr><th>Day</th><th>Date</th><th>Start</th><th>Finish</th><th>Break</th><th>Hrs</th><th>Job Type</th><th>State</th><th>Location &amp; Work</th></tr></thead>
    <tbody>{DAYS.map(d=>{const day=sheet.days[d];const jobs=(day?.jobs||[]).filter(j=>j.start||j.finish||j.jobName);const lv=day?.leave;const lvt=lv&&lv.type?LEAVE_TYPES.find(l=>l.code===lv.type):null;if(!jobs.length&&!lvt) return (<tr key={d}><td style={{fontWeight:600}}>{d}</td><td>{dates[d]||""}</td><td colSpan="7" style={{color:"#aaa",fontStyle:"italic"}}>—</td></tr>);return jobs.map((j,i)=>(<tr key={d+"-"+i}>{i===0&&<td rowSpan={jobs.length+(lvt?1:0)} style={{fontWeight:600,verticalAlign:"top"}}>{d}</td>}{i===0&&<td rowSpan={jobs.length+(lvt?1:0)} style={{verticalAlign:"top"}}>{dates[d]||""}</td>}<td>{j.start}</td><td>{j.finish}</td>{i===0&&<td rowSpan={jobs.length} style={{textAlign:"center"}}>30m</td>}<td style={{textAlign:"center",fontWeight:600}}>{calcH(j.start,j.finish)?fH(calcH(j.start,j.finish)):""}</td><td>{j.jobName}</td><td>{j.state}</td><td>{j.details}</td></tr>)).concat(lvt?[<tr key={d+"-lv"} style={{background:"#fffbf0"}}><td colSpan="3" style={{fontWeight:600,color:lvt.color}}>{lvt.name}</td><td style={{textAlign:"center",fontWeight:600,color:lvt.color}}>{fH(lv.hours)}</td><td colSpan="2">{lv.note||""}</td><td></td></tr>]:[]);})}</tbody></table>
    <div className="pdf-totals"><div className="pdf-total-box"><div className="pdf-total-val" style={{color:"#2c3e50"}}>{fH(t.regular)}</div><div className="pdf-total-lbl">Regular</div></div><div className="pdf-total-box"><div className="pdf-total-val" style={{color:"#e74c3c"}}>{fH(t.overtime)}</div><div className="pdf-total-lbl">Overtime</div></div>{t.leaveHrs>0&&<div className="pdf-total-box"><div className="pdf-total-val" style={{color:"#d4ac0d"}}>{fH(t.leaveHrs)}</div><div className="pdf-total-lbl">Leave</div></div>}<div className="pdf-total-box" style={{background:"#2c3e50",border:"none"}}><div className="pdf-total-val" style={{color:"#e67e22"}}>{fH(t.total)}</div><div className="pdf-total-lbl" style={{color:"rgba(255,255,255,.6)"}}>Total</div></div></div>
    <div className="pdf-sig"><div><div className="pdf-sig-line">&nbsp;</div><div className="pdf-sig-label">Employee Signature</div></div><div><div className="pdf-sig-line">&nbsp;</div><div className="pdf-sig-label">Date</div></div><div><div className="pdf-sig-line">&nbsp;</div><div className="pdf-sig-label">Manager Signature</div></div><div><div className="pdf-sig-line">&nbsp;</div><div className="pdf-sig-label">Date</div></div></div>
  </div>);
}

function PrintableOvertimeBank({empName,ledger,balance}){
  return(<div className="print-page" style={{fontFamily:"'Segoe UI',Arial,sans-serif"}}>
    <div className="pdf-title">{COMPANY} — Overtime Bank Statement</div>
    <div className="pdf-subtitle">Generated {new Date().toLocaleDateString("en-AU")} · CONFIDENTIAL</div>
    <div className="pdf-meta">
      <div><div className="pdf-meta-label">Employee</div><div className="pdf-meta-value">{empName}</div></div>
      <div><div className="pdf-meta-label">Current Balance</div><div className="pdf-meta-value" style={{color:balance>0?"#e67e22":balance<0?"#e74c3c":"#2c3e50",fontWeight:800}}>{balance<0?"OVERDRAWN — ":""}{fH(Math.abs(balance))}</div></div>
      <div><div className="pdf-meta-label">Entries</div><div className="pdf-meta-value">{ledger.length}</div></div>
    </div>
    <table className="pdf-table">
      <thead><tr><th>Date</th><th>Description</th><th>Transaction Notes</th><th style={{textAlign:"right"}}>Hours</th><th style={{textAlign:"right"}}>Running Balance</th></tr></thead>
      <tbody>
        {ledger.map(e=>(
          <tr key={e.id} style={{background:e.entryType==="ot"?"#fff8f0":e.hours>0?"#f0faf4":"#fdf2f2"}}>
            <td>{fmtAU(e.date)}</td>
            <td style={{fontWeight:600}}>{e.label}</td>
            <td style={{color:"#7f8c8d",fontStyle:"italic"}}>{e.note||"—"}</td>
            <td style={{textAlign:"right",fontWeight:700,fontFamily:"monospace",color:e.hours>0?"#27ae60":"#e74c3c"}}>{e.hours>0?"+":""}{fH(Math.abs(e.hours))}</td>
            <td style={{textAlign:"right",fontWeight:700,fontFamily:"monospace",color:e.balance<0?"#e74c3c":"#2c3e50"}}>{e.balance<0?"(":""}{ fH(Math.abs(e.balance))}{e.balance<0?") OD":""}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="pdf-totals">
      <div className="pdf-total-box" style={{background:balance>0?"#fff8f0":balance<0?"#fdf2f2":"#f5f3ef",border:`2px solid ${balance>0?"#e67e22":balance<0?"#e74c3c":"#e6e2dc"}`}}>
        <div className="pdf-total-val" style={{color:balance>0?"#e67e22":balance<0?"#e74c3c":"#2c3e50"}}>{fH(Math.abs(balance))}</div>
        <div className="pdf-total-lbl">{balance<0?"Balance Overdrawn":"Current Balance"}</div>
      </div>
    </div>
    <div style={{marginTop:24,fontSize:10,color:"#95a5a6",textAlign:"center"}}>Generated {new Date().toLocaleDateString("en-AU")} · {COMPANY} · Confidential</div>
  </div>);
}

function PrintableSummary({sheets,weekEnding,staffProfiles={}}){
  const ws=sheets.filter(s=>s.weekEnding===weekEnding&&s.submittedAt);let gT=0,gO=0,gR=0,gL=0;const aS={},aJ={},aL={};const ed=ws.map(s=>{const t=getTotals(s,staffProfiles[s.employeeName]?.weeklyHours||STD_WEEK,(staffProfiles[s.employeeName]?.employmentType)==="casual",staffProfiles[s.employeeName]?.paidBreak===true);gT+=t.total;gO+=t.overtime;gR+=t.regular;gL+=t.leaveHrs;Object.entries(t.byState).forEach(([k,v])=>aS[k]=(aS[k]||0)+v);Object.entries(t.byJob).forEach(([k,v])=>aJ[k]=(aJ[k]||0)+v);Object.entries(t.byLeave).forEach(([k,v])=>aL[k]=(aL[k]||0)+v);return{sheet:s,...t};});const dates=getDayDates(weekEnding);
  return(<div className="print-page" style={{fontFamily:"'Segoe UI',Arial,sans-serif"}}>
    <div className="pdf-title">{COMPANY} — Weekly Summary</div>
    <div className="pdf-subtitle">Week Ending: {fmtAU(weekEnding)} · {ws.length} Employee{ws.length!==1?"s":""} · CONFIDENTIAL — ADMIN ONLY</div>
    <div className="pdf-totals"><div className="pdf-total-box"><div className="pdf-total-val" style={{color:"#2c3e50"}}>{fH(gR)}</div><div className="pdf-total-lbl">Regular</div></div><div className="pdf-total-box"><div className="pdf-total-val" style={{color:"#e74c3c"}}>{fH(gO)}</div><div className="pdf-total-lbl">Overtime</div></div>{gL>0&&<div className="pdf-total-box"><div className="pdf-total-val" style={{color:"#d4ac0d"}}>{fH(gL)}</div><div className="pdf-total-lbl">Leave</div></div>}<div className="pdf-total-box" style={{background:"#2c3e50",border:"none"}}><div className="pdf-total-val" style={{color:"#e67e22"}}>{fH(gT)}</div><div className="pdf-total-lbl" style={{color:"rgba(255,255,255,.6)"}}>Total</div></div></div>
    <div className="pdf-section">Employee Overview</div>
    <table className="pdf-table"><thead><tr><th>Employee</th>{DAYS.map(d=><th key={d}>{d.slice(0,3)}</th>)}<th>Reg</th><th>OT</th><th>Leave</th><th>Total</th></tr></thead><tbody>
    {ed.sort((a,b)=>a.sheet.employeeName.localeCompare(b.sheet.employeeName)).map(({sheet:s,total,regular,overtime,byDay,byDayOT,leaveHrs})=><tr key={s.id}><td style={{fontWeight:600}}>{s.employeeName}</td>{DAYS.map(d=>{const isCas=(staffProfiles[s.employeeName]?.employmentType)==="casual";const lv=s.days[d]?.leave;const lvt=lv?.type?LEAVE_TYPES.find(l=>l.code===lv.type):null;const worked=byDay[d]||0;const ot=byDayOT?.[d]||0;const ordinary=isCas?worked:Math.max(0,worked-ot);const lvHrs=lvt?(lv.hours||0):0;const empty=!worked&&!lvt;return<td key={d} style={{textAlign:"left",fontFamily:"sans-serif",fontSize:9,padding:"4px 5px",verticalAlign:"top",lineHeight:1.5}}>{empty?"—":<>{ordinary>0&&<div style={{color:"#2c3e50"}}><span style={{fontWeight:700}}>{fH(ordinary)}</span> <span style={{color:"#7f8c8d"}}>Ordinary</span></div>}{ot>0&&<div style={{color:"#e74c3c"}}><span style={{fontWeight:700}}>{fH(ot)}</span> <span style={{color:"#c0392b"}}>Overtime</span></div>}{lvt&&<div style={{color:lvt.color}}><span style={{fontWeight:700}}>{fH(lvHrs)}</span> <span style={{fontStyle:"italic"}}>{lvt.name}</span></div>}</>}</td>;})}  <td style={{textAlign:"center",fontWeight:600,fontFamily:"monospace"}}>{fH(regular)}</td><td style={{textAlign:"center",fontWeight:700,color:overtime?"#e74c3c":"#ccc",fontFamily:"monospace"}}>{overtime?fH(overtime):"—"}</td><td style={{textAlign:"center",color:leaveHrs?"#d4ac0d":"#ccc",fontFamily:"monospace"}}>{leaveHrs?fH(leaveHrs):"—"}</td><td style={{textAlign:"center",fontWeight:700,color:"#e67e22",fontFamily:"monospace"}}>{fH(total)}</td></tr>)}
    </tbody></table>
    {Object.keys(aS).length>0&&<div><div className="pdf-section">Hours by State</div><table className="pdf-table" style={{width:"auto",minWidth:300}}><thead><tr><th>State</th><th>Hours</th><th>Job Types</th></tr></thead><tbody>{Object.entries(aS).sort((a,b)=>b[1]-a[1]).map(([c,h])=>{const sj=Object.entries(aJ).filter(([k])=>k.endsWith(`|||${c}`)).map(([k,v])=>({name:k.split("|||")[0],hrs:v})).sort((a,b)=>b.hrs-a.hrs);return<tr key={c}><td style={{fontWeight:600}}>{c}</td><td style={{fontWeight:700,fontFamily:"monospace"}}>{fH(h)}</td><td style={{fontSize:10}}>{sj.map(j=>`${j.name}: ${fH(j.hrs)}`).join(", ")}</td></tr>;})}</tbody></table></div>}
    <div style={{marginTop:30,fontSize:10,color:"#95a5a6",textAlign:"center"}}>Generated {new Date().toLocaleDateString("en-AU")} · {COMPANY} · Confidential</div>
  </div>);
}

/* ════════════════════════════════════════════════════════════
   ADMIN SUMMARY VIEW
   ════════════════════════════════════════════════════════════ */
function AdminSummary({allSheets,onExport,onXeroCSV,staff,staffProfiles,onManageStaff,onSetDisposition,onOvertimeBank,onAdminEdit,onApprove,onRefresh}){
  const weeks=[...new Set(allSheets.filter(s=>s.submittedAt&&s.weekEnding).map(s=>s.weekEnding))].sort().reverse();
  const allYears=[...new Set(weeks.map(w=>w.slice(0,4)))].sort().reverse();
  const[selYear,setSelYear]=useState(allYears[0]||"");
  const[selWeek,setSelWeek]=useState(weeks[0]||"");
  const[expanded,setExpanded]=useState({});

  const filteredWeeks=selYear?weeks.filter(w=>w.startsWith(selYear)):weeks;

  const handleYearChange=(yr)=>{
    setSelYear(yr);
    const fw=yr?weeks.filter(w=>w.startsWith(yr)):weeks;
    if(fw.length)setSelWeek(fw[0]);
  };
  const ws=allSheets.filter(s=>s.weekEnding===selWeek&&s.submittedAt);
  let gT=0,gO=0,gR=0,gL=0;const aS={},aJ={},aL={};
  const ed=ws.map(s=>{const t=getTotals(s,staffProfiles[s.employeeName]?.weeklyHours||STD_WEEK,(staffProfiles[s.employeeName]?.employmentType)==="casual",staffProfiles[s.employeeName]?.paidBreak===true);gT+=t.total;gO+=t.overtime;gR+=t.regular;gL+=t.leaveHrs;Object.entries(t.byState).forEach(([k,v])=>aS[k]=(aS[k]||0)+v);Object.entries(t.byJob).forEach(([k,v])=>aJ[k]=(aJ[k]||0)+v);Object.entries(t.byLeave).forEach(([k,v])=>aL[k]=(aL[k]||0)+v);return{sheet:s,...t};});
  const toggle=id=>setExpanded(p=>({...p,[id]:!p[id]}));
  const dd=getDayDates(selWeek);

  // Check which staff haven't submitted
  const submitted=new Set(ws.map(s=>s.employeeName));
  const missing=staff.filter(n=>!submitted.has(n));

  if(!weeks.length)return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"14px 12px 8px",display:"flex",gap:8}}>
        <button onClick={onManageStaff} style={{...S.exportBtn,flex:1,marginTop:0,borderColor:"#e67e22",color:"#e67e22"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          Manage Staff
        </button>
      </div>
      <p style={S.empty}>No timesheets submitted yet.</p>
    </div>
  );
  return(
    <div style={{paddingBottom:24}}>
      {/* Pending approval section */}
      {(()=>{const pending=allSheets.filter(s=>s.submittedAt&&s.approvalStatus==="pending");if(!pending.length)return null;return(<div style={{margin:"0 0 4px"}}>
        <div style={{background:"linear-gradient(135deg,#e74c3c,#c0392b)",padding:"10px 16px 8px",margin:"0 12px 8px",borderRadius:12,color:"#fff"}}>
          <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Pending Approval — {pending.length}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:1}}>Review and approve employee timesheets</div>
        </div>
        {pending.sort((a,b)=>b.weekEnding.localeCompare(a.weekEnding)).map(s=>{const t=getTotals(s,staffProfiles[s.employeeName]?.weeklyHours||STD_WEEK,(staffProfiles[s.employeeName]?.employmentType)==="casual",staffProfiles[s.employeeName]?.paidBreak===true);return(<div key={s.id} style={{...S.listItem,margin:"0 12px 6px",border:"2px solid #f5c6cb"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#2c3e50"}}>{s.employeeName}</div>
              <div style={{fontSize:11,color:"#7f8c8d",marginTop:1}}>{(()=>{const cas=(staffProfiles[s.employeeName]?.employmentType)==="casual";return`Week ending ${fmtAU(s.weekEnding)} · ${cas?`${fH(t.total)} total`:`${fH(t.regular)} reg${t.overtime>0?` · ${fH(t.overtime)} OT`:""}`}${t.leaveHrs>0?` · ${fH(t.leaveHrs)} leave`:""}`;})()}</div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>onAdminEdit(s)} style={{background:"none",border:"2px solid #2980b9",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:"#2980b9",cursor:"pointer"}}>Edit</button>
              <button onClick={()=>onApprove(s.id)} style={{background:"linear-gradient(135deg,#27ae60,#1e8449)",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>Approve ✓</button>
            </div>
          </div>
        </div>);})}
      </div>);})()}
      <div style={{padding:"14px 12px 8px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            <label style={S.label}>Year</label>
            <select value={selYear} onChange={e=>handleYearChange(e.target.value)} style={{...S.select,color:"#2c3e50"}}>
              {allYears.map(y=><option key={y} value={y}>{y} · {weeks.filter(w=>w.startsWith(y)).length}wks</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Week Ending</label>
            <select value={selWeek} onChange={e=>setSelWeek(e.target.value)} style={{...S.select,color:"#2c3e50"}}>
              {filteredWeeks.map(w=><option key={w} value={w}>{fmtAU(w)}</option>)}
            </select>
          </div>
        </div>
        <div style={{fontSize:10,color:"#95a5a6",marginTop:6,textAlign:"right"}}>
          {weeks.length} total submissions · 5-year retention
        </div>
      </div>
      <div style={S.sumHeader}>
        <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1}}>Week Ending {fmtAU(selWeek)}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>{ws.length} of {staff.length} staff submitted</div>
        <div style={{...S.sumGrid,gridTemplateColumns:"1fr 1fr"}}>
          <div style={S.sumStat("rgba(255,255,255,.1)")}><div style={S.sumStatVal}>{fH(gR)}</div><div style={S.sumStatLbl}>Regular</div></div>
          <div style={S.sumStat("rgba(231,76,60,.8)")}><div style={S.sumStatVal}>{fH(gO)}</div><div style={S.sumStatLbl}>Overtime</div></div>
          <div style={{...S.sumStat("rgba(230,126,34,.85)"),gridColumn:"1/-1"}}><div style={S.sumStatVal}>{fH(gT)}</div><div style={S.sumStatLbl}>Total Worked</div></div>
        </div>
        {Object.keys(aL).length>0&&(
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Leave This Week</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {Object.entries(aL).filter(([,h])=>h>0).sort((a,b)=>b[1]-a[1]).map(([code,hrs])=>{
                const lt=LEAVE_TYPES.find(l=>l.code===code);
                const col=lt?.color||"#d4ac0d";
                return(
                  <div key={code} style={{background:col,borderRadius:8,padding:"6px 12px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:80}}>
                    <div style={{fontSize:15,fontWeight:800,color:"#fff",fontFamily:"monospace"}}>{fH(hrs)}</div>
                    <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.85)",marginTop:1,textAlign:"center",lineHeight:1.2}}>{lt?.name||code}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Missing staff warning */}
      {missing.length>0&&<div style={{...S.card,margin:"0 12px 10px",border:"2px solid #e74c3c"}}>
        <div style={{padding:"10px 14px",background:"#fdf2f2"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#e74c3c",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Not Yet Submitted ({missing.length})</div>
          {missing.map(n=><div key={n} style={{fontSize:13,color:"#c0392b",padding:"3px 0",fontWeight:500}}>{n}</div>)}
        </div>
      </div>}

      <div style={{padding:"0 12px 8px"}}>
        <button onClick={()=>onXeroCSV(selWeek)} style={{...S.exportBtn,width:"100%",marginBottom:6,borderColor:"#1d6f42",color:"#1d6f42"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Export Xero CSV (ordinary hours only)
        </button>
        <button onClick={()=>onExport("summary",selWeek)} style={{...S.exportBtn,width:"100%",marginBottom:8}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Export Summary PDF</button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onOvertimeBank} style={{...S.exportBtn,flex:1,marginTop:0,borderColor:"#e74c3c",color:"#e74c3c"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Overtime Bank</button>
          <button onClick={onManageStaff} style={{...S.exportBtn,flex:1,marginTop:0,borderColor:"#e67e22",color:"#e67e22"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>Manage Staff</button>
          <button onClick={onRefresh} style={{...S.exportBtn,flex:1,marginTop:0,borderColor:"#2980b9",color:"#2980b9"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Refresh</button>
        </div>
      </div>

      {/* State/Job/Leave breakdowns */}
      {Object.keys(aS).length>0&&<div style={S.stateCard}><div style={S.stateBar}><span style={{fontSize:12,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:1}}>Hours by State</span></div>{Object.entries(aS).sort((a,b)=>b[1]-a[1]).map(([c,h])=>{const sj=Object.entries(aJ).filter(([k])=>k.endsWith(`|||${c}`)).map(([k,v])=>({name:k.split("|||")[0],hrs:v})).sort((a,b)=>b.hrs-a.hrs);return<div key={c}><div style={S.stateRow}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:4,background:STATE_COLORS[c]||"#95a5a6"}}/><span style={{fontSize:14,fontWeight:600,color:"#2c3e50"}}>{c}</span></div><span style={{fontSize:14,fontWeight:700,color:STATE_COLORS[c]||"#2c3e50",fontFamily:"monospace"}}>{fH(h)}</span></div>{sj.map((j,i)=><div key={i} style={S.jobBreak}><span style={{fontSize:12,color:"#7f8c8d"}}>{j.name}</span><span style={{fontSize:12,fontWeight:600,color:"#95a5a6",fontFamily:"monospace"}}>{fH(j.hrs)}</span></div>)}</div>;})}</div>}

      {/* Per-employee */}
      <p style={S.secTitle}>Employee Detail</p>
      {ed.sort((a,b)=>a.sheet.employeeName.localeCompare(b.sheet.employeeName)).map(({sheet:s,total,regular,overtime,byDay,byDayOT,byState,byLeave,leaveHrs})=>{
        const isOpen=expanded[s.id];
        return<div key={s.id} style={S.empCard}>
          <div style={S.empHead} onClick={()=>toggle(s.id)}>
            <div><div style={{display:"flex",alignItems:"center",gap:6}}><div style={S.empName}>{s.employeeName}</div>{(()=>{const et=(staffProfiles[s.employeeName]?.employmentType||"full-time");return<span style={{fontSize:9,fontWeight:700,color:"#fff",background:et==="casual"?"#e67e22":"#27ae60",padding:"2px 6px",borderRadius:6,letterSpacing:.5,textTransform:"uppercase"}}>{et==="casual"?"CAS":"FT"}</span>;})()}{s.approvalStatus==="approved"?<span style={{fontSize:9,fontWeight:700,color:"#fff",background:"#27ae60",padding:"2px 6px",borderRadius:6,letterSpacing:.5}}>✓ APPROVED</span>:<span style={{fontSize:9,fontWeight:700,color:"#fff",background:"#e67e22",padding:"2px 6px",borderRadius:6,letterSpacing:.5}}>PENDING</span>}</div><div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}><span>{fH(total)}</span>{overtime>0&&(staffProfiles[s.employeeName]?.employmentType||"full-time")!=="casual"&&<span style={{color:"#e74c3c"}}>+{fH(overtime)} OT</span>}{leaveHrs>0&&<span style={{color:"#d4ac0d"}}>{fH(leaveHrs)} leave</span>}</div></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>{Object.keys(byState).sort().map(c=><span key={c} style={{fontSize:9,fontWeight:700,color:"#fff",background:STATE_COLORS[c]||"#666",padding:"2px 6px",borderRadius:8}}>{c}</span>)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.5" strokeLinecap="round" style={{transform:isOpen?"rotate(180deg)":"rotate(0)",transition:"transform .2s",marginLeft:4}}><polyline points="6 9 12 15 18 9"/></svg></div>
          </div>
          {isOpen&&<div>
            {DAYS.map(d=>{const dh=byDay[d]||0;const dot=byDayOT?.[d]||0;const isCas=(staffProfiles[s.employeeName]?.employmentType)==="casual";const jobs=(s.days[d]?.jobs||[]).filter(j=>calcH(j.start,j.finish)>0);const lv=s.days[d]?.leave;const lvt=lv?.type?LEAVE_TYPES.find(l=>l.code===lv.type):null;if(!dh&&!lvt)return null;return<div key={d}><div style={S.dayRow}><span style={S.dayLabel}>{d.slice(0,3)} {dd[d]?fmtDateShort(dd[d]):""}</span><span style={S.dayJobs}>{jobs.map(j=>[j.jobName,j.state,j.details].filter(Boolean).join(" · ")).join(" | ")}</span><span style={{...S.dayHrs,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}><span>{dh?fH(dh):"—"}</span>{dot>0&&!isCas&&<span style={{fontSize:10,fontWeight:700,color:"#e74c3c"}}>+{fH(dot)} OT</span>}</span></div>{lvt&&<div style={{...S.dayRow,background:"#fffbf0",fontSize:12}}><span style={{width:80}}/><span style={{flex:1,color:lvt.color,fontWeight:600}}>{lvt.name}{lv.note?` — ${lv.note}`:""}</span><span style={{...S.dayHrs,color:lvt.color}}>{fH(lv.hours)}</span></div>}</div>;})}
            {(()=>{const cas=(staffProfiles[s.employeeName]?.employmentType)==="casual";return(<div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:"#f0ece6",flexWrap:"wrap",gap:4}}>{cas?<span style={{fontSize:12,fontWeight:700,color:"#e67e22"}}>Total (Casual): {fH(total)}</span>:<><span style={{fontSize:12,fontWeight:700,color:"#2c3e50"}}>Reg: {fH(regular)}</span>{overtime>0&&<span style={{fontSize:12,fontWeight:700,color:"#e74c3c"}}>OT: {fH(overtime)}</span>}<span style={{fontSize:12,fontWeight:700,color:"#e67e22"}}>Total: {fH(total)}</span></>}{leaveHrs>0&&<span style={{fontSize:12,fontWeight:700,color:"#d4ac0d"}}>Leave: {fH(leaveHrs)}</span>}</div>);})()}
            {overtime>0&&(staffProfiles[s.employeeName]?.employmentType||"full-time")!=="casual"&&(
              <div style={{padding:"10px 14px",background:"#fdf8f0",borderTop:"1px solid #f0e6c8"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#b7950b",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Overtime {fH(overtime)} — stored separately, not in Xero payrun</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>onSetDisposition(s.id,"payout")} style={{flex:1,padding:"10px 8px",borderRadius:8,border:"2px solid",borderColor:s.overtimeDisposition==="payout"?"#27ae60":"#e6e2dc",background:s.overtimeDisposition==="payout"?"#f0faf4":"#fff",color:s.overtimeDisposition==="payout"?"#27ae60":"#95a5a6",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                    Paid Separately
                  </button>
                  <button onClick={()=>onSetDisposition(s.id,"bank")} style={{flex:1,padding:"10px 8px",borderRadius:8,border:"2px solid",borderColor:s.overtimeDisposition==="bank"?"#e67e22":"#e6e2dc",background:s.overtimeDisposition==="bank"?"#fff8f0":"#fff",color:s.overtimeDisposition==="bank"?"#e67e22":"#95a5a6",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                    Bank as TOIL
                  </button>
                </div>
              </div>
            )}
            <div style={{padding:"8px 14px"}}><button onClick={()=>onExport("timesheet",s)} style={{...S.exportBtn,marginTop:0,fontSize:12,padding:"10px"}}>Export {s.employeeName}'s PDF</button></div>
          </div>}
        </div>;
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MANAGE STAFF (admin only)
   ════════════════════════════════════════════════════════════ */
function ManageStaff({staff,onSave,onBack,employeePins,onSavePins,staffProfiles,onSaveProfiles}){
  const[list,setList]=useState([...staff]);
  const[newName,setNewName]=useState("");
  const[saving,setSaving]=useState(false);
  const[localPins,setLocalPins]=useState({...employeePins});
  const[editingPin,setEditingPin]=useState(null);
  const[tempPin,setTempPin]=useState("");
  const[localProfiles,setLocalProfiles]=useState({...staffProfiles});
  const setEmpType=(name,type)=>setLocalProfiles(p=>({...p,[name]:{...(p[name]||{}),employmentType:type}}));

  const addStaff=()=>{
    const name=newName.trim();
    if(!name)return;
    if(list.includes(name)){return;}
    setList(prev=>[...prev,name].sort((a,b)=>a.localeCompare(b)));
    setNewName("");
  };
  const removeStaff=(name)=>{
    setList(prev=>prev.filter(n=>n!==name));
    setLocalPins(prev=>{const p={...prev};delete p[name];return p;});
    setLocalProfiles(prev=>{const p={...prev};delete p[name];return p;});
  };
  const startEditPin=(name)=>{setEditingPin(name);setTempPin("");};
  const confirmPin=(name)=>{
    if(tempPin.length>=4){setLocalPins(prev=>({...prev,[name]:tempPin}));setEditingPin(null);setTempPin("");}
  };
  const handleSave=async()=>{
    setSaving(true);
    await onSave(list);
    await onSavePins(localPins);
    await onSaveProfiles(localProfiles);
    setSaving(false);
    onBack();
  };

  return(
    <div style={{paddingBottom:24}}>
      <button onClick={onBack} style={S.backBtn}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Back to Summary</button>

      <div style={{...S.card,margin:"8px 12px 10px"}}>
        <div style={{padding:"12px 14px",background:"linear-gradient(135deg,#2c3e50,#34495e)",color:"#fff"}}>
          <div style={{fontSize:14,fontWeight:700}}>Manage Staff List</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>{list.length} active staff members</div>
        </div>
        <div style={{padding:14}}>
          <label style={S.label}>Add New Staff Member</label>
          <div style={{display:"flex",gap:8}}>
            <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStaff()} placeholder="Full name..." style={{...S.input,flex:1}}/>
            <button onClick={addStaff} disabled={!newName.trim()} style={{...S.primary,width:"auto",padding:"10px 20px",fontSize:14,opacity:newName.trim()?1:.5}}>Add</button>
          </div>
        </div>
      </div>

      <div style={{padding:"0 12px"}}>
        {list.sort((a,b)=>a.localeCompare(b)).map(name=>(
          <div key={name} style={{...S.listItem,padding:0,marginBottom:6,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px 8px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:16,background:"linear-gradient(135deg,#2c3e50,#34495e)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:700}}>{name.charAt(0)}</div>
                <span style={{fontSize:15,fontWeight:600,color:"#2c3e50"}}>{name}</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button onClick={()=>startEditPin(name)} style={{background:"none",border:"1px solid #b0c4de",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,color:"#2980b9",cursor:"pointer"}}>
                  {localPins[name]?"PIN ✓":"Set PIN"}
                </button>
                <button onClick={()=>removeStaff(name)} style={{background:"none",border:"1px solid #f0d6d6",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,color:"#c0392b",cursor:"pointer"}}>Remove</button>
              </div>
            </div>
            <div style={{padding:"4px 16px 8px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,marginRight:2}}>Employment:</span>
              {[{val:"full-time",label:"Full Time",color:"#27ae60"},{val:"casual",label:"Casual",color:"#e67e22"}].map(opt=>{
                const sel=(localProfiles[name]?.employmentType||"full-time")===opt.val;
                return<button key={opt.val} onClick={()=>setEmpType(name,opt.val)} style={{padding:"5px 12px",borderRadius:8,border:`2px solid ${opt.color}`,background:sel?opt.color:"#fff",color:sel?"#fff":opt.color,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{opt.label}</button>;
              })}
            </div>
            <div style={{padding:"0 16px 12px",borderTop:"1px solid #f5f0ea"}}>
              <span style={{fontSize:10,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:6,marginTop:8}}>Ordinary Hours / Week:</span>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                {[21,32,35,36,37.5,38,40].map(h=>{
                  const sel=(localProfiles[name]?.weeklyHours||40)===h;
                  return<button key={h} onClick={()=>setLocalProfiles(p=>({...p,[name]:{...(p[name]||{}),weeklyHours:h}}))}
                    style={{padding:"5px 10px",borderRadius:8,border:`2px solid ${sel?"#2980b9":"#e6e2dc"}`,background:sel?"#2980b9":"#fff",color:sel?"#fff":"#7f8c8d",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{h}h</button>;
                })}
              </div>
            </div>
            <div style={{padding:"0 16px 12px",borderTop:"1px solid #f5f0ea"}}>
              <span style={{fontSize:10,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:8,marginTop:8}}>Break Type:</span>
              <div style={{display:"flex",gap:8}}>
                {[{val:false,label:"Unpaid Break",desc:"30 min deducted on 8h+ days"},{val:true,label:"Paid Break",desc:"Break included in paid hours"}].map(opt=>{
                  const sel=(localProfiles[name]?.paidBreak===true)===opt.val;
                  return<button key={String(opt.val)} onClick={()=>setLocalProfiles(p=>({...p,[name]:{...(p[name]||{}),paidBreak:opt.val}}))}
                    style={{flex:1,padding:"8px 10px",borderRadius:8,border:`2px solid ${sel?"#8e44ad":"#e6e2dc"}`,background:sel?"#8e44ad":"#fff",color:sel?"#fff":"#7f8c8d",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                    <div>{opt.label}</div><div style={{fontSize:9,opacity:.75,marginTop:2,fontWeight:400}}>{opt.desc}</div>
                  </button>;
                })}
              </div>
            </div>
            <div style={{padding:"0 16px 14px",borderTop:"1px solid #f5f0ea"}}>
              <span style={{fontSize:10,fontWeight:700,color:"#1d6f42",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:6,marginTop:8}}>Xero Earnings Rate Name:</span>
              <input
                type="text"
                placeholder="e.g. AR Ordinary Earnings"
                value={localProfiles[name]?.xeroEarningsRate||""}
                onChange={e=>setLocalProfiles(p=>({...p,[name]:{...(p[name]||{}),xeroEarningsRate:e.target.value}}))}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"2px solid #e6e2dc",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",color:"#2c3e50"}}
              />
              <div style={{fontSize:10,color:"#95a5a6",marginTop:4}}>Must match exactly the earnings rate name in Xero Payroll Settings</div>
            </div>
            {editingPin===name&&(
              <div style={{padding:"10px 16px 14px",borderTop:"1px solid #f0ece6",background:"#fafaf8"}}>
                <label style={S.label}>New PIN (4–6 digits)</label>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <input type="password" inputMode="numeric" maxLength={6} value={tempPin} onChange={e=>setTempPin(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&confirmPin(name)} placeholder="••••" style={{...S.pinInput,fontSize:20,flex:1,padding:"10px"}} autoFocus/>
                  <button onClick={()=>confirmPin(name)} disabled={tempPin.length<4} style={{...S.primary,width:"auto",padding:"10px 16px",fontSize:13,opacity:tempPin.length>=4?1:.5}}>Save</button>
                  <button onClick={()=>{setEditingPin(null);setTempPin("");}} style={{...S.exportBtn,width:"auto",padding:"10px 16px",fontSize:13,marginTop:0}}>Cancel</button>
                </div>
                {tempPin.length>0&&tempPin.length<4&&<div style={{fontSize:11,color:"#e74c3c",marginTop:4}}>PIN must be at least 4 digits</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{padding:"12px 12px 0"}}>
        <button onClick={handleSave} disabled={saving} style={{...S.primary,opacity:saving?.6:1}}>
          {saving?"Saving...":"Save Staff List"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ADMIN EDIT SHEET
   ════════════════════════════════════════════════════════════ */
function AdminEditSheet({sheet,onSaveAndApprove,onBack,staffProfiles={}}){
  const[editSheet,setEditSheet]=useState({...sheet});
  const[selDay,setSelDay]=useState(null);
  const[saving,setSaving]=useState(false);
  const dayDates=getDayDates(editSheet.weekEnding);
  const isFullTime=(staffProfiles[editSheet.employeeName]?.employmentType||"full-time")!=="casual";
  const updateDay=(d,data)=>setEditSheet(p=>({...p,days:{...p.days,[d]:data}}));
  const handleApprove=async()=>{setSaving(true);await onSaveAndApprove(editSheet);setSaving(false);};
  return(
    <div style={{paddingBottom:24}}>
      <button onClick={()=>selDay?setSelDay(null):onBack()} style={S.backBtn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        {selDay?"Back to Week":"Back to Summary"}
      </button>
      <div style={{...S.card,margin:"4px 12px 10px"}}>
        <div style={{padding:14}}>
          <div style={{fontSize:15,fontWeight:700,color:"#2c3e50"}}>{editSheet.employeeName}</div>
          <div style={{fontSize:12,color:"#95a5a6",marginTop:2}}>Week ending {fmtAU(editSheet.weekEnding)}</div>
          <div style={{fontSize:11,color:"#e67e22",marginTop:4,fontWeight:600}}>Submitted {editSheet.submittedAt?new Date(editSheet.submittedAt).toLocaleDateString("en-AU"):"—"} · Edit days below then approve</div>
        </div>
      </div>
      {selDay===null?(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 12px 12px"}}>
            {DAYS.map(d=>(<div key={d} style={d==="Sunday"?{gridColumn:"1/-1"}:{}}><DayTile day={d} date={dayDates[d]||""} data={editSheet.days[d]} onClick={()=>setSelDay(d)}/></div>))}
          </div>
          <StateSummary sheet={editSheet}/>
          <LeaveSummary sheet={editSheet}/>
          <TotalsBar sheet={editSheet} isCasual={!isFullTime} stdWeek={staffProfiles[editSheet.employeeName]?.weeklyHours||STD_WEEK} paidBreak={staffProfiles[editSheet.employeeName]?.paidBreak===true}/>
          <div style={{padding:"0 12px 24px"}}>
            <button onClick={handleApprove} disabled={saving} style={{...S.primary,opacity:saving?.6:1,background:"linear-gradient(135deg,#27ae60,#1e8449)",boxShadow:"0 3px 12px rgba(39,174,96,.35)"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              {saving?"Approving...":"Approve Timesheet"}
            </button>
          </div>
        </div>
      ):(
        <DayCard day={selDay} date={dayDates[selDay]||""} data={editSheet.days[selDay]} update={data=>updateDay(selDay,data)} onSaveDay={()=>setSelDay(null)} isFullTime={isFullTime}/>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   OVERTIME BANK
   ════════════════════════════════════════════════════════════ */
function OvertimeBank({allSheets,staff,onBack,overtimeAdj,isAdmin,onAddAdjustment,onDeleteAdjustment,onExport,staffProfiles={}}){
  const isSingle=staff.length===1;
  const[selEmp,setSelEmp]=useState(isSingle?staff[0]:null);
  const[adjType,setAdjType]=useState("deduct");
  const[adjHours,setAdjHours]=useState("");
  const[adjNote,setAdjNote]=useState("");
  const[adjErr,setAdjErr]=useState("");
  const[adjSaving,setAdjSaving]=useState(false);

  function buildLedger(name){
    // All submitted FT timesheets with OT hours
    const sheetEntries=allSheets
      .filter(s=>s.employeeName===name&&s.submittedAt)
      .map(s=>({id:s.id,date:s.weekEnding,label:`Week ending ${fmtAU(s.weekEnding)}`,hours:getTotals(s,staffProfiles[name]?.weeklyHours||STD_WEEK,(staffProfiles[name]?.employmentType)==="casual").overtime,entryType:"ot",deletable:false}))
      .filter(e=>e.hours>0);
    // Manual adjustments (add / deduct)
    const adjEntries=(overtimeAdj[name]||[]).map(a=>({id:a.id,date:a.date,label:a.type==="deduct"?"Hours Deducted":"Hours Added",note:a.note||"",hours:a.type==="deduct"?-Math.abs(a.hours):Math.abs(a.hours),entryType:a.type,deletable:true}));
    const all=[...sheetEntries,...adjEntries].sort((a,b)=>a.date.localeCompare(b.date));
    let bal=0;
    return all.map(e=>{bal=Math.round((bal+e.hours)*100)/100;return{...e,balance:bal};});
  }

  function getBalance(name){const l=buildLedger(name);return l.length?l[l.length-1].balance:0;}

  const activeStaff=staff.filter(n=>buildLedger(n).length>0);
  const ledger=selEmp?buildLedger(selEmp):[];
  const currentBalance=selEmp?getBalance(selEmp):0;

  const submitAdj=async()=>{
    const h=parseFloat(adjHours);
    if(!adjHours||isNaN(h)||h<=0){setAdjErr("Enter valid hours");return;}
    setAdjErr("");setAdjSaving(true);
    await onAddAdjustment(selEmp,adjHours,adjNote,new Date().toISOString().slice(0,10),adjType);
    setAdjHours("");setAdjNote("");
    setAdjSaving(false);
  };

  return(
    <div style={{paddingBottom:24}}>
      <button onClick={()=>{if(selEmp&&!isSingle)setSelEmp(null);else onBack();}} style={S.backBtn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        {selEmp&&!isSingle?"Back to Overtime Bank":isAdmin?"Back to Summary":"Back"}
      </button>

      {/* Employee list (admin multi-staff) */}
      {!selEmp&&(
        <div>
          <div style={{...S.sumHeader,margin:"0 12px 10px"}}>
            <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:1}}>Overtime Bank</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Tap an employee to view their ledger</div>
          </div>
          {activeStaff.length===0&&<p style={S.empty}>No overtime recorded yet.</p>}
          {activeStaff.map(name=>{
            const bal=getBalance(name);
            return(
              <div key={name} style={{...S.listItem,margin:"0 12px 8px",cursor:"pointer"}} onClick={()=>setSelEmp(name)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:18,background:"linear-gradient(135deg,#2c3e50,#34495e)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:700}}>{name.charAt(0)}</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#2c3e50"}}>{name}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:20,fontWeight:800,fontFamily:"monospace",color:bal>0?"#e67e22":bal<0?"#e74c3c":"#95a5a6"}}>{fH(Math.abs(bal))}</div>
                    <div style={{fontSize:9,fontWeight:700,color:bal<0?"#e74c3c":"#95a5a6",textTransform:"uppercase",letterSpacing:.5}}>{bal<0?"Overdrawn":"Balance"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Employee ledger */}
      {selEmp&&(
        <div>
          {/* Balance header */}
          <div style={{...S.sumHeader,margin:"0 12px 10px"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:6}}>{selEmp} — Overtime Bank</div>
            <div style={{fontSize:34,fontWeight:800,fontFamily:"monospace",color:currentBalance>0?"#e67e22":currentBalance<0?"#e74c3c":"rgba(255,255,255,.4)"}}>{fH(Math.abs(currentBalance))}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:.5,marginTop:2}}>{currentBalance<0?"Balance Overdrawn":"Running Balance"}</div>
          </div>

          {/* Add / Deduct form — admin only */}
          {isAdmin&&(
            <div style={{...S.card,margin:"0 12px 12px",padding:"12px 14px 14px"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#2c3e50",textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Adjust Balance</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button onClick={()=>setAdjType("add")} style={{flex:1,padding:"10px",borderRadius:8,border:"2px solid",borderColor:adjType==="add"?"#27ae60":"#e6e2dc",background:adjType==="add"?"#27ae60":"#fff",color:adjType==="add"?"#fff":"#7f8c8d",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add Hours</button>
                <button onClick={()=>setAdjType("deduct")} style={{flex:1,padding:"10px",borderRadius:8,border:"2px solid",borderColor:adjType==="deduct"?"#e74c3c":"#e6e2dc",background:adjType==="deduct"?"#e74c3c":"#fff",color:adjType==="deduct"?"#fff":"#7f8c8d",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>− Deduct Hours</button>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <div style={{width:100,flexShrink:0}}>
                  <label style={S.label}>Hours</label>
                  <input type="number" min="0.25" step="0.25" value={adjHours} onChange={e=>setAdjHours(e.target.value)} placeholder="0.00" style={S.input}/>
                </div>
                <div style={{flex:1}}>
                  <label style={S.label}>Transaction Notes</label>
                  <input type="text" value={adjNote} onChange={e=>setAdjNote(e.target.value)} placeholder={adjType==="deduct"?"e.g. TOIL taken Mon–Tue, approved by manager":"e.g. OT added from week ending 18/05/2025"} style={{...S.input,borderColor:"#b0c4de"}}/>
                </div>
              </div>
              {adjErr&&<div style={{fontSize:12,color:"#e74c3c",fontWeight:600,marginBottom:6}}>{adjErr}</div>}
              <button onClick={submitAdj} disabled={adjSaving} style={{...S.primary,opacity:adjSaving?.6:1,background:adjType==="deduct"?"linear-gradient(135deg,#e74c3c,#c0392b)":"linear-gradient(135deg,#27ae60,#1e8449)"}}>
                {adjSaving?"Saving...":adjType==="deduct"?"Deduct Hours from Balance":"Add Hours to Balance"}
              </button>
            </div>
          )}

          {/* Weekly ledger */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 12px"}}>
            <p style={{...S.secTitle,padding:0,margin:"10px 0 8px"}}>Weekly Ledger — most recent first</p>
            {onExport&&ledger.length>0&&(
              <button onClick={()=>onExport("overtime-bank",{empName:selEmp,ledger,balance:currentBalance})} style={{...S.exportBtn,width:"auto",padding:"8px 14px",fontSize:12,marginTop:0,borderColor:"#8e44ad",color:"#8e44ad"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                Export PDF
              </button>
            )}
          </div>
          {ledger.length===0&&<p style={S.empty}>No overtime recorded yet.</p>}
          {[...ledger].reverse().map(e=>(
            <div key={e.id} style={{...S.listItem,margin:"0 12px 6px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#95a5a6"}}>{fmtAU(e.date)}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#2c3e50",marginTop:2}}>{e.label}</div>
                  {e.note&&<div style={{fontSize:11,color:"#7f8c8d",marginTop:2,fontStyle:"italic"}}>{e.note}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16,fontWeight:800,fontFamily:"monospace",color:e.hours>0?"#27ae60":"#e74c3c"}}>{e.hours>0?"+":""}{fH(Math.abs(e.hours))}</div>
                    <div style={{fontSize:10,color:"#95a5a6",fontFamily:"monospace"}}>bal: {fH(Math.abs(e.balance))}{e.balance<0?" ▼":""}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,color:"#fff",background:e.entryType==="ot"?"#e67e22":e.hours>0?"#27ae60":"#e74c3c",padding:"3px 8px",borderRadius:8,whiteSpace:"nowrap",minWidth:40,textAlign:"center"}}>
                    {e.entryType==="ot"?"OT":e.hours>0?"Added":"Used"}
                  </span>
                  {isAdmin&&e.deletable&&(
                    <button onClick={()=>onDeleteAdjustment(selEmp,e.id)} style={{background:"none",border:"1px solid #f0d6d6",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#c0392b",cursor:"pointer",flexShrink:0}}>✕</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DAY TILE
   ════════════════════════════════════════════════════════════ */
function DayTile({day,date,data,onClick,onQuickAdd}){
  const rawHrs=(data.jobs||[]).reduce((s,j)=>s+calcH(j.start,j.finish),0);
  const breakH=rawHrs>0?DEFAULT_BREAK/60:0;
  const hrs=Math.max(0,rawHrs-breakH);
  const isSaved=!!data.saved;
  const leaveObj=data.leave&&typeof data.leave==="object"?data.leave:null;
  const lt=leaveObj?.type?LEAVE_TYPES.find(l=>l.code===leaveObj.type):null;
  const hasContent=hrs>0||lt;
  const bg=isSaved?"#f0faf4":hasContent?"#fff8f0":"#fafaf8";
  const border=isSaved?"2px solid #27ae60":hasContent?"2px solid #e67e22":"2px solid #e6e2dc";
  const hrsColor=isSaved?"#27ae60":hasContent?"#e67e22":"#bdc3c7";
  return(
    <div style={{position:"relative",width:"100%"}}>
      <button onClick={onClick} style={{background:bg,border,borderRadius:12,padding:"12px 8px",textAlign:"center",cursor:"pointer",fontFamily:"inherit",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:4,minHeight:90,justifyContent:"space-between",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:1}}>{day.slice(0,3)}</div>
        <div style={{fontSize:11,fontWeight:600,color:"#95a5a6"}}>{date||""}</div>
        <div style={{fontSize:20,fontWeight:800,fontFamily:"monospace",color:hrsColor,lineHeight:1}}>
          {hrs>0?fH(hrs):lt?fH(leaveObj.hours):"—"}
        </div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap",justifyContent:"center",minHeight:18}}>
          {isSaved&&<span style={{fontSize:8,fontWeight:700,color:"#fff",background:"#27ae60",padding:"2px 6px",borderRadius:8,letterSpacing:.5}}>SAVED</span>}
          {lt&&<span style={{fontSize:8,fontWeight:700,color:"#fff",background:lt.color,padding:"2px 6px",borderRadius:8}}>{lt.code}</span>}
          {!isSaved&&hasContent&&!lt&&<span style={{fontSize:8,fontWeight:700,color:"#e67e22",padding:"2px 6px",borderRadius:8,border:"1px solid #e67e22"}}>EDIT</span>}
        </div>
      </button>
      {onQuickAdd&&!isSaved&&(
        <button onClick={e=>{e.stopPropagation();onQuickAdd();}} title="Quick add standard day"
          style={{position:"absolute",top:6,right:6,width:22,height:22,borderRadius:"50%",background:"#e67e22",border:"none",color:"#fff",fontSize:16,fontWeight:700,lineHeight:"20px",textAlign:"center",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}>
          +
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════════ */
export default function App(){
  const[user,setUser]=useState(null);
  const[view,setView]=useState("home"); // home | edit | manage-staff
  const[sheet,setSheet]=useState(freshSheet(""));
  const[history,setHistory]=useState([]);
  const[allAdmin,setAllAdmin]=useState([]);
  const[staff,setStaff]=useState(DEFAULT_STAFF);
  const[employeePins,setEmployeePins]=useState({});
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[toast,setToast]=useState("");
  const[printMode,setPrintMode]=useState(null);
  const[changingPin,setChangingPin]=useState(false);
  const[newPin,setNewPin]=useState("");
  const[confirmPin,setConfirmPin]=useState("");
  const[pinErr,setPinErr]=useState("");
  const[selectedDay,setSelectedDay]=useState(null);
  const[showSubmitConfirm,setShowSubmitConfirm]=useState(false);
  const[showWeekPicker,setShowWeekPicker]=useState(false);
  const[adminEditSheet,setAdminEditSheet]=useState(null);
  const[adminEditDay,setAdminEditDay]=useState(null);
  const[overtimeAdj,setOvertimeAdj]=useState({});
  const[staffProfiles,setStaffProfiles]=useState({});

  // Load print CSS + staff list on mount
  useEffect(()=>{
    const style=document.createElement("style");style.textContent=PRINT_CSS;document.head.appendChild(style);
    loadStaffList().then(list=>{if(list&&list.length)setStaff(list);});
    loadEmployeePins().then(pins=>{if(pins&&Object.keys(pins).length)setEmployeePins(pins);});
    loadStaffProfiles().then(p=>{if(p&&Object.keys(p).length)setStaffProfiles(p);});
    pruneOldData();
    return()=>document.head.removeChild(style);
  },[]);

  // Load data when user logs in
  useEffect(()=>{
    if(!user)return;
    setLoading(true);
    if(user.type==="staff"){
      Promise.all([loadMySheets(user.name),loadOvertimeAdjustments()]).then(([s,adj])=>{
        setHistory(s.filter(x=>x.submittedAt).sort((a,b)=>(b.weekEnding||"").localeCompare(a.weekEnding||"")));
        setOvertimeAdj(adj);
        setLoading(false);
      });
    }else{
      Promise.all([loadAllAdmin(),loadOvertimeAdjustments()]).then(([s,adj])=>{
        setAllAdmin(s.filter(x=>x.submittedAt));
        setOvertimeAdj(adj);
        setLoading(false);
      });
    }
  },[user]);

  const flash=m=>{setToast(m);setTimeout(()=>setToast(""),2500);};
  const updateDay=(d,data)=>setSheet(p=>({...p,days:{...p.days,[d]:data}}));
  const dayDates=getDayDates(sheet.weekEnding);
  const isCasualEmployee=(staffProfiles[user?.name]?.employmentType||"full-time")==="casual";
  const quickAddDay=(d)=>updateDay(d,{...sheet.days[d],jobs:[{...defaultJob(),id:uid()}],saved:true});

  // Group employee history by year for display
  const histByYear={};
  history.forEach(h=>{const yr=(h.weekEnding||"").slice(0,4)||"?";if(!histByYear[yr])histByYear[yr]=[];histByYear[yr].push(h);});
  const histYears=Object.keys(histByYear).sort().reverse();

  // Compute this employee's TOIL balance (staff view)
  const myStdWeek=staffProfiles[user?.name]?.weeklyHours||STD_WEEK;
  const myIsCasual=(staffProfiles[user?.name]?.employmentType)==="casual";
  const myPaidBreak=staffProfiles[user?.name]?.paidBreak===true;
  const myBanked=user?.type==="staff"?history.filter(s=>s.overtimeDisposition==="bank").reduce((sum,s)=>sum+getTotals(s,myStdWeek,myIsCasual,myPaidBreak).overtime,0):0;
  const myAdjTotal=user?.type==="staff"?(overtimeAdj[user?.name]||[]).reduce((sum,a)=>sum+(a.type==="deduct"?-Math.abs(a.hours):Math.abs(a.hours)),0):0;
  const myTOILBalance=Math.round((myBanked+myAdjTotal)*100)/100;
  const myHasOT=user?.type==="staff"&&!myIsCasual&&(history.some(s=>getTotals(s,myStdWeek,false,myPaidBreak).overtime>0)||(overtimeAdj[user?.name]||[]).length>0);

  const handleSaveStaff=async(newList)=>{
    await saveStaffList(newList);
    setStaff(newList);
    flash("Staff list updated");
  };

  const handleSavePins=async(newPins)=>{
    await saveEmployeePins(newPins);
    setEmployeePins(newPins);
  };

  const handleSaveProfiles=async(newProfiles)=>{
    await saveStaffProfiles(newProfiles);
    setStaffProfiles(newProfiles);
  };

  const handleAddOTAdjustment=async(empName,hours,note,date,type)=>{
    const entry={id:uid(),date,hours:parseFloat(hours),note,type};
    const updated={...overtimeAdj,[empName]:[...(overtimeAdj[empName]||[]),entry].sort((a,b)=>a.date.localeCompare(b.date))};
    await saveOvertimeAdjustments(updated);
    setOvertimeAdj(updated);
    flash(type==="deduct"?"Hours deducted from TOIL balance":"Hours added to TOIL balance");
  };

  const handleDeleteOTAdjustment=async(empName,adjId)=>{
    const updated={...overtimeAdj,[empName]:(overtimeAdj[empName]||[]).filter(a=>a.id!==adjId)};
    await saveOvertimeAdjustments(updated);
    setOvertimeAdj(updated);
    flash("Adjustment removed");
  };

  const handleAdminRefresh=async()=>{
    setLoading(true);
    const[s,adj]=await Promise.all([loadAllAdmin(),loadOvertimeAdjustments()]);
    setAllAdmin(s.filter(x=>x.submittedAt));
    setOvertimeAdj(adj);
    setLoading(false);
    flash("Data refreshed");
  };
  const handleAdminEditOpen=(sheet)=>{setAdminEditSheet({...sheet});setAdminEditDay(null);setView("admin-edit");};
  const handleAdminApprove=async(sheetId)=>{
    const s=allAdmin.find(x=>x.id===sheetId);if(!s)return;
    const updated={...s,approvalStatus:"approved"};
    const err=await saveTS(updated);
    if(err){flash("❌ Save failed — approval not recorded. Check connection.");return;}
    // Reload from Supabase to confirm persistence
    const[fresh]=await Promise.all([loadAllAdmin()]);
    setAllAdmin(fresh.filter(x=>x.submittedAt));
    flash("✓ Timesheet approved and saved");
  };
  const handleAdminSaveAndApprove=async(editedSheet)=>{
    const updated={...editedSheet,approvalStatus:"approved"};
    const err=await saveTS(updated);
    if(err){flash("❌ Save failed — approval not recorded. Check connection.");return;}
    const fresh=await loadAllAdmin();
    setAllAdmin(fresh.filter(x=>x.submittedAt));
    setAdminEditSheet(null);setAdminEditDay(null);setView("home");
    flash("✓ Timesheet approved and saved");
  };

  // ── Local archive helper ──────────────────────────────────────
  // Downloads a JSON snapshot of all submitted sheets for the given week,
  // including computed totals. Used as a tamper-evident local backup alongside
  // the Xero CSV and PDF exports for 5-year record-keeping.
  const downloadWeekJSON=(weekEnding)=>{
    const ws=allAdmin.filter(s=>s.weekEnding===weekEnding&&s.submittedAt);
    const archive={
      exportedAt:new Date().toISOString(),
      company:COMPANY,
      weekEnding,
      sheets:ws.map(s=>{
        const isCasual=(staffProfiles[s.employeeName]?.employmentType)==="casual";
        const t=getTotals(s,staffProfiles[s.employeeName]?.weeklyHours||STD_WEEK,isCasual);
        return{
          id:s.id,employeeName:s.employeeName,weekEnding:s.weekEnding,
          submittedAt:s.submittedAt,approvalStatus:s.approvalStatus,
          employmentType:isCasual?"casual":"full-time",
          totals:{
            regular:+t.regular.toFixed(2),
            overtime:+t.overtime.toFixed(2),
            leave:+t.leaveHrs.toFixed(2),
            total:+t.total.toFixed(2),
            byDay:Object.fromEntries(Object.entries(t.byDay).map(([k,v])=>[k,+v.toFixed(2)])),
            byDayOT:Object.fromEntries(Object.entries(t.byDayOT).map(([k,v])=>[k,+v.toFixed(2)])),
            byLeave:Object.fromEntries(Object.entries(t.byLeave).map(([k,v])=>[k,+v.toFixed(2)])),
          },
          rawData:s.data||s,
        };
      }),
    };
    const blob=new Blob([JSON.stringify(archive,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`Millewa_Archive_${weekEnding}.json`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleXeroCSV=(weekEnding)=>{
    const ws=allAdmin.filter(s=>s.weekEnding===weekEnding&&s.submittedAt&&s.approvalStatus==="approved");
    if(!ws.length){flash("No approved timesheets for this week — approve first");return;}

    // Xero timesheet import format: one row per earnings type per employee
    // Ordinary hours only — overtime is tracked separately and excluded from Xero
    const header=["EmployeeName","StartDate","EndDate","EarningsRateName","NumberOfUnits"];

    // Derive week start (Monday) from week ending (Sunday)
    const endDate=new Date(weekEnding+"T00:00:00");
    const startDate=new Date(endDate);startDate.setDate(endDate.getDate()-6);
    const fmt=d=>`${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;
    const startStr=fmt(startDate);
    const endStr=fmt(endDate);

    // Map our leave codes to Xero earnings rate names
    const XERO_LEAVE_MAP={
      AL:"Annual Leave",SL:"Sick/Personal Leave",LSL:"Long Service Leave",
      PH:"Public Holiday",CL:"Compassionate Leave",WC:"Workers Compensation",
      LWOP:"Leave Without Pay",RDO:"Rostered Day Off",TOIL:"Time Off In Lieu",OTH:"Other Leave"
    };

    const rows=[];
    ws.sort((a,b)=>a.employeeName.localeCompare(b.employeeName)).forEach(s=>{
      const isCasual=(staffProfiles[s.employeeName]?.employmentType)==="casual";
      const t=getTotals(s,staffProfiles[s.employeeName]?.weeklyHours||STD_WEEK,isCasual);

      // Ordinary hours — capped at STD_DAY_HRS per day, overtime excluded
      const xeroRate=staffProfiles[s.employeeName]?.xeroEarningsRate||"";
      const ordinaryHrs=DAYS.reduce((sum,d)=>{
        const dh=t.byDay[d]||0;
        return sum+(isCasual?dh:Math.min(dh,STD_DAY_HRS));
      },0);
      if(ordinaryHrs>0) rows.push([s.employeeName,startStr,endStr,xeroRate||`⚠ NO XERO RATE SET FOR ${s.employeeName}`,ordinaryHrs.toFixed(2)]);

      // Leave — one row per leave type
      if(!isCasual){
        Object.entries(t.byLeave).forEach(([code,hrs])=>{
          if(hrs>0){
            const earningsName=XERO_LEAVE_MAP[code]||code;
            rows.push([s.employeeName,startStr,endStr,earningsName,hrs.toFixed(2)]);
          }
        });
      }
    });

    const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`Millewa_Xero_Payroll_${weekEnding}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
    downloadWeekJSON(weekEnding);
    flash("Xero CSV + JSON archive downloaded");
  };

  const handleSetOvertimeDisposition=async(sheetId,disposition)=>{
    const sheet=allAdmin.find(s=>s.id===sheetId);
    if(!sheet)return;
    const updated={...sheet,overtimeDisposition:disposition};
    await saveTS(updated);
    setAllAdmin(prev=>prev.map(s=>s.id===sheetId?updated:s));
    flash(disposition==="bank"?"Overtime banked as TOIL":"Overtime marked for Xero payout");
  };

  const handleChangePin=async()=>{
    if(newPin.length<4){setPinErr("PIN must be at least 4 digits");return;}
    if(newPin!==confirmPin){setPinErr("PINs do not match");return;}
    const updated={...employeePins,[user.name]:newPin};
    await saveEmployeePins(updated);
    setEmployeePins(updated);
    setChangingPin(false);setNewPin("");setConfirmPin("");setPinErr("");
    flash("PIN updated");
  };

  const saveDayDraft=()=>{
    flash("Day saved");
  };

  const handleExport = async (type, data) => {
    // Set printMode so the off-screen renderer mounts
    const mode = type === "timesheet"
      ? { type: "timesheet", sheet: data, generating: true }
      : type === "overtime-bank"
      ? { type: "overtime-bank", empName: data.empName, ledger: data.ledger, balance: data.balance, generating: true }
      : { type: "summary", weekEnding: data, generating: true };
    setPrintMode(mode);

    // Let React commit the off-screen DOM before we screenshot it
    await new Promise(r => setTimeout(r, 150));

    try {
      const el = document.getElementById("pdf-render-target");
      if (!el) throw new Error("PDF render target not found");

      const canvas = await html2canvas(el, {
        scale: 2,                  // higher-DPI capture for crisp text
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;

      // Tile across pages if the content is taller than A4
      let heightLeft = imgH;
      let y = 0;
      pdf.addImage(imgData, "PNG", 0, y, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        y = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, y, pageW, imgH);
        heightLeft -= pageH;
      }

      const safe = s => String(s || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
      const filename = type === "timesheet"
        ? `Timesheet_${safe(data.employeeName)}_${data.weekEnding}.pdf`
        : type === "overtime-bank"
        ? `OvertimeBank_${safe(data.empName)}_${new Date().toISOString().slice(0,10)}.pdf`
        : `Millewa_WeeklySummary_${data}.pdf`;
      pdf.save(filename);

      // Also save a JSON archive alongside any summary PDF export
      if(type==="summary") downloadWeekJSON(data);

      flash("PDF downloaded" + (type==="summary" ? " + JSON archive" : ""));
    } catch (err) {
      console.error("PDF generation failed:", err);
      flash("PDF generation failed — see console");
    } finally {
      setPrintMode(null);
    }
  };

  const submit=()=>{
    if(!sheet.weekEnding){flash("Select week ending date");return;}
    setShowSubmitConfirm(true);
  };
  const doSubmit=async()=>{
    setShowSubmitConfirm(false);
    setSaving(true);
    const done={...sheet,submittedAt:new Date().toISOString(),approvalStatus:"pending"};
    await saveTS(done);
    setHistory(h=>[...h.filter(x=>x.id!==done.id),done].sort((a,b)=>(b.weekEnding||"").localeCompare(a.weekEnding||"")));
    flash("Timesheet submitted!");setSaving(false);setSheet(freshSheet(user.name,getNextSunday()));setView("home");
  };

  const logout=()=>{setUser(null);setView("home");setHistory([]);setAllAdmin([]);setOvertimeAdj({});setChangingPin(false);setNewPin("");setConfirmPin("");setPinErr("");setSelectedDay(null);setAdminEditSheet(null);setAdminEditDay(null);};

  // ── Not logged in ──
  if(!user) return <LoginScreen onLogin={u=>{setUser(u);setView("home");}} staff={staff} employeePins={employeePins}/>;

  // Off-screen render target for PDF capture, plus a "generating..." overlay.
  // Both are mounted conditionally while printMode is set; the main UI stays mounted underneath.
  const pdfOverlay = printMode ? (
    <div>
      {/* Visible "Generating PDF…" modal */}
      <div style={{position:"fixed",inset:0,background:"rgba(15,23,33,.78)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#fff",padding:"28px 36px",borderRadius:14,textAlign:"center",boxShadow:"0 12px 40px rgba(0,0,0,.4)",maxWidth:320}}>
          <div style={{width:36,height:36,border:"3px solid #e6e2dc",borderTopColor:"#e67e22",borderRadius:"50%",margin:"0 auto 14px",animation:"mtspin 0.8s linear infinite"}}/>
          <div style={{fontSize:15,fontWeight:700,color:"#2c3e50"}}>Generating PDF…</div>
          <div style={{fontSize:11,color:"#95a5a6",marginTop:4}}>Your download will start shortly</div>
        </div>
      </div>
      {/* Off-screen render target — positioned where html2canvas can find it but the user can't */}
      <div id="pdf-render-target" style={{position:"fixed",left:"-99999px",top:0,width:"794px",background:"#fff",padding:"24px"}}>
        {printMode.type === "timesheet"     && <PrintableTimesheet sheet={printMode.sheet}/>}
        {printMode.type === "summary"       && <PrintableSummary sheets={allAdmin} weekEnding={printMode.weekEnding} staffProfiles={staffProfiles}/>}
        {printMode.type === "overtime-bank" && <PrintableOvertimeBank empName={printMode.empName} ledger={printMode.ledger} balance={printMode.balance}/>}
      </div>
      <style>{`@keyframes mtspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ) : null;

  // ── Admin view ──
  if(user.type==="admin") return(
    <div style={S.shell}>
      <div style={S.header}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
          <div><h1 style={S.hTitle}>{COMPANY}</h1><p style={S.hSub}>Admin — Weekly Summary</p></div>
          <button onClick={logout} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,color:"rgba(255,255,255,.6)",cursor:"pointer"}}>Sign Out</button>
        </div>
      </div>
      {view==="manage-staff"
        ? <ManageStaff staff={staff} onSave={handleSaveStaff} onBack={()=>setView("home")} employeePins={employeePins} onSavePins={handleSavePins} staffProfiles={staffProfiles} onSaveProfiles={handleSaveProfiles}/>
        : view==="admin-edit"
          ? <AdminEditSheet sheet={adminEditSheet} onSaveAndApprove={handleAdminSaveAndApprove} onBack={()=>setView("home")} staffProfiles={staffProfiles}/>
          : view==="overtime"
            ? <OvertimeBank allSheets={allAdmin} staff={staff} onBack={()=>setView("home")} overtimeAdj={overtimeAdj} isAdmin={true} onAddAdjustment={handleAddOTAdjustment} onDeleteAdjustment={handleDeleteOTAdjustment} onExport={handleExport} staffProfiles={staffProfiles}/>
            : <div>
                <button onClick={logout} style={S.backBtn}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Back</button>
                <AdminSummary allSheets={allAdmin} onExport={handleExport} onXeroCSV={handleXeroCSV} staff={staff} staffProfiles={staffProfiles} onManageStaff={()=>setView("manage-staff")} onSetDisposition={handleSetOvertimeDisposition} onOvertimeBank={()=>setView("overtime")} onAdminEdit={handleAdminEditOpen} onApprove={handleAdminApprove} onRefresh={handleAdminRefresh}/>
              </div>
      }
      {toast&&<div style={S.toast}>{toast}</div>}
      {pdfOverlay}
    </div>
  );

  // ── Staff view ──
  return(
    <div style={S.shell}>
      <div style={S.header}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
          <div><h1 style={S.hTitle}>{COMPANY}</h1><p style={S.hSub}>Weekly Timesheet</p><div style={S.hUser}>{user.name}</div></div>
          <button onClick={logout} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,color:"rgba(255,255,255,.6)",cursor:"pointer"}}>Sign Out</button>
        </div>
      </div>

      {/* Staff: My Timesheet only — no summary tab */}
      {view==="home"&&(
        <div>
          <button onClick={logout} style={S.backBtn}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Back</button>
          <div style={{padding:"4px 12px 14px"}}>
            <button onClick={()=>{
              const available=getAvailableWeeks(history,4);
              if(available.length===0){flash("You have already submitted a timesheet for each of the last 4 weeks.");return;}
              if(available.length===1){setSheet(freshSheet(user.name,available[0]));setSelectedDay(null);setView("edit");return;}
              setShowWeekPicker(true);
            }} style={S.primary}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Timesheet
            </button>
            {showWeekPicker&&(()=>{const available=getAvailableWeeks(history,4);return(
              <div style={{background:"#fff",borderRadius:12,border:"1px solid #e6e2dc",padding:16,marginTop:10,boxShadow:"0 2px 12px rgba(0,0,0,.08)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#2c3e50",marginBottom:4}}>Select Pay Period</div>
                <div style={{fontSize:11,color:"#7f8c8d",marginBottom:12}}>Choose the week ending date for this timesheet. You can submit for missed weeks up to 4 weeks back.</div>
                {available.map((we,i)=>(
                  <button key={we} onClick={()=>{setShowWeekPicker(false);setSheet(freshSheet(user.name,we));setSelectedDay(null);setView("edit");}}
                    style={{display:"block",width:"100%",textAlign:"left",background:i===0?"#f0f7ff":"#fafafa",border:`1px solid ${i===0?"#3498db":"#e6e2dc"}`,borderRadius:10,padding:"12px 14px",marginBottom:8,cursor:"pointer"}}>
                    <div style={{fontSize:14,fontWeight:700,color:i===0?"#2980b9":"#2c3e50"}}>{fmtAU(we)}</div>
                    <div style={{fontSize:11,color:"#95a5a6",marginTop:2}}>{i===0?"Current week":"Late submission — "+Math.round((new Date(getNextSunday())-new Date(we+"T00:00:00"))/(7*86400000))+" week(s) ago"}</div>
                  </button>
                ))}
                <button onClick={()=>setShowWeekPicker(false)} style={{width:"100%",background:"none",border:"none",color:"#95a5a6",fontSize:13,cursor:"pointer",paddingTop:4}}>Cancel</button>
              </div>
            );})()}
          </div>
          {myHasOT&&!isCasualEmployee&&(
            <div style={{padding:"0 12px 10px"}}>
              <div style={{background:"linear-gradient(135deg,#1a2634,#2c3e50)",borderRadius:12,padding:"14px 16px",color:"#fff"}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"rgba(255,255,255,.5)",marginBottom:4}}>My TOIL Balance</div>
                <div style={{fontSize:28,fontWeight:800,fontFamily:"monospace",color:myTOILBalance>0?"#e67e22":myTOILBalance<0?"#e74c3c":"rgba(255,255,255,.4)"}}>{fH(Math.abs(myTOILBalance))}</div>
                {myTOILBalance<0&&<div style={{fontSize:11,color:"#e74c3c",fontWeight:600,marginTop:2}}>Balance overdrawn</div>}
                <button onClick={()=>setView("my-overtime")} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,color:"#fff",cursor:"pointer",marginTop:8}}>View History →</button>
              </div>
            </div>
          )}
          <div style={{padding:"0 12px 4px"}}>
            {!changingPin
              ? <button onClick={()=>setChangingPin(true)} style={{...S.exportBtn,marginTop:0,fontSize:13,padding:"12px"}}>Change My PIN</button>
              : <div style={{background:"#fff",borderRadius:12,border:"1px solid #e6e2dc",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#2c3e50",marginBottom:12}}>Change PIN</div>
                  <label style={S.label}>New PIN (4–6 digits)</label>
                  <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e=>{setNewPin(e.target.value.replace(/\D/g,""));setPinErr("");}} placeholder="••••" style={{...S.pinInput,marginBottom:10}}/>
                  <label style={{...S.label,marginTop:6}}>Confirm PIN</label>
                  <input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={e=>{setConfirmPin(e.target.value.replace(/\D/g,""));setPinErr("");}} onKeyDown={e=>e.key==="Enter"&&handleChangePin()} placeholder="••••" style={{...S.pinInput,marginBottom:8}}/>
                  {pinErr&&<div style={{color:"#e74c3c",fontSize:12,fontWeight:600,marginBottom:8}}>{pinErr}</div>}
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button onClick={()=>{setChangingPin(false);setNewPin("");setConfirmPin("");setPinErr("");}} style={{...S.exportBtn,flex:1,marginTop:0}}>Cancel</button>
                    <button onClick={handleChangePin} style={{...S.primary,flex:1,opacity:newPin.length>=4&&newPin===confirmPin?1:.5}}>Save PIN</button>
                  </div>
                </div>
            }
          </div>
          {histYears.length>0&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px 2px"}}>
                <span style={S.secTitle}>My Submissions</span>
                <span style={{fontSize:10,color:"#bdc3c7",paddingRight:4}}>5-year history</span>
              </div>
              {histYears.map(yr=>(
                <div key={yr}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 16px 2px",background:"#f0ece6",borderTop:"1px solid #e6e2dc",borderBottom:"1px solid #e6e2dc",marginTop:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#2c3e50"}}>{yr}</span>
                    <span style={{fontSize:10,fontWeight:600,color:"#95a5a6"}}>{histByYear[yr].length} submission{histByYear[yr].length!==1?"s":""}</span>
                  </div>
                  <div style={{padding:"6px 12px"}}>
                    {histByYear[yr].map(h=>{
                      const{total,overtime,byState,leaveHrs}=getTotals(h,myStdWeek,myIsCasual,myPaidBreak);
                      return<div key={h.id} style={S.listItem}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:15,color:"#2c3e50"}}>Week ending {fmtAU(h.weekEnding)}</div>
                            <div style={{fontSize:12,marginTop:4,display:"flex",gap:8,flexWrap:"wrap"}}>
                              <span style={{color:"#2c3e50",fontWeight:600}}>{fH(total)}</span>
                              {overtime>0&&!myIsCasual&&<span style={{color:"#e74c3c",fontWeight:700}}>+{fH(overtime)} OT</span>}
                              {leaveHrs>0&&<span style={{color:"#d4ac0d",fontWeight:700}}>{fH(leaveHrs)} leave</span>}
                              <span style={{fontSize:10,fontWeight:700,color:h.approvalStatus==="approved"?"#27ae60":"#e67e22",background:h.approvalStatus==="approved"?"#eafaf1":"#fef9f0",padding:"1px 7px",borderRadius:8,border:`1px solid ${h.approvalStatus==="approved"?"#a9dfbf":"#f5cba7"}`}}>{h.approvalStatus==="approved"?"Approved":"Pending Approval"}</span>
                            </div>
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                            <button onClick={()=>handleExport("timesheet",h)} style={{background:"none",border:"1px solid #2c3e50",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:"#2c3e50",cursor:"pointer"}}>PDF</button>
                            <button onClick={()=>{setSheet({...h,submittedAt:null});setSelectedDay(null);setView("edit");}} style={{background:"none",border:"1px solid #ddd",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:"#2980b9",cursor:"pointer"}}>Edit</button>
                          </div>
                        </div>
                      </div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading&&!history.length&&<p style={S.empty}>No timesheets submitted yet.<br/>Tap <strong>New Timesheet</strong> to get started.</p>}
        </div>
      )}

      {view==="edit"&&(
        <div>
          <button onClick={()=>{if(selectedDay!==null)setSelectedDay(null);else setView("home");}} style={S.backBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            {selectedDay!==null?"Back to Week":"Back"}
          </button>

          {/* Week ending — auto-calculated, read only */}
          <div style={{...S.card,margin:"4px 12px 10px"}}><div style={{padding:14}}>
            <div style={{fontSize:15,fontWeight:700,color:"#2c3e50",marginBottom:10}}>{user.name}</div>
            <div style={{fontSize:11,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Pay Period — Week Ending</div>
            <div style={{background:"#f0f4f8",borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:"#2c3e50"}}>{fmtAU(sheet.weekEnding)}</div>
                <div style={{fontSize:11,color:"#95a5a6",marginTop:2}}>{sheet.weekEnding<getNextSunday()?"Late submission — "+Math.round((new Date(getNextSunday())-new Date(sheet.weekEnding+"T00:00:00"))/(7*86400000))+" week(s) ago":"Pay period ending this Sunday"}</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b0c4de" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
          </div></div>

          {selectedDay===null?(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 12px 12px"}}>
                {DAYS.map(d=>(
                  <div key={d} style={d==="Sunday"?{gridColumn:"1/-1"}:{}}>
                    <DayTile day={d} date={dayDates[d]||""} data={sheet.days[d]} onClick={()=>setSelectedDay(d)} onQuickAdd={isCasualEmployee?()=>quickAddDay(d):undefined}/>
                  </div>
                ))}
              </div>
              <StateSummary sheet={sheet}/>
              <LeaveSummary sheet={sheet}/>
              <TotalsBar sheet={sheet} isCasual={isCasualEmployee} stdWeek={staffProfiles[user.name]?.weeklyHours||STD_WEEK} paidBreak={myPaidBreak}/>
              {showSubmitConfirm&&(()=>{const alreadySubmitted=history.some(h=>h.weekEnding===sheet.weekEnding&&h.id!==sheet.id);return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:340,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,.18)"}}>
                <div style={{fontSize:18,fontWeight:800,color:"#2c3e50",marginBottom:6}}>Confirm Submission</div>
                <div style={{fontSize:13,color:"#7f8c8d",marginBottom:14}}>Please check before submitting:</div>
                <div style={{background:"#f0f4f8",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#7f8c8d",textTransform:"uppercase",letterSpacing:.5,marginBottom:2}}>Pay Period</div>
                  <div style={{fontSize:16,fontWeight:800,color:"#2c3e50"}}>Week ending {fmtAU(sheet.weekEnding)}</div>
                </div>
                {alreadySubmitted&&<div style={{background:"#fdf0f0",border:"2px solid #e74c3c",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:18,lineHeight:1}}>⚠️</span>
                  <div style={{fontSize:13,fontWeight:700,color:"#c0392b"}}>You have already submitted a timesheet for this pay period. Only one timesheet per week is allowed.</div>
                </div>}
                <div style={{fontSize:12,color:"#95a5a6",marginBottom:18}}>Only submit once per week. Contact your manager if you need to make changes after submitting.</div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>setShowSubmitConfirm(false)} style={{flex:1,padding:"12px",borderRadius:10,border:"2px solid #e6e2dc",background:"#fff",color:"#7f8c8d",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                  {!alreadySubmitted&&<button onClick={doSubmit} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Confirm & Submit</button>}
                </div>
              </div></div>);})()}
              <div style={{padding:"0 12px 24px"}}><button onClick={submit} disabled={saving} style={{...S.primary,opacity:saving?.6:1}}>{saving?"Submitting...":"Submit Timesheet"}</button></div>
            </div>
          ):(
            <DayCard day={selectedDay} date={dayDates[selectedDay]||""} data={sheet.days[selectedDay]} update={data=>updateDay(selectedDay,data)} onSaveDay={()=>{saveDayDraft();setSelectedDay(null);}} isFullTime={(staffProfiles[user.name]?.employmentType||"full-time")!=="casual"}/>
          )}
        </div>
      )}

      {view==="my-overtime"&&(
        <OvertimeBank allSheets={history} staff={[user.name]} onBack={()=>setView("home")} overtimeAdj={overtimeAdj} isAdmin={false}/>
      )}

      {toast&&<div style={S.toast}>{toast}</div>}
      {pdfOverlay}
    </div>
  );
}
