import { useState, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

const G = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Sora:wght@400;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0b0f1a;--surface:#111827;--s2:#1c2437;--s3:#243049;
    --border:#2a3552;--accent:#3b82f6;--green:#10b981;--amber:#f59e0b;
    --red:#ef4444;--text:#e2e8f0;--muted:#64748b;
    --plan:#8b5cf6;--eng:#10b981;--qs:#f59e0b;--site:#f43f5e;
  }
  html,body,#root{height:100%;font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text)}
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-track{background:var(--surface)}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
  .fade-in{animation:fi .25s ease both}
  @keyframes fi{from{opacity:0}to{opacity:1}}
  .pulse{animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}
  input,select,textarea{background:var(--s3);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 10px;font-family:inherit;font-size:13px;outline:none;transition:border-color .2s;width:100%}
  input:focus,select:focus,textarea:focus{border-color:var(--accent)}
  input::placeholder,textarea::placeholder{color:var(--muted)}
  table input{min-width:60px}
  table td{white-space:nowrap}
  button{cursor:pointer;font-family:inherit;border:none;border-radius:8px;transition:all .2s}
  table{border-collapse:collapse;width:100%}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
  td{padding:10px 14px;font-size:13px;border-bottom:1px solid var(--border);vertical-align:top}
  tr:last-child td{border-bottom:none}
`;

// ─── Constants ────────────────────────────────────────────────────────────────
// Pages available per role
const ROLE_PAGES = {
  planning:    ["dashboard","create","my-boqs","reports"],
  engineering: ["dashboard","pending","my-boqs","reports"],
  qs:          ["dashboard","pending","my-boqs","reports"],
  site:        ["dashboard","pending","my-boqs","reports"],
  procurement: ["dashboard","procurement"],
};
const PAGE_LABELS = {
  dashboard:"Dashboard", create:"Create BOQ", "my-boqs":"My BOQs / All BOQs",
  pending:"Pending Review", reports:"Reports", procurement:"Procurement Tracker",
};

const INITIAL_USERS = [
  { id:1, name:"user_1", email:"planning@listenlights.com",    password:"plan123", role:"planning",    phone:"9876543210", designation:"Planning Manager",  active:true, pages:["dashboard","create","my-boqs","reports"] },
  { id:2, name:"user_2",    email:"engineering@listenlights.com", password:"eng123",  role:"engineering", phone:"9876543211", designation:"Senior Engineer",    active:true, pages:["dashboard","pending","my-boqs","reports"] },
  { id:3, name:"user_3",   email:"QS@listenlights.com",          password:"qs123",   role:"qs",          phone:"9876543212", designation:"QS Analyst",         active:true, pages:["dashboard","pending","my-boqs","reports"] },
  { id:4, name:"user_4",    email:"site@listenlights.com",        password:"site123", role:"site",        phone:"9876543213", designation:"Site Supervisor",    active:true, pages:["dashboard","pending","my-boqs","reports"] },
  { id:5, name:"User_5",    email:"procurement@corp.com", password:"proc123",  role:"procurement", phone:"9876543214", designation:"Procurement Manager", active:true, pages:["dashboard","procurement","quotations"] },
  { id:6, name:"Rahul Traders",  email:"vendor1@corp.com",     password:"vend123",  role:"vendor", phone:"9876543220", designation:"Vendor",  active:true, pages:["quotes"] },
  { id:7, name:"Mehta Supplies", email:"vendor2@corp.com",     password:"vend123",  role:"vendor", phone:"9876543221", designation:"Vendor",  active:true, pages:["quotes"] },
  { id:8, name:"Singh & Co.",    email:"vendor3@corp.com",     password:"vend123",  role:"vendor", phone:"9876543222", designation:"Vendor",  active:true, pages:["quotes"] },
];
const mkInitials = n => n.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

const ROLE_META = {
  planning:    { label:"Project Control",        color:"#8b5cf6", icon:"📐" },
  engineering: { label:"Engineering Team",     color:"#10b981", icon:"⚙️" },
  qs:          { label:"Quantity Survey Team", color:"#f59e0b", icon:"📏" },
  site:        { label:"Project Team",            color:"#f43f5e", icon:"🏗️" },
  procurement: { label:"Procurement Team",     color:"#f0a030", icon:"📦" },
  vendor:      { label:"Vendor",               color:"#06b6d4", icon:"🏭" },
};

const STATUS_META = {
  draft:           { label:"Draft",                    color:"#64748b", bg:"#1e293b" },
  with_engineering:{ label:"With Engineering",         color:"#10b981", bg:"#064e3b" },
  with_qs:         { label:"With Quantity Survey",     color:"#f59e0b", bg:"#3d2600" },
  with_site:       { label:"With Project Team",           color:"#f43f5e", bg:"#3f0018" },
  completed:       { label:"Completed",                color:"#3b82f6", bg:"#1e3a5f" },
};

const UNIT_LIST = ["No's","Nos","Sets","R.Mtrs","Mtrs.","Mts","L/S","M.Ton","Cu. Mtrs","Sq.Mtr","MT","KG","CFT","SQM","LTR","Bags","RM","Sqft","RMT","Lump","LS","Lot","KVA","KW","Mtr"];
const genId = () => `BOQ-${Date.now().toString(36).toUpperCase().slice(-6)}`;

// ─── Excel Parser ─────────────────────────────────────────────────────────────

// Maps a cell header text → recognised field key. Returns null if unrecognised.
function classifyHeader(raw) {
  const h = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  if (!h) return null;
  // Line item / serial number column
  if (/line.?item.?id|item.?id|line.?id|sl\s*no|s\s*no|sr\s*no|si\s*no/.test(h)) return 'lineItemId';
  // Label / section code
  if (/^(label|code|ref|section|heading|item\s*no|item\s*num)$/.test(h)) return 'label';
  // Description / name column
  if (/descrip|item\s*desc|item\s*name|particulars|work\s*description|scope|narration/.test(h)) return 'name';
  // Unit column
  if (/^(unit|uom|units)$/.test(h) || /unit\s*of\s*measure/.test(h)) return 'unit';
  // Quantity column — only exact matches to avoid "3rd FLOOR QUANTITY" style merged headers
  if (/^(qty|quantity|quant)$/.test(h)) return 'quantity';
  return null;
}

// Count distinct recognised headers in a row
function headerScore(row) {
  const seen = new Set();
  for (const cell of row) { const f = classifyHeader(cell); if (f) seen.add(f); }
  return seen.size;
}

// Build column-index map from a header row
function buildColMap(row) {
  const map = {};
  row.forEach((cell, ci) => {
    const f = classifyHeader(cell);
    if (f && !(f in map)) map[f] = ci;
  });
  return map;
}

// Clean a lineItemId that Excel may have stored as a float
// e.g. "1.2000000000000002" → "1.2"
function cleanLineItemId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = parseFloat(s);
  if (!isNaN(n)) return parseFloat(n.toPrecision(10)).toString();
  return s;
}

// Key rule: a row is a "spec / note" row if it has text only in the description
// column and nothing else meaningful (no line-item id, no unit, no qty).
// These are background paragraphs that explain the items below them — NOT line items.
// Parse ALL sheets — returns array of {sheetName, items}
function parseAllSheets(wb) {
  return wb.SheetNames.map(name => ({
    sheetName: name,
    items: trySheet(wb.Sheets[name]),
  }));
}

// Legacy single-best-sheet picker (kept for non-multi-sheet paths)
function parseSheetToItems(wb) {
  let best = [];
  for (const s of wb.SheetNames) {
    const r = trySheet(wb.Sheets[s]);
    if (r.length > best.length) best = r;
  }
  return best;
}

function trySheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false, blankrows:false });
  if (!rows || rows.length < 2) return [];

  // ── Step 1: Find the headline row ──────────────────────────────────────────
  // Scan the first 40 rows. The row with the most recognised column keywords
  // (Description, Unit, Qty, SI. NO …) is the column-header / headline row.
  // ALL data extraction happens from the row immediately after it.
  let bestRow = -1, bestScore = 0, bestMap = {};
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const map = buildColMap(rows[i]);
    const score = Object.keys(map).length;
    if (score > bestScore) { bestScore = score; bestRow = i; bestMap = map; }
  }

  const cm = { ...bestMap };
  // dataStart = first row of actual items (one row after the headline)
  const dataStart = bestScore > 0 ? bestRow + 1 : 0;

  // ── Step 2: Heuristically find the description column if not in headline ────
  if (!('name' in cm)) {
    const textScore = {};
    for (let i = dataStart; i < Math.min(dataStart + 60, rows.length); i++) {
      (rows[i] || []).forEach((cell, ci) => {
        const v = String(cell).trim();
        // Must be long text that is NOT a number
        if (v.length > 5 && isNaN(parseFloat(v.replace(/,/g, '')))) {
          textScore[ci] = (textScore[ci] || 0) + v.length;
        }
      });
    }
    const taken = new Set(Object.values(cm));
    const best = Object.entries(textScore)
      .filter(([ci]) => !taken.has(Number(ci)))
      .sort((a, b) => b[1] - a[1])[0];
    if (best) cm.name = Number(best[0]);
  }

  if (!('name' in cm)) return []; // no description column found at all

  // ── Step 3: Heuristically find quantity column ──────────────────────────────
  // Prefer columns with small positive integers (1–9999 = typical BOQ counts)
  // over columns with large numbers (rates / costs).
  // Also prefer columns physically close to the unit column.
  if (!('quantity' in cm)) {
    const taken = new Set(Object.values(cm));
    const qtyHits = {}, rateHits = {};
    for (let i = dataStart; i < Math.min(dataStart + 60, rows.length); i++) {
      (rows[i] || []).forEach((cell, ci) => {
        if (taken.has(ci)) return;
        const v = parseFloat(String(cell).replace(/,/g, '').trim());
        if (isNaN(v) || v <= 0) return;
        if (v <= 9999) qtyHits[ci] = (qtyHits[ci] || 0) + 1;
        else           rateHits[ci] = (rateHits[ci] || 0) + 1;
      });
    }
    const unitCol = cm.unit ?? 999;
    const cands = Object.entries(qtyHits)
      .filter(([ci]) => !taken.has(Number(ci)) && !(rateHits[Number(ci)] > qtyHits[Number(ci)]))
      .sort((a, b) => Math.abs(Number(a[0]) - unitCol) - Math.abs(Number(b[0]) - unitCol));
    if (cands.length) cm.quantity = Number(cands[0][0]);
  }

  // ── Step 4: Heuristically find unit column ──────────────────────────────────
  const UR = /^(nos?\.?|no's|sets?|r\.?mtrs?|mtr?s?\.?|mts|l\/s|m\.?ton|cu\.?\s*mtr?s?|sq\.?\s*mtr?|mt|kg|cft|sqm|ltr?|bags|rm|rmt|lump|ls|lot|kva|kw|pcs|ea|each|m|km|units?)$/i;
  if (!('unit' in cm)) {
    const taken = new Set(Object.values(cm));
    const unitHits = {};
    for (let i = dataStart; i < Math.min(dataStart + 60, rows.length); i++) {
      (rows[i] || []).forEach((cell, ci) => {
        if (taken.has(ci)) return;
        const v = String(cell).trim();
        if (v.length >= 1 && v.length <= 12 && UR.test(v)) unitHits[ci] = (unitHits[ci] || 0) + 1;
      });
    }
    const best = Object.entries(unitHits).sort((a, b) => b[1] - a[1])[0];
    if (best && Number(best[1]) >= 2) cm.unit = Number(best[0]);
  }

  // ── Step 5: Extract rows — DESCRIPTION IS THE ONLY REQUIRED FIELD ──────────
  //
  // Simple two-rule logic:
  //   KEEP  → description column has any text  (other fields may be blank)
  //   SKIP  → description column is empty      (even if other columns have data)
  //
  // The only other rows we skip are structural noise that will never have
  // a real description:
  //   • Completely blank rows
  //   • Repeated column-header rows (score ≥ 2 recognised field keywords)
  //   • Sub-header continuation rows where every cell is a rate/amount keyword
  //     e.g. "QUANTITY | Rate (INR) | Amount (INR)"
  //   • Aggregate summary rows: SUB TOTAL, GRAND TOTAL, TOTAL

  // Matches rows like "SUB TOTAL", "GRAND TOTAL", "TOTAL"
  const IS_TOTAL_ROW = /^(sub\s*total|grand\s+total|^total$)/i;

  // Words that appear in sub-header continuation rows only (not in real descriptions)
  const IS_META_HEADER = /^(quantity|rate|amount|price|cost|inr|rs\.?|supply|installation|total|uom|unit\s*of\s*measure|floor|section)$/i;

  const items = [];
  let uid = Date.now();

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];

    // Skip blank rows
    if (!row || row.every(c => String(c).trim() === '')) continue;

    // Skip repeated column-header rows (e.g. headline appears again mid-sheet)
    if (headerScore(row) >= 2) continue;

    // Skip sub-header continuation rows where every non-empty cell is a meta word
    const nonEmpty = row.map(c => String(c).trim()).filter(Boolean);
    if (nonEmpty.length > 0 && nonEmpty.every(v =>
      IS_META_HEADER.test(v.toLowerCase().replace(/[^a-z]/g, ' ').trim())
    )) continue;

    // ── The anchor: description column ───────────────────────────────────────
    const rawName = String(row[cm.name] ?? '').trim();

    // SKIP if description is empty — regardless of what other columns contain
    if (!rawName) continue;

    // Skip aggregate/total rows (they have text in description but aren't items)
    if (IS_TOTAL_ROW.test(rawName)) continue;

    // ✅ Description present → extract whatever other fields are available.
    //    Missing lineItemId / unit / qty are fine — leave them blank / zero.
    const lineItemId = cm.lineItemId != null ? cleanLineItemId(row[cm.lineItemId]) : '';
    const unit       = cm.unit       != null ? String(row[cm.unit]       ?? '').trim() : '';
    const label      = cm.label      != null ? String(row[cm.label]      ?? '').trim() : '';
    const planQty    = cm.quantity   != null ? pn(String(row[cm.quantity] ?? ''))      : 0;

    items.push({ id: uid++, lineItemId, label, name: rawName, unit, planQty, engQty:0, qsQty:0, siteQty:0 });
  }

  return items;
}

function pn(str){const n=parseFloat(String(str).replace(/,/g,'').trim());return isNaN(n)?0:n;}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Badge({status}){
  const m=STATUS_META[status]||{label:status,color:"#64748b",bg:"#1e293b"};
  return <span style={{background:m.bg,color:m.color,border:`1px solid ${m.color}40`,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{m.label}</span>;
}
function Btn({children,variant="primary",onClick,disabled,small,style={}}){
  const v={
    primary:{background:"var(--accent)",color:"#fff"},
    success:{background:"var(--green)",color:"#fff"},
    ghost:{background:"transparent",color:"var(--muted)",border:"1px solid var(--border)"},
    outline:{background:"transparent",color:"var(--accent)",border:"1px solid var(--accent)"},
    purple:{background:"var(--plan)",color:"#fff"},
    amber:{background:"var(--qs)",color:"#000"},
    rose:{background:"var(--site)",color:"#fff"},
  };
  return <button onClick={onClick} disabled={disabled} style={{padding:small?"6px 14px":"9px 18px",fontSize:small?12:13,fontWeight:600,opacity:disabled?.4:1,...v[variant],...style}}>{children}</button>;
}
function Card({children,style={}}){return <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:20,...style}}>{children}</div>;}
function StatCard({icon,label,value,color}){
  return(
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:20,display:"flex",alignItems:"center",gap:16}}>
      <div style={{width:48,height:48,borderRadius:12,background:`${color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{icon}</div>
      <div><div style={{fontSize:24,fontWeight:700,color,fontFamily:"Sora"}}>{value}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{label}</div></div>
    </div>
  );
}
function DiffBadge({diff,show}){
  if(!show) return <span style={{color:"var(--muted)"}}>—</span>;
  const c=diff===0?"var(--green)":diff>0?"var(--amber)":"var(--red)";
  return <span style={{fontSize:12,fontWeight:700,color:c,background:`${c}18`,border:`1px solid ${c}35`,borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>{diff>0?"+":""}{diff}</span>;
}
function DescCell({text,editable,onChange}){
  if(!editable) return <div style={{lineHeight:1.75,fontSize:13,whiteSpace:"pre-wrap",wordBreak:"break-word",color:"var(--text)",padding:"2px 0"}}>{text||<span style={{color:"var(--muted)"}}>—</span>}</div>;
  return(
    <div contentEditable suppressContentEditableWarning
      onBlur={e=>onChange(e.currentTarget.innerText.trim())}
      onFocus={e=>e.currentTarget.style.borderColor="var(--accent)"}
      onBlurCapture={e=>e.currentTarget.style.borderColor="var(--border)"}
      style={{minHeight:38,lineHeight:1.75,fontSize:13,padding:"6px 10px",background:"var(--s3)",border:"1px solid var(--border)",borderRadius:8,outline:"none",whiteSpace:"pre-wrap",wordBreak:"break-word",cursor:"text"}}
    >{text}</div>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────
function NotifBell({notifications,onClear}){
  const [open,setOpen]=useState(false);
  const unread=notifications.filter(n=>!n.read).length;
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:"none",border:"none",fontSize:20,position:"relative",padding:"4px 8px",color:"var(--text)"}}>
        🔔
        {unread>0&&<span className="pulse" style={{position:"absolute",top:0,right:0,width:18,height:18,background:"var(--red)",borderRadius:"50%",fontSize:10,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:40,width:360,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,zIndex:999,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
            <span style={{fontWeight:600,fontSize:14}}>Notifications</span>
            {unread>0&&<button onClick={()=>{onClear();setOpen(false);}} style={{background:"none",border:"none",color:"var(--accent)",fontSize:12,cursor:"pointer"}}>Mark all read</button>}
          </div>
          <div style={{maxHeight:340,overflowY:"auto"}}>
            {notifications.length===0&&<div style={{padding:"24px 16px",color:"var(--muted)",fontSize:13,textAlign:"center"}}>No notifications</div>}
            {notifications.slice().reverse().map(n=>(
              <div key={n.id} style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:n.read?"transparent":"#1e293b",display:"flex",gap:12,alignItems:"flex-start"}}>
                <span style={{fontSize:18,flexShrink:0}}>{n.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:n.read?400:600,lineHeight:1.5}}>{n.message}</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>{new Date(n.time).toLocaleString()}</div>
                </div>
                {!n.read&&<div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)",flexShrink:0,marginTop:4}}/>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Items Table ──────────────────────────────────────────────────────────────
// Columns rendered depend on role and which stages are available
function ItemsTable({items, role, editField, onUpdateItem, stagesVisible, lastRowRef=null}){
  // stagesVisible: { eng, qs, site }
  const {eng=false, qs=false, site=false} = stagesVisible||{};
  const isPlan = role==="planning";
  const isEng  = role==="engineering";
  const isQS   = role==="qs";
  const isSite = role==="site";
  const canEditPlan = isPlan && editField==="planQty";

  // ── Item search ─────────────────────────────────────────────────────────────
  const [search,setSearch]=useState("");
  // "all" | "description" | "lineItemId" | "label"
  const [searchField,setSearchField]=useState("all");
  const q=search.trim().toLowerCase();
  const filteredItems=q
    ? items.filter(i=>{
        if(searchField==="description") return i.name&&i.name.toLowerCase().includes(q);
        if(searchField==="lineItemId")  return i.lineItemId&&i.lineItemId.toLowerCase().includes(q);
        if(searchField==="label")       return i.label&&i.label.toLowerCase().includes(q);
        // "all" — search across every field
        const qtyRole=editField==="engQty"?i.engQty:editField==="qsQty"?i.qsQty:editField==="siteQty"?i.siteQty:i.planQty;
        return(
          (i.name&&i.name.toLowerCase().includes(q))||
          (i.lineItemId&&i.lineItemId.toLowerCase().includes(q))||
          (i.label&&i.label.toLowerCase().includes(q))||
          (i.unit&&i.unit.toLowerCase().includes(q))||
          String(i.planQty||0).includes(q)||
          String(qtyRole||0).includes(q)
        );
      })
    : items;
  const FIELD_OPTS=[
    {k:"all",         label:"All Fields"},
    {k:"description", label:"Description"},
    {k:"lineItemId",  label:"Line Item ID"},
    {k:"label",       label:"Label"},
  ];
  const placeholders={
    all:"Search description, line ID, label, unit, qty…",
    description:"Search item description…",
    lineItemId:"Search line item ID…",
    label:"Search label…",
  };

  // Auto-hide optional columns when all items have no data for that field
  // In edit mode always show so user can fill them in
  const hasLineItemId = canEditPlan || items.some(i=>i.lineItemId&&i.lineItemId.trim());
  const hasLabel      = canEditPlan || items.some(i=>i.label&&i.label.trim());
  const hasUnit       = canEditPlan || items.some(i=>i.unit&&i.unit.trim());

  // Determine which qty columns to show per role
  const showEng  = isEng||isQS||isSite||(isPlan&&eng);
  const showQS   = isQS||isSite||(isPlan&&qs);
  const showSite = isSite||(isPlan&&site);

  // Min table width based on visible columns
  let minW = 400;
  if(hasLineItemId) minW+=110;
  if(hasLabel)      minW+=100;
  if(hasUnit)       minW+=80;
  minW+=100+50; // planQty col + # col
  if(showEng)  minW+=190;
  if(showQS)   minW+=190;
  if(showSite) minW+=190;

  return(
    <div>
      {/* ── Search bar + field filter ── */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {/* Field filter chips */}
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {FIELD_OPTS.map(opt=>{
            const active=searchField===opt.k;
            const chipColor=opt.k==="description"?"var(--accent)":opt.k==="lineItemId"?"var(--plan)":opt.k==="label"?"var(--qs)":"var(--muted)";
            return(
              <button key={opt.k} onClick={()=>setSearchField(opt.k)}
                style={{padding:"4px 11px",fontSize:11,fontWeight:600,borderRadius:20,border:`1px solid ${active?chipColor:"var(--border)"}`,
                  background:active?chipColor+"20":"transparent",color:active?chipColor:"var(--muted)",
                  cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>
                {opt.label}
              </button>
            );
          })}
        </div>
        {/* Search input */}
        <div style={{position:"relative",flex:1,minWidth:180,maxWidth:360}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",fontSize:13,pointerEvents:"none"}}>⌕</span>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder={placeholders[searchField]}
            style={{width:"100%",paddingLeft:30,paddingRight:search?28:10,boxSizing:"border-box"}}
          />
          {search&&(
            <button onClick={()=>setSearch("")}
              style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>
              ✕
            </button>
          )}
        </div>
        {/* Match count */}
        {q&&(
          <span style={{fontSize:11,color:"var(--muted)",whiteSpace:"nowrap",fontFamily:"monospace",flexShrink:0}}>
            {filteredItems.length}/{items.length} items
          </span>
        )}
      </div>
      <div style={{overflowX:"auto"}}>
      <datalist id="uopts">{UNIT_LIST.map(u=><option key={u} value={u}/>)}</datalist>
      <table style={{tableLayout:"auto",width:"100%",minWidth:minW}}>
        <colgroup>
          <col style={{width:42}}/>
          {hasLineItemId&&<col style={{width:110}}/>}
          {hasLabel&&<col style={{width:100}}/>}
          <col/>{/* description — flex */}
          {hasUnit&&<col style={{width:80}}/>}
          <col style={{width:100}}/>
          {showEng&&<><col style={{width:95}}/><col style={{width:90}}/></>}
          {showQS &&<><col style={{width:90}}/><col style={{width:90}}/></>}
          {showSite&&<><col style={{width:95}}/><col style={{width:90}}/></>}
          {canEditPlan&&<col style={{width:36}}/>}
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            {hasLineItemId&&<th>Line Item ID</th>}
            {hasLabel&&<th>Label</th>}
            <th>Item Description</th>
            {hasUnit&&<th style={{textAlign:"center"}}>Unit</th>}
            <th style={{textAlign:"center",color:"var(--plan)"}}>BOQ Qty</th>
            {showEng&&<th style={{textAlign:"center",color:"var(--eng)"}}>Eng. Qty</th>}
            {showEng&&<th style={{textAlign:"center"}}>Eng↔Plan</th>}
            {showQS &&<th style={{textAlign:"center",color:"var(--qs)"}}>QS Qty</th>}
            {showQS &&<th style={{textAlign:"center"}}>QS↔Eng</th>}
            {showSite&&<th style={{textAlign:"center",color:"var(--site)"}}>Site Qty</th>}
            {showSite&&<th style={{textAlign:"center"}}>Site↔Eng</th>}
            {canEditPlan&&<th/>}
          </tr>
        </thead>
        <tbody>
          {filteredItems.length===0&&<tr><td colSpan={14} style={{textAlign:"center",padding:"40px 0",color:"var(--muted)"}}>{q?`No items match "${search}"`:'No items'}</td></tr>}
          {filteredItems.map((item,idx)=>{
            const engDiff=(item.engQty||0)-(item.planQty||0);
            const qsDiff =(item.qsQty||0) -(item.engQty||0);
            const siteDiff=(item.siteQty||0)-(item.engQty||0);
            const isLast=idx===filteredItems.length-1;
            return(
              <tr key={item.id} ref={isLast?lastRowRef:null} style={{verticalAlign:"top"}}>
                <td style={{color:"var(--muted)",paddingTop:12,fontSize:12}}>{idx+1}</td>

                {/* Line Item ID — only if any item has it */}
                {hasLineItemId&&(
                  <td style={{paddingTop:10}}>
                    {canEditPlan
                      ?<input value={item.lineItemId||""} onChange={e=>onUpdateItem(item.id,"lineItemId",e.target.value)} style={{fontSize:12}}/>
                      :<span style={{fontSize:12,color:"var(--muted)"}}>{item.lineItemId||"—"}</span>}
                  </td>
                )}

                {/* Label — only if any item has it */}
                {hasLabel&&(
                  <td style={{paddingTop:10}}>
                    {canEditPlan
                      ?<input value={item.label||""} onChange={e=>onUpdateItem(item.id,"label",e.target.value)} style={{fontSize:12}}/>
                      :<span style={{fontSize:12,color:"var(--muted)"}}>{item.label||"—"}</span>}
                  </td>
                )}

                {/* Description */}
                <td style={{paddingTop:10,whiteSpace:"normal"}}>
                  <DescCell text={item.name} editable={canEditPlan} onChange={v=>onUpdateItem(item.id,"name",v)}/>
                </td>

                {/* Unit — only if any item has unit data */}
                {hasUnit&&(
                  <td style={{textAlign:"center",paddingTop:10}}>
                    {canEditPlan
                      ?<input value={item.unit||""} onChange={e=>onUpdateItem(item.id,"unit",e.target.value)} list="uopts" style={{textAlign:"center"}}/>
                      :<span>{item.unit||"—"}</span>}
                  </td>
                )}

                {/* BOQ Qty — locked after submit */}
                <td style={{textAlign:"center",paddingTop:10}}>
                  {canEditPlan
                    ?<input type="number" value={item.planQty||0} min={0} onChange={e=>onUpdateItem(item.id,"planQty",pn(e.target.value))} style={{textAlign:"center"}}/>
                    :<span style={{fontWeight:600,color:"var(--plan)"}}>{item.planQty||0}</span>}
                </td>

                {/* Eng Qty */}
                {showEng&&(
                  <td style={{textAlign:"center",paddingTop:10}}>
                    {editField==="engQty"
                      ?<input type="number" value={item.engQty||0} min={0} onChange={e=>onUpdateItem(item.id,"engQty",pn(e.target.value))} style={{textAlign:"center",borderColor:"var(--eng)",background:"#0a2a1a"}}/>
                      :<span style={{fontWeight:600,color:"var(--eng)"}}>{item.engQty||0}</span>}
                  </td>
                )}
                {showEng&&<td style={{textAlign:"center",paddingTop:12}}><DiffBadge diff={engDiff} show={item.engQty>0}/></td>}

                {/* QS Qty */}
                {showQS&&(
                  <td style={{textAlign:"center",paddingTop:10}}>
                    {editField==="qsQty"
                      ?<input type="number" value={item.qsQty||0} min={0} onChange={e=>onUpdateItem(item.id,"qsQty",pn(e.target.value))} style={{textAlign:"center",borderColor:"var(--qs)",background:"#2a1a00"}}/>
                      :<span style={{fontWeight:600,color:"var(--qs)"}}>{item.qsQty||0}</span>}
                  </td>
                )}
                {showQS&&<td style={{textAlign:"center",paddingTop:12}}><DiffBadge diff={qsDiff} show={item.qsQty>0}/></td>}

                {/* Site Qty — compared against Engineering */}
                {showSite&&(
                  <td style={{textAlign:"center",paddingTop:10}}>
                    {editField==="siteQty"
                      ?<input type="number" value={item.siteQty||0} min={0} onChange={e=>onUpdateItem(item.id,"siteQty",pn(e.target.value))} style={{textAlign:"center",borderColor:"var(--site)",background:"#2a0010"}}/>
                      :<span style={{fontWeight:600,color:"var(--site)"}}>{item.siteQty||0}</span>}
                  </td>
                )}
                {showSite&&<td style={{textAlign:"center",paddingTop:12}}><DiffBadge diff={siteDiff} show={item.siteQty>0}/></td>}

                {canEditPlan&&<td style={{paddingTop:12}}><button onClick={()=>onUpdateItem(item.id,"__delete__",null)} style={{background:"none",color:"var(--red)",fontSize:15,border:"none",cursor:"pointer"}}>🗑</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ─── Totals Summary Bar ───────────────────────────────────────────────────────
function TotalBar({items, showEng, showQS, showSite}){
  const pt=items.reduce((s,i)=>s+(i.planQty||0),0);
  const et=items.reduce((s,i)=>s+(i.engQty||0),0);
  const qt=items.reduce((s,i)=>s+(i.qsQty||0),0);
  const st=items.reduce((s,i)=>s+(i.siteQty||0),0);
  const ed=et-pt, qd=qt-et, sd=st-et;
  const dc=d=>d===0?"var(--green)":d>0?"var(--amber)":"var(--red)";
  return(
    <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center",paddingTop:14,marginTop:14,borderTop:"1px solid var(--border)"}}>
      <Chip label="Planning Total" value={pt} color="var(--plan)"/>
      {showEng&&<><Chip label="Engineering Total" value={et} color="var(--eng)"/><Chip label="Eng↔Plan" value={(ed>0?"+":"")+ed} color={dc(ed)}/></>}
      {showQS&&<><Chip label="QS Total" value={qt} color="var(--qs)"/><Chip label="QS↔Eng" value={(qd>0?"+":"")+qd} color={dc(qd)}/></>}
      {showSite&&<><Chip label="Site Total" value={st} color="var(--site)"/><Chip label="Site↔Eng" value={(sd>0?"+":"")+sd} color={dc(sd)}/></>}
    </div>
  );
}
function Chip({label,value,color}){
  return <div style={{fontSize:13}}><span style={{color:"var(--muted)"}}>{label}: </span><strong style={{color}}>{typeof value==="number"?value.toLocaleString():value}</strong></div>;
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
function ActivityLog({log}){
  return(
    <Card style={{marginTop:16}}>
      <h3 style={{fontFamily:"Sora",fontSize:16,marginBottom:16}}>📜 Activity Log</h3>
      {!(log||[]).length&&<div style={{color:"var(--muted)",fontSize:13}}>No activity yet</div>}
      {(log||[]).slice().reverse().map((e,i)=>(
        <div key={i} style={{display:"flex",gap:12,marginBottom:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)",marginTop:5,flexShrink:0}}/>
          <div><div style={{fontSize:13}}>{e.action}</div><div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{e.user} · {new Date(e.time).toLocaleString()}</div></div>
        </div>
      ))}
    </Card>
  );
}

// ─── Sheet Tabs ───────────────────────────────────────────────────────────────
// Shown inside BOQ detail views when the BOQ has multiple sheets.
// If only one sheet (or no sheets), renders nothing — UI looks identical to before.
function SheetTabs({sheets, activeSheet, setActiveSheet, roleColor}){
  if(!sheets||sheets.length<=1) return null;
  return(
    <div style={{display:"flex",gap:2,borderBottom:"1px solid var(--border)",marginBottom:16,overflowX:"auto"}}>
      {sheets.map(s=>{
        const isAct=activeSheet===s.sheetName;
        return(
          <button key={s.sheetName} onClick={()=>setActiveSheet(s.sheetName)}
            style={{padding:"8px 16px",border:"none",background:"transparent",
              color:isAct?(roleColor||"var(--accent)"):"var(--muted)",
              fontSize:12,fontWeight:isAct?700:500,cursor:"pointer",whiteSpace:"nowrap",
              borderBottom:isAct?`2px solid ${roleColor||"var(--accent)"}`:  "2px solid transparent",
              transition:"all .15s",flexShrink:0}}>
            📋 {s.sheetName}
            <span style={{marginLeft:6,fontSize:10,background:"var(--s2)",border:"1px solid var(--border)",
              borderRadius:10,padding:"1px 7px",fontFamily:"monospace",color:"var(--muted)"}}>
              {s.items.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────
function AlertBanner({icon,title,desc,color,bg}){
  return(
    <div style={{marginBottom:14,padding:"12px 16px",background:bg,border:`1px solid ${color}`,borderRadius:10,display:"flex",gap:12,alignItems:"flex-start"}}>
      <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
      <div><div style={{fontWeight:600,color}}>{title}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{desc}</div></div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,users}){
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const go=()=>{
    if(loading)return;
    setLoading(true);setErr("");
    setTimeout(()=>{
      const u=users.find(u=>u.email===email.trim().toLowerCase()&&u.password===pw&&u.active!==false);
      if(u){setLoading(false);onLogin(u);}else{setErr("Invalid credentials or account disabled.");setLoading(false);}
    },400);
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 30% 50%, #1e293b 0%, #0b0f1a 60%)"}}>
      <div className="fade-in" style={{width:"100%",maxWidth:460,padding:20}}>
        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{width:64,height:64,borderRadius:18,background:"linear-gradient(135deg,#8b5cf6,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 14px",boxShadow:"0 0 30px #8b5cf640"}}>📋</div>
          <h1 style={{fontFamily:"Sora",fontSize:26,fontWeight:800}}>ELIZA</h1>
          <p style={{color:"var(--muted)",fontSize:13,marginTop:5}}></p>
        </div>
        <Card style={{padding:28}}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div><label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:5}}>EMAIL</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@email.com"/></div>
            <div><label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:5}}>PASSWORD</label><input value={pw} onChange={e=>setPw(e.target.value)} type="password" placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&go()}/></div>
            {err&&<div style={{color:"var(--red)",fontSize:12,textAlign:"center"}}>{err}</div>}
            <Btn onClick={go} disabled={loading} style={{width:"100%",padding:12,marginTop:2}}>{loading?"Signing in…":"Sign In →"}</Btn>
          </div>
          <div style={{marginTop:18,padding:14,background:"var(--s2)",borderRadius:10}}>
            <div style={{fontSize:11,color:"var(--muted)",fontWeight:600,marginBottom:8}}></div>
            {users.filter(u=>u.active!==false&&u.role!=="vendor").map(u=>(
              <div key={u.id} onClick={()=>onLogin(u)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:6,cursor:"pointer",marginBottom:3}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{color:ROLE_META[u.role]?.color,fontWeight:600}}>{ROLE_META[u.role]?.icon} {ROLE_META[u.role]?.label}</span>
                <span style={{color:"var(--muted)",fontSize:12}}>{u.email} / {u.password}</span>
              </div>
            ))}
            <div style={{borderTop:"1px solid var(--border)",margin:"8px 0",paddingTop:8}}>
              <div style={{fontSize:10,color:"var(--s3)",fontWeight:600,marginBottom:6}}>🏭 VENDOR LOGINS (for quotation testing)</div>
              {users.filter(u=>u.role==="vendor"&&u.active!==false).map(u=>(
                <div key={u.id} onClick={()=>onLogin(u)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:6,cursor:"pointer",marginBottom:3}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{color:"#06b6d4",fontWeight:600}}>🏭 {u.name}</span>
                  <span style={{color:"var(--muted)",fontSize:12}}>{u.email} / {u.password}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({user,page,setPage,onLogout,boqs,notifications,onClearNotif}){
  const role=ROLE_META[user.role]||{label:"User",color:"#94a3b8",icon:"👤",level:0};
  const engPending=boqs.filter(b=>b.status==="with_engineering").length;
  const qsPending=boqs.filter(b=>b.status==="with_qs").length;
  const sitePending=boqs.filter(b=>b.status==="with_site").length;

  const allNavMap={
    planning:   [{id:"dashboard",icon:"🏠",label:"Dashboard"},{id:"create",icon:"➕",label:"New BOQ"},{id:"my-boqs",icon:"📋",label:"My BOQs"},{id:"search",icon:"🔍",label:"Search"},{id:"reports",icon:"📊",label:"Reports"}],
    engineering:[{id:"dashboard",icon:"🏠",label:"Dashboard"},{id:"pending",icon:"📥",label:"Pending Review",badge:engPending},{id:"my-boqs",icon:"📋",label:"All BOQs"},{id:"search",icon:"🔍",label:"Search"},{id:"reports",icon:"📊",label:"Reports"}],
    qs:         [{id:"dashboard",icon:"🏠",label:"Dashboard"},{id:"pending",icon:"📥",label:"Pending Review",badge:qsPending},{id:"my-boqs",icon:"📋",label:"All BOQs"},{id:"search",icon:"🔍",label:"Search"},{id:"reports",icon:"📊",label:"Reports"}],
    site:       [{id:"dashboard",icon:"🏠",label:"Dashboard"},{id:"pending",icon:"📥",label:"Pending Review",badge:sitePending},{id:"my-boqs",icon:"📋",label:"All BOQs"},{id:"search",icon:"🔍",label:"Search"},{id:"reports",icon:"📊",label:"Reports"}],
    procurement:[{id:"dashboard",icon:"🏠",label:"Dashboard"},{id:"quotations",icon:"📝",label:"Quotations"}],
    vendor:     [{id:"quotes",icon:"📋",label:"My Quotations"}],
  };
  const allNav=allNavMap[user.role]||[];
  const nav=allNav.filter(n=>!user.pages||user.pages.includes(n.id));

  return(
    <div style={{width:224,background:"var(--surface)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
      <div style={{padding:"18px 16px 14px",borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#8b5cf6,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📋</div>
          <div><div style={{fontFamily:"Sora",fontWeight:700,fontSize:14}}>ELIZA</div><div style={{fontSize:10,color:"var(--muted)"}}></div></div>
        </div>
      </div>
      <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)"}}>
        <div style={{background:`${role.color}18`,border:`1px solid ${role.color}30`,borderRadius:8,padding:"8px 11px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>{role.icon}</span>
          <div><div style={{fontSize:11,fontWeight:600,color:role.color}}>{role.label}</div></div>
        </div>
      </div>
      <nav style={{flex:1,padding:"8px 6px"}}>
        {nav.map(item=>(
          <button key={item.id} onClick={()=>setPage(item.id)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 11px",borderRadius:9,marginBottom:2,fontSize:13,fontWeight:500,background:page===item.id?`${role.color}20`:"transparent",color:page===item.id?role.color:"var(--muted)",border:page===item.id?`1px solid ${role.color}30`:"1px solid transparent"}}>
            <span>{item.icon} {item.label}</span>
            {item.badge>0&&<span style={{background:"var(--accent)",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700}}>{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div style={{padding:"12px 14px",borderTop:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`${role.color}28`,border:`1px solid ${role.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:role.color}}>{user.avatar||mkInitials(user.name)}</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div><div style={{fontSize:10,color:"var(--muted)"}}>{user.email}</div></div>
          <NotifBell notifications={notifications} onClear={onClearNotif}/>
        </div>
        {/* Theme toggle */}
        <Btn variant="ghost" onClick={onLogout} style={{width:"100%",fontSize:12,padding:6}}>Sign Out</Btn>
      </div>
    </div>
  );
}

// ─── Generic Dashboard ────────────────────────────────────────────────────────
function Dashboard({user,boqs,setPage,notifications,pendingStatus,pendingLabel}){
  const role=ROLE_META[user.role];
  const pending=boqs.filter(b=>b.status===pendingStatus).length;
  const done=boqs.filter(b=>b.status==="completed").length;
  const received=boqs.filter(b=>b.status!=="draft").length;
  const unread=notifications.filter(n=>!n.read);

  return(
    <div className="fade-in">
      <div style={{marginBottom:22}}><h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>{role.icon} {role.label} Dashboard</h1><p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>{pendingLabel}</p></div>

      {unread.length>0&&(
        <div style={{marginBottom:18,padding:"13px 16px",background:"#1e1a00",border:"1px solid var(--amber)",borderRadius:12,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>🔔</span>
          <div style={{flex:1}}><div style={{fontWeight:600,color:"var(--amber)"}}>{unread.length} unread notification{unread.length>1?"s":""}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:2,lineHeight:1.5}}>{unread[unread.length-1]?.message}</div></div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        <StatCard icon="📋" label="Total Received" value={user.role==="planning"?boqs.filter(b=>b.createdBy===user.id).length:boqs.length} color={role.color}/>
        <StatCard icon="⏳" label="Pending Review" value={pending} color="var(--accent)"/>
        <StatCard icon="✅" label="Completed" value={done} color="var(--green)"/>
      </div>

      {pending>0&&(
        <Card style={{borderColor:`${role.color}40`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><h3 style={{fontFamily:"Sora",fontSize:16}}>⚡ Action Required</h3><p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>{pending} BOQ{pending>1?"s":""} awaiting your review</p></div>
            <Btn variant={user.role==="site"?"rose":user.role==="qs"?"amber":"success"} onClick={()=>setPage("pending")}>Review Now →</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Planning: Dashboard ──────────────────────────────────────────────────────
function PlanningDash({boqs,user,setPage,notifications}){
  const mine=boqs.filter(b=>b.createdBy===user.id);
  const unread=notifications.filter(n=>!n.read);
  return(
    <div className="fade-in">
      <div style={{marginBottom:22}}><h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>📐 Planning Dashboard</h1><p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>Create and manage Bills of Quantities</p></div>
      {unread.length>0&&(
        <div style={{marginBottom:18,padding:"13px 16px",background:"#1e1a00",border:"1px solid var(--amber)",borderRadius:12,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>🔔</span>
          <div style={{flex:1}}><div style={{fontWeight:600,color:"var(--amber)"}}>{unread.length} unread notification{unread.length>1?"s":""}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:2,lineHeight:1.5}}>{unread[unread.length-1]?.message}</div></div>
          <Btn small variant="amber" onClick={()=>setPage("my-boqs")}>View BOQs →</Btn>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        <StatCard icon="📋" label="Total BOQs" value={mine.length} color="var(--plan)"/>
        <StatCard icon="📝" label="Drafts" value={mine.filter(b=>b.status==="draft").length} color="var(--muted)"/>
        <StatCard icon="✅" label="Completed" value={mine.filter(b=>b.status==="completed").length} color="var(--green)"/>
      </div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontFamily:"Sora",fontSize:16}}>Recent BOQs</h3>
          <Btn variant="purple" small onClick={()=>setPage("create")}>+ New BOQ</Btn>
        </div>
        {mine.length===0?<div style={{textAlign:"center",padding:"36px 0",color:"var(--muted)"}}><div style={{fontSize:40,marginBottom:10}}>📋</div>No BOQs yet.</div>
          :<table><thead><tr><th>BOQ ID</th><th>Date</th><th>Items</th><th>Status</th></tr></thead>
            <tbody>{mine.slice().reverse().map(b=>(
              <tr key={b.id}><td style={{fontFamily:"monospace",fontSize:12}}>{b.boqId}</td><td style={{color:"var(--muted)"}}>{new Date(b.createdAt).toLocaleDateString()}</td><td>{b.items.length}</td><td><Badge status={b.status}/></td></tr>
            ))}</tbody></table>}
      </Card>
    </div>
  );
}

// ─── BOQ Creator ──────────────────────────────────────────────────────────────

// ─── Export BOQ to Excel per stage ────────────────────────────────────────────
function exportBoqExcel(boq, stage){
  // stage: "planning" | "engineering" | "qs" | "site" | "full"
  const stageMap={
    planning: {label:"BOQ Qty",   cols:["planQty"],                    filename:"PLANNING"},
    engineering:{label:"Eng Qty", cols:["planQty","engQty"],           filename:"ENGINEERING"},
    qs:        {label:"QS Qty",   cols:["planQty","engQty","qsQty"],   filename:"QS"},
    site:      {label:"Site Qty", cols:["planQty","engQty","qsQty","siteQty"], filename:"SITE"},
    full:      {label:"All",      cols:["planQty","engQty","qsQty","siteQty"], filename:"FULL"},
  };
  const s=stageMap[stage]||stageMap.full;
  const colHeaders=["#","Line Item ID","Label","Description","Unit"];
  const colKeys=["#","lineItemId","label","name","unit"];
  const qtyLabels={"planQty":"BOQ Qty","engQty":"Eng Qty","qsQty":"QS Qty","siteQty":"Site Qty"};
  s.cols.forEach(k=>{ colHeaders.push(qtyLabels[k]); colKeys.push(k); });
  // Add diff columns for stages beyond first
  if(s.cols.includes("engQty")){ colHeaders.push("Eng↔BOQ"); colKeys.push("_engDiff"); }
  if(s.cols.includes("qsQty")){  colHeaders.push("QS↔Eng");  colKeys.push("_qsDiff");  }
  if(s.cols.includes("siteQty")){colHeaders.push("Site↔Eng");colKeys.push("_siteDiff");}

  const rows=[colHeaders];
  boq.items.forEach((it,idx)=>{
    const row=[];
    colKeys.forEach(k=>{
      if(k==="#")            row.push(idx+1);
      else if(k==="_engDiff") row.push((it.engQty||0)-(it.planQty||0));
      else if(k==="_qsDiff")  row.push((it.qsQty||0)-(it.engQty||0));
      else if(k==="_siteDiff")row.push((it.siteQty||0)-(it.engQty||0));
      else row.push(it[k]??0);
    });
    rows.push(row);
  });
  // Totals row
  const totRow=["","","","Totals",""];
  s.cols.forEach(k=>totRow.push(boq.items.reduce((s,i)=>s+(i[k]||0),0)));
  if(s.cols.includes("engQty")) totRow.push("");
  if(s.cols.includes("qsQty"))  totRow.push("");
  if(s.cols.includes("siteQty"))totRow.push("");
  rows.push([]);rows.push(totRow);

  const csv=rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download=`${boq.boqId}-${s.filename}.csv`;
  a.click();
}

// ─── Time-with-team indicator ─────────────────────────────────────────────────
function TimeWithTeam({boq}){
  const statusToTeam={
    with_engineering:"Engineering Team",
    with_qs:"Quantity Survey Team",
    with_site:"Project Team",
  };
  const teamName=statusToTeam[boq.status];
  if(!teamName) return null;
  // Find the log entry that moved it to the current status
  const log=boq.activityLog||[];
  // The transition event is the latest log entry
  const lastEntry=log[log.length-1];
  if(!lastEntry) return null;
  const since=lastEntry.time;
  const elapsed=Date.now()-since;
  const mins=Math.floor(elapsed/60000);
  const hrs=Math.floor(elapsed/3600000);
  const days=Math.floor(elapsed/86400000);
  let timeStr, urgency="normal";
  if(mins<60)       timeStr=`${mins}m`;
  else if(hrs<24)   timeStr=`${hrs}h ${mins%60}m`;
  else              timeStr=`${days}d ${hrs%24}h`;
  if(days>=7)       urgency="critical";
  else if(days>=3)  urgency="warning";
  const colors={normal:"var(--green)",warning:"var(--amber)",critical:"var(--red)"};
  const bgs={normal:"#052e16",warning:"#2a1a00",critical:"#3f0000"};
  const c=colors[urgency], bg=bgs[urgency];
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:6,background:bg,border:`1px solid ${c}40`,
      borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,color:c}}>
      <span style={{fontSize:14}}>⏱</span>
      <span>With {teamName} for <strong>{timeStr}</strong></span>
    </div>
  );
}

function BOQCreator({onSave,user}){
  // Single active sheet's items (for the old single-sheet path)
  const [items,setItems]=useState([]);
  const [ps,setPs]=useState(null);
  const [pm,setPm]=useState("");
  const [drag,setDrag]=useState(false);
  const [done,setDone]=useState(false);
  const [srcFile,setSrcFile]=useState(null);
  const fref=useRef(null);
  const lastRowRef=useRef(null);
  // ── Multi-sheet state ──────────────────────────────────────────────────────
  const [allSheets,setAllSheets]=useState([]); // [{sheetName, items}]
  const [selSheets,setSelSheets]=useState(new Set()); // selected sheet names
  const [activeSheet,setActiveSheet]=useState(null); // currently viewed sheet name
  const isMulti=allSheets.length>1;

  const addRow=()=>{
    setItems(p=>[...p,{id:Date.now(),lineItemId:"",label:"",name:"",unit:"",planQty:0,engQty:0,qsQty:0,siteQty:0}]);
    // Scroll to the new row after React re-renders
    setTimeout(()=>lastRowRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),50);
  };

  const upd=(id,f,v)=>{
    if(f==="__delete__"){setItems(p=>p.filter(i=>i.id!==id));return;}
    setItems(p=>p.map(i=>i.id===id?{...i,[f]:v}:i));
  };

  const processFile=file=>{
    if(!file)return;
    const n=file.name.toLowerCase();
    if(!n.endsWith(".xlsx")&&!n.endsWith(".xls")&&!n.endsWith(".csv")){setPs("error");setPm("Only .xlsx, .xls or .csv supported.");return;}
    setPs("parsing");setPm(`Reading "${file.name}"…`);
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const arrayBuf=e.target.result;
        const wb=XLSX.read(new Uint8Array(arrayBuf),{type:"array",cellText:true,cellDates:true});
        const sheets=parseAllSheets(wb);
        const validSheets=sheets.filter(s=>s.items.length>0);
        if(validSheets.length===0){
          const rs=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:"",raw:false});
          const prev=rs.slice(0,4).map(r=>r.filter(c=>String(c).trim()).slice(0,5).join("|")).filter(Boolean).join(" → ");
          setPs("error");setPm(`No items found in any sheet. Preview: [${prev||"empty"}]`);return;
        }
        const bytes=new Uint8Array(arrayBuf);
        let binary="";
        for(let i=0;i<bytes.byteLength;i++)binary+=String.fromCharCode(bytes[i]);
        const b64=btoa(binary);
        const mime=n.endsWith(".csv")?"text/csv":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        setSrcFile({name:file.name,size:file.size,dataUrl:`data:${mime};base64,${b64}`,type:mime});

        if(validSheets.length===1){
          // Single-sheet path — same as before
          const parsed=validSheets[0].items;
          const detected=[];
          if(parsed.some(i=>i.lineItemId)) detected.push("Line Item ID");
          if(parsed.some(i=>i.label))      detected.push("Label");
          detected.push("Description");
          if(parsed.some(i=>i.unit))       detected.push("Unit");
          if(parsed.some(i=>i.planQty>0))  detected.push("Qty");
          const missing=["Line Item ID","Label","Unit"].filter(f=>!detected.includes(f));
          const note=missing.length?` (missing: ${missing.join(", ")} — columns hidden)`:"";
          setItems(parsed);
          setAllSheets([]);setSelSheets(new Set());setActiveSheet(null);
          setPs("done");setPm(`✅ Extracted ${parsed.length} items from "${validSheets[0].sheetName}" · Detected: ${detected.join(", ")}${note}`);
        } else {
          // Multi-sheet path — let user select sheets
          setAllSheets(validSheets);
          const allNames=new Set(validSheets.map(s=>s.sheetName));
          setSelSheets(allNames); // default: all selected
          setActiveSheet(validSheets[0].sheetName);
          setItems([]); // items come from sheet selection
          setPs("sheets");
          setPm(`📋 Found ${validSheets.length} sheets with data — select which to include below`);
        }
      }catch(err){setPs("error");setPm(`Error: ${err.message}`);}
    };
    reader.onerror=()=>{setPs("error");setPm("Could not read file.");};
    reader.readAsArrayBuffer(file);
  };

  // Active sheet's items for preview
  const activeSheetItems=activeSheet
    ?allSheets.find(s=>s.sheetName===activeSheet)?.items||[]
    :items;

  // All selected sheets' items merged (for submit)
  const mergedItems=isMulti
    ?allSheets.filter(s=>selSheets.has(s.sheetName)).flatMap(s=>s.items)
    :items;

  const toggleSheet=name=>{
    setSelSheets(p=>{
      const n=new Set(p);
      if(n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const submit=asDraft=>{
    const defaultAtts=srcFile?[{id:Date.now(),name:srcFile.name,size:srcFile.size,type:srcFile.type,dataUrl:srcFile.dataUrl,uploadedBy:user.name,uploadedAt:Date.now(),note:"Source BOQ sheet (auto-attached)"}]:[];
    let finalSheets, flatItems;
    if(isMulti){
      // Keep each sheet separate; also build flat items for compat (counts, reports)
      finalSheets=allSheets
        .filter(s=>selSheets.has(s.sheetName))
        .map(s=>({sheetName:s.sheetName,items:s.items.filter(i=>i.name)}));
      flatItems=finalSheets.flatMap(s=>s.items);
    } else {
      finalSheets=null; // no sheet structure for manual/single-sheet
      flatItems=items.filter(i=>i.name);
    }
    const boq={
      id:Date.now(),boqId:genId(),createdBy:user.id,createdAt:Date.now(),
      status:asDraft?"draft":"with_engineering",
      sheets:finalSheets,       // null for single-sheet; array for multi-sheet
      items:flatItems,           // always flat — used for counts, reports, compat
      attachments:defaultAtts,
      activityLog:[{time:Date.now(),user:user.name,action:asDraft?"Saved as Draft":"Submitted to Engineering Team"}],
    };
    onSave(boq);setDone(true);
  };

  if(done) return(<div className="fade-in" style={{textAlign:"center",padding:"80px 0"}}><div style={{fontSize:60,marginBottom:14}}>✅</div><h2 style={{fontFamily:"Sora",fontSize:22,marginBottom:8}}>Submitted to Engineering!</h2><p style={{color:"var(--muted)"}}>Engineering → QS → Project Team will review in sequence.</p></div>);

  const ub=drag?"#052e16":"#1a2235";
  const uc=drag?"var(--green)":ps==="error"?"var(--red)":"var(--accent)";

  return(
    <div className="fade-in">
      <div style={{marginBottom:20}}><h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>Create New BOQ</h1><p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>Upload Excel/CSV or add items manually</p></div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);processFile(e.dataTransfer.files[0]);}} onClick={()=>fref.current?.click()}
        style={{border:`2px dashed ${uc}`,borderRadius:14,background:ub,padding:"20px",textAlign:"center",cursor:"pointer",marginBottom:12,transition:"all .2s"}}>
        <input ref={fref} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
        {ps==="parsing"?<><div style={{fontSize:28,marginBottom:6}}>⏳</div><div style={{fontWeight:600}}>Parsing…</div></>
          :<><div style={{fontSize:32,marginBottom:6}}>{drag?"📂":"⬆️"}</div>
            <div style={{fontWeight:600,marginBottom:4}}>{drag?"Drop to upload":"Drag & drop Excel / CSV"}</div>
            <div style={{color:"var(--muted)",fontSize:12,marginBottom:10}}>Auto-detects: Line Item ID · Label · Description · Unit · Qty</div>
            <div style={{display:"inline-block",background:"var(--accent)",color:"#fff",padding:"6px 18px",borderRadius:8,fontSize:13,fontWeight:600}}>Browse Files</div></>}
      </div>
      {pm&&<div style={{marginBottom:12,padding:"8px 14px",borderRadius:9,fontSize:13,background:ps==="done"?"#052e16":ps==="error"?"#3f0000":"var(--s2)",color:ps==="done"?"var(--green)":ps==="error"?"var(--red)":"var(--muted)",border:`1px solid ${ps==="done"?"#10b98140":ps==="error"?"#ef444440":"var(--border)"}`}}>{pm}</div>}
      {/* ── Multi-sheet selector ── */}
      {isMulti&&(
        <Card style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h3 style={{fontFamily:"Sora",fontSize:16}}>📑 Sheets Found</h3>
            <div style={{display:"flex",gap:6}}>
              <Btn variant="ghost" small onClick={()=>setSelSheets(new Set(allSheets.map(s=>s.sheetName)))}>Select All</Btn>
              <Btn variant="ghost" small onClick={()=>setSelSheets(new Set())}>Deselect All</Btn>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
            {allSheets.map(s=>{
              const sel=selSheets.has(s.sheetName);
              const active=activeSheet===s.sheetName;
              return(
                <div key={s.sheetName} style={{border:`1px solid ${active?"var(--accent)":sel?"var(--green)":"var(--border)"}`,borderRadius:10,padding:"8px 14px",background:active?"#1e3a5f":sel?"#052e16":"var(--s2)",cursor:"pointer",transition:"all .15s",minWidth:160}}
                  onClick={()=>setActiveSheet(s.sheetName)}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:13,color:active?"var(--accent)":sel?"var(--green)":"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:160}}>{s.sheetName}</span>
                    <button onClick={e=>{e.stopPropagation();toggleSheet(s.sheetName);}}
                      style={{flexShrink:0,width:20,height:20,borderRadius:4,border:`1px solid ${sel?"var(--green)":"var(--border)"}`,background:sel?"var(--green)":"transparent",color:sel?"#fff":"var(--muted)",cursor:"pointer",fontSize:12,lineHeight:"18px",textAlign:"center",padding:0}}>
                      {sel?"✓":""}
                    </button>
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{s.items.length} items</div>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:12,color:"var(--muted)",padding:"6px 12px",background:"var(--s3)",borderRadius:8,border:"1px solid var(--border)"}}>
            📌 Click a sheet card to preview its items below · Use the checkbox to include/exclude from submission · <strong style={{color:"var(--text)"}}>{selSheets.size} of {allSheets.length} sheets selected</strong>
          </div>
        </Card>
      )}

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontFamily:"Sora",fontSize:16}}>
            📦 {isMulti?`Sheet: "${activeSheet||""}"`:"BOQ Items"}
          </h3>
          <div style={{display:"flex",gap:8}}>
            {!isMulti&&items.length>0&&<Btn variant="ghost" small onClick={()=>{setItems([]);setAllSheets([]);setPs(null);setPm("");}}>Clear</Btn>}
            {!isMulti&&<Btn variant="outline" small onClick={addRow}>+ Add Row</Btn>}
          </div>
        </div>
        <ItemsTable items={isMulti?activeSheetItems:items} role="planning" editField={isMulti?null:"planQty"} onUpdateItem={isMulti?()=>{}:upd} stagesVisible={{eng:false,qs:false,site:false}} lastRowRef={lastRowRef}/>
        {isMulti&&(
          <div style={{marginTop:10,padding:"6px 12px",background:"var(--s3)",borderRadius:8,fontSize:12,color:"var(--muted)",border:"1px solid var(--border)"}}>
            👁 Preview only — all selected sheets will be kept as separate tabs inside one BOQ
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,paddingTop:14,borderTop:"1px solid var(--border)"}}>
          <div style={{color:"var(--muted)",fontSize:13}}>Items: <strong style={{color:"var(--text)"}}>{(isMulti?mergedItems:items).filter(i=>i.name).length}</strong> · Total Qty: <strong style={{color:"var(--text)"}}>{(isMulti?mergedItems:items).reduce((s,i)=>s+(i.planQty||0),0).toLocaleString()}</strong>{isMulti&&selSheets.size>1&&<> · <strong style={{color:"var(--accent)"}}>{selSheets.size} sheets</strong> → 1 BOQ</>}</div>
          <div style={{display:"flex",gap:10}}>
            <Btn variant="ghost" onClick={()=>submit(true)}>Save Draft</Btn>
            <Btn variant="success" onClick={()=>submit(false)} disabled={(isMulti?mergedItems:items).filter(i=>i.name).length===0}>Submit to Engineering →</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── BOQ List ─────────────────────────────────────────────────────────────────
function BOQList({boqs,user,onSelect,filterStatus,users=[]}){
  const [search,setSearch]=useState("");
  let list=filterStatus?boqs.filter(b=>b.status===filterStatus):boqs;
  if(user.role==="planning") list=list.filter(b=>b.createdBy===user.id);
  if(search) list=list.filter(b=>b.boqId.toLowerCase().includes(search.toLowerCase()));
  return(
    <div className="fade-in">
      <div style={{marginBottom:20}}><h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>{filterStatus?"Pending Review":"All BOQs"}</h1><p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>{list.length} BOQ{list.length!==1?"s":""}</p></div>
      <Card>
        <div style={{marginBottom:14}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search BOQ ID…" style={{width:260}}/></div>
        {list.length===0?<div style={{textAlign:"center",padding:"36px 0",color:"var(--muted)"}}><div style={{fontSize:36,marginBottom:10}}>📭</div>No BOQs found</div>
          :<table><thead><tr><th>BOQ ID</th><th>Created By</th><th>Date</th><th>Items</th><th>Status</th><th>Time with Team</th><th/></tr></thead>
            <tbody>{list.slice().reverse().map(b=>{
              const c=users.find(u=>u.id===b.createdBy);
              return(<tr key={b.id}><td style={{fontFamily:"monospace",fontSize:12}}>{b.boqId}</td><td>{c?.name||"—"}</td><td style={{color:"var(--muted)"}}>{new Date(b.createdAt).toLocaleDateString()}</td><td>{b.items.length}</td><td><Badge status={b.status}/></td><td><TimeWithTeam boq={b}/></td><td><Btn small variant="outline" onClick={()=>onSelect(b)}>View →</Btn></td></tr>);
            })}</tbody></table>}
      </Card>
    </div>
  );
}


// ─── Attachments Panel ────────────────────────────────────────────────────────
function AttachmentsPanel({attachments=[], onAdd, canAdd=false}){
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const ICONS = {
    pdf:"📄", doc:"📝", docx:"📝", xls:"📊", xlsx:"📊", csv:"📊",
    png:"🖼️", jpg:"🖼️", jpeg:"🖼️", gif:"🖼️", webp:"🖼️",
    zip:"🗜️", rar:"🗜️", txt:"📃", ppt:"📊", pptx:"📊",
  };
  const iconFor = name => {
    const ext = (name||"").split(".").pop().toLowerCase();
    return ICONS[ext] || "📎";
  };
  const fmtSize = b => b < 1024 ? `${b}B` : b < 1024*1024 ? `${(b/1024).toFixed(1)}KB` : `${(b/(1024*1024)).toFixed(1)}MB`;

  const readFile = file => {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = e => {
      onAdd({
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: e.target.result,
        uploadedAt: Date.now(),
      });
      setUploading(false);
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  };

  const handleDrop = e => {
    e.preventDefault(); setDragging(false);
    Array.from(e.dataTransfer.files).forEach(readFile);
  };

  const download = att => {
    const a = document.createElement("a");
    a.href = att.dataUrl;
    a.download = att.name;
    a.click();
  };

  return(
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <h3 style={{fontFamily:"Sora",fontSize:14,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:7}}>
          📎 Attachments
          <span style={{fontSize:11,background:"var(--s3)",color:"var(--muted)",border:"1px solid var(--border)",borderRadius:20,padding:"1px 9px",fontWeight:600}}>{attachments.length}</span>
        </h3>
        {canAdd&&(
          <Btn small variant="outline" onClick={()=>fileRef.current?.click()} disabled={uploading}>
            {uploading?"Uploading…":"+ Attach File"}
          </Btn>
        )}
        <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>Array.from(e.target.files).forEach(readFile)}/>
      </div>

      {/* Drop zone — shown only when user can add */}
      {canAdd&&(
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={handleDrop}
          style={{
            border:`2px dashed ${dragging?"var(--accent)":"var(--border)"}`,
            borderRadius:10, padding:"12px 16px",
            background:dragging?"#1e3a5f20":"var(--s2)",
            textAlign:"center", fontSize:12, color:"var(--muted)",
            marginBottom:attachments.length?10:0,
            transition:"all .2s", cursor:"pointer",
          }}
          onClick={()=>fileRef.current?.click()}
        >
          {dragging?"Drop files here":"Drag & drop files here, or click to browse — any file type accepted"}
        </div>
      )}

      {/* File list */}
      {attachments.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {attachments.map(att=>(
            <div key={att.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px"}}>
              <span style={{fontSize:20,flexShrink:0}}>{iconFor(att.name)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.name}</span>
                  {att.note&&<span style={{fontSize:10,color:"#10b981",background:"#10b98118",border:"1px solid #10b98130",borderRadius:4,padding:"1px 6px",whiteSpace:"nowrap",flexShrink:0}}>auto</span>}
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>
                  {fmtSize(att.size)} · {att.uploadedBy?att.uploadedBy+" · ":""}{new Date(att.uploadedAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={()=>download(att)}
                style={{padding:"5px 12px",fontSize:11,fontWeight:600,borderRadius:7,border:"1px solid var(--accent)",background:"transparent",color:"var(--accent)",cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}
              >⬇ Download</button>
            </div>
          ))}
        </div>
      )}

      {attachments.length===0&&!canAdd&&(
        <div style={{textAlign:"center",padding:"16px 0",color:"var(--muted)",fontSize:12,background:"var(--s2)",borderRadius:8,border:"1px solid var(--border)"}}>No attachments</div>
      )}
    </div>
  );
}

// ─── Planning: View BOQ (all stages, all read-only) ───────────────────────────
function PlanningView({boq,onBack,onUpdateBoq}){
  const sheets=boq.sheets||null; // null = legacy flat items
  const [activeSheet,setActiveSheet]=useState(sheets?sheets[0].sheetName:null);

  // Items currently shown in the table
  const visibleItems=sheets
    ? (sheets.find(s=>s.sheetName===activeSheet)?.items||[])
    : boq.items;

  const allItems=boq.items; // always flat — used for stage detection & totals bar
  const hasEng=allItems.some(i=>i.engQty>0);
  const hasQS=allItems.some(i=>i.qsQty>0);
  const hasSite=allItems.some(i=>i.siteQty>0);

  const addAttachment = att => {
    const updated = {...boq, attachments:[...(boq.attachments||[]),att]};
    onUpdateBoq && onUpdateBoq(updated, null);
  };

  return(
    <div className="fade-in">
      {/* ── Top action bar ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,padding:"14px 18px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Btn variant="ghost" small onClick={onBack}>← Back</Btn>
          <div>
            <h1 style={{fontFamily:"Sora",fontSize:20,fontWeight:700}}>{boq.boqId}</h1>
            <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center"}}>
              <Badge status={boq.status}/>
              <span style={{color:"var(--muted)",fontSize:12}}>{new Date(boq.createdAt).toLocaleDateString()}</span>
              {sheets&&sheets.length>1&&<span style={{fontSize:11,color:"var(--plan)",background:"var(--plan)15",border:"1px solid var(--plan)30",borderRadius:20,padding:"2px 8px"}}>{sheets.length} sheets</span>}
            </div>
          </div>
        </div>
        <span style={{fontSize:12,color:"var(--muted)",background:"var(--s2)",padding:"6px 14px",borderRadius:8,border:"1px solid var(--border)"}}>👁 Read-Only — Planning View</span>
      </div>

      {hasEng&&<AlertBanner icon="⚙️" title="Engineering Team has reviewed this BOQ" desc="Engineering quantities shown below. Your planning quantities are permanently locked." color="var(--eng)" bg="#0a2a1a"/>}
      {hasQS&&<AlertBanner icon="📏" title="Quantity Survey Team has reviewed this BOQ" desc="QS quantities and comparisons shown below." color="var(--qs)" bg="#2a1a00"/>}
      {hasSite&&<AlertBanner icon="🏗️" title="Project Team has reviewed this BOQ" desc="Project Team quantities are compared against Engineering quantities below." color="var(--site)" bg="#2a0010"/>}

      <Card style={{marginBottom:16}}>
        <AttachmentsPanel attachments={boq.attachments||[]} onAdd={addAttachment} canAdd={true}/>
      </Card>

      <Card style={{marginBottom:16}}>
        <h3 style={{fontFamily:"Sora",fontSize:16,marginBottom:sheets&&sheets.length>1?12:16}}>📦 BOQ Items (Read Only)</h3>
        <SheetTabs sheets={sheets} activeSheet={activeSheet} setActiveSheet={setActiveSheet} roleColor="var(--plan)"/>
        <ItemsTable items={visibleItems} role="planning" editField={null} onUpdateItem={()=>{}} stagesVisible={{eng:hasEng,qs:hasQS,site:hasSite}}/>
        <TotalBar items={visibleItems} showEng={hasEng} showQS={hasQS} showSite={hasSite}/>
      </Card>
      <ActivityLog log={boq.activityLog}/>
    </div>
  );
}

// ─── Engineering: BOQ Detail ──────────────────────────────────────────────────
function EngineeringView({boq,onUpdate,onBack}){
  const initSheets=boq.sheets
    ? boq.sheets.map(s=>({...s,items:s.items.map(i=>({...i,engQty:i.engQty||0}))}))
    : null;
  const [sheets,setSheets]=useState(initSheets);
  const [activeSheet,setActiveSheet]=useState(initSheets?initSheets[0].sheetName:null);
  // Legacy flat items (when no sheets)
  const [items,setItems]=useState(sheets?[]:boq.items.map(i=>({...i,engQty:i.engQty||0})));
  const [atts,setAtts]=useState(boq.attachments||[]);
  const locked=boq.status!=="with_engineering";

  const visibleItems=sheets
    ? (sheets.find(s=>s.sheetName===activeSheet)?.items||[])
    : items;

  const upd=(id,f,v)=>{
    if(f!=="engQty") return;
    if(sheets){
      setSheets(p=>p.map(s=>s.sheetName===activeSheet
        ? {...s,items:s.items.map(i=>i.id===id?{...i,engQty:v}:i)}
        : s));
    } else {
      setItems(p=>p.map(i=>i.id===id?{...i,engQty:v}:i));
    }
  };

  const flatItems=sheets?sheets.flatMap(s=>s.items):items;

  const submit=()=>onUpdate({
    ...boq,
    sheets:sheets||boq.sheets,
    items:flatItems,
    attachments:atts,
    status:"with_qs",
    activityLog:[...(boq.activityLog||[]),{time:Date.now(),user:"Engineering Team",action:`Engineering quantities submitted — forwarded to Quantity Survey Team${atts.length>(boq.attachments?.length||0)?` (${atts.length} attachment${atts.length!==1?"s":""})`:""}` }]
  },"engineering_submitted");

  return(
    <div className="fade-in">
      {/* ── Top action bar ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,padding:"14px 18px",background:"var(--surface)",border:`1px solid ${locked?"var(--border)":"var(--eng)40"}`,borderRadius:12,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Btn variant="ghost" small onClick={onBack}>← Back</Btn>
          <div>
            <h1 style={{fontFamily:"Sora",fontSize:20,fontWeight:700}}>{boq.boqId}</h1>
            <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
              <Badge status={boq.status}/><TimeWithTeam boq={boq}/>
              {sheets&&sheets.length>1&&<span style={{fontSize:11,color:"var(--eng)",background:"var(--eng)15",border:"1px solid var(--eng)30",borderRadius:20,padding:"2px 8px"}}>{sheets.length} sheets</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <Btn variant="ghost" small onClick={()=>exportBoqExcel({...boq,items:flatItems},"engineering")}>⬇ Download Sheet</Btn>
          {!locked
            ? <Btn variant="success" onClick={submit}>Submit to Quantity Survey →</Btn>
            : <div style={{fontSize:12,color:"var(--green)",background:"#052e16",padding:"6px 14px",borderRadius:8,border:"1px solid #10b98140"}}>🔒 Submitted — with QS Team</div>
          }
        </div>
      </div>

      <Card style={{marginBottom:16}}>
        <AttachmentsPanel attachments={atts} onAdd={att=>setAtts(p=>[...p,att])} canAdd={!locked}/>
      </Card>

      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:sheets&&sheets.length>1?12:14,flexWrap:"wrap",gap:8}}>
          <h3 style={{fontFamily:"Sora",fontSize:16}}>📦 BOQ Items</h3>
          {!locked&&<div style={{fontSize:12,color:"var(--muted)",background:"var(--s2)",padding:"5px 11px",borderRadius:8,border:"1px solid var(--border)"}}>✏️ Enter <strong style={{color:"var(--eng)"}}>Eng. Qty</strong> · Planning Qty is <strong style={{color:"var(--plan)"}}>locked</strong></div>}
        </div>
        <SheetTabs sheets={sheets} activeSheet={activeSheet} setActiveSheet={setActiveSheet} roleColor="var(--eng)"/>
        <ItemsTable items={visibleItems} role="engineering" editField={locked?null:"engQty"} onUpdateItem={upd} stagesVisible={{eng:true,qs:false,site:false}}/>
        <TotalBar items={visibleItems} showEng={true} showQS={false} showSite={false}/>
      </Card>
      <ActivityLog log={boq.activityLog}/>
    </div>
  );
}

// ─── QS: BOQ Detail ───────────────────────────────────────────────────────────
function QSView({boq,onUpdate,onBack}){
  const initSheets=boq.sheets
    ? boq.sheets.map(s=>({...s,items:s.items.map(i=>({...i,qsQty:i.qsQty||0}))}))
    : null;
  const [sheets,setSheets]=useState(initSheets);
  const [activeSheet,setActiveSheet]=useState(initSheets?initSheets[0].sheetName:null);
  const [items,setItems]=useState(sheets?[]:boq.items.map(i=>({...i,qsQty:i.qsQty||0})));
  const [atts,setAtts]=useState(boq.attachments||[]);
  const locked=boq.status!=="with_qs";

  const visibleItems=sheets
    ? (sheets.find(s=>s.sheetName===activeSheet)?.items||[])
    : items;

  const upd=(id,f,v)=>{
    if(f!=="qsQty") return;
    if(sheets){
      setSheets(p=>p.map(s=>s.sheetName===activeSheet
        ? {...s,items:s.items.map(i=>i.id===id?{...i,qsQty:v}:i)}
        : s));
    } else {
      setItems(p=>p.map(i=>i.id===id?{...i,qsQty:v}:i));
    }
  };

  const flatItems=sheets?sheets.flatMap(s=>s.items):items;

  const submit=()=>onUpdate({
    ...boq,
    sheets:sheets||boq.sheets,
    items:flatItems,
    attachments:atts,
    status:"with_site",
    activityLog:[...(boq.activityLog||[]),{time:Date.now(),user:"Quantity Survey Team",action:`QS quantities submitted — forwarded to Project Team`}]
  },"qs_submitted");

  return(
    <div className="fade-in">
      {/* ── Top action bar ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,padding:"14px 18px",background:"var(--surface)",border:`1px solid ${locked?"var(--border)":"var(--qs)40"}`,borderRadius:12,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Btn variant="ghost" small onClick={onBack}>← Back</Btn>
          <div>
            <h1 style={{fontFamily:"Sora",fontSize:20,fontWeight:700}}>{boq.boqId}</h1>
            <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
              <Badge status={boq.status}/><TimeWithTeam boq={boq}/>
              {sheets&&sheets.length>1&&<span style={{fontSize:11,color:"var(--qs)",background:"var(--qs)15",border:"1px solid var(--qs)30",borderRadius:20,padding:"2px 8px"}}>{sheets.length} sheets</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <Btn variant="ghost" small onClick={()=>exportBoqExcel({...boq,items:flatItems},"qs")}>⬇ Download Sheet</Btn>
          {!locked
            ? <Btn variant="amber" onClick={submit}>Submit to Project Team →</Btn>
            : <div style={{fontSize:12,color:"var(--amber)",background:"#2a1a00",padding:"6px 14px",borderRadius:8,border:"1px solid #f59e0b40"}}>🔒 Submitted — with Project Team</div>
          }
        </div>
      </div>

      <AlertBanner icon="⚙️" title="Engineering Quantities are locked" desc="Enter your QS quantities below to compare with Engineering." color="var(--eng)" bg="#0a2a1a"/>

      <Card style={{marginBottom:16}}>
        <AttachmentsPanel attachments={atts} onAdd={att=>setAtts(p=>[...p,att])} canAdd={!locked}/>
      </Card>

      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:sheets&&sheets.length>1?12:14,flexWrap:"wrap",gap:8}}>
          <h3 style={{fontFamily:"Sora",fontSize:16}}>📦 BOQ Items</h3>
          {!locked&&<div style={{fontSize:12,color:"var(--muted)",background:"var(--s2)",padding:"5px 11px",borderRadius:8,border:"1px solid var(--border)"}}>✏️ Enter <strong style={{color:"var(--qs)"}}>QS Qty</strong> — Eng. Qty is <strong style={{color:"var(--eng)"}}>locked</strong></div>}
        </div>
        <SheetTabs sheets={sheets} activeSheet={activeSheet} setActiveSheet={setActiveSheet} roleColor="var(--qs)"/>
        <ItemsTable items={visibleItems} role="qs" editField={locked?null:"qsQty"} onUpdateItem={upd} stagesVisible={{eng:true,qs:true,site:false}}/>
        <TotalBar items={visibleItems} showEng={true} showQS={true} showSite={false}/>
      </Card>
      <ActivityLog log={boq.activityLog}/>
    </div>
  );
}

// ─── Site: BOQ Detail ─────────────────────────────────────────────────────────
function SiteView({boq,onUpdate,onBack,users=[]}){
  const initSheets=boq.sheets
    ? boq.sheets.map(s=>({...s,items:s.items.map(i=>({...i,siteQty:i.siteQty||0}))}))
    : null;
  const [sheets,setSheets]=useState(initSheets);
  const [activeSheet,setActiveSheet]=useState(initSheets?initSheets[0].sheetName:null);
  const [items,setItems]=useState(sheets?[]:boq.items.map(i=>({...i,siteQty:i.siteQty||0})));
  const [atts,setAtts]=useState(boq.attachments||[]);
  const locked=boq.status!=="with_site";

  const visibleItems=sheets
    ? (sheets.find(s=>s.sheetName===activeSheet)?.items||[])
    : items;

  const upd=(id,f,v)=>{
    if(f!=="siteQty") return;
    if(sheets){
      setSheets(p=>p.map(s=>s.sheetName===activeSheet
        ? {...s,items:s.items.map(i=>i.id===id?{...i,siteQty:v}:i)}
        : s));
    } else {
      setItems(p=>p.map(i=>i.id===id?{...i,siteQty:v}:i));
    }
  };

  const flatItems=sheets?sheets.flatMap(s=>s.items):items;

  const submit=()=>onUpdate({
    ...boq,
    sheets:sheets||boq.sheets,
    items:flatItems,
    attachments:atts,
    status:"completed",
    activityLog:[...(boq.activityLog||[]),{time:Date.now(),user:"Project Team",action:"Site quantities submitted — BOQ Completed"}]
  },"site_submitted");

  return(
    <div className="fade-in">
      {/* ── Top action bar ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,padding:"14px 18px",background:"var(--surface)",border:`1px solid ${locked?"var(--border)":"var(--site)40"}`,borderRadius:12,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Btn variant="ghost" small onClick={onBack}>← Back</Btn>
          <div>
            <h1 style={{fontFamily:"Sora",fontSize:20,fontWeight:700}}>{boq.boqId}</h1>
            <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
              <Badge status={boq.status}/><TimeWithTeam boq={boq}/>
              {sheets&&sheets.length>1&&<span style={{fontSize:11,color:"var(--site)",background:"var(--site)15",border:"1px solid var(--site)30",borderRadius:20,padding:"2px 8px"}}>{sheets.length} sheets</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <Btn variant="outline" small onClick={()=>exportBoqExcel({...boq,items:flatItems},"site")}>⬇ Download Sheet</Btn>
          {!locked
            ? <Btn variant="rose" onClick={submit}>✅ Submit & Complete BOQ</Btn>
            : <div style={{fontSize:12,color:"var(--green)",background:"#052e16",padding:"6px 14px",borderRadius:8,border:"1px solid #10b98140"}}>✅ Completed</div>
          }
        </div>
      </div>

      <AlertBanner icon="📐" title="Planning, Engineering and QS Quantities are all locked" desc="You can see all previous quantities below. Enter your Site Qty — it will be compared against Engineering Qty." color="var(--site)" bg="#2a0010"/>

      <Card style={{marginBottom:16}}>
        <AttachmentsPanel attachments={atts} onAdd={att=>setAtts(p=>[...p,att])} canAdd={!locked}/>
      </Card>

      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:sheets&&sheets.length>1?12:14,flexWrap:"wrap",gap:8}}>
          <h3 style={{fontFamily:"Sora",fontSize:16}}>📦 BOQ Items — Full View</h3>
          {!locked&&<div style={{fontSize:12,color:"var(--muted)",background:"var(--s2)",padding:"5px 11px",borderRadius:8,border:"1px solid var(--border)"}}>✏️ Enter <strong style={{color:"var(--site)"}}>Site Qty</strong> — compared vs <strong style={{color:"var(--eng)"}}>Eng. Qty</strong></div>}
          {locked&&<div style={{fontSize:12,color:"var(--site)",background:"#2a0010",padding:"5px 11px",borderRadius:8,border:"1px solid #f43f5e40"}}>✅ Completed</div>}
        </div>
        <SheetTabs sheets={sheets} activeSheet={activeSheet} setActiveSheet={setActiveSheet} roleColor="var(--site)"/>
        <ItemsTable items={visibleItems} role="site" editField={locked?null:"siteQty"} onUpdateItem={upd} stagesVisible={{eng:true,qs:true,site:true}}/>
        <TotalBar items={visibleItems} showEng={true} showQS={true} showSite={true}/>
      </Card>
      <ActivityLog log={boq.activityLog}/>
      {locked&&<div style={{textAlign:"center",padding:12,background:"#052e16",borderRadius:10,border:"1px solid #10b98140",color:"var(--green)",marginTop:14}}>✅ BOQ fully completed by Project Team</div>}
    </div>
  );
}


// ─── Procurement Dashboard ────────────────────────────────────────────────────

// Column indices (0-based) matching the expected Excel format
const PROC_COL = {
  PROJECT_NAME: 2,   // C  - Project Name
  ITEM_NO:      5,   // F  - Item No (SAP Item Master — primary PO line key)
  ITEM_NAME:    6,   // G  - Item Name
  PR_NO:        11,  // L  - PR No
  PR_DATE:      12,  // M  - PR Date
  PR_REQ_DATE:  13,  // N  - PR Required Date
  PR_QTY:       14,  // O  - PR Qty
  OPEN_PR_QTY:  15,  // P  - OPEN PR QUANTITY
  PR_STATUS:    17,  // R  - PR Status
  PO_OWNER:     19,  // T  - PO Owner Name
  PO_NO:        20,  // U  - PO No
  PO_EXP_DEL:   22,  // W  - PO Expected Delivery Date
  PO_DATE:      23,  // X  - PO Date
  PO_STATUS:    32,  // AG - PO Status
  GRPO_NO:      34,  // AI - GRPO No
  GRPO_DATE:    36,  // AK - GRPO Date
  MAT_REC_DATE: 37,  // AL - Material Received Date
  GRPO_CREATION:38,  // AM - GRPO Creation Date
  GRPO_STATUS:  45,  // AT - GRPO Status
  VENDOR_NAME:   4,  //  E - Vendor Name
  GROUP_NAME:    7,  //  H - Group Name
};

function procParseDate(val){
  if(!val)return null;
  // Handle Excel serial number dates (e.g. 46115.00011574074)
  // Excel serial: days since 1899-12-30 (accounting for Lotus 1-2-3 leap year bug)
  const num=typeof val==="number"?val:parseFloat(val);
  if(!isNaN(num)&&num>40000&&num<60000){
    const d=new Date(Math.round((num-25569)*86400*1000));
    return isNaN(d)?null:d;
  }
  const s=String(val).trim();
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){const y=m[3].length===2?2000+parseInt(m[3]):parseInt(m[3]);return new Date(y,parseInt(m[2])-1,parseInt(m[1]));}
  const d=new Date(val);return isNaN(d)?null:d;
}
function procFmtDate(val){
  if(val===null||val===undefined||val==="—"||val==="")return "—";
  const d=procParseDate(val);
  if(!d)return String(val);
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});
}
function procIsOverdue(dateVal,status){
  if(status!=="OPEN")return false;
  const d=procParseDate(dateVal);if(!d)return false;
  const t=new Date();t.setHours(0,0,0,0);return d<t;
}

async function parseProcurementExcel(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
        const prMap=new Map(),poMap=new Map(),grpoMap=new Map();
        const cancelledPosByPR=new Map(),cancelledGrposByPR=new Map();
        const _today=new Date();_today.setHours(0,0,0,0);

        for(let i=1;i<rows.length;i++){
          const r=rows[i];
          if(!r||r.every(c=>c===""||c===null||c===undefined))continue;
          const g=v=>String(r[v]??'').trim();
          const projectName=g(PROC_COL.PROJECT_NAME),itemName=g(PROC_COL.ITEM_NAME),itemNo=g(PROC_COL.ITEM_NO),itemDesc=g(8),prNo=g(PROC_COL.PR_NO),vendorName=g(PROC_COL.VENDOR_NAME),groupName=g(PROC_COL.GROUP_NAME);
          const prQty=+(r[PROC_COL.PR_QTY]||0),openPrQty=+(r[PROC_COL.OPEN_PR_QTY]||0);
          const poLineTot=+(r[28]||0); // PO Line Tot (Qty*Price)
          const poQty=+(r[24]||0),openPoQty=+(r[29]||0),grpoQty=+(r[39]||0),openGrpoQty=+(r[42]||0),price=+(r[25]||0);
          const grpoLineTot=+(r[40]||0);
          // Use raw cell value for date columns so Excel serial numbers are preserved as numbers
          const rd=col=>r[col]??'';
          const prDate=rd(PROC_COL.PR_DATE),prReqDate=rd(PROC_COL.PR_REQ_DATE);
          const prStatus=g(PROC_COL.PR_STATUS).toUpperCase(),poOwner=g(PROC_COL.PO_OWNER);
          const poNo=g(PROC_COL.PO_NO),poExpDel=rd(PROC_COL.PO_EXP_DEL);
          const poDate=rd(PROC_COL.PO_DATE),poStatus=g(PROC_COL.PO_STATUS).toUpperCase();
          const grpoNo=g(PROC_COL.GRPO_NO),grpoDate=rd(PROC_COL.GRPO_DATE);
          const matRecDate=rd(PROC_COL.MAT_REC_DATE),grpoCrDate=rd(PROC_COL.GRPO_CREATION);
          const grpoStatus=g(PROC_COL.GRPO_STATUS).toUpperCase();
          // Pre-parse dates once at load time — avoids repeated parsing in useMemo/render
          const today=_today;
          const prReqDateTs=procParseDate(prReqDate); const prOverdue=prStatus==="OPEN"&&prReqDateTs&&prReqDateTs<today;
          const poExpDelTs=procParseDate(poExpDel);   const poOverdue=poStatus==="OPEN"&&poExpDelTs&&poExpDelTs<today;
          const matRecDateTs=procParseDate(matRecDate);const grpoOverdue=grpoStatus==="OPEN"&&matRecDateTs&&matRecDateTs<today;
          const prDateTs=procParseDate(prDate);
          const poDateTs=procParseDate(poDate);

          // PR
          if(prNo&&prNo!=="None"){
            if(!prMap.has(prNo))prMap.set(prNo,{prNo,prDate,prReqDate,prStatus,poOwner,projectName,groupName,totalQty:0,openQty:0,items:[],itemCount:0,prDateTs,prReqDateTs,isOverdue:prOverdue});
            const pr=prMap.get(prNo);
            if(prStatus==="OPEN")pr.prStatus="OPEN";
            pr.totalQty+=prQty;pr.openQty+=openPrQty;
            if(itemName){pr.items.push({name:itemName,prQty,openPrQty,poQty,status:prStatus,vendorName});pr.itemCount++;}
          }
          // PO
          const poValid=poNo&&poNo!=="None"&&poNo!=="NONE";
          if(poValid){
            if(!poMap.has(poNo))poMap.set(poNo,{poNo,poDate,poExpDel,poStatus,poOwner,prNo,projectName,vendorName,groupName,totalAmount:0,openAmount:0,poLineTotal:0,lineSeen:new Set(),items:[],itemCount:0,poDateTs,poExpDelTs,isOverdue:poOverdue});
            const po=poMap.get(poNo);
            if(poStatus==="OPEN")po.poStatus="OPEN";
            if(poStatus!=="CANCELLED"){
              // Dedup key: PO No + Item No + PO Line Total + PO Qty
              // A SAP flat export repeats the same PO sub-line once per GRPO delivery receipt.
              // Using just PO+ItemNo collapses genuinely different sub-lines (same item,
              // different qty/price batches). Including PO Line Tot + PO Qty ensures we
              // keep distinct sub-lines while still deduplicating pure GRPO-driven repeats.
              const lineKey=poNo+"|"+itemNo+"|"+(poLineTot||0)+"|"+(poQty||0);
              if(!po.lineSeen.has(lineKey)){po.lineSeen.add(lineKey);po.openAmount+=(+(r[30]||0));po.poLineTotal+=(poLineTot||0);}
              // totalAmount will be computed as poLineTotal (open + closed) after parsing
            }
            if(itemName){po.items.push({name:itemName,poQty,openPoQty,grpoQty,status:poStatus});po.itemCount++;}
          } else if(poStatus==="CANCELLED"){
            const k=prNo||"_cancel_";
            if(!cancelledPosByPR.has(k))cancelledPosByPR.set(k,{poNo:"—",poDate:"—",poExpDel:"—",poStatus:"CANCELLED",poOwner,prNo,projectName,items:[],itemCount:0,isCancelled:true});
            const c=cancelledPosByPR.get(k);if(itemName){c.items.push({name:itemName,poQty,openPoQty,grpoQty,status:poStatus});c.itemCount++;}
          }
          // GRPO
          const grpoValid=grpoNo&&grpoNo!=="None"&&grpoNo!=="NONE";
          if(grpoValid){
            if(!grpoMap.has(grpoNo))grpoMap.set(grpoNo,{grpoNo,grpoDate,matRecDate,grpoCrDate,grpoStatus,poNo,prNo,projectName,poOwner,groupName,vendorName,totalGrpoAmt:0,openGrpoAmt:0,lineSeen:new Set(),items:[],itemCount:0,matRecDateTs,poDateTs,isOverdue:grpoOverdue});
            const grpo=grpoMap.get(grpoNo);
            if(grpoStatus==="OPEN")grpo.grpoStatus="OPEN";
            if(grpoStatus!=="CANCELLED"){
              // Dedup GRPO lines by GRPO No + Item No + GRPO Line Total + GRPO Qty
              // Same logic as PO: include amounts so partial deliveries of the same
              // item within the same GRPO (different qty batches) are kept distinct.
              const gLineKey=grpoNo+"|"+itemNo+"|"+(grpoLineTot||0)+"|"+(grpoQty||0);
              if(!grpo.lineSeen.has(gLineKey)){grpo.lineSeen.add(gLineKey);grpo.totalGrpoAmt+=grpoLineTot;grpo.openGrpoAmt+=(+(r[44]||0));}
            }
            if(itemName){grpo.items.push({name:itemName,grpoQty,openGrpoQty,status:grpoStatus});grpo.itemCount++;}
          } else if(grpoStatus==="CANCELLED"){
            const k=(poNo||prNo||"_cancel_");
            if(!cancelledGrposByPR.has(k))cancelledGrposByPR.set(k,{grpoNo:"—",grpoDate:"—",matRecDate:"—",grpoCrDate:"—",grpoStatus:"CANCELLED",poNo,prNo,projectName,poOwner,items:[],itemCount:0,isCancelled:true});
            const c=cancelledGrposByPR.get(k);if(itemName){c.items.push({name:itemName,grpoQty,openGrpoQty,status:grpoStatus});c.itemCount++;}
          }
        }

        // totalAmount = sum of unique PO sub-line totals (already deduplicated above).
        // This is the true committed PO value — free of GRPO-driven row duplication.
        poMap.forEach(po=>{
          po.totalAmount=po.poLineTotal;
        });
        const _allDocs=[...prMap.values(),...poMap.values(),...grpoMap.values(),...cancelledPosByPR.values(),...cancelledGrposByPR.values()];
        const vendors=[...new Set([...poMap.values()].map(d=>d.vendorName).filter(Boolean))].sort();
        const projects=[...new Set(_allDocs.map(d=>d.projectName).filter(Boolean))].sort();
        const owners=[...new Set(_allDocs.map(d=>d.poOwner).filter(Boolean))].sort();
        resolve({vendors,
          prs:  Array.from(prMap.values()),
          pos:  [...Array.from(poMap.values()),...Array.from(cancelledPosByPR.values())],
          grpos:[...Array.from(grpoMap.values()),...Array.from(cancelledGrposByPR.values())],
          projects,
          owners,
        });
      }catch(err){reject(err);}
    };
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
}

const PROC_STATUS_CFG={
  OPEN:     {color:"#3b9eff",bg:"#0d2040",border:"#1a4070"},
  CLOSED:   {color:"#22c55e",bg:"#062010",border:"#0f4020"},
  CANCELLED:{color:"#64748b",bg:"#121820",border:"#1e2530"},
  OVERDUE:  {color:"#ef4444",bg:"#200808",border:"#401010"},
};
const procStatusCfg=(s,od)=>od?PROC_STATUS_CFG.OVERDUE:(PROC_STATUS_CFG[s]||{color:"#40405a",bg:"#0d0d14",border:"#1a1a28"});

function ProcStatusBadge({status,overdue}){
  const cfg=procStatusCfg(status,overdue);
  const label=overdue?"OVERDUE":(status||"—");
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:cfg.color,flexShrink:0}}/>{label}
    </span>
  );
}

function ProcStatCard({label,value,cfg,active,onClick,icon}){
  return(
    <div onClick={onClick} style={{background:active?cfg.bg:"var(--surface)",border:`1px solid ${active?cfg.border:"var(--border)"}`,borderRadius:12,padding:"16px 18px",cursor:"pointer",transition:"all .15s",userSelect:"none",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:10,right:12,fontSize:20,opacity:0.1}}>{icon}</div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:active?cfg.color:"var(--muted)",textTransform:"uppercase",marginBottom:8}}>{label}</div>
      <div style={{fontSize:32,fontWeight:800,color:active?cfg.color:"var(--muted)",fontFamily:"'Courier New',monospace",lineHeight:1}}>{value}</div>
    </div>
  );
}

function ProcItemsModal({doc,type,onClose}){
  const docNo=doc[type==="PR"?"prNo":type==="PO"?"poNo":"grpoNo"]||"—";
  const sc=s=>s==="OPEN"?"#3b9eff":s==="CLOSED"?"#22c55e":s==="CANCELLED"?"#64748b":"#ef4444";
  const isPO=type==="PO";

  // For PR: vendor may differ per item — check
  const isPR=type==="PR";
  const prVendors=isPR?[...new Set(doc.items.map(it=>it.vendorName).filter(Boolean))]:[];
  const prSingleVendor=prVendors.length===1?prVendors[0]:null; // one vendor → show once; multiple → show per item

  const gridCols=isPO?"28px 1fr 80px 90px 80px 80px":isPR?"28px 1fr 80px 80px 80px 80px":"28px 1fr 80px 90px 80px";
  // If PR has multiple vendors, add a vendor column
  const grid=isPR&&!prSingleVendor?"28px 140px 1fr 80px 80px 80px 80px":gridCols;

  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#00000088",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:24,maxWidth:isPO||(!prSingleVendor&&isPR)?1000:720,width:"100%",maxHeight:"75vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>

        {/* ── Modal header ── */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <div style={{fontSize:11,color:"var(--muted)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Line Items — {type}</div>
            <div style={{fontSize:16,fontWeight:700,fontFamily:"monospace",color:"var(--text)",marginBottom:8}}>{docNo}</div>
            {/* Project + Vendor pill row */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {doc.projectName&&(
                <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:"#8b5cf6",background:"#8b5cf618",border:"1px solid #8b5cf630",borderRadius:6,padding:"3px 10px"}}>
                  🏗 {doc.projectName}
                </span>
              )}
              {/* Vendor — show once if PO/GRPO or single-vendor PR */}
              {(type==="PO"||type==="GRPO"||prSingleVendor)&&(doc.vendorName||prSingleVendor)&&(
                <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:"#f0a030",background:"#f0a03018",border:"1px solid #f0a03030",borderRadius:6,padding:"3px 10px"}}>
                  🏭 {doc.vendorName||prSingleVendor}
                </span>
              )}
              {isPR&&!prSingleVendor&&prVendors.length>1&&(
                <span style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>
                  {prVendors.length} vendors — shown per item
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",fontSize:20,cursor:"pointer",flexShrink:0,marginLeft:16}}>✕</button>
        </div>

        {/* ── Column headers ── */}
        <div style={{display:"grid",gridTemplateColumns:grid,gap:8,padding:"7px 10px",background:"var(--s2)",borderRadius:"6px 6px 0 0",borderBottom:"1px solid var(--border)"}}>
          {["#",
            ...(isPR&&!prSingleVendor?["Vendor"]:[]),
            "Item Name",
            ...(isPO?["PO Qty","Open PO Qty","GRPO Qty"]:isPR?["PR Qty","Open PR Qty","PO Qty"]:["GRPO Qty","Open GRPO Qty"]),
            "Status"
          ].map((h,i)=>(
            <span key={i} style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",textAlign:["PO Qty","Open PO Qty","GRPO Qty","PR Qty","Open PR Qty","GRPO Qty","Open GRPO Qty"].includes(h)?"right":"left"}}>{h}</span>
          ))}
        </div>

        {/* ── Item rows ── */}
        <div style={{overflowY:"auto",flex:1}}>
          {doc.items.map((it,i)=>{
            const name=typeof it==="object"?it.name:it;
            const status=typeof it==="object"?(it.status||null):null;
            const poQty=typeof it==="object"?(it.poQty||0):0;
            const openPoQty=typeof it==="object"?(it.openPoQty||0):0;
            const grpoQty=typeof it==="object"?(it.grpoQty||0):0;
            const itemVendor=it.vendorName||"";
            return(
              <div key={i} style={{display:"grid",gridTemplateColumns:grid,gap:8,padding:"8px 10px",borderBottom:"1px solid var(--border)",alignItems:"start"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"}
                onMouseLeave={e=>e.currentTarget.style.background=""}>
                <span style={{color:"var(--s3)",fontFamily:"monospace",fontSize:11,paddingTop:2}}>{String(i+1).padStart(2,"0")}</span>
                {/* Per-item vendor for multi-vendor PRs */}
                {isPR&&!prSingleVendor&&(
                  <span style={{fontSize:11,color:"#f0a030",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{itemVendor||"—"}</span>
                )}
                <span style={{color:"var(--text)",fontSize:12,lineHeight:1.4}}>{name}</span>
                {(()=>{
                  const q1=isPO?poQty:isPR?(it.prQty||0):(it.grpoQty||0);
                  const q2=isPO?openPoQty:isPR?(it.openPrQty||0):(it.openGrpoQty||0);
                  const q3=isPO?grpoQty:isPR?(it.poQty||0):null;
                  const c1="var(--text)", c2="#3b9eff", c3=isPO?"#10b981":"#f0a030";
                  return(<>
                    <span style={{color:q1>0?c1:"var(--s3)",fontSize:12,fontFamily:"monospace",textAlign:"right",fontWeight:q1>0?600:400}}>{q1>0?q1.toLocaleString("en-IN"):"—"}</span>
                    <span style={{color:q2>0?c2:"var(--s3)",fontSize:12,fontFamily:"monospace",textAlign:"right",fontWeight:q2>0?600:400}}>{q2>0?q2.toLocaleString("en-IN"):"—"}</span>
                    {q3!==null&&<span style={{color:q3>0?c3:"var(--s3)",fontSize:12,fontFamily:"monospace",textAlign:"right",fontWeight:q3>0?600:400}}>{q3>0?q3.toLocaleString("en-IN"):"—"}</span>}
                  </>);
                })()}
                {status
                  ?<span style={{fontSize:10,fontWeight:700,color:sc(status),background:sc(status)+"18",border:`1px solid ${sc(status)}40`,borderRadius:5,padding:"2px 7px",textAlign:"center",whiteSpace:"nowrap"}}>{status}</span>
                  :<span/>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Procurement tables ────────────────────────────────────────────────────────
const PTH=({children,style={}})=><th style={{padding:"9px 13px",textAlign:"left",fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase",whiteSpace:"nowrap",borderBottom:"1px solid var(--border)",background:"var(--s2)",...style}}>{children}</th>;
const PTD=({children,style={}})=><td style={{padding:"9px 13px",fontSize:12,color:"var(--muted)",borderBottom:"1px solid var(--border)",verticalAlign:"middle",...style}}>{children}</td>;
const PDocNum=({children})=><span style={{fontFamily:"'Courier New',monospace",fontSize:13,fontWeight:700,color:"var(--text)"}}>{children}</span>;

function PRTable({docs,onItems}){
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr><PTH>#</PTH><PTH>PR Number</PTH><PTH>Items</PTH><PTH>PR Date</PTH><PTH>Required Date</PTH><PTH>PO Owner</PTH><PTH>Status</PTH></tr></thead>
        <tbody>
          {docs.length===0
            ?<tr><td colSpan={7} style={{textAlign:"center",padding:"40px",color:"var(--muted)",fontSize:13}}>No records</td></tr>
            :docs.map((d,i)=>{
              const od=d.isOverdue;
              return(
                <tr key={d.prNo+i} onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <PTD style={{color:"var(--s3)",fontFamily:"monospace",fontSize:11}}>{String(i+1).padStart(3,"0")}</PTD>
                  <PTD><PDocNum>{d.prNo}</PDocNum></PTD>
                  <PTD><button onClick={()=>onItems(d,"PR")} style={{background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px",fontSize:11,color:"var(--accent)",cursor:"pointer",fontWeight:600}}>{d.itemCount} item{d.itemCount!==1?"s":""}</button></PTD>
                  <PTD>{procFmtDate(d.prDate)}</PTD>
                  <PTD style={{color:od?"var(--red)":"var(--muted)",fontWeight:od?700:400}}>{procFmtDate(d.prReqDate)}{od&&" ⚠"}</PTD>
                  <PTD style={{color:"var(--text)",fontSize:12}}>{d.poOwner||"—"}</PTD>
                  <PTD><ProcStatusBadge status={d.prStatus} overdue={od}/></PTD>
                </tr>
              );
            })
          }
        </tbody>
      </table>
    </div>
  );
}

function POTable({docs,onItems}){
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr><PTH>#</PTH><PTH>PO Number</PTH><PTH>PR Ref</PTH><PTH>Items</PTH><PTH>PO Date</PTH><PTH>Expected Delivery</PTH><PTH>PO Owner</PTH><PTH>Status</PTH></tr></thead>
        <tbody>
          {docs.length===0
            ?<tr><td colSpan={8} style={{textAlign:"center",padding:"40px",color:"var(--muted)",fontSize:13}}>No records</td></tr>
            :docs.map((d,i)=>{
              const od=d.isOverdue;
              return(
                <tr key={(d.poNo||i)+i} onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <PTD style={{color:"var(--s3)",fontFamily:"monospace",fontSize:11}}>{String(i+1).padStart(3,"0")}</PTD>
                  <PTD>{d.isCancelled?<span style={{color:"var(--muted)",fontSize:12}}>No PO</span>:<PDocNum>{d.poNo}</PDocNum>}</PTD>
                  <PTD style={{color:"var(--muted)",fontFamily:"monospace",fontSize:11}}>{d.prNo||"—"}</PTD>
                  <PTD>{d.itemCount>0?<button onClick={()=>onItems(d,"PO")} style={{background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px",fontSize:11,color:"var(--accent)",cursor:"pointer",fontWeight:600}}>{d.itemCount} item{d.itemCount!==1?"s":""}</button>:<span style={{color:"var(--s3)"}}>—</span>}</PTD>
                  <PTD>{procFmtDate(d.poDate)}</PTD>
                  <PTD style={{color:od?"var(--red)":"var(--muted)",fontWeight:od?700:400}}>{procFmtDate(d.poExpDel)}{od&&" ⚠"}</PTD>
                  <PTD style={{color:"var(--text)",fontSize:12}}>{d.poOwner||"—"}</PTD>
                  <PTD><ProcStatusBadge status={d.poStatus} overdue={od}/></PTD>
                </tr>
              );
            })
          }
        </tbody>
      </table>
    </div>
  );
}

function GRPOTable({docs,onItems}){
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr><PTH>#</PTH><PTH>GRPO Number</PTH><PTH>PO Ref</PTH><PTH>Items</PTH><PTH>GRPO Date</PTH><PTH>Material Received</PTH><PTH>Creation Date</PTH><PTH>Status</PTH></tr></thead>
        <tbody>
          {docs.length===0
            ?<tr><td colSpan={8} style={{textAlign:"center",padding:"40px",color:"var(--muted)",fontSize:13}}>No records</td></tr>
            :docs.map((d,i)=>{
              const od=d.isOverdue;
              return(
                <tr key={(d.grpoNo||i)+i} onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <PTD style={{color:"var(--s3)",fontFamily:"monospace",fontSize:11}}>{String(i+1).padStart(3,"0")}</PTD>
                  <PTD>{d.isCancelled?<span style={{color:"var(--muted)",fontSize:12}}>No GRPO</span>:<PDocNum>{d.grpoNo}</PDocNum>}</PTD>
                  <PTD style={{color:"var(--muted)",fontFamily:"monospace",fontSize:11}}>{d.poNo||"—"}</PTD>
                  <PTD>{d.itemCount>0?<button onClick={()=>onItems(d,"GRPO")} style={{background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px",fontSize:11,color:"var(--accent)",cursor:"pointer",fontWeight:600}}>{d.itemCount} item{d.itemCount!==1?"s":""}</button>:<span style={{color:"var(--s3)"}}>—</span>}</PTD>
                  <PTD>{procFmtDate(d.grpoDate)}</PTD>
                  <PTD style={{color:od?"var(--red)":"var(--muted)",fontWeight:od?700:400}}>{procFmtDate(d.matRecDate)}{od&&" ⚠"}</PTD>
                  <PTD>{procFmtDate(d.grpoCrDate)}</PTD>
                  <PTD><ProcStatusBadge status={d.grpoStatus} overdue={od}/></PTD>
                </tr>
              );
            })
          }
        </tbody>
      </table>
    </div>
  );
}

// ── Single dashboard panel (one tab) ─────────────────────────────────────────
const PAGE_SIZE=100;

function ProcDashPanel({type,docs,statusKey,dateKey,onItems}){
  const [filter,setFilter]=useState("ALL");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const ref=useRef(null);

  const stats=useMemo(()=>{
    const open     =docs.filter(d=>d[statusKey]==="OPEN").length;
    const closed   =docs.filter(d=>d[statusKey]==="CLOSED").length;
    const cancelled=docs.filter(d=>d[statusKey]==="CANCELLED").length;
    const overdue  =docs.filter(d=>d.isOverdue).length;
    return{total:docs.length,open,closed,cancelled,overdue};
  },[docs,statusKey]);

  const filtered=useMemo(()=>{
    let list=docs;
    if(filter==="OPEN")           list=list.filter(d=>d[statusKey]==="OPEN");
    else if(filter==="CLOSED")    list=list.filter(d=>d[statusKey]==="CLOSED");
    else if(filter==="CANCELLED") list=list.filter(d=>d[statusKey]==="CANCELLED");
    else if(filter==="OVERDUE")   list=list.filter(d=>d.isOverdue);
    if(search.trim()){
      const q=search.toLowerCase();
      list=list.filter(d=>Object.values(d).some(v=>String(v).toLowerCase().includes(q)));
    }
    return list;
  },[docs,filter,search,statusKey]);

  // Reset to page 1 whenever filter/search changes
  const prevFilter=useRef(filter),prevSearch=useRef(search);
  if(prevFilter.current!==filter||prevSearch.current!==search){
    prevFilter.current=filter;prevSearch.current=search;
    if(page!==1)setPage(1);
  }

  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const pageDocs=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  const filterBtns=[
    {key:"ALL",      label:"All",       value:stats.total,     cfg:{color:"var(--text)",bg:"var(--surface)",border:"var(--border)"},     icon:"◈"},
    {key:"OPEN",     label:"Open",      value:stats.open,      cfg:PROC_STATUS_CFG.OPEN,      icon:"◉"},
    {key:"CLOSED",   label:"Closed",    value:stats.closed,    cfg:PROC_STATUS_CFG.CLOSED,    icon:"✓"},
    {key:"CANCELLED",label:"Cancelled", value:stats.cancelled, cfg:PROC_STATUS_CFG.CANCELLED, icon:"✗"},
    {key:"OVERDUE",  label:"Overdue ⚠", value:stats.overdue,  cfg:PROC_STATUS_CFG.OVERDUE,   icon:"⚠"},
  ];

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>
        {filterBtns.map(fb=><ProcStatCard key={fb.key} label={fb.label} value={fb.value} cfg={fb.cfg} active={filter===fb.key} onClick={()=>setFilter(fb.key)} icon={fb.icon}/>)}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{flex:1,position:"relative"}}>
          <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",fontSize:13}}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${type} records…`}
            style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 13px 8px 30px",color:"var(--text)",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <span style={{fontSize:11,color:"var(--muted)",fontFamily:"monospace",whiteSpace:"nowrap"}}>{filtered.length} record{filtered.length!==1?"s":""}</span>
      </div>
      <Card style={{padding:0,overflow:"hidden"}}>
        {type==="PR"   &&<PRTable   docs={pageDocs} onItems={onItems}/>}
        {type==="PO"   &&<POTable   docs={pageDocs} onItems={onItems}/>}
        {type==="GRPO" &&<GRPOTable docs={pageDocs} onItems={onItems}/>}
      </Card>
      {totalPages>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12}}>
          <button onClick={()=>setPage(1)} disabled={page===1} style={{padding:"4px 9px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,color:page===1?"var(--s3)":"var(--muted)",cursor:page===1?"default":"pointer",fontSize:11}}>«</button>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{padding:"4px 9px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,color:page===1?"var(--s3)":"var(--muted)",cursor:page===1?"default":"pointer",fontSize:11}}>‹</button>
          <span style={{fontSize:11,color:"var(--muted)",padding:"0 6px"}}>Page <b style={{color:"var(--text)"}}>{page}</b> of {totalPages} &nbsp;·&nbsp; rows {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={{padding:"4px 9px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,color:page===totalPages?"var(--s3)":"var(--muted)",cursor:page===totalPages?"default":"pointer",fontSize:11}}>›</button>
          <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} style={{padding:"4px 9px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:6,color:page===totalPages?"var(--s3)":"var(--muted)",cursor:page===totalPages?"default":"pointer",fontSize:11}}>»</button>
        </div>
      )}
    </div>
  );
}

// ── Main Procurement Page ─────────────────────────────────────────────────────
// ─── Procurement Reports ──────────────────────────────────────────────────────
// ─── Procurement Reports ──────────────────────────────────────────────────────
const fmtAmt=v=>{v=v||0;if(v>=10000000)return"₹"+(v/10000000).toFixed(1)+" Cr";if(v>=100000)return"₹"+(v/100000).toFixed(1)+" L";if(v>=1000)return"₹"+(v/1000).toFixed(1)+" K";return"₹"+Math.round(v).toLocaleString("en-IN");};

// ─── Overdue Alerts Panel ─────────────────────────────────────────────────────
// ─── Vendor Dashboard ─────────────────────────────────────────────────────────
function VendorDashboard({pos,grpos}){
  const [sort,setSort]=useState("spend");
  const [selVendor,setSelVendor]=useState(null);
  const [vSearch,setVSearch]=useState("");

  const fmt=v=>{v=v||0;if(v>=10000000)return"₹"+(v/10000000).toFixed(1)+" Cr";if(v>=100000)return"₹"+(v/100000).toFixed(1)+" L";if(v>=1000)return"₹"+(v/1000).toFixed(1)+" K";return"₹"+Math.round(v).toLocaleString("en-IN");};

  // Build vendor map
  const poToVendor={};
  pos.forEach(po=>{if(po.vendorName)poToVendor[po.poNo]=po.vendorName;});

  const vendorMap={};
  pos.forEach(po=>{
    const v=po.vendorName||"Unknown";
    if(!vendorMap[v])vendorMap[v]={name:v,pos:[],spend:0,openAmt:0,grpoAmt:0,openGrpoAmt:0,overdueCount:0,statusCounts:{OPEN:0,CLOSED:0,CANCELLED:0},projects:new Set()};
    const vd=vendorMap[v];
    vd.pos.push(po);
    vd.spend+=po.totalAmount||0;
    vd.openAmt+=po.openAmount||0;
    vd.statusCounts[po.poStatus]=(vd.statusCounts[po.poStatus]||0)+1;
    if(po.isOverdue)vd.overdueCount++;
    if(po.projectName)vd.projects.add(po.projectName);
  });
  grpos.forEach(g=>{
    const v=poToVendor[g.poNo]||"Unknown";
    if(vendorMap[v]){vendorMap[v].grpoAmt+=(g.totalGrpoAmt||0);vendorMap[v].openGrpoAmt+=(g.openGrpoAmt||0);}
  });

  const vendors=Object.values(vendorMap)
    .map(v=>({...v,poCount:v.pos.length,delivPct:v.spend>0?Math.round(((v.spend-v.openAmt)/v.spend)*100):0,projects:[...v.projects]}))
    .sort((a,b)=>b[sort==="spend"?"spend":sort==="open"?"openAmt":sort==="grpo"?"grpoAmt":"overdueCount"]-a[sort==="spend"?"spend":sort==="open"?"openAmt":sort==="grpo"?"grpoAmt":"overdueCount"]);

  const filtered=vSearch?vendors.filter(v=>v.name.toLowerCase().includes(vSearch.toLowerCase())):vendors;

  // Chart data
  const top8Spend=vendors.slice(0,8).map(v=>({name:v.name.length>18?v.name.slice(0,18)+"…":v.name,fullName:v.name,spend:v.spend,open:v.openAmt,grpo:v.grpoAmt}));
  const statusPie=vendors.reduce((acc,v)=>{acc.open+=v.statusCounts.OPEN||0;acc.closed+=v.statusCounts.CLOSED||0;acc.cancelled+=v.statusCounts.CANCELLED||0;return acc;},{open:0,closed:0,cancelled:0});
  const totalPOs=statusPie.open+statusPie.closed+statusPie.cancelled||1;

  const TT1=({active,payload})=>{
    if(!active||!payload?.length)return null;
    const d=payload[0]?.payload;
    return(<div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",fontSize:12}}>
      <div style={{fontWeight:700,marginBottom:6,color:"var(--text)"}}>{d?.fullName||d?.name}</div>
      {payload.map(p=><div key={p.dataKey} style={{color:p.color,marginBottom:2}}>{p.name}: {fmt(p.value)}</div>)}
    </div>);
  };

  const selV=selVendor?vendorMap[selVendor]:null;

  return(
    <div className="fade-in">
      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        {selVendor&&<button onClick={()=>setSelVendor(null)} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 12px",color:"var(--muted)",cursor:"pointer",fontSize:12}}>← All Vendors</button>}
        <div style={{width:3,height:22,borderRadius:2,background:"#f0a030"}}/>
        <div>
          <h2 style={{fontFamily:"Sora",fontSize:16,fontWeight:700}}>{selVendor?selVendor:"Vendor / Supplier Dashboard"}</h2>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>{selVendor?`${selV?.poCount} POs · ${selV?.projects?.length} projects`:`${vendors.length} vendors · click a row to drill down`}</div>
        </div>
      </div>

      {!selVendor?(
        <>
          {/* ── KPI strip ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {[
              {label:"Total Vendors",  value:vendors.length,           unit:"",    color:"#8b5cf6"},
              {label:"Total Spend",    value:fmt(vendors.reduce((s,v)=>s+v.spend,0)),   unit:"",color:"#f0a030"},
              {label:"Open Amount",    value:fmt(vendors.reduce((s,v)=>s+v.openAmt,0)), unit:"",color:"#ef4444"},
              {label:"GRPO Received",  value:fmt(vendors.reduce((s,v)=>s+v.grpoAmt,0)),"unit":"",color:"#10b981"},
            ].map(k=>(
              <div key={k.label} style={{background:"var(--surface)",border:`1px solid ${k.color}30`,borderRadius:10,padding:"13px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:k.color,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{k.label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:k.color,fontFamily:"monospace"}}>{k.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Charts row ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:16,marginBottom:20}}>
            {/* Bar chart: top 8 vendors by spend */}
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:20}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:"var(--text)"}}>Top Vendors — Spend vs Open vs GRPO</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top8Spend} margin={{top:4,right:8,left:0,bottom:80}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10,fill:"var(--muted)"}} angle={-40} textAnchor="end" interval={0} height={80}/>
                  <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"var(--muted)"}} width={70}/>
                  <Tooltip content={TT1}/>
                  <Legend verticalAlign="top" wrapperStyle={{fontSize:11,paddingBottom:8}}/>
                  <Bar dataKey="spend"  name="Total Spend"    fill="#f0a030" radius={[3,3,0,0]} maxBarSize={24}/>
                  <Bar dataKey="open"   name="Open Amount"    fill="#ef4444" radius={[3,3,0,0]} maxBarSize={24}/>
                  <Bar dataKey="grpo"   name="GRPO Received"  fill="#10b981" radius={[3,3,0,0]} maxBarSize={24}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* PO Status donut + delivery perf */}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Status breakdown */}
              <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:16,flex:1}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:12,color:"var(--text)"}}>PO Status Breakdown</div>
                {[["OPEN","#3b9eff",statusPie.open],["CLOSED","#22c55e",statusPie.closed],["CANCELLED","#64748b",statusPie.cancelled]].map(([st,color,cnt])=>(
                  <div key={st} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:11,color:"var(--muted)"}}>{st}</span>
                      <span style={{fontSize:11,fontWeight:700,color}}>{cnt} <span style={{color:"var(--muted)",fontWeight:400}}>({((cnt/totalPOs)*100).toFixed(0)}%)</span></span>
                    </div>
                    <div style={{height:6,background:"var(--s3)",borderRadius:3}}>
                      <div style={{height:6,width:((cnt/totalPOs)*100)+"%",background:color,borderRadius:3,transition:"width .4s"}}/>
                    </div>
                  </div>
                ))}
              </div>
              {/* Overdue vendors */}
              <div style={{background:"var(--surface)",border:"1px solid #ef444430",borderRadius:12,padding:16}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:"#ef4444"}}>⚠ Vendors with Overdue POs</div>
                {vendors.filter(v=>v.overdueCount>0).slice(0,5).map(v=>(
                  <div key={v.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,cursor:"pointer"}} onClick={()=>setSelVendor(v.name)}>
                    <span style={{fontSize:11,color:"var(--text)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.name}</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#ef4444",marginLeft:8}}>{v.overdueCount} overdue</span>
                  </div>
                ))}
                {vendors.filter(v=>v.overdueCount>0).length===0&&<div style={{fontSize:11,color:"var(--muted)"}}>No overdue POs 🎉</div>}
              </div>
            </div>
          </div>

          {/* ── Delivery performance chart ── */}
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:20,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:"var(--text)"}}>Delivery Performance — Top Vendors (% of spend delivered)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={vendors.slice(0,12).map(v=>({name:v.name.length>16?v.name.slice(0,16)+"…":v.name,fullName:v.name,pct:v.delivPct,open:100-v.delivPct}))} layout="vertical" margin={{top:0,right:50,left:140,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                <XAxis type="number" domain={[0,100]} tickFormatter={v=>v+"%"} tick={{fontSize:10,fill:"var(--muted)"}}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:"var(--muted)"}} width={140}/>
                <Tooltip content={({active,payload})=>active&&payload?.length?<div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",fontSize:12}}><div style={{fontWeight:700,marginBottom:4}}>{payload[0]?.payload?.fullName}</div><div style={{color:"#10b981"}}>Delivered: {payload[0]?.payload?.pct}%</div><div style={{color:"#ef4444"}}>Open: {payload[0]?.payload?.open}%</div></div>:null}/>
                <Bar dataKey="pct"  name="Delivered" fill="#10b981" radius={[0,3,3,0]} stackId="a"/>
                <Bar dataKey="open" name="Open"      fill="#ef444460" radius={[0,3,3,0]} stackId="a"/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Vendor table ── */}
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontWeight:700,fontSize:13,flex:1}}>All Vendors</span>
              <input value={vSearch} onChange={e=>setVSearch(e.target.value)} placeholder="Search vendor…"
                style={{width:180,padding:"6px 10px",fontSize:12,borderRadius:7,border:"1px solid var(--border)",background:"var(--s2)",color:"var(--text)",outline:"none"}}/>
              <div style={{display:"flex",gap:4}}>
                {[["spend","Spend"],["open","Open"],["grpo","GRPO"],["overdueCount","Overdue"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setSort(k)}
                    style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:sort===k?"#f0a030":"var(--s2)",color:sort===k?"#fff":"var(--muted)",cursor:"pointer",fontWeight:600}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 60px 110px 110px 110px 70px 90px",gap:8,padding:"8px 16px",background:"var(--s2)",borderBottom:"1px solid var(--border)"}}>
              {["Vendor","POs","Total Spend","Open Amount","GRPO Rcvd","Overdue","Delivery"].map((h,i)=>(
                <span key={h} style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",textAlign:i>0?"right":"left"}}>{h}</span>
              ))}
            </div>
            {filtered.map((v,i)=>{
              const dc=v.delivPct>=80?"#10b981":v.delivPct>=50?"#f0a030":"#ef4444";
              return(
                <div key={v.name} onClick={()=>setSelVendor(v.name)}
                  style={{display:"grid",gridTemplateColumns:"1fr 60px 110px 110px 110px 70px 90px",gap:8,padding:"10px 16px",borderBottom:"1px solid var(--border)",alignItems:"center",cursor:"pointer",background:i%2===0?"transparent":"var(--s2)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--s2)"}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{v.name}</div>
                    <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>{v.projects.length} project{v.projects.length!==1?"s":""}</div>
                  </div>
                  <span style={{fontSize:12,fontFamily:"monospace",textAlign:"right",color:"var(--muted)"}}>{v.poCount}</span>
                  <span style={{fontSize:12,fontFamily:"monospace",textAlign:"right",fontWeight:700,color:"var(--text)"}}>{fmt(v.spend)}</span>
                  <span style={{fontSize:12,fontFamily:"monospace",textAlign:"right",color:"#ef4444",fontWeight:v.openAmt>0?700:400}}>{fmt(v.openAmt)}</span>
                  <span style={{fontSize:12,fontFamily:"monospace",textAlign:"right",color:"#10b981",fontWeight:v.grpoAmt>0?700:400}}>{fmt(v.grpoAmt)}</span>
                  <span style={{fontSize:12,textAlign:"right",color:v.overdueCount>0?"#ef4444":"var(--s3)",fontWeight:700}}>{v.overdueCount>0?v.overdueCount+"⚠":"—"}</span>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontSize:12,fontWeight:700,color:dc}}>{v.delivPct}%</span>
                    <div style={{height:4,background:"var(--s3)",borderRadius:2,marginTop:3}}>
                      <div style={{height:4,width:v.delivPct+"%",background:dc,borderRadius:2}}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ):(
        /* ── Vendor Drill-down ── */
        <VendorDetail vendor={selV?{...selV,projects:[...selV.projects]} : null} fmt={fmt} grpos={grpos}/>
      )}
    </div>
  );
}

function VendorDetail({vendor,fmt,grpos}){
  if(!vendor)return null;
  const v=vendor;
  const poToGrpo={};
  grpos.forEach(g=>{if(!poToGrpo[g.poNo])poToGrpo[g.poNo]=[];poToGrpo[g.poNo].push(g);});

  const spendByProj=v.projects.reduce((acc,p)=>{
    const projPos=v.pos.filter(po=>po.projectName===p);
    acc[p]={spend:projPos.reduce((s,po)=>s+(po.totalAmount||0),0),open:projPos.reduce((s,po)=>s+(po.openAmount||0),0),poCount:projPos.length};
    return acc;
  },{});
  const projChartData=Object.entries(spendByProj).map(([name,d])=>({name:name.length>20?name.slice(0,20)+"…":name,fullName:name,...d})).sort((a,b)=>b.spend-a.spend).slice(0,8);

  const monthlySpend={};
  v.pos.forEach(po=>{
    const d=po.poDateTs;
    if(d){const key=d.getFullYear()+"-"+(d.getMonth()+1).toString().padStart(2,"0");monthlySpend[key]=(monthlySpend[key]||0)+(po.totalAmount||0);}
  });
  const trendData=Object.entries(monthlySpend).sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([m,spend])=>({month:m.slice(5)+"/"+m.slice(2,4),spend}));

  return(
    <div>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Total POs",   value:v.poCount,               color:"#8b5cf6",isNum:true},
          {label:"Total Spend", value:fmt(v.spend),            color:"#f0a030"},
          {label:"Open Amount", value:fmt(v.openAmt),          color:"#ef4444"},
          {label:"GRPO Rcvd",   value:fmt(v.grpoAmt),          color:"#10b981"},
          {label:"Delivery",    value:v.delivPct+"%",          color:v.delivPct>=80?"#10b981":v.delivPct>=50?"#f0a030":"#ef4444"},
        ].map(k=>(
          <div key={k.label} style={{background:"var(--surface)",border:`1px solid ${k.color}30`,borderRadius:10,padding:"13px 16px"}}>
            <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{k.label}</div>
            <div style={{fontSize:18,fontWeight:800,color:k.color,fontFamily:"monospace"}}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        {/* Spend by project */}
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:12}}>Spend by Project</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={projChartData} margin={{top:4,right:8,left:0,bottom:50}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:9,fill:"var(--muted)"}} angle={-35} textAnchor="end" interval={0}/>
              <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:9,fill:"var(--muted)"}} width={60}/>
              <Tooltip content={({active,payload})=>active&&payload?.length?<div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",fontSize:11}}><div style={{fontWeight:700,marginBottom:4}}>{payload[0]?.payload?.fullName}</div>{payload.map(p=><div key={p.dataKey} style={{color:p.color}}>{p.name}: {fmt(p.value)}</div>)}</div>:null}/>
              <Bar dataKey="spend" name="Spend" fill="#f0a030" radius={[3,3,0,0]} maxBarSize={28}/>
              <Bar dataKey="open"  name="Open"  fill="#ef4444" radius={[3,3,0,0]} maxBarSize={28}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Monthly trend */}
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:16}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:12}}>Monthly PO Spend Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} margin={{top:4,right:8,left:0,bottom:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="month" tick={{fontSize:10,fill:"var(--muted)"}}/>
              <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:"var(--muted)"}} width={65}/>
              <Tooltip formatter={(val)=>fmt(val)} labelStyle={{color:"var(--text)"}} contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8}}/>
              <Bar dataKey="spend" name="Spend" fill="#8b5cf6" radius={[3,3,0,0]} maxBarSize={32}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PO list for this vendor */}
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700}}>Purchase Orders</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 120px 110px 110px 110px 80px",gap:8,padding:"8px 16px",background:"var(--s2)",borderBottom:"1px solid var(--border)"}}>
          {["PO Number","Date / Exp Del","Total Amount","Open Amount","Project","Status"].map((h,i)=>(
            <span key={h} style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",textAlign:i>1&&i<5?"right":"left"}}>{h}</span>
          ))}
        </div>
        <div style={{maxHeight:360,overflowY:"auto"}}>
          {v.pos.map((po,i)=>{
            const od=po.isOverdue;
            const sc=po.poStatus==="OPEN"?"#3b9eff":po.poStatus==="CLOSED"?"#22c55e":"#64748b";
            return(
              <div key={po.poNo+i} style={{display:"grid",gridTemplateColumns:"1fr 120px 110px 110px 110px 80px",gap:8,padding:"9px 16px",borderBottom:"1px solid var(--border)",alignItems:"center",background:i%2===0?"transparent":"var(--s2)"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--s2)"}>
                <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"var(--text)"}}>{po.poNo}</span>
                <div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{procFmtDate(po.poDate)}</div>
                  <div style={{fontSize:10,color:od?"#ef4444":"var(--s3)"}}>{procFmtDate(po.poExpDel)}{od?" ⚠":""}</div>
                </div>
                <span style={{fontSize:12,fontFamily:"monospace",textAlign:"right",fontWeight:700}}>{fmt(po.totalAmount)}</span>
                <span style={{fontSize:12,fontFamily:"monospace",textAlign:"right",color:"#ef4444",fontWeight:po.openAmount>0?700:400}}>{fmt(po.openAmount)}</span>
                <span style={{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{po.projectName}</span>
                <span style={{fontSize:10,fontWeight:700,color:sc,background:sc+"18",border:`1px solid ${sc}40`,borderRadius:5,padding:"2px 7px",textAlign:"center"}}>{po.poStatus}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExportButton({prs,pos,grpos,stats,label="Export"}){
  const [exporting,setExporting]=useState(false);
  const doExport=async()=>{
    setExporting(true);
    try{
      const wb=XLSX.utils.book_new();

      // ── Sheet 1: Dashboard Summary ────────────────────────────────────────
      const ts=new Date().toLocaleString("en-IN");
      const totalPOAmt=stats?.poLineTotal||0, openPOAmt=stats?.openPoAmount||0;
      const totalGRPOAmt=stats?.grpoLineTotal||0, openGRPOAmt=stats?.openGrpoAmount||0;
      const summaryRows=[
        ["PROCUREMENT DASHBOARD SUMMARY"],
        ["Exported on:", ts],
        [""],
        ["── FINANCIAL KPIs ──────────────────────────────"],
        ["Metric","Value (₹)","Formatted"],
        ["PO Line Total",    Math.round(totalPOAmt),   fmtAmt(totalPOAmt)],
        ["Open PO Amount",   Math.round(openPOAmt),    fmtAmt(openPOAmt)],
        ["Open PO %",        totalPOAmt>0?+((openPOAmt/totalPOAmt)*100).toFixed(1):0, totalPOAmt>0?((openPOAmt/totalPOAmt)*100).toFixed(1)+"%":"—"],
        ["GRPO Line Total",  Math.round(totalGRPOAmt), fmtAmt(totalGRPOAmt)],
        ["Open GRPO Amount", Math.round(openGRPOAmt),  fmtAmt(openGRPOAmt)],
        ["Open GRPO %",      totalGRPOAmt>0?+((openGRPOAmt/totalGRPOAmt)*100).toFixed(1):0, totalGRPOAmt>0?((openGRPOAmt/totalGRPOAmt)*100).toFixed(1)+"%":"—"],
        [""],
        ["── PURCHASE REQUESTS ───────────────────────────"],
        ["Metric","Count","%"],
        ["Total PRs",    prs.length, "100%"],
        ["Open PRs",     prs.filter(d=>d.prStatus==="OPEN").length,     prs.length>0?((prs.filter(d=>d.prStatus==="OPEN").length/prs.length)*100).toFixed(1)+"%":"—"],
        ["Closed PRs",   prs.filter(d=>d.prStatus==="CLOSED").length,   prs.length>0?((prs.filter(d=>d.prStatus==="CLOSED").length/prs.length)*100).toFixed(1)+"%":"—"],
        ["Cancelled PRs",prs.filter(d=>d.prStatus==="CANCELLED").length,prs.length>0?((prs.filter(d=>d.prStatus==="CANCELLED").length/prs.length)*100).toFixed(1)+"%":"—"],
        ["Overdue PRs",  prs.filter(d=>d.isOverdue).length, ""],
        [""],
        ["── PURCHASE ORDERS ─────────────────────────────"],
        ["Metric","Count","%"],
        ["Total POs",    pos.length, "100%"],
        ["Open POs",     pos.filter(d=>d.poStatus==="OPEN").length,     pos.length>0?((pos.filter(d=>d.poStatus==="OPEN").length/pos.length)*100).toFixed(1)+"%":"—"],
        ["Closed POs",   pos.filter(d=>d.poStatus==="CLOSED").length,   pos.length>0?((pos.filter(d=>d.poStatus==="CLOSED").length/pos.length)*100).toFixed(1)+"%":"—"],
        ["Cancelled POs",pos.filter(d=>d.poStatus==="CANCELLED").length,pos.length>0?((pos.filter(d=>d.poStatus==="CANCELLED").length/pos.length)*100).toFixed(1)+"%":"—"],
        ["Overdue POs",  pos.filter(d=>d.isOverdue).length, ""],
        [""],
        ["── GOODS RECEIPTS ──────────────────────────────"],
        ["Metric","Count","%"],
        ["Total GRPOs",    grpos.length, "100%"],
        ["Open GRPOs",     grpos.filter(d=>d.grpoStatus==="OPEN").length,     grpos.length>0?((grpos.filter(d=>d.grpoStatus==="OPEN").length/grpos.length)*100).toFixed(1)+"%":"—"],
        ["Closed GRPOs",   grpos.filter(d=>d.grpoStatus==="CLOSED").length,   grpos.length>0?((grpos.filter(d=>d.grpoStatus==="CLOSED").length/grpos.length)*100).toFixed(1)+"%":"—"],
        ["Cancelled GRPOs",grpos.filter(d=>d.grpoStatus==="CANCELLED").length,grpos.length>0?((grpos.filter(d=>d.grpoStatus==="CANCELLED").length/grpos.length)*100).toFixed(1)+"%":"—"],
        ["Overdue GRPOs",  grpos.filter(d=>d.isOverdue).length, ""],
      ];
      const sumWs=XLSX.utils.aoa_to_sheet(summaryRows);
      sumWs["!cols"]=[{wch:30},{wch:18},{wch:14}];
      XLSX.utils.book_append_sheet(wb,sumWs,"Dashboard Summary");

      // ── Sheet 2: PRs ──────────────────────────────────────────────────────
      const prRows=[["PR No","PR Date","Required Date","Status","Owner","Project","Total Qty","Open Qty","Items"]];
      prs.forEach(d=>prRows.push([d.prNo,d.prDate,d.prReqDate,d.prStatus,d.poOwner,d.projectName,d.totalQty,d.openQty,d.itemCount]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(prRows),"Purchase Requests");

      // ── Sheet 3: POs ──────────────────────────────────────────────────────
      const poRows=[["PO No","PO Date","Exp Delivery","Status","Owner","Vendor","Project","Total Amount (₹)","Open Amount (₹)","Items"]];
      pos.forEach(d=>poRows.push([d.poNo,d.poDate,d.poExpDel,d.poStatus,d.poOwner,d.vendorName||"",d.projectName,Math.round(d.totalAmount||0),Math.round(d.openAmount||0),d.itemCount]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(poRows),"Purchase Orders");

      // ── Sheet 4: GRPOs ────────────────────────────────────────────────────
      const grpoRows=[["GRPO No","GRPO Date","Mat Rec Date","Status","PO No","PR No","Owner","Project","GRPO Amount (₹)","Open GRPO Amount (₹)","Items"]];
      grpos.forEach(d=>grpoRows.push([d.grpoNo,d.grpoDate,d.matRecDate,d.grpoStatus,d.poNo,d.prNo,d.poOwner,d.projectName,Math.round(d.totalGrpoAmt||0),Math.round(d.openGrpoAmt||0),d.itemCount]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(grpoRows),"Goods Receipts");

      // ── Sheet 5: Vendor Summary ───────────────────────────────────────────
      const vendorMap={};
      pos.forEach(po=>{
        const v=po.vendorName||"Unknown";
        if(!vendorMap[v])vendorMap[v]={name:v,poCount:0,spend:0,openAmt:0,overdueCount:0};
        vendorMap[v].poCount++;vendorMap[v].spend+=po.totalAmount||0;vendorMap[v].openAmt+=po.openAmount||0;
        if(po.isOverdue)vendorMap[v].overdueCount++;
      });
      const vRows=[["Vendor","PO Count","Total Spend (₹)","Open Amount (₹)","Overdue POs"]];
      Object.values(vendorMap).sort((a,b)=>b.spend-a.spend).forEach(v=>vRows.push([v.name,v.poCount,Math.round(v.spend),Math.round(v.openAmt),v.overdueCount]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(vRows),"Vendor Summary");

      XLSX.writeFile(wb,`Procurement_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
    }catch(e){console.error(e);}
    setExporting(false);
  };
  return(
    <button onClick={doExport} disabled={exporting}
      style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",borderRadius:8,border:"1px solid var(--border)",background:"var(--s2)",color:"var(--text)",fontSize:12,fontWeight:600,cursor:exporting?"wait":"pointer",opacity:exporting?0.7:1}}>
      <span>{exporting?"⏳":"📥"}</span>
      <span>{exporting?"Exporting…":label}</span>
    </button>
  );
}

// CCS Projects — split by status
// Uses exact Excel project names where data exists; user-provided names for projects not yet in Excel
const CCS_CLOSED=new Set([
  // Blr
  "IBM - EGL - Colliers - Blr",
  "Manyata - Block L4 - Colliers - Blr",
  "WS Central - 18th Fl - Blr",
  "Visa - GF, 2Fl & 3Fl - Om sai Intex - Blr",
  "HSBC - B4 - JLL - Blr",
  // Hyd
  "Evernorth - CBRE - Hyd",
  "IVY - CBRE - Hyd",
  "EA - Savills - Hyd",
  // Mum
  "L&T - Seawood 412 office - Mum",
  "Hiranandini - Centaurus - Mum",
  "Sculpture Park - WTP - Mum",
  "Asian Paints - Vessel - Parel - CBRE - Mum",
  "Crisil - Powai - Mum",
  "Morgan Stanley - Parivartan - Mum",
  "BNP Paribas - L11 & L12 - Centaurus - Mum",
  // Pune
  "KRC - PACT - Pune",
  "Workspace Livspace - Pune",
  "Embassy - Qubix Business Park - Colliers - Pune",
  "Brookfield - 45 ICON (Block A & B) - Pune",
  "Infosys - 7F - G1 Building - Pune",
  "Infosys - SDB 03 - Raceway Works - Pune",
]);
const CCS_ACTIVE=new Set([
  // NCR
  "TCS - SDB 1 - NCR",
  // Mum
  "Growel_Mum",
  "UBS - Emerald - Front Office - Savills - Mum",
  "KRC - Cignus 2 - Mum",
  "Eastbridge Hiranandani - Vikhroli - Mum",
  "Kalpataru - Summit tower - Mulund - Mum",
  "German Consulate - MUMB - 3.OG - Mum",
  // Chn
  "Embassy-ESTZ-B1-Chn",
  // Blr
  "PAREXEL - C&W - BLR",
  // Pune
  "Persistent - Ph 2, 3 & 4 - Pune",
  "KRC B94-97 - Pune",
  // Hyd
  "Ashirvad Pipes - HVAC - JLL - Hyd",
  "Ashirwad Pipes - 33 KV HT Line - JLL- Hyd",
  "UBS - Savills - Hyd",
  "Sanofi - Ph 2 - Hyd",
]);
const CCS_PROJECTS=new Set([...CCS_CLOSED,...CCS_ACTIVE]);

// PR→PO target thresholds by group (in days)
const GROUP_PR_PO_THRESHOLD={
  "Consumables":   3,
  "Lead Item":     8,
  "Long Lead Item":15,
}; // default for all others = 7 (1 week)
const getThreshold=g=>GROUP_PR_PO_THRESHOLD[g]??7;

// ─── Pivot Drill-Down Modal ───────────────────────────────────────────────────
function PivotDrillModal({project,type,filter,docs,onClose}){
  const TYPE_CFG={
    PR: {color:"#8b5cf6",statusKey:"prStatus",  numKey:"prNo",   dateKey:"prDate",    dueDateKey:"prReqDate",  numLabel:"PR No",   dateLabel:"PR Date",   dueDateLabel:"Req. Date"},
    PO: {color:"#f0a030",statusKey:"poStatus",  numKey:"poNo",   dateKey:"poDate",    dueDateKey:"poExpDel",   numLabel:"PO No",   dateLabel:"PO Date",   dueDateLabel:"Exp. Delivery"},
    GRPO:{color:"#10b981",statusKey:"grpoStatus",numKey:"grpoNo", dateKey:"grpoDate",  dueDateKey:"matRecDate", numLabel:"GRPO No", dateLabel:"GRPO Date", dueDateLabel:"Mat. Rec. Date"},
  };
  const cfg=TYPE_CFG[type]||TYPE_CFG.PR;
  const FILTER_LABELS={all:"All",open:"Open",closed:"Closed",cancelled:"Cancelled",overdue:"Overdue ⚠"};
  const FILTER_COLORS={all:"var(--text)",open:"#3b9eff",closed:"#22c55e",cancelled:"#64748b",overdue:"#ef4444"};

  const sc=s=>s==="OPEN"?"#3b9eff":s==="CLOSED"?"#22c55e":s==="CANCELLED"?"#64748b":"#ef4444";

  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#000000aa",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}
      onClick={onClose}>
      <div style={{background:"var(--surface)",border:`1px solid ${cfg.color}40`,borderRadius:16,width:"100%",maxWidth:860,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:`0 0 40px ${cfg.color}20`}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color:cfg.color,textTransform:"uppercase",letterSpacing:"0.08em",background:cfg.color+"18",border:`1px solid ${cfg.color}30`,borderRadius:6,padding:"2px 8px"}}>{type}</span>
              <span style={{fontSize:11,fontWeight:700,color:FILTER_COLORS[filter],background:FILTER_COLORS[filter]+"18",border:`1px solid ${FILTER_COLORS[filter]}30`,borderRadius:6,padding:"2px 8px"}}>{FILTER_LABELS[filter]}</span>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:"var(--text)",maxWidth:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:12,color:"var(--muted)",fontFamily:"monospace"}}>{docs.length} record{docs.length!==1?"s":""}</span>
            <button onClick={onClose} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontSize:18,cursor:"pointer",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>

        {/* Table */}
        <div style={{overflowY:"auto",flex:1}}>
          {docs.length===0?(
            <div style={{textAlign:"center",padding:"48px 0",color:"var(--muted)"}}>
              <div style={{fontSize:36,marginBottom:10}}>📭</div>
              <div>No {type} records match this filter</div>
            </div>
          ):(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead style={{position:"sticky",top:0,zIndex:1}}>
                <tr>
                  <th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>#</th>
                  <th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:cfg.color,textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>{cfg.numLabel}</th>
                  <th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>{cfg.dateLabel}</th>
                  <th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>{cfg.dueDateLabel}</th>
                  {type==="PO"&&<th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>Vendor</th>}
                  <th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>Owner</th>
                  {type==="PO"&&<th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"#f0a030",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"right",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>PO Amount</th>}
                  {type==="PO"&&<th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"right",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>Open Amt</th>}
                  <th style={{padding:"9px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d,i)=>{
                  const docNo=d[cfg.numKey]||"—";
                  const isOD=d.isOverdue;
                  const fmtA=v=>{v=v||0;if(v>=10000000)return"₹"+(v/10000000).toFixed(2)+" Cr";if(v>=100000)return"₹"+(v/100000).toFixed(2)+" L";if(v>=1000)return"₹"+(v/1000).toFixed(1)+" K";return"₹"+Math.round(v).toLocaleString("en-IN");};
                  return(
                    <tr key={docNo+i} style={{background:i%2===0?"transparent":"var(--s2)"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--s2)"}>
                      <td style={{padding:"9px 14px",fontSize:11,color:"var(--muted)",fontFamily:"monospace",borderBottom:"1px solid var(--border)"}}>{String(i+1).padStart(2,"0")}</td>
                      <td style={{padding:"9px 14px",fontSize:13,fontWeight:700,color:cfg.color,fontFamily:"monospace",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{docNo}</td>
                      <td style={{padding:"9px 14px",fontSize:12,color:"var(--muted)",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{procFmtDate(d[cfg.dateKey])}</td>
                      <td style={{padding:"9px 14px",fontSize:12,color:isOD?"#ef4444":"var(--muted)",fontWeight:isOD?700:400,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{procFmtDate(d[cfg.dueDateKey])}{isOD&&" ⚠"}</td>
                      {type==="PO"&&<td style={{padding:"9px 14px",fontSize:12,color:"var(--text)",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{d.vendorName||"—"}</td>}
                      <td style={{padding:"9px 14px",fontSize:12,color:"var(--text)",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{d.poOwner||"—"}</td>
                      {type==="PO"&&<td style={{padding:"9px 14px",fontSize:12,fontWeight:700,color:"#f0a030",fontFamily:"monospace",textAlign:"right",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{fmtA(d.totalAmount)}</td>}
                      {type==="PO"&&<td style={{padding:"9px 14px",fontSize:12,fontWeight:700,color:"#ef4444",fontFamily:"monospace",textAlign:"right",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{fmtA(d.openAmount)}</td>}
                      <td style={{padding:"9px 14px",borderBottom:"1px solid var(--border)"}}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,background:sc(d[cfg.statusKey])+"18",color:sc(d[cfg.statusKey]),border:`1px solid ${sc(d[cfg.statusKey])}30`,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:sc(d[cfg.statusKey]),flexShrink:0}}/>
                          {d[cfg.statusKey]||"—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"10px 20px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"flex-end",flexShrink:0}}>
          <button onClick={onClose} style={{padding:"7px 20px",fontSize:12,fontWeight:600,borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",cursor:"pointer"}}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Pivot Panel ──────────────────────────────────────────────────────
function ProjectPivotPanel({stats,dateFrom,dateTo,selCCS}){
  const [tab,setTab]=useState("summary"); // "summary" | "table"
  const [drill,setDrill]=useState(null); // {project,type,filter,docs}
  const {rows,totals,label,count}=stats;

  const fmtA=v=>{v=v||0;if(v>=10000000)return"₹"+(v/10000000).toFixed(2)+" Cr";if(v>=100000)return"₹"+(v/100000).toFixed(2)+" L";if(v>=1000)return"₹"+(v/1000).toFixed(1)+" K";return"₹"+Math.round(v).toLocaleString("en-IN");};

  const isCCS=!!selCCS;
  const headerColor=isCCS?"#06b6d4":"#8b5cf6";

  // Summary card helper
  const SCard=({label,color,data,showAmt=false})=>(
    <div style={{background:"var(--surface)",border:`1px solid ${color}30`,borderRadius:12,padding:"16px 18px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <span style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span>
        <span style={{fontSize:22,fontWeight:800,color,fontFamily:"monospace"}}>{data.total}</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {[
          {l:"Open",     v:data.open,     c:"#3b9eff"},
          {l:"Closed",   v:data.closed,   c:"#22c55e"},
          {l:"Cancelled",v:data.cancelled,c:"#64748b"},
          {l:"Overdue",  v:data.overdue,  c:"#ef4444"},
        ].map(({l,v,c})=>(
          <div key={l} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0}}/>
              <span style={{fontSize:11,color:"var(--muted)"}}>{l}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:Math.max(4,data.total>0?(v/data.total)*80:0),height:4,borderRadius:2,background:c,transition:"width .3s"}}/>
              <span style={{fontSize:12,fontWeight:600,color:v>0?c:"var(--s3)",minWidth:20,textAlign:"right"}}>{v}</span>
            </div>
          </div>
        ))}
      </div>
      {showAmt&&(
        <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Line Total</span>
            <span style={{fontSize:13,fontWeight:700,color,fontFamily:"monospace"}}>{fmtA(data.lineTotal)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Open Amt</span>
            <span style={{fontSize:13,fontWeight:700,color:"#ef4444",fontFamily:"monospace"}}>{fmtA(data.openAmt)}</span>
          </div>
        </div>
      )}
    </div>
  );

  // Table columns
  const TH=({children,right=false,color})=>(
    <th style={{padding:"8px 12px",fontSize:10,fontWeight:700,color:color||"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:right?"right":"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>{children}</th>
  );
  const TD=({children,right=false,bold=false,color,mono=false})=>(
    <td style={{padding:"8px 12px",fontSize:12,textAlign:right?"right":"left",fontWeight:bold?700:400,color:color||"var(--text)",fontFamily:mono?"monospace":"inherit",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{children}</td>
  );
  const Pill=({v,c,onClick})=>{
    if(!v||v<=0)return <span style={{color:"var(--s3)"}}>—</span>;
    const base={background:c+"18",color:c,border:"1px solid "+c+"30",borderRadius:10,padding:"2px 9px",fontSize:10,fontWeight:700,cursor:onClick?"pointer":"default",transition:"all .15s"};
    return <span onClick={onClick} style={base}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.outline="2px solid "+c+"80";}}
      onMouseLeave={e=>{e.currentTarget.style.outline="none";}}
    >{v}</span>;
  };

  return(
    <>
    <div style={{marginBottom:24,background:"var(--surface)",border:`1px solid ${headerColor}30`,borderRadius:14,overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:"var(--s2)",borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${headerColor},#3b82f6)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏗️</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"var(--text)"}}>{label}</div>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
              {count} project{count!==1?"s":""} · {totals.pr.total+totals.po.total+totals.grpo.total} total documents
              {(dateFrom||dateTo)&&<span style={{marginLeft:6,color:"var(--accent)"}}>· 📅 {dateFrom||"…"} → {dateTo||"…"}</span>}
            </div>
          </div>
        </div>
        {/* Amount KPIs inline */}
        <div style={{display:"flex",gap:20,alignItems:"center"}}>
          {[
            {l:"PO Line Total",v:totals.po.lineTotal,c:"#f0a030"},
            {l:"Open PO Amt",  v:totals.po.openAmt,  c:"#ef4444"},
            {l:"GRPO Total",   v:totals.grpo.lineTotal,c:"#10b981"},
            {l:"Open GRPO",    v:totals.grpo.openAmt, c:"#06b6d4"},
          ].map(k=>(
            <div key={k.l} style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>{k.l}</div>
              <div style={{fontSize:14,fontWeight:800,color:k.c,fontFamily:"monospace"}}>{fmtA(k.v)}</div>
            </div>
          ))}
          {/* Tab toggle */}
          <div style={{display:"flex",gap:2,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:3,marginLeft:8}}>
            {[{k:"summary",l:"Summary"},{k:"table",l:"Pivot Table"}].map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)}
                style={{padding:"4px 12px",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,
                  background:tab===t.k?headerColor:"transparent",color:tab===t.k?"#fff":"var(--muted)"}}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary view — 3 cards side by side */}
      {tab==="summary"&&(
        <div style={{padding:18}}>
          {count===1?(
            // Single project — show 3 cards
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
              <SCard label="Purchase Requests" color="#8b5cf6" data={totals.pr}/>
              <SCard label="Purchase Orders"   color="#f0a030" data={totals.po} showAmt/>
              <SCard label="Goods Receipts"    color="#10b981" data={totals.grpo} showAmt/>
            </div>
          ):(
            // Multi project — show combined card + mini per-project strip
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:16}}>
                <SCard label="Purchase Requests" color="#8b5cf6" data={totals.pr}/>
                <SCard label="Purchase Orders"   color="#f0a030" data={totals.po} showAmt/>
                <SCard label="Goods Receipts"    color="#10b981" data={totals.grpo} showAmt/>
              </div>
              {/* Mini per-project bar */}
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Per Project — PO Line Total</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {rows.slice(0,10).map(r=>{
                  const pct=totals.po.lineTotal>0?((r.po.lineTotal/totals.po.lineTotal)*100):0;
                  return(
                    <div key={r.name} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:180,fontSize:11,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{r.name}</div>
                      <div style={{flex:1,height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:6,width:pct+"%",background:"#f0a030",borderRadius:3,transition:"width .4s"}}/>
                      </div>
                      <div style={{width:80,textAlign:"right",fontSize:11,fontWeight:700,color:"#f0a030",fontFamily:"monospace",flexShrink:0}}>{fmtA(r.po.lineTotal)}</div>
                      <div style={{width:40,textAlign:"right",fontSize:10,color:"var(--muted)",flexShrink:0}}>{pct.toFixed(0)}%</div>
                    </div>
                  );
                })}
                {rows.length>10&&<div style={{fontSize:11,color:"var(--muted)",textAlign:"center",paddingTop:4}}>+{rows.length-10} more — switch to Pivot Table view</div>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pivot Table view */}
      {tab==="table"&&(
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                <TH>Project</TH>
                <TH right color="#8b5cf6">PR Total</TH>
                <TH right color="#8b5cf6">PR Open</TH>
                <TH right color="#8b5cf6">PR Overdue</TH>
                <TH right color="#f0a030">PO Total</TH>
                <TH right color="#f0a030">PO Open</TH>
                <TH right color="#f0a030">PO Overdue</TH>
                <TH right color="#f0a030">PO Line Total</TH>
                <TH right color="#f0a030">Open PO Amt</TH>
                <TH right color="#10b981">GRPO Total</TH>
                <TH right color="#10b981">GRPO Open</TH>
                <TH right color="#10b981">GRPO Overdue</TH>
                <TH right color="#10b981">GRPO Line Total</TH>
                <TH right color="#10b981">Open GRPO Amt</TH>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={r.name} style={{background:i%2===0?"transparent":"var(--s2)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--s2)"}>
                  <TD><span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{r.name}</span></TD>
                  <TD right><Pill v={r.pr.total} c="#8b5cf6" onClick={()=>setDrill({project:r.name,type:"PR",filter:"all",docs:r.pr.docs.all})}/></TD>
                  <TD right><Pill v={r.pr.open} c="#3b9eff" onClick={()=>setDrill({project:r.name,type:"PR",filter:"open",docs:r.pr.docs.open})}/></TD>
                  <TD right><Pill v={r.pr.overdue} c="#ef4444" onClick={()=>setDrill({project:r.name,type:"PR",filter:"overdue",docs:r.pr.docs.overdue})}/></TD>
                  <TD right><Pill v={r.po.total} c="#f0a030" onClick={()=>setDrill({project:r.name,type:"PO",filter:"all",docs:r.po.docs.all})}/></TD>
                  <TD right><Pill v={r.po.open} c="#3b9eff" onClick={()=>setDrill({project:r.name,type:"PO",filter:"open",docs:r.po.docs.open})}/></TD>
                  <TD right><Pill v={r.po.overdue} c="#ef4444" onClick={()=>setDrill({project:r.name,type:"PO",filter:"overdue",docs:r.po.docs.overdue})}/></TD>
                  <TD right bold color="#f0a030" mono>{fmtA(r.po.lineTotal)}</TD>
                  <TD right bold color="#ef4444" mono>{fmtA(r.po.openAmt)}</TD>
                  <TD right><Pill v={r.grpo.total} c="#10b981" onClick={()=>setDrill({project:r.name,type:"GRPO",filter:"all",docs:r.grpo.docs.all})}/></TD>
                  <TD right><Pill v={r.grpo.open} c="#3b9eff" onClick={()=>setDrill({project:r.name,type:"GRPO",filter:"open",docs:r.grpo.docs.open})}/></TD>
                  <TD right><Pill v={r.grpo.overdue} c="#ef4444" onClick={()=>setDrill({project:r.name,type:"GRPO",filter:"overdue",docs:r.grpo.docs.overdue})}/></TD>
                  <TD right bold color="#10b981" mono>{fmtA(r.grpo.lineTotal)}</TD>
                  <TD right bold color="#06b6d4" mono>{fmtA(r.grpo.openAmt)}</TD>
                </tr>
              ))}
              {/* Totals row — visually distinct from project rows */}
              <tr style={{background:"linear-gradient(90deg,#0f1e35,#0f1e35)",borderTop:"2px solid var(--accent)",outline:"none"}}>
                <td style={{padding:"12px 14px",fontSize:12,fontWeight:800,color:"var(--accent)",letterSpacing:"0.06em",textTransform:"uppercase",borderRight:"2px solid var(--accent)",whiteSpace:"nowrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:16}}>∑</span>
                    <div>
                      <div>Grand Total</div>
                      <div style={{fontSize:10,color:"var(--muted)",fontWeight:500,textTransform:"none",letterSpacing:0}}>{rows.length} project{rows.length!==1?"s":""}</div>
                    </div>
                  </div>
                </td>
                {[
                  {v:totals.pr.total,   c:"#8b5cf6"},
                  {v:totals.pr.open,    c:"#3b9eff"},
                  {v:totals.pr.overdue||"—", c:"#ef4444"},
                  {v:totals.po.total,   c:"#f0a030"},
                  {v:totals.po.open,    c:"#3b9eff"},
                  {v:totals.po.overdue||"—", c:"#ef4444"},
                  {v:fmtA(totals.po.lineTotal),  c:"#f0a030", mono:true},
                  {v:fmtA(totals.po.openAmt),    c:"#ef4444", mono:true},
                  {v:totals.grpo.total, c:"#10b981"},
                  {v:totals.grpo.open,  c:"#3b9eff"},
                  {v:totals.grpo.overdue||"—",   c:"#ef4444"},
                  {v:fmtA(totals.grpo.lineTotal),c:"#10b981", mono:true},
                  {v:fmtA(totals.grpo.openAmt),  c:"#06b6d4", mono:true},
                ].map((cell,i)=>(
                  <td key={i} style={{padding:"12px 14px",textAlign:"right",fontSize:14,fontWeight:800,
                    color:cell.c,fontFamily:cell.mono?"monospace":"inherit",
                    borderBottom:"none",background:"transparent",
                    textShadow:`0 0 12px ${cell.c}60`}}>
                    {cell.v}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
    {drill&&<PivotDrillModal project={drill.project} type={drill.type} filter={drill.filter} docs={drill.docs} onClose={()=>setDrill(null)}/>}
    </>
  );
}

function ProcurementDashboard(){
  const [procData,setProcData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [activeTab,setActiveTab]=useState("PR");
  const [modal,setModal]=useState(null);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef(null);

  const handleFile=async file=>{
    if(!file)return;
    setLoading(true);
    try{
      const result=await parseProcurementExcel(file);
      setProcData(result);setActiveTab("PR");
      // ── Auto-set date range from actual data min/max ──
      const allTs=result.prs.map(d=>d.prDateTs).filter(Boolean);
      if(allTs.length){
        const minD=new Date(Math.min(...allTs.map(d=>d.getTime())));
        const maxD=new Date(Math.max(...allTs.map(d=>d.getTime())));
        const minStr=minD.toISOString().slice(0,10);
        const maxStr=maxD.toISOString().slice(0,10);
        setDateFrom(minStr);
        setDateTo(maxStr);
        setDataRange({min:minStr,max:maxStr});
      }
    }catch(e){alert("Error parsing file: "+e.message);}
    setLoading(false);
  };



  // ── Filter state (all before any early return — Rules of Hooks) ─────────────
  const [selProjects,setSelProjects]=useState(new Set());//empty=ALL
  const [projSearch,setProjSearch]=useState("");
  const [projOpen,setProjOpen]=useState(false);
  const [selOwners,setSelOwners]=useState(new Set());//empty=ALL
  const [ownerSearch,setOwnerSearch]=useState("");
  const [ownerOpen,setOwnerOpen]=useState(false);
  const [selCCS,setSelCCS]=useState("");//""=off, "ALL"=all CCS, "CLOSED"=CCS closed, "ACTIVE"=CCS active
  const [selGroup,setSelGroup]=useState("");//empty=ALL
  const [ownerTab,setOwnerTab]=useState("overview"); // "overview" | "pr" | "po" | "grpo"
  const [convDrill,setConvDrill]=useState(null); // {pairs, title, groupName, bucket}
  // ── Global date range filter (anchored on PR Date) ────────────────────────
  const [dateFrom,setDateFrom]=useState(""); // "YYYY-MM-DD"
  const [dateTo,setDateTo]=useState("");
  const [dateOpen,setDateOpen]=useState(false);
  const [dataRange,setDataRange]=useState(null); // {min,max} full range of uploaded file
  const dateActive=!!(dateFrom||dateTo);
  const isFullRange=!!(dataRange&&dateFrom===dataRange.min&&dateTo===dataRange.max);

  // ── Quarter presets derived from actual PR date range in data ────────────
  const quarterPresets=useMemo(()=>{
    if(!procData)return[];
    // Quarter range derived only from PR creation dates — consistent with the filter axis
    const allTs=procData.prs.map(d=>d.prDateTs).filter(Boolean);
    if(!allTs.length)return[];
    const minY=Math.min(...allTs.map(d=>d.getFullYear()));
    const maxY=Math.max(...allTs.map(d=>d.getFullYear()));
    const quarters=[];
    for(let y=minY;y<=maxY;y++){
      for(let q=1;q<=4;q++){
        const fm=new Date(y,(q-1)*3,1); const tm=new Date(y,q*3,0);
        if(fm<=allTs.reduce((a,b)=>a>b?a:b)&&tm>=allTs.reduce((a,b)=>a<b?a:b))
          quarters.push({label:`Q${q} FY${String(y).slice(2)}–${String(y+1).slice(2)}`,
            from:new Date(y,(q-1)*3,1).toISOString().slice(0,10),
            to:new Date(y,q*3,0).toISOString().slice(0,10)});
      }
    }
    return quarters;
  },[procData]);

  // ── When project/CCS selection changes, auto-update date range to that project's data ──
  useEffect(()=>{
    if(!procData)return;
    const activeProjSet=selCCS==="ALL"?CCS_PROJECTS:selCCS==="CLOSED"?CCS_CLOSED:selCCS==="ACTIVE"?CCS_ACTIVE:selProjects;
    const prs=activeProjSet.size===0
      ?procData.prs
      :procData.prs.filter(d=>activeProjSet.has(d.projectName));
    const allTs=prs.map(d=>d.prDateTs).filter(Boolean);
    if(!allTs.length)return;
    const minD=new Date(Math.min(...allTs.map(d=>d.getTime())));
    const maxD=new Date(Math.max(...allTs.map(d=>d.getTime())));
    const minStr=minD.toISOString().slice(0,10);
    const maxStr=maxD.toISOString().slice(0,10);
    setDateFrom(minStr);
    setDateTo(maxStr);
    setDataRange({min:minStr,max:maxStr});
  },[selProjects,selCCS,procData]);

  const allGroups=useMemo(()=>{
    if(!procData)return[];
    const s=new Set();
    [...procData.pos,...procData.grpos,...procData.prs].forEach(d=>{if(d.groupName)s.add(d.groupName);});
    return[...s].sort();
  },[procData]);

  const filteredProjects=useMemo(()=>{
    if(!procData)return[];
    const q=projSearch.toLowerCase().trim();
    return q?procData.projects.filter(p=>p.toLowerCase().includes(q)):procData.projects;
  },[procData,projSearch]);

  const filteredOwners=useMemo(()=>{
    if(!procData)return[];
    const q=ownerSearch.toLowerCase().trim();
    return q?procData.owners.filter(o=>o.toLowerCase().includes(q)):procData.owners;
  },[procData,ownerSearch]);

  const filteredTabs=useMemo(()=>{
    if(!procData)return[
      {key:"PR",label:"Purchase Requests",docs:[],statusKey:"prStatus",dateKey:"prReqDate",color:"#8b5cf6"},
      {key:"PO",label:"Purchase Orders",docs:[],statusKey:"poStatus",dateKey:"poExpDel",color:"#f0a030"},
      {key:"GRPO",label:"Goods Receipts",docs:[],statusKey:"grpoStatus",dateKey:"matRecDate",color:"#10b981"},
    ];
    const activeProjSet=selCCS==="ALL"?CCS_PROJECTS:selCCS==="CLOSED"?CCS_CLOSED:selCCS==="ACTIVE"?CCS_ACTIVE:selProjects;
    const byProj=d=>activeProjSet.size===0||activeProjSet.has(d.projectName);
    const byOwner=d=>selOwners.size===0||selOwners.has(d.poOwner);
    const byGroup=d=>!selGroup||d.groupName===selGroup;
    // Date filter — always anchored on PR creation date for all doc types.
    // For PRs: use prDateTs directly.
    // For POs/GRPOs: look up the PR creation date via prNo so all tabs
    // are filtered by the same consistent date axis.
    const fromTs=dateFrom?new Date(dateFrom):null;
    const toTs=dateTo?new Date(dateTo+"T23:59:59"):null;
    const prCreationMap={};
    procData.prs.forEach(pr=>{ if(pr.prDateTs) prCreationMap[pr.prNo]=pr.prDateTs; });
    const byDate=d=>{
      if(!fromTs&&!toTs)return true;
      // Resolve to PR creation date: direct for PRs, via prNo for POs/GRPOs
      const ts=d.prDateTs ?? prCreationMap[d.prNo] ?? null;
      // Records with no parseable date are always included — never silently drop them
      if(!ts)return true;
      if(fromTs&&ts<fromTs)return false;
      if(toTs&&ts>toTs)return false;
      return true;
    };
    const filt=d=>byProj(d)&&byOwner(d)&&byGroup(d)&&byDate(d);
    return[
      {key:"PR",   label:"Purchase Requests", docs:procData.prs.filter(filt),   statusKey:"prStatus",   dateKey:"prReqDate",  color:"#8b5cf6"},
      {key:"PO",   label:"Purchase Orders",   docs:procData.pos.filter(filt),   statusKey:"poStatus",   dateKey:"poExpDel",   color:"#f0a030"},
      {key:"GRPO", label:"Goods Receipts",    docs:procData.grpos.filter(filt), statusKey:"grpoStatus", dateKey:"matRecDate", color:"#10b981"},
    ];
  },[procData,selProjects,selOwners,selCCS,selGroup,dateFrom,dateTo]);

  // ── Owner stats (for the owner dashboard view) ────────────────────────────
  const ownerStats=useMemo(()=>{
    if(!procData||selOwners.size!==1)return null;
    const soloOwner=[...selOwners][0];
    const activeProjSet2=selCCS==="ALL"?new Set(CCS_PROJECTS):selCCS==="CLOSED"?new Set(CCS_CLOSED):selCCS==="ACTIVE"?new Set(CCS_ACTIVE):selProjects;
    const matchProj=d=>activeProjSet2.size===0||activeProjSet2.has(d.projectName);
    const prs=procData.prs.filter(d=>d.poOwner===soloOwner&&matchProj(d));
    const pos=procData.pos.filter(d=>d.poOwner===soloOwner&&matchProj(d));
    const grpos=procData.grpos.filter(d=>d.poOwner===soloOwner&&matchProj(d));

    // Build lookup maps for date calculation
    const prDateMap={};
    prs.forEach(pr=>{const d=pr.prDateTs;if(d)prDateMap[pr.prNo]=d;});
    const poDateMap={};
    pos.forEach(po=>{const d=po.poDateTs;if(d)poDateMap[po.poNo]=d;});

    // PR → PO: days between PR Date and PO Date, linked via po.prNo
    const prToPoDays=[];
    pos.forEach(po=>{
      const poD=po.poDateTs;
      const prD=prDateMap[po.prNo];
      if(poD&&prD){
        const diff=Math.round((poD-prD)/86400000);
        if(diff>=0&&diff<3650)prToPoDays.push(diff); // sanity cap 10 years
      }
    });

    // PO → GRPO: days between PO Date and Material Received Date, linked via grpo.poNo
    const poToGrpoDays=[];
    grpos.forEach(grpo=>{
      const matD=grpo.matRecDateTs;
      const poD=poDateMap[grpo.poNo];
      if(matD&&poD){
        const diff=Math.round((matD-poD)/86400000);
        if(diff>=0&&diff<3650)poToGrpoDays.push(diff);
      }
    });

    const avg=arr=>arr.length?Math.round(arr.reduce((s,v)=>s+v,0)/arr.length):null;
    const med=arr=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);};
    const min=arr=>arr.length?Math.min(...arr):null;
    const max=arr=>arr.length?Math.max(...arr):null;

    // Build PR lookup map (prNo → full PR doc) for drill-down
    const prByNo={};prs.forEach(pr=>{prByNo[pr.prNo]=pr;});
    const poByNo={};pos.forEach(po=>{poByNo[po.poNo]=po;});

    // Group-wise breakdown — store full pairs for drill-down
    const groupDays={};
    const ensureGroup=g=>{if(!groupDays[g])groupDays[g]={prToPo:[],poToGrpo:[]};};

    pos.forEach(po=>{
      const poD=po.poDateTs;
      const prD=prDateMap[po.prNo];
      if(poD&&prD){
        const diff=Math.round((poD-prD)/86400000);
        if(diff>=0&&diff<3650){
          prToPoDays.push(diff);
          const g=po.groupName||"Unknown";
          ensureGroup(g);
          groupDays[g].prToPo.push({days:diff,poNo:po.poNo,prNo:po.prNo,
            poDate:po.poDate,prDate:prByNo[po.prNo]?.prDate||"—",
            vendor:po.vendorName,project:po.projectName,itemCount:po.itemCount});
        }
      }
    });

    grpos.forEach(grpo=>{
      const matD=grpo.matRecDateTs;
      const poD=poDateMap[grpo.poNo];
      if(matD&&poD){
        const diff=Math.round((matD-poD)/86400000);
        if(diff>=0&&diff<3650){
          poToGrpoDays.push(diff);
          const g=grpo.groupName||"Unknown";
          ensureGroup(g);
          groupDays[g].poToGrpo.push({days:diff,grpoNo:grpo.grpoNo,poNo:grpo.poNo,
            matRecDate:grpo.matRecDate,poDate:poByNo[grpo.poNo]?.poDate||"—",
            vendor:grpo.vendorName,project:grpo.projectName});
        }
      }
    });

    const makeBuckets=(pairs,groupName)=>{
      const thr=getThreshold(groupName);
      const fast =pairs.filter(p=>p.days<=2);
      const target=pairs.filter(p=>p.days>2&&p.days<=thr);
      const slow  =pairs.filter(p=>p.days>thr);
      return{fast,target,slow,threshold:thr,
        avg:avg(pairs.map(p=>p.days)),count:pairs.length,
        days:pairs.map(p=>p.days)};
    };

    const groupStats=Object.entries(groupDays)
      .map(([name,d])=>({
        name,
        prToPo:{...makeBuckets(d.prToPo,name),pairs:d.prToPo},
        poToGrpo:{avg:avg(d.poToGrpo.map(p=>p.days)),count:d.poToGrpo.length,
          med:med(d.poToGrpo.map(p=>p.days)),min:min(d.poToGrpo.map(p=>p.days)),
          max:max(d.poToGrpo.map(p=>p.days)),pairs:d.poToGrpo},
      }))
      .sort((a,b)=>(b.prToPo.count+b.poToGrpo.count)-(a.prToPo.count+a.poToGrpo.count));

    return{
      owner:soloOwner,
      pr:{total:prs.length,open:prs.filter(d=>d.prStatus==="OPEN").length,closed:prs.filter(d=>d.prStatus==="CLOSED").length,cancelled:prs.filter(d=>d.prStatus==="CANCELLED").length,overdue:prs.filter(d=>d.isOverdue).length,docs:prs},
      po:{total:pos.length,open:pos.filter(d=>d.poStatus==="OPEN").length,closed:pos.filter(d=>d.poStatus==="CLOSED").length,cancelled:pos.filter(d=>d.poStatus==="CANCELLED").length,overdue:pos.filter(d=>d.isOverdue).length,docs:pos},
      grpo:{total:grpos.length,open:grpos.filter(d=>d.grpoStatus==="OPEN").length,closed:grpos.filter(d=>d.grpoStatus==="CLOSED").length,cancelled:grpos.filter(d=>d.grpoStatus==="CANCELLED").length,overdue:grpos.filter(d=>d.isOverdue).length,docs:grpos},
      prToPo:{avg:avg(prToPoDays),med:med(prToPoDays),min:min(prToPoDays),max:max(prToPoDays),count:prToPoDays.length},
      poToGrpo:{avg:avg(poToGrpoDays),med:med(poToGrpoDays),min:min(poToGrpoDays),max:max(poToGrpoDays),count:poToGrpoDays.length},
      groupStats,
    };
  },[procData,selOwners,selProjects,selCCS]);

  // ── Project pivot stats — triggers when any project selection is active ───────
  const projectStats=useMemo(()=>{
    // Always show when project(s) selected OR CCS filter active (even alongside owner filter)
    const activeProjSet=selCCS==="ALL"?CCS_PROJECTS:selCCS==="CLOSED"?CCS_CLOSED:selCCS==="ACTIVE"?CCS_ACTIVE:selProjects;
    if(!procData||activeProjSet.size===0)return null;
    // Use the already-date-filtered docs from filteredTabs so date range is respected
    const prs=filteredTabs[0].docs;
    const pos=filteredTabs[1].docs;
    const grpos=filteredTabs[2].docs;

    // Build per-project pivot rows
    const projSet=[...activeProjSet];
    const rows=projSet.map(proj=>{
      const pPRs =prs.filter(d=>d.projectName===proj);
      const pPOs =pos.filter(d=>d.projectName===proj);
      const pGRPOs=grpos.filter(d=>d.projectName===proj);
      return{
        name:proj,
        pr:{total:pPRs.length,open:pPRs.filter(d=>d.prStatus==="OPEN").length,closed:pPRs.filter(d=>d.prStatus==="CLOSED").length,cancelled:pPRs.filter(d=>d.prStatus==="CANCELLED").length,overdue:pPRs.filter(d=>d.isOverdue).length,
          docs:{all:pPRs,open:pPRs.filter(d=>d.prStatus==="OPEN"),closed:pPRs.filter(d=>d.prStatus==="CLOSED"),cancelled:pPRs.filter(d=>d.prStatus==="CANCELLED"),overdue:pPRs.filter(d=>d.isOverdue)}},
        po:{total:pPOs.length,open:pPOs.filter(d=>d.poStatus==="OPEN").length,closed:pPOs.filter(d=>d.poStatus==="CLOSED").length,cancelled:pPOs.filter(d=>d.poStatus==="CANCELLED").length,overdue:pPOs.filter(d=>d.isOverdue).length,
          lineTotal:pPOs.reduce((s,d)=>s+(d.totalAmount||0),0),openAmt:pPOs.reduce((s,d)=>s+(d.openAmount||0),0),
          docs:{all:pPOs,open:pPOs.filter(d=>d.poStatus==="OPEN"),closed:pPOs.filter(d=>d.poStatus==="CLOSED"),cancelled:pPOs.filter(d=>d.poStatus==="CANCELLED"),overdue:pPOs.filter(d=>d.isOverdue)}},
        grpo:{total:pGRPOs.length,open:pGRPOs.filter(d=>d.grpoStatus==="OPEN").length,closed:pGRPOs.filter(d=>d.grpoStatus==="CLOSED").length,cancelled:pGRPOs.filter(d=>d.grpoStatus==="CANCELLED").length,overdue:pGRPOs.filter(d=>d.isOverdue).length,
          lineTotal:pGRPOs.reduce((s,d)=>s+(d.totalGrpoAmt||0),0),openAmt:pGRPOs.reduce((s,d)=>s+(d.openGrpoAmt||0),0),
          docs:{all:pGRPOs,open:pGRPOs.filter(d=>d.grpoStatus==="OPEN"),closed:pGRPOs.filter(d=>d.grpoStatus==="CLOSED"),cancelled:pGRPOs.filter(d=>d.grpoStatus==="CANCELLED"),overdue:pGRPOs.filter(d=>d.isOverdue)}},
      };
    }).filter(r=>r.pr.total+r.po.total+r.grpo.total>0)
      .sort((a,b)=>(b.po.lineTotal)-(a.po.lineTotal));

    // Totals row
    const totals={
      pr:{total:0,open:0,closed:0,cancelled:0,overdue:0},
      po:{total:0,open:0,closed:0,cancelled:0,overdue:0,lineTotal:0,openAmt:0},
      grpo:{total:0,open:0,closed:0,cancelled:0,overdue:0,lineTotal:0,openAmt:0},
    };
    rows.forEach(r=>{
      ["total","open","closed","cancelled","overdue"].forEach(k=>{totals.pr[k]+=r.pr[k];totals.po[k]+=r.po[k];totals.grpo[k]+=r.grpo[k];});
      totals.po.lineTotal+=r.po.lineTotal;totals.po.openAmt+=r.po.openAmt;
      totals.grpo.lineTotal+=r.grpo.lineTotal;totals.grpo.openAmt+=r.grpo.openAmt;
    });

    const label=selCCS==="ALL"?"CCS — All Projects":selCCS==="CLOSED"?"CCS — Closed Projects":selCCS==="ACTIVE"?"CCS — Active Projects":
      activeProjSet.size===1?[...activeProjSet][0]:activeProjSet.size+" Projects Selected";
    return{rows,totals,label,count:activeProjSet.size};
  },[filteredTabs,procData,selProjects,selCCS]);

  const active=filteredTabs.find(t=>t.key===activeTab);

  const filteredStats=useMemo(()=>({
    totalPR:filteredTabs[0].docs.length, openPR:filteredTabs[0].docs.filter(d=>d.prStatus==="OPEN").length, overduePR:filteredTabs[0].docs.filter(d=>d.isOverdue).length,
    totalPO:filteredTabs[1].docs.length, openPO:filteredTabs[1].docs.filter(d=>d.poStatus==="OPEN").length, overduePO:filteredTabs[1].docs.filter(d=>d.isOverdue).length,
    totalGRPO:filteredTabs[2].docs.length,openGRPO:filteredTabs[2].docs.filter(d=>d.grpoStatus==="OPEN").length,overdueGRPO:filteredTabs[2].docs.filter(d=>d.isOverdue).length,
    poLineTotal:filteredTabs[1].docs.reduce((s,d)=>s+(d.totalAmount||0),0),
    openPoAmount:filteredTabs[1].docs.reduce((s,d)=>s+(d.openAmount||0),0),
    grpoLineTotal:filteredTabs[2].docs.reduce((s,d)=>s+(d.totalGrpoAmt||0),0),
    openGrpoAmount:filteredTabs[2].docs.reduce((s,d)=>s+(d.openGrpoAmt||0),0),
  }),[filteredTabs]);

  // ── Precomputed index maps — avoid O(n*m) filter calls inside render ─────────
  const projCounts=useMemo(()=>{
    if(!procData)return{};
    const m={};
    const inc=(key,proj)=>{if(!m[proj])m[proj]={pr:0,po:0,grpo:0};m[proj][key]++;};
    procData.prs.forEach(d=>inc("pr",d.projectName));
    procData.pos.forEach(d=>inc("po",d.projectName));
    procData.grpos.forEach(d=>inc("grpo",d.projectName));
    return m;
  },[procData]);

  const ownerCounts=useMemo(()=>{
    if(!procData)return{};
    const m={};
    const ensure=o=>{if(!m[o])m[o]={prs:0,pos:0,grpos:0,open:0,overdue:0};};
    procData.prs.forEach(d=>{ensure(d.poOwner);m[d.poOwner].prs++;if(d.prStatus==="OPEN")m[d.poOwner].open++;if(d.isOverdue)m[d.poOwner].overdue++;});
    procData.pos.forEach(d=>{ensure(d.poOwner);m[d.poOwner].pos++;if(d.poStatus==="OPEN")m[d.poOwner].open++;if(d.isOverdue)m[d.poOwner].overdue++;});
    procData.grpos.forEach(d=>{ensure(d.poOwner);m[d.poOwner].grpos++;if(d.grpoStatus==="OPEN")m[d.poOwner].open++;if(d.isOverdue)m[d.poOwner].overdue++;});
    return m;
  },[procData]);

  // ── Group-wise conversion stats (global, respects project/owner/group filters) ─
  const groupConvStats=useMemo(()=>{
    if(!procData)return[];
    const pos=filteredTabs[1].docs;
    const grpos=filteredTabs[2].docs;
    const prs=filteredTabs[0].docs;
    const avg=arr=>arr.length?Math.round(arr.reduce((s,v)=>s+v,0)/arr.length):null;
    const med=arr=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);};
    // build PR date lookup
    const prDateMap={};
    prs.forEach(pr=>{const d=pr.prDateTs;if(d)prDateMap[pr.prNo]=d;});
    const poDateMap={};
    pos.forEach(po=>{const d=po.poDateTs;if(d)poDateMap[po.poNo]=d;});
    const gd={};
    const eg=g=>{if(!gd[g])gd[g]={prToPo:[],poToGrpo:[]};};
    pos.forEach(po=>{
      const poD=po.poDateTs,prD=prDateMap[po.prNo];
      if(poD&&prD){const diff=Math.round((poD-prD)/86400000);if(diff>=0&&diff<3650){const g=po.groupName||"Unknown";eg(g);gd[g].prToPo.push(diff);}}
    });
    grpos.forEach(grpo=>{
      const matD=grpo.matRecDateTs,poD=poDateMap[grpo.poNo];
      if(matD&&poD){const diff=Math.round((matD-poD)/86400000);if(diff>=0&&diff<3650){const g=grpo.groupName||"Unknown";eg(g);gd[g].poToGrpo.push(diff);}}
    });
    return Object.entries(gd)
      .map(([name,d])=>({name,
        prToPo:{avg:avg(d.prToPo),med:med(d.prToPo),min:d.prToPo.length?Math.min(...d.prToPo):null,max:d.prToPo.length?Math.max(...d.prToPo):null,count:d.prToPo.length},
        poToGrpo:{avg:avg(d.poToGrpo),med:med(d.poToGrpo),min:d.poToGrpo.length?Math.min(...d.poToGrpo):null,max:d.poToGrpo.length?Math.max(...d.poToGrpo):null,count:d.poToGrpo.length},
      }))
      .sort((a,b)=>(b.prToPo.count+b.poToGrpo.count)-(a.prToPo.count+a.poToGrpo.count));
  },[filteredTabs,procData]);

  if(!procData){
    return(
      <div className="fade-in">
        <div style={{marginBottom:24}}>
          <h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>📦 Procurement Tracker</h1>
          <p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>Upload your PR / PO / GRPO Excel file to generate dashboards</p>
        </div>
        <Card style={{maxWidth:560}}>
          <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>fileRef.current?.click()}
            style={{border:`2px dashed ${drag?"var(--accent)":"var(--border)"}`,borderRadius:12,padding:"40px 24px",textAlign:"center",cursor:"pointer",background:drag?"var(--s3)":"var(--s2)",transition:"all .2s",marginBottom:20}}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            {loading
              ?<div style={{color:"var(--accent)",fontSize:14}}>⏳ Parsing file…</div>
              :<>
                <div style={{fontSize:40,marginBottom:12}}>📊</div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:5}}>{drag?"Drop to upload":"Drag & drop Excel file here"}</div>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:16}}>or click to browse · .xlsx, .xls supported</div>
                <div style={{display:"inline-block",background:"var(--accent)",color:"#fff",padding:"8px 20px",borderRadius:8,fontSize:13,fontWeight:600}}>Browse File</div>
              </>
            }
          </div>
          <div style={{background:"var(--s2)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase",marginBottom:8}}>Expected Columns</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {["PR No","Item Name","PR Date","PR Required Date","PR Status","PO Owner Name","PO No","PO Date","PO Exp. Delivery Date","PO Status","GRPO No","GRPO Date","Material Received Date","GRPO Creation Date","GRPO Status"].map(c=>(
                <span key={c} style={{fontSize:11,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:5,padding:"2px 8px",color:"var(--muted)"}}>{c}</span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if(activeTab!=="VENDORS"&&(!active||!filteredStats))return null;

  // ── Reusable dropdown builder ──────────────────────────────────────────────
  const Dropdown=({label,icon,isOpen,setOpen,setSearch,selected,onClear,trigger,children})=>(
    <div style={{flex:1,minWidth:220,position:"relative"}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase",marginBottom:6}}>
        {label}
        {selected!=="ALL"&&<button onClick={onClear} style={{marginLeft:8,background:"none",border:"none",color:"var(--accent)",fontSize:11,cursor:"pointer",fontWeight:600,padding:0}}>✕ Clear</button>}
      </div>
      <button onClick={()=>{setOpen(o=>!o);setSearch("");}}
        style={{display:"flex",alignItems:"center",gap:8,background:"var(--s2)",border:`1px solid ${isOpen?"var(--accent)":"var(--border)"}`,borderRadius:9,padding:"9px 14px",cursor:"pointer",width:"100%",textAlign:"left",transition:"border-color .15s"}}>
        <span style={{fontSize:15}}>{icon}</span>
        {trigger}
        <span style={{fontSize:10,color:"var(--muted)",flexShrink:0,marginLeft:"auto"}}>{isOpen?"▲":"▼"}</span>
      </button>
      {isOpen&&(
        <div style={{position:"absolute",top:"100%",left:0,zIndex:300,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 8px 32px #00000070",width:"100%",marginTop:4,overflow:"hidden"}}>
          {children}
        </div>
      )}
    </div>
  );

  return(
    <div className="fade-in">

      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>📦 Procurement Tracker</h1>
          <div style={{display:"flex",gap:16,marginTop:5,flexWrap:"wrap"}}>
            {[
              {label:"PR",  total:filteredStats.totalPR,  open:filteredStats.openPR,  overdue:filteredStats.overduePR,  color:"#8b5cf6"},
              {label:"PO",  total:filteredStats.totalPO,  open:filteredStats.openPO,  overdue:filteredStats.overduePO,  color:"#f0a030"},
              {label:"GRPO",total:filteredStats.totalGRPO,open:filteredStats.openGRPO,overdue:filteredStats.overdueGRPO,color:"#10b981"},
            ].map(s=>(
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:s.color}}/>
                <span style={{color:"var(--muted)"}}>{s.label}</span>
                <span style={{color:"var(--text)",fontWeight:600}}>{s.total}</span>
                <span style={{color:"var(--muted)"}}>·</span>
                <span style={{color:"#3b9eff"}}>{s.open} open</span>
                {s.overdue>0&&<><span style={{color:"var(--muted)"}}>·</span><span style={{color:"var(--red)"}}>{s.overdue} ⚠</span></>}
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <ExportButton prs={filteredTabs[0].docs} pos={filteredTabs[1].docs} grpos={filteredTabs[2].docs} stats={filteredStats} label="Export Filtered"/>
          <Btn variant="ghost" small onClick={()=>{setProcData(null);setSelProjects(new Set());setSelOwners(new Set());setSelCCS("");setDateFrom("");setDateTo("");setDataRange(null);}}>↑ Upload New File</Btn>
        </div>
      </div>

      {/* ── Amount KPIs ── */}
      {(()=>{
        const fmtA=v=>{v=v||0;if(v>=10000000)return"₹"+(v/10000000).toFixed(1)+" Cr";if(v>=100000)return"₹"+(v/100000).toFixed(1)+" L";if(v>=1000)return"₹"+(v/1000).toFixed(1)+" K";return"₹"+Math.round(v).toLocaleString("en-IN");};
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {[
              {label:"PO Line Total",    value:fmtA(filteredStats.poLineTotal),  color:"#f0a030"},
              {label:"Open PO Amount",   value:fmtA(filteredStats.openPoAmount), color:"#ef4444"},
              {label:"GRPO Line Total",  value:fmtA(filteredStats.grpoLineTotal),color:"#10b981"},
              {label:"Open GRPO Amount", value:fmtA(filteredStats.openGrpoAmount),color:"#06b6d4"},
            ].map(k=>(
              <div key={k.label} style={{background:"var(--surface)",border:`1px solid ${k.color}30`,borderRadius:10,padding:"13px 16px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:k.color,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{k.label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:k.color,fontFamily:"monospace"}}>{k.value}</div>

                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Filters row ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>

        {/* ── Project column ── */}
        <div>
        {/* Project filter — multi-select */}
        <Dropdown label="Filter by Project" icon="🏗️" isOpen={projOpen} setOpen={setProjOpen} setSearch={setProjSearch}
          selected={selProjects.size>0?"x":null} onClear={()=>{setSelProjects(new Set());setProjOpen(false);setSelCCS("");}}
          trigger={<span style={{flex:1,fontSize:13,color:selProjects.size===0&&!selCCS?"var(--muted)":"var(--text)",fontWeight:selProjects.size===0&&!selCCS?400:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {selCCS==="ALL"?"CCS — All ("+CCS_PROJECTS.size+")":selCCS==="CLOSED"?"CCS — Closed ("+CCS_CLOSED.size+")":selCCS==="ACTIVE"?"CCS — Active ("+CCS_ACTIVE.size+")":selProjects.size===0?"All Projects ("+procData.projects.length+")":selProjects.size===1?[...selProjects][0]:selProjects.size+" projects selected"}
          </span>}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--border)",display:"flex",gap:6,alignItems:"center"}}>
            <input value={projSearch} onChange={e=>setProjSearch(e.target.value)} placeholder="Search projects…" autoFocus
              style={{flex:1,background:"var(--s2)",border:"1px solid var(--border)",borderRadius:7,padding:"7px 10px",color:"var(--text)",fontSize:12,outline:"none"}}/>
            {selProjects.size>0&&<button onClick={()=>setSelProjects(new Set())}
              style={{fontSize:11,color:"var(--muted)",background:"none",border:"1px solid var(--border)",borderRadius:6,padding:"4px 8px",cursor:"pointer"}}>Clear</button>}
          </div>
          <div style={{maxHeight:300,overflowY:"auto"}}>
            {/* All Projects option */}
            {(!projSearch)&&(
              <div onClick={()=>{setSelProjects(new Set());setSelCCS("");setProjOpen(false);}}
                style={{padding:"8px 12px",cursor:"pointer",background:selProjects.size===0&&!selCCS?"var(--s3)":"transparent",borderBottom:"1px solid var(--border)"}}
                onMouseEnter={e=>{if(selProjects.size>0||selCCS)e.currentTarget.style.background="var(--s2)"}}
                onMouseLeave={e=>{e.currentTarget.style.background=selProjects.size===0&&!selCCS?"var(--s3)":"transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:13,color:selProjects.size===0&&!selCCS?"var(--accent)":"var(--text)",fontWeight:selProjects.size===0&&!selCCS?700:400,flex:1}}>All Projects</span>
                  <span style={{fontSize:10,color:"var(--muted)",fontFamily:"monospace"}}>{procData.projects.length}</span>
                </div>
              </div>
            )}
            {/* CCS options — 3 rows */}
            {(!projSearch)&&[
              {key:"ALL",   label:"🏢 CCS — All Projects",    count:CCS_PROJECTS.size, color:"#06b6d4"},
              {key:"ACTIVE",label:"🟢 CCS — Active Projects",  count:CCS_ACTIVE.size,   color:"#22c55e"},
              {key:"CLOSED",label:"🔴 CCS — Closed Projects",  count:CCS_CLOSED.size,   color:"#ef4444"},
            ].map(opt=>(
              <div key={opt.key} onClick={()=>{setSelCCS(v=>v===opt.key?"":opt.key);setSelProjects(new Set());}}
                style={{padding:"8px 12px",cursor:"pointer",background:selCCS===opt.key?"var(--s3)":"transparent",borderBottom:opt.key==="CLOSED"?"2px solid var(--border)":"1px solid var(--border)"}}
                onMouseEnter={e=>{if(selCCS!==opt.key)e.currentTarget.style.background="var(--s2)"}}
                onMouseLeave={e=>{e.currentTarget.style.background=selCCS===opt.key?"var(--s3)":"transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:14,height:14,borderRadius:3,border:"2px solid",borderColor:selCCS===opt.key?opt.color:"var(--border)",background:selCCS===opt.key?opt.color:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {selCCS===opt.key&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                  </span>
                  <span style={{fontSize:13,color:selCCS===opt.key?opt.color:"var(--text)",fontWeight:selCCS===opt.key?700:400,flex:1}}>{opt.label}</span>
                  <span style={{fontSize:11,color:"var(--muted)",marginLeft:"auto"}}>{opt.count} projects</span>
                </div>
              </div>
            ))}
            {filteredProjects.map(p=>{
              const isSel=selProjects.has(p)||(selCCS==="ALL"&&CCS_PROJECTS.has(p))||(selCCS==="ACTIVE"&&CCS_ACTIVE.has(p))||(selCCS==="CLOSED"&&CCS_CLOSED.has(p));
              const prc=(projCounts[p]?.pr||0);
              return(
                <div key={p} onClick={()=>{
                    if(selCCS){setSelCCS("");const ns=new Set([p]);setSelProjects(ns);}
                    else{const ns=new Set(selProjects);ns.has(p)?ns.delete(p):ns.add(p);setSelProjects(ns);}
                  }}
                  style={{padding:"8px 12px",cursor:"pointer",background:isSel?"var(--s3)":"transparent",borderBottom:"1px solid var(--border)"}}
                  onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="var(--s2)"}}
                  onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isSel?"var(--s3)":"transparent"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:14,height:14,borderRadius:3,border:"2px solid",borderColor:isSel?"var(--accent)":"var(--border)",background:isSel?"var(--accent)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {isSel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                    </span>
                    <span style={{fontSize:12,color:isSel?"var(--accent)":"var(--text)",fontWeight:isSel?700:400,flex:1}}>{p}</span>
                    {CCS_ACTIVE.has(p)&&<span style={{fontSize:9,color:"#22c55e",background:"#22c55e15",border:"1px solid #22c55e30",borderRadius:4,padding:"1px 5px"}}>CCS Active</span>}
                    {CCS_CLOSED.has(p)&&<span style={{fontSize:9,color:"#ef4444",background:"#ef444415",border:"1px solid #ef444430",borderRadius:4,padding:"1px 5px"}}>CCS Closed</span>}
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:2,paddingLeft:22}}>
                    <span style={{fontSize:10,color:"#8b5cf6"}}>{prc} PRs</span>
                    <span style={{fontSize:10,color:"#f0a030"}}>{projCounts[p]?.po||0} POs</span>
                    <span style={{fontSize:10,color:"#10b981"}}>{projCounts[p]?.grpo||0} GRPOs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Dropdown>
        {/* Project chips */}
        {(selCCS||selProjects.size>0)&&(
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8,alignItems:"center"}}>
            {selCCS&&(
              <span style={{display:"flex",alignItems:"center",gap:4,
                background:selCCS==="ACTIVE"?"#22c55e15":selCCS==="CLOSED"?"#ef444415":"#06b6d410",
                border:`1px solid ${selCCS==="ACTIVE"?"#22c55e40":selCCS==="CLOSED"?"#ef444440":"#06b6d440"}`,
                borderRadius:20,padding:"3px 10px",fontSize:11,
                color:selCCS==="ACTIVE"?"#22c55e":selCCS==="CLOSED"?"#ef4444":"#06b6d4",fontWeight:600}}>
                {selCCS==="ALL"?"🏢 CCS All ("+CCS_PROJECTS.size+")":selCCS==="ACTIVE"?"🟢 CCS Active ("+CCS_ACTIVE.size+")":"🔴 CCS Closed ("+CCS_CLOSED.size+")"}
                <button onClick={()=>setSelCCS("")} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",padding:0,fontSize:12,lineHeight:1}}>×</button>
              </span>
            )}
            {[...selProjects].map(p=>(
              <span key={p} style={{display:"flex",alignItems:"center",gap:4,background:"var(--s3)",border:"1px solid var(--border)",borderRadius:20,padding:"3px 10px",fontSize:11,color:"var(--text)"}}>
                🏗️ {p.length>28?p.slice(0,28)+"…":p}
                <button onClick={()=>{const ns=new Set(selProjects);ns.delete(p);setSelProjects(ns);}} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",padding:0,fontSize:12,lineHeight:1}}>×</button>
              </span>
            ))}
          </div>
        )}
        </div>

        {/* ── Owner column ── */}
        <div>
        {/* Owner filter — multi-select */}
        <Dropdown label="Filter by Owner" icon="👤" isOpen={ownerOpen} setOpen={setOwnerOpen} setSearch={setOwnerSearch}
          selected={selOwners.size>0?"x":null} onClear={()=>{setSelOwners(new Set());setOwnerOpen(false);setOwnerTab("overview");}}
          trigger={<span style={{flex:1,fontSize:13,color:selOwners.size===0?"var(--muted)":"var(--text)",fontWeight:selOwners.size===0?400:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {selOwners.size===0?"All Owners ("+procData.owners.length+")":selOwners.size===1?[...selOwners][0]:selOwners.size+" owners selected"}
          </span>}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--border)",display:"flex",gap:6,alignItems:"center"}}>
            <input value={ownerSearch} onChange={e=>setOwnerSearch(e.target.value)} placeholder="Search owners…" autoFocus
              style={{flex:1,background:"var(--s2)",border:"1px solid var(--border)",borderRadius:7,padding:"7px 10px",color:"var(--text)",fontSize:12,outline:"none"}}/>
            {selOwners.size>0&&<button onClick={()=>setSelOwners(new Set())}
              style={{fontSize:11,color:"var(--muted)",background:"none",border:"1px solid var(--border)",borderRadius:6,padding:"4px 8px",cursor:"pointer"}}>Clear</button>}
          </div>
          <div style={{maxHeight:280,overflowY:"auto"}}>
            {filteredOwners.map(o=>{
              const isSel=selOwners.has(o);
              return(
                <div key={o} onClick={()=>{const ns=new Set(selOwners);ns.has(o)?ns.delete(o):ns.add(o);setSelOwners(ns);setOwnerTab("overview");}}
                  style={{padding:"8px 12px",cursor:"pointer",background:isSel?"var(--s3)":"transparent",borderBottom:"1px solid var(--border)"}}
                  onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="var(--s2)"}}
                  onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isSel?"var(--s3)":"transparent"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:14,height:14,borderRadius:3,border:"2px solid",borderColor:isSel?"var(--accent)":"var(--border)",background:isSel?"var(--accent)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {isSel&&<span style={{color:"#fff",fontSize:9,fontWeight:900}}>✓</span>}
                    </span>
                    <span style={{fontSize:12,color:isSel?"var(--accent)":"var(--text)",fontWeight:isSel?700:400,flex:1}}>{o}</span>
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:2,paddingLeft:22}}>
                    <span style={{fontSize:10,color:"#3b9eff"}}>{ownerCounts[o]?.open||0} open</span>
                    {(ownerCounts[o]?.overdue||0)>0&&<span style={{fontSize:10,color:"#ef4444"}}>{ownerCounts[o].overdue} ⚠ overdue</span>}
                    <span style={{fontSize:10,color:"var(--muted)"}}>{ownerCounts[o]?.prs||0}PR · {ownerCounts[o]?.pos||0}PO · {ownerCounts[o]?.grpos||0}GRPO</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Dropdown>
        {/* Owner chips */}
        {selOwners.size>0&&(
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8,alignItems:"center"}}>
            {[...selOwners].map(o=>(
              <span key={o} style={{display:"flex",alignItems:"center",gap:4,background:"var(--s3)",border:"1px solid var(--border)",borderRadius:20,padding:"3px 10px",fontSize:11,color:"var(--text)"}}>
                👤 {o}
                <button onClick={()=>{const ns=new Set(selOwners);ns.delete(o);setSelOwners(ns);}} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",padding:0,fontSize:12,lineHeight:1}}>×</button>
              </span>
            ))}
          </div>
        )}
        </div>

        {/* ── Date Range column ── */}
        <div style={{position:"relative"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
            <span>Filter by PR Creation Date</span>
            {dataRange&&!isFullRange&&(
              <button onClick={()=>{setDateFrom(dataRange.min);setDateTo(dataRange.max);}}
                style={{background:"none",border:"1px solid var(--accent)",borderRadius:10,color:"var(--accent)",fontSize:10,cursor:"pointer",fontWeight:700,padding:"1px 8px",lineHeight:"16px"}}>
                ↺ Full Range
              </button>
            )}
            {dateActive&&(
              <button onClick={()=>{setDateFrom("");setDateTo("");}}
                style={{background:"none",border:"none",color:"var(--muted)",fontSize:11,cursor:"pointer",fontWeight:600,padding:0,marginLeft:"auto"}}>
                ✕ Clear
              </button>
            )}
          </div>
          <button onClick={()=>setDateOpen(o=>!o)}
            style={{display:"flex",alignItems:"center",gap:8,background:dateActive&&!isFullRange?"#1e3a5f":"var(--s2)",border:`1px solid ${dateOpen?"var(--accent)":dateActive&&!isFullRange?"var(--accent)":"var(--border)"}`,borderRadius:9,padding:"9px 14px",cursor:"pointer",width:"100%",textAlign:"left",transition:"border-color .15s"}}>
            <span style={{fontSize:15}}>📅</span>
            <span style={{flex:1,fontSize:13,color:dateActive&&!isFullRange?"var(--accent)":"var(--muted)",fontWeight:dateActive&&!isFullRange?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {dateActive?(dateFrom||"…")+" → "+(dateTo||"…")+(isFullRange?" (Full Range)":""):"All Dates"}
            </span>
            <span style={{fontSize:10,color:"var(--muted)",flexShrink:0,marginLeft:"auto"}}>{dateOpen?"▲":"▼"}</span>
          </button>

          {dateOpen&&(
            <div style={{position:"absolute",top:"100%",left:0,zIndex:400,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,boxShadow:"0 8px 32px #00000070",width:340,marginTop:4,padding:16}}>

              {/* ── Data range banner ── */}
              {dataRange&&(
                <div style={{background:"var(--s3)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>📊 Data Range in File</div>
                    <div style={{fontSize:12,color:"var(--green)",fontWeight:700,fontFamily:"monospace"}}>{dataRange.min} → {dataRange.max}</div>
                  </div>
                  <button onClick={()=>{setDateFrom(dataRange.min);setDateTo(dataRange.max);}}
                    style={{padding:"4px 10px",fontSize:11,fontWeight:700,borderRadius:6,border:"1px solid var(--green)",background:"transparent",color:"var(--green)",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                    Use Full Range
                  </button>
                </div>
              )}

              {/* From / To — manual inputs */}
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Custom Range</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div>
                  <label style={{fontSize:10,color:"var(--muted)",display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>From</label>
                  <input type="date" value={dateFrom}
                    min={dataRange?.min} max={dataRange?.max}
                    onChange={e=>setDateFrom(e.target.value)}
                    style={{width:"100%",background:"var(--s3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",boxSizing:"border-box",colorScheme:"dark"}}/>
                </div>
                <div>
                  <label style={{fontSize:10,color:"var(--muted)",display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>To</label>
                  <input type="date" value={dateTo}
                    min={dataRange?.min} max={dataRange?.max}
                    onChange={e=>setDateTo(e.target.value)}
                    style={{width:"100%",background:"var(--s3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:7,padding:"6px 9px",fontSize:12,outline:"none",boxSizing:"border-box",colorScheme:"dark"}}/>
                </div>
              </div>

              {/* Quick month presets */}
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Quick Ranges</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
                {[
                  {label:"This Month",fn:()=>{const n=new Date();return{f:new Date(n.getFullYear(),n.getMonth(),1),t:new Date(n.getFullYear(),n.getMonth()+1,0)};}},
                  {label:"Last Month",fn:()=>{const n=new Date();return{f:new Date(n.getFullYear(),n.getMonth()-1,1),t:new Date(n.getFullYear(),n.getMonth(),0)};}},
                  {label:"Last 3 Mo",fn:()=>{const n=new Date();return{f:new Date(n.getFullYear(),n.getMonth()-2,1),t:new Date(n.getFullYear(),n.getMonth()+1,0)};}},
                  {label:"This FY",fn:()=>{const n=new Date();const fy=n.getMonth()>=3?n.getFullYear():n.getFullYear()-1;return{f:new Date(fy,3,1),t:new Date(fy+1,2,31)};}},
                  {label:"Last FY",fn:()=>{const n=new Date();const fy=(n.getMonth()>=3?n.getFullYear():n.getFullYear()-1)-1;return{f:new Date(fy,3,1),t:new Date(fy+1,2,31)};}},
                ].map(p=>{
                  const{f,t}=p.fn();
                  const fStr=f.toISOString().slice(0,10),tStr=t.toISOString().slice(0,10);
                  const isActive=dateFrom===fStr&&dateTo===tStr;
                  return(
                    <button key={p.label} onClick={()=>{setDateFrom(fStr);setDateTo(tStr);}}
                      style={{padding:"4px 11px",fontSize:11,fontWeight:600,borderRadius:6,border:`1px solid ${isActive?"var(--accent)":"var(--border)"}`,background:isActive?"var(--accent)":"var(--s2)",color:isActive?"#fff":"var(--muted)",cursor:"pointer"}}>
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Quarterly presets */}
              {quarterPresets.length>0&&(
                <>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Quarter</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
                    {quarterPresets.slice().reverse().map(q=>{
                      const isActive=dateFrom===q.from&&dateTo===q.to;
                      return(
                        <button key={q.label} onClick={()=>{setDateFrom(q.from);setDateTo(q.to);}}
                          style={{padding:"4px 11px",fontSize:11,fontWeight:600,borderRadius:6,border:`1px solid ${isActive?"#f0a030":"var(--border)"}`,background:isActive?"#f0a03020":"var(--s2)",color:isActive?"#f0a030":"var(--muted)",cursor:"pointer"}}>
                          {q.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Apply / Clear */}
              <div style={{display:"flex",gap:8,justifyContent:"space-between",paddingTop:10,borderTop:"1px solid var(--border)"}}>
                <button onClick={()=>{setDateFrom("");setDateTo("");}}
                  style={{padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:7,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",cursor:"pointer"}}>
                  Clear Dates
                </button>
                {dataRange&&(
                  <button onClick={()=>{setDateFrom(dataRange.min);setDateTo(dataRange.max);}}
                    style={{padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:7,border:"1px solid var(--green)",background:"transparent",color:"var(--green)",cursor:"pointer"}}>
                    ↺ Full Range
                  </button>
                )}
                <button onClick={()=>setDateOpen(false)}
                  style={{padding:"6px 18px",fontSize:12,fontWeight:600,borderRadius:7,border:"none",background:"var(--accent)",color:"#fff",cursor:"pointer"}}>
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Active date chip */}
          {dateActive&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8,alignItems:"center"}}>
              <span style={{display:"flex",alignItems:"center",gap:4,background:isFullRange?"var(--s3)":"#1e3a5f",border:`1px solid ${isFullRange?"var(--border)":"var(--accent)"}`,borderRadius:20,padding:"3px 10px",fontSize:11,color:isFullRange?"var(--muted)":"var(--accent)",fontWeight:600}}>
                📅 {dateFrom||"…"} → {dateTo||"…"}{isFullRange?" (Full Range)":""}
                <button onClick={()=>{setDateFrom("");setDateTo("");}} style={{background:"none",border:"none",color:isFullRange?"var(--muted)":"var(--accent)",cursor:"pointer",padding:0,fontSize:12,lineHeight:1}}>×</button>
              </span>
            </div>
          )}
        </div>

      </div>

      {/* ── Group Name filter chips ── */}
      {allGroups.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginRight:2}}>Group:</span>
          {["", ...allGroups].map(g=>{
            const isAll=g==="";
            const active=isAll?(selGroup===""):(selGroup===g);
            return(
              <button key={g||"all"} onClick={()=>setSelGroup(isAll?"":g)}
                style={{padding:"4px 12px",border:"1px solid",borderColor:active?"var(--accent)":"var(--border)",borderRadius:20,background:active?"var(--accent)":"transparent",color:active?"#fff":"var(--muted)",fontSize:11,fontWeight:active?700:400,cursor:"pointer",transition:"all .15s"}}>
                {isAll?"All Groups":g}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Group Conversion Stats panel (shown when a group is selected) ── */}
      {selGroup&&(()=>{
        const gStat=groupConvStats.find(g=>g.name===selGroup);
        if(!gStat)return null;
        const dayColor=v=>v===null?"var(--s3)":v<=14?"#22c55e":v<=30?"#f0a030":"#ef4444";
        const dayLabel=v=>v===null?"—":v<=14?"🟢 Fast":v<=30?"🟡 Moderate":"🔴 Slow";
        return(
          <div style={{background:"var(--surface)",border:"1px solid var(--accent)",borderRadius:14,padding:"18px 20px",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <span style={{fontSize:18}}>📊</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{selGroup} — Conversion Times</div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>
                  {gStat.prToPo.count} PR→PO pairs · {gStat.poToGrpo.count} PO→GRPO pairs
                  {selOwners.size>0&&<span style={{marginLeft:6,color:"var(--accent)"}}>· {selOwners.size} owner{selOwners.size!==1?"s":""} filtered</span>}
                  {(selProjects.size>0||selCCS)&&<span style={{marginLeft:6,color:"#8b5cf6"}}>· {selCCS==="ALL"?"CCS All":selCCS==="ACTIVE"?"CCS Active":selCCS==="CLOSED"?"CCS Closed":selProjects.size+" project(s)"} filtered</span>}
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {[
                {label:"PR → PO",sublabel:"PR Date → PO Date",d:gStat.prToPo,color:"#f0a030",icon:"📋→📦"},
                {label:"PO → GRPO",sublabel:"PO Date → Material Received Date",d:gStat.poToGrpo,color:"#10b981",icon:"📦→🚚"},
              ].map(({label,sublabel,d,color,icon})=>(
                <div key={label} style={{background:"var(--s2)",borderRadius:10,padding:"14px 16px",border:`1px solid ${color}25`}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
                    <span style={{fontSize:14}}>{icon}</span>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
                      <div style={{fontSize:10,color:"var(--muted)"}}>{sublabel}</div>
                    </div>
                  </div>
                  {d.avg===null?(
                    <div style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>No data</div>
                  ):(
                    <>
                      <div style={{display:"flex",alignItems:"baseline",gap:5,marginBottom:12}}>
                        <span style={{fontSize:30,fontWeight:800,color:dayColor(d.avg),fontFamily:"monospace",lineHeight:1}}>{d.avg}</span>
                        <span style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>days avg</span>
                        <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:dayColor(d.avg)}}>{dayLabel(d.avg)}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
                        {[["Min",d.min,"#22c55e"],["Median",d.med,color],["Max",d.max,"#ef4444"]].map(([l,v,c])=>(
                          <div key={l} style={{background:"var(--surface)",borderRadius:7,padding:"7px 8px",textAlign:"center"}}>
                            <div style={{fontSize:9,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>{l}</div>
                            <div style={{fontSize:15,fontWeight:700,color:c,fontFamily:"monospace"}}>{v??"-"}</div>
                            <div style={{fontSize:9,color:"var(--muted)"}}>days</div>
                          </div>
                        ))}
                      </div>
                      <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:5,width:Math.min(100,Math.round((d.avg/90)*100))+"%",background:dayColor(d.avg),borderRadius:3,transition:"width .4s"}}/>
                      </div>
                      <div style={{marginTop:5,fontSize:10,color:"var(--muted)",textAlign:"right"}}>{d.count} pairs matched</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {/* ── Project Pivot Panel ── */}
      {projectStats&&(
        <ProjectPivotPanel
          stats={projectStats}
          dateFrom={dateFrom} dateTo={dateTo}
          selCCS={selCCS}
        />
      )}

      {ownerStats&&(
        <div style={{marginBottom:24}}>
          {/* Owner header */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"14px 16px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:12}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#f0a030,#ef4444)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff",flexShrink:0}}>
              {ownerStats.owner.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--text)"}}>{ownerStats.owner}</div>
              <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
                {ownerStats.pr.total+ownerStats.po.total+ownerStats.grpo.total} total documents
                {selProjects.size>0&&<span style={{marginLeft:6,color:"var(--accent)"}}>· {selProjects.size} project{selProjects.size!==1?"s":""}</span>}
              </div>
            </div>
            {/* Mini tab switcher */}
            <div style={{display:"flex",gap:2,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:3}}>
              {[{k:"overview",l:"Overview"},{k:"pr",l:"PRs"},{k:"po",l:"POs"},{k:"grpo",l:"GRPOs"}].map(t=>(
                <button key={t.k} onClick={()=>setOwnerTab(t.k)}
                  style={{padding:"4px 10px",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,
                    background:ownerTab===t.k?"var(--accent)":"transparent",color:ownerTab===t.k?"#fff":"var(--muted)"}}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          {ownerTab==="overview"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[
                {label:"Purchase Requests", key:"pr",   color:"#8b5cf6", stat:ownerStats.pr},
                {label:"Purchase Orders",   key:"po",   color:"#f0a030", stat:ownerStats.po},
                {label:"Goods Receipts",    key:"grpo", color:"#10b981", stat:ownerStats.grpo},
              ].map(({label,key,color,stat})=>(
                <div key={key} onClick={()=>setOwnerTab(key)}
                  style={{background:"var(--surface)",border:`1px solid ${color}30`,borderRadius:12,padding:"16px 18px",cursor:"pointer",transition:"border-color .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=color+"80"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=color+"30"}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <span style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span>
                    <span style={{fontSize:20,fontWeight:800,color,fontFamily:"monospace"}}>{stat.total}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      {l:"Open",     v:stat.open,     c:"#3b9eff", bg:"#0d2040"},
                      {l:"Closed",   v:stat.closed,   c:"#22c55e", bg:"#062010"},
                      {l:"Cancelled",v:stat.cancelled,c:"#64748b", bg:"#121820"},
                      {l:"Overdue",  v:stat.overdue,  c:"#ef4444", bg:"#200808"},
                    ].map(({l,v,c,bg})=>(
                      <div key={l} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0}}/>
                          <span style={{fontSize:11,color:"var(--muted)"}}>{l}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:Math.max(4,stat.total>0?(v/stat.total)*80:0),height:4,borderRadius:2,background:c,transition:"width .3s"}}/>
                          <span style={{fontSize:12,fontWeight:600,color:v>0?c:"var(--s3)",minWidth:20,textAlign:"right"}}>{v}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Conversion Times: Overall + Per Group ── */}
          {ownerTab==="overview"&&(()=>{
            const dc=v=>v===null?"var(--s3)":v<=14?"#22c55e":v<=30?"#f0a030":"#ef4444";
            const dl=v=>v===null?"—":v<=14?"🟢 Fast":v<=30?"🟡 Moderate":"🔴 Slow";

            // Overall row uses statistical avg
            const overallP2P=ownerStats.prToPo;
            const overallP2G=ownerStats.poToGrpo;

            // PR→PO bucket cell — shows Fast / Target / Slow counts
            const P2PBucketCell=({g})=>{
              const d=g.prToPo;
              if(!d.count)return <span style={{color:"var(--s3)",fontSize:12}}>—</span>;
              const thr=d.threshold;
              const buckets=[
                {label:"Fast",sublabel:"≤2d",pairs:d.fast,  color:"#22c55e",bg:"#22c55e15"},
                {label:"Target",sublabel:`≤${thr}d`,pairs:d.target,color:"#f0a030",bg:"#f0a03015"},
                {label:"Slow", sublabel:`>${thr}d`,pairs:d.slow, color:"#ef4444",bg:"#ef444415"},
              ];
              return <div>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  {buckets.map(b=>(
                    <div key={b.label}
                      onClick={e=>{e.stopPropagation();if(b.pairs.length)setConvDrill({pairs:b.pairs,title:`${g.name} — ${b.label} PR→PO`,bucket:b.label,threshold:thr});}}
                      style={{flex:1,background:b.bg,border:`1px solid ${b.color}30`,borderRadius:7,padding:"6px 4px",textAlign:"center",
                        cursor:b.pairs.length?"pointer":"default",transition:"all .15s",opacity:b.pairs.length?1:0.4}}
                      onMouseEnter={e=>{if(b.pairs.length)e.currentTarget.style.borderColor=b.color+"80";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=b.color+"30";}}>
                      <div style={{fontSize:16,fontWeight:800,color:b.color,fontFamily:"monospace",lineHeight:1}}>{b.pairs.length}</div>
                      <div style={{fontSize:9,color:b.color,fontWeight:600,marginTop:2}}>{b.label}</div>
                      <div style={{fontSize:9,color:"var(--muted)"}}>{b.sublabel}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"var(--muted)"}}>avg: <span style={{fontWeight:700,color:dc(d.avg),fontFamily:"monospace"}}>{d.avg??"-"}d</span> · n={d.count}</div>
              </div>;
            };

            // PO→GRPO uses statistical min/med/max as before
            const P2GStatCell=({d,color})=>d.avg===null
              ?<span style={{color:"var(--s3)",fontSize:12}}>—</span>
              :<div>
                <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:3}}>
                  <span style={{fontSize:16,fontWeight:800,color:dc(d.avg),fontFamily:"monospace"}}>{d.avg}</span>
                  <span style={{fontSize:10,color:"var(--muted)"}}>d avg</span>
                  <span style={{fontSize:10,fontWeight:700,color:dc(d.avg),marginLeft:4}}>{dl(d.avg)}</span>
                </div>
                <div style={{fontSize:10,color:"var(--s3)"}}>n={d.count}</div>
                <div style={{height:4,background:"var(--s3)",borderRadius:2,marginTop:5,overflow:"hidden"}}>
                  <div style={{height:4,width:Math.min(100,Math.round((d.avg/90)*100))+"%",background:dc(d.avg),borderRadius:2,transition:"width .4s"}}/>
                </div>
              </div>;

            return(
              <div style={{marginTop:14,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
                {/* Header */}
                <div style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr",gap:0,background:"var(--s2)",borderBottom:"1px solid var(--border)"}}>
                  <div style={{padding:"8px 14px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Group</div>
                  <div style={{padding:"8px 14px",fontSize:10,fontWeight:700,color:"#f0a030",textTransform:"uppercase",letterSpacing:"0.08em",borderLeft:"1px solid var(--border)"}}>📋→📦 PR → PO &nbsp;<span style={{fontWeight:400,color:"var(--muted)",fontSize:9}}>Fast / Target / Slow buckets · click to drill down</span></div>
                  <div style={{padding:"8px 14px",fontSize:10,fontWeight:700,color:"#10b981",textTransform:"uppercase",letterSpacing:"0.08em",borderLeft:"1px solid var(--border)"}}>📦→🚚 PO → GRPO</div>
                </div>
                {/* Overall row */}
                <div style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr",background:"var(--s2)",borderBottom:"1px solid var(--border)"}}>
                  <div style={{padding:"12px 14px",borderRight:"1px solid var(--border)",display:"flex",alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"var(--accent)"}}>🔢 Overall</span>
                  </div>
                  <div style={{padding:"12px 14px",borderRight:"1px solid var(--border)"}}>
                    <P2GStatCell d={overallP2P} color="#f0a030"/>
                  </div>
                  <div style={{padding:"12px 14px"}}>
                    <P2GStatCell d={overallP2G} color="#10b981"/>
                  </div>
                </div>
                {/* Per-group rows */}
                {(ownerStats.groupStats||[]).map((g,i)=>(
                  <div key={g.name} style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr",borderBottom:"1px solid var(--border)",background:i%2===0?"transparent":"var(--s2)"}}>
                    <div style={{padding:"12px 14px",borderRight:"1px solid var(--border)",display:"flex",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{g.name}</div>
                        <div style={{fontSize:9,color:"var(--muted)",marginTop:2}}>threshold: {getThreshold(g.name)}d</div>
                      </div>
                    </div>
                    <div style={{padding:"12px 14px",borderRight:"1px solid var(--border)"}}>
                      <P2PBucketCell g={g}/>
                    </div>
                    <div style={{padding:"12px 14px"}}>
                      <P2GStatCell d={g.poToGrpo} color="#10b981"/>
                    </div>
                  </div>
                ))}
                <div style={{padding:"7px 14px",background:"var(--s2)"}}>
                  <span style={{fontSize:10,color:"var(--muted)",fontStyle:"italic"}}>Thresholds — Consumables: 3d · Lead Item: 8d · Long Lead Item: 15d · Others: 7d</span>
                </div>
              </div>
            );
          })()}

          {ownerTab!=="overview"&&(()=>{
            const tabCfg={
              pr: {docs:ownerStats.pr.docs, statusKey:"prStatus",  dateKey:"prReqDate",  color:"#8b5cf6"},
              po: {docs:ownerStats.po.docs, statusKey:"poStatus",  dateKey:"poExpDel",   color:"#f0a030"},
              grpo:{docs:ownerStats.grpo.docs,statusKey:"grpoStatus",dateKey:"matRecDate",color:"#10b981"},
            }[ownerTab];
            return <ProcDashPanel key={"owner-"+ownerTab+[...selOwners].join(",")} type={ownerTab.toUpperCase()} docs={tabCfg.docs} statusKey={tabCfg.statusKey} dateKey={tabCfg.dateKey} onItems={(doc,type)=>setModal({doc,type})}/>;
          })()}
        </div>
      )}

      {/* ── Tab bar + content (when no owner selected OR owner on overview) ── */}
      {(!ownerStats||(ownerStats&&ownerTab==="overview"))&&(
        <>
          {/* Tab bar */}
          <div style={{display:"flex",gap:4,borderBottom:"1px solid var(--border)",marginBottom:20}}>
            {filteredTabs.map(t=>{
              const open=t.docs.filter(d=>d[t.statusKey]==="OPEN").length;
              const od=t.docs.filter(d=>d.isOverdue).length;
              const isAct=activeTab===t.key;
              return(
                <button key={t.key} onClick={()=>setActiveTab(t.key)}
                  style={{padding:"11px 20px",border:"none",background:"transparent",color:isAct?t.color:"var(--muted)",fontSize:13,fontWeight:700,cursor:"pointer",borderBottom:isAct?`2px solid ${t.color}`:"2px solid transparent",transition:"all .15s",display:"flex",alignItems:"center",gap:8}}>
                  <span>{t.key}</span>
                  <span style={{fontSize:11,color:isAct?"var(--muted)":"var(--s3)"}}>—</span>
                  <span style={{fontSize:11,color:isAct?"var(--muted)":"var(--s3)"}}>{t.label}</span>
                  <span style={{background:"var(--s2)",border:"1px solid var(--border)",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700,color:isAct?"var(--muted)":"var(--s3)",fontFamily:"monospace"}}>{t.docs.length}</span>
                  {open>0&&<span style={{background:"#0d2040",border:"1px solid #1a4070",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700,color:"#3b9eff",fontFamily:"monospace"}}>{open}</span>}
                  {od>0&&<span style={{background:"#200808",border:"1px solid #401010",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700,color:"#ef4444",fontFamily:"monospace"}}>{od}⚠</span>}
                </button>
              );
            })}
            <button onClick={()=>setActiveTab("VENDORS")}
              style={{padding:"11px 20px",border:"none",background:"transparent",color:activeTab==="VENDORS"?"#f0a030":"var(--muted)",fontSize:13,fontWeight:700,cursor:"pointer",borderBottom:activeTab==="VENDORS"?"2px solid #f0a030":"2px solid transparent",transition:"all .15s",display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
              <span>🏭</span>
              <span style={{fontSize:11,color:activeTab==="VENDORS"?"var(--muted)":"var(--s3)"}}>— Vendors</span>
            </button>
          </div>

          {activeTab==="VENDORS"
            ?<VendorDashboard pos={filteredTabs[1].docs} grpos={filteredTabs[2].docs}/>
            :(<>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <div style={{width:3,height:22,borderRadius:2,background:active.color}}/>
                <div>
                  <h2 style={{fontFamily:"Sora",fontSize:16,fontWeight:700}}>{active.label} Dashboard</h2>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>
                    {active.docs.length} documents
                    {selProjects.size>0&&<span style={{marginLeft:6,color:"var(--accent)"}}>· {selProjects.size} project{selProjects.size!==1?"s":""}</span>}
                    {selOwners.size===1&&<span style={{marginLeft:6,color:"#f0a030"}}>· {[...selOwners][0]}</span>}
                    {" · click item count to view line items"}
                  </div>
                </div>
              </div>
              <ProcDashPanel key={activeTab+[...selProjects].join(",")+[...selOwners].join(",")} type={active.key} docs={active.docs} statusKey={active.statusKey} dateKey={active.dateKey} onItems={(doc,type)=>setModal({doc,type})}/>
            </>)
          }
        </>
      )}

      {modal&&<ProcItemsModal doc={modal.doc} type={modal.type} onClose={()=>setModal(null)}/>}
      {convDrill&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#00000088",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setConvDrill(null)}>
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:24,maxWidth:860,width:"100%",maxHeight:"78vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div>
                <div style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>
                  {convDrill.bucket==="Fast"?"🟢 Fast — ≤2 days":convDrill.bucket==="Target"?`🟡 Target — ≤${convDrill.threshold} days`:`🔴 Slow — >${convDrill.threshold} days`}
                </div>
                <div style={{fontSize:15,fontWeight:700,color:"var(--text)"}}>{convDrill.title}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{convDrill.pairs.length} PR→PO pairs</div>
              </div>
              <button onClick={()=>setConvDrill(null)} style={{background:"none",border:"none",color:"var(--muted)",fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            {/* Table */}
            <div style={{overflowY:"auto",flex:1}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["#","PR No","PO No","PR Date","PO Date","Days","Vendor","Project","Items"].map((h,i)=>(
                      <th key={h} style={{padding:"7px 10px",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",textAlign:i>4?"left":"left",borderBottom:"1px solid var(--border)",background:"var(--s2)",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...convDrill.pairs].sort((a,b)=>a.days-b.days).map((p,i)=>{
                    const dc=convDrill.bucket==="Fast"?"#22c55e":convDrill.bucket==="Target"?"#f0a030":"#ef4444";
                    return(
                      <tr key={i} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"transparent":"var(--s2)"}}>
                        <td style={{padding:"7px 10px",fontSize:11,color:"var(--s3)",fontFamily:"monospace"}}>{i+1}</td>
                        <td style={{padding:"7px 10px",fontSize:11,fontFamily:"monospace",color:"var(--text)",fontWeight:600}}>{p.prNo}</td>
                        <td style={{padding:"7px 10px",fontSize:11,fontFamily:"monospace",color:"var(--text)"}}>{p.poNo}</td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>{p.prDate}</td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>{p.poDate}</td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{fontSize:13,fontWeight:800,color:dc,fontFamily:"monospace"}}>{p.days}</span>
                          <span style={{fontSize:10,color:"var(--muted)",marginLeft:2}}>d</span>
                        </td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"var(--muted)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vendor||"—"}</td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"var(--muted)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.project||"—"}</td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"var(--muted)",textAlign:"center"}}>{p.itemCount||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(projOpen||ownerOpen||dateOpen)&&<div style={{position:"fixed",inset:0,zIndex:199}} onClick={()=>{setProjOpen(false);setProjSearch("");setOwnerOpen(false);setOwnerSearch("");setDateOpen(false);}}/>}
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────
// ─── BOQ Table used inside Reports ───────────────────────────────────────────
function ReportBOQTable({list,onSelect,users=[]}){
  if(list.length===0) return(
    <div style={{textAlign:"center",padding:"36px 0",color:"var(--muted)"}}>
      <div style={{fontSize:36,marginBottom:8}}>📭</div>No BOQs found
    </div>
  );
  return(
    <table>
      <thead><tr>
        <th>BOQ ID</th><th>Created By</th><th>Date</th><th style={{textAlign:"center"}}>Items</th>
        <th style={{textAlign:"center",color:"var(--plan)"}}>Plan</th>
        <th style={{textAlign:"center",color:"var(--eng)"}}>Eng.</th>
        <th style={{textAlign:"center",color:"var(--qs)"}}>QS</th>
        <th style={{textAlign:"center",color:"var(--site)"}}>Site</th>
        <th/>
      </tr></thead>
      <tbody>
        {list.slice().reverse().map(b=>{
          const creator=users.find(u=>u.id===b.createdBy);
          const pt=b.items.reduce((s,i)=>s+(i.planQty||0),0);
          const et=b.items.reduce((s,i)=>s+(i.engQty||0),0);
          const qt=b.items.reduce((s,i)=>s+(i.qsQty||0),0);
          const st=b.items.reduce((s,i)=>s+(i.siteQty||0),0);
          return(
            <tr key={b.id}>
              <td style={{fontFamily:"monospace",fontSize:12,fontWeight:600}}>{b.boqId}</td>
              <td style={{fontSize:12}}>{creator?.name||"—"}</td>
              <td style={{color:"var(--muted)",fontSize:12}}>{new Date(b.createdAt).toLocaleDateString()}</td>
              <td style={{textAlign:"center"}}>{b.items.length}</td>
              <td style={{textAlign:"center",fontWeight:600,color:"var(--plan)"}}>{pt.toLocaleString()}</td>
              <td style={{textAlign:"center",fontWeight:600,color:et>0?"var(--eng)":"var(--muted)"}}>{et>0?et.toLocaleString():"—"}</td>
              <td style={{textAlign:"center",fontWeight:600,color:qt>0?"var(--qs)":"var(--muted)"}}>{qt>0?qt.toLocaleString():"—"}</td>
              <td style={{textAlign:"center",fontWeight:600,color:st>0?"var(--site)":"var(--muted)"}}>{st>0?st.toLocaleString():"—"}</td>
              <td><Btn small variant="outline" onClick={()=>onSelect(b)}>View →</Btn></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Status Section Card (clickable, expands inline) ─────────────────────────
function StatusSection({statusKey,meta,boqs,activeStatus,setActiveStatus,onSelect,users=[]}){
  const list=boqs.filter(b=>b.status===statusKey);
  const isActive=activeStatus===statusKey;
  return(
    <div style={{marginBottom:12}}>
      {/* Header row — clickable */}
      <div onClick={()=>setActiveStatus(isActive?null:statusKey)}
        style={{display:"flex",alignItems:"center",gap:14,background:"var(--surface)",border:`2px solid ${isActive?meta.color:"var(--border)"}`,borderRadius:isActive?"14px 14px 0 0":14,padding:"14px 18px",cursor:"pointer",transition:"all .2s",boxShadow:isActive?`0 0 18px ${meta.color}25`:"none"}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.borderColor=`${meta.color}60`;}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.borderColor="var(--border)";}}>
        <div style={{width:12,height:12,borderRadius:"50%",background:meta.color,flexShrink:0,boxShadow:isActive?`0 0 8px ${meta.color}`:"none"}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:isActive?meta.color:"var(--text)"}}>{meta.label}</div>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>{isActive?"Click to collapse":"Click to view BOQs"}</div>
        </div>
        <div style={{fontSize:28,fontFamily:"Sora",fontWeight:800,color:meta.color,minWidth:32,textAlign:"right"}}>{list.length}</div>
        <div style={{fontSize:14,color:meta.color,marginLeft:8}}>{isActive?"▲":"▼"}</div>
      </div>

      {/* Expanded BOQ table */}
      {isActive&&(
        <div className="fade-in" style={{background:"var(--surface)",border:`2px solid ${meta.color}`,borderTop:"none",borderRadius:"0 0 14px 14px",padding:"0 0 4px 0",overflow:"hidden"}}>
          <ReportBOQTable list={list} onSelect={onSelect} users={users}/>
        </div>
      )}
    </div>
  );
}

// ─── Main Reports Component ───────────────────────────────────────────────────
function Reports({boqs,user,onSelect,users=[]}){
  const [activeStatus,setActiveStatus]=useState(null);
  const isPlan=user.role==="planning";

  // Pipeline stages shown as approval flow for planning
  const PIPELINE=[
    { key:"draft",           label:"1. Draft",                   icon:"📝", color:"#64748b", desc:"Created by Planning, not yet submitted" },
    { key:"with_engineering",label:"2. Engineering Review",      icon:"⚙️", color:"#10b981", desc:"Awaiting Engineering quantities" },
    { key:"with_qs",         label:"3. Quantity Survey Review",  icon:"📏", color:"#f59e0b", desc:"Awaiting QS quantities" },
    { key:"with_site",       label:"4. Project Team Review",        icon:"🏗️", color:"#f43f5e", desc:"Awaiting Site quantities" },
    { key:"completed",       label:"5. Completed",               icon:"✅", color:"#3b82f6", desc:"All teams have reviewed and submitted" },
  ];

  const total=boqs.length;
  const completed=boqs.filter(b=>b.status==="completed").length;
  const inProgress=boqs.filter(b=>b.status!=="draft"&&b.status!=="completed").length;
  const drafts=boqs.filter(b=>b.status==="draft").length;

  return(
    <div className="fade-in">
      <div style={{marginBottom:22}}>
        <h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700}}>📊 Reports</h1>
        <p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>
          {isPlan?"Full approval pipeline overview — click any stage to see its BOQs":"Click any status to view the BOQs at that stage"}
        </p>
      </div>

      {/* Summary strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[
          {label:"Total BOQs",    value:total,      color:"var(--plan)"},
          {label:"In Progress",   value:inProgress, color:"var(--amber)"},
          {label:"Completed",     value:completed,  color:"var(--green)"},
          {label:"Drafts",        value:drafts,     color:"var(--muted)"},
        ].map(s=>(
          <div key={s.label} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800,fontFamily:"Sora",color:s.color}}>{s.value}</div>
            <div style={{fontSize:12,color:"var(--muted)",marginTop:3}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Planning gets full pipeline view with flow arrows */}
      {isPlan&&(
        <>
          <h3 style={{fontFamily:"Sora",fontSize:15,marginBottom:14,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",fontSize:11}}>Approval Pipeline</h3>
          {/* Visual pipeline flow */}
          <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
            {PIPELINE.map((stage,i)=>{
              const count=boqs.filter(b=>b.status===stage.key).length;
              return(
                <div key={stage.key} style={{display:"flex",alignItems:"center",flexShrink:0}}>
                  <div onClick={()=>setActiveStatus(activeStatus===stage.key?null:stage.key)}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 16px",borderRadius:12,background:activeStatus===stage.key?`${stage.color}20`:"var(--s2)",border:`2px solid ${activeStatus===stage.key?stage.color:"var(--border)"}`,cursor:"pointer",minWidth:110,transition:"all .2s",boxShadow:activeStatus===stage.key?`0 0 14px ${stage.color}30`:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=`${stage.color}80`}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=activeStatus===stage.key?stage.color:"var(--border)"}>
                    <div style={{fontSize:22,marginBottom:4}}>{stage.icon}</div>
                    <div style={{fontSize:11,fontWeight:700,color:stage.color,textAlign:"center",lineHeight:1.3}}>{stage.label}</div>
                    <div style={{fontSize:22,fontWeight:800,fontFamily:"Sora",color:stage.color,marginTop:4}}>{count}</div>
                    <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>BOQ{count!==1?"s":""}</div>
                  </div>
                  {i<PIPELINE.length-1&&(
                    <div style={{fontSize:18,color:"var(--border)",margin:"0 4px",flexShrink:0}}>→</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* All status sections — clickable, expand inline */}
      <h3 style={{fontFamily:"Sora",fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:12}}>
        {isPlan?"All Stages — Click to Expand":"BOQs by Status — Click to Expand"}
      </h3>
      {Object.entries(STATUS_META).map(([k,m])=>(
        <StatusSection
          key={k}
          statusKey={k}
          meta={m}
          boqs={boqs}
          activeStatus={activeStatus}
          setActiveStatus={setActiveStatus}
          onSelect={onSelect}
          users={users}
        />
      ))}
    </div>
  );
}


// ─── Admin: User Form Modal ────────────────────────────────────────────────────
const DEPT_ROLES = [
  { role:"planning",    label:"Project Control",        color:"#8b5cf6", icon:"📐" },
  { role:"engineering", label:"Engineering Team",     color:"#10b981", icon:"⚙️" },
  { role:"qs",          label:"Quantity Survey Team", color:"#f59e0b", icon:"📏" },
  { role:"site",        label:"Project Team",            color:"#f43f5e", icon:"🏗️" },
];

const ALL_PAGES = [
  { id:"dashboard", label:"Dashboard",          desc:"Main overview & stats" },
  { id:"create",    label:"Create BOQ",         desc:"Create new BOQs (Planning only)" },
  { id:"my-boqs",   label:"My BOQs / All BOQs", desc:"List and search BOQs" },
  { id:"pending",   label:"Pending Review",     desc:"BOQs awaiting their review" },
  { id:"reports",   label:"Reports",            desc:"Pipeline overview & analytics" },
];

// ─── Global BOQ Search ─────────────────────────────────────────────────────────
const STATUS_COLOR={draft:"#64748b",with_engineering:"#3b9eff",with_qs:"#f0a030",with_site:"#8b5cf6",approved:"#22c55e",rejected:"#ef4444"};
const STATUS_LABEL={draft:"Draft",with_engineering:"Engineering",with_qs:"QS",with_site:"Site",approved:"Approved",rejected:"Rejected"};

function GlobalSearch({boqs,users,onSelectBoq}){
  const [q,setQ]=useState("");
  const [filter,setFilter]=useState("all"); // all | boqId | itemName | lineItemId
  const [statusF,setStatusF]=useState("all");
  const inputRef=useRef(null);

  // Focus on mount
  React.useEffect(()=>{ inputRef.current?.focus(); },[]);

  const trimQ=q.trim().toLowerCase();

  const results=useMemo(()=>{
    if(!trimQ) return [];
    const hits=[];
    boqs.forEach(boq=>{
      const creator=users.find(u=>u.id===boq.createdBy);
      if(statusF!=="all"&&boq.status!==statusF) return;

      // Match BOQ ID
      const boqMatch=(filter==="all"||filter==="boqId")&&boq.boqId.toLowerCase().includes(trimQ);

      // Match items
      const matchedItems=[];
      if(filter==="all"||filter==="itemName"||filter==="lineItemId"){
        boq.items.forEach((item,idx)=>{
          const nameMatch=(filter==="all"||filter==="itemName")&&(item.name||"").toLowerCase().includes(trimQ);
          const lidMatch=(filter==="all"||filter==="lineItemId")&&(item.lineItemId||"").toLowerCase().includes(trimQ);
          const labelMatch=(filter==="all")&&(item.label||"").toLowerCase().includes(trimQ);
          if(nameMatch||lidMatch||labelMatch){
            matchedItems.push({...item,_idx:idx,_matchedName:nameMatch||labelMatch,_matchedLid:lidMatch});
          }
        });
      }

      if(boqMatch||matchedItems.length>0){
        hits.push({boq,creator,boqMatch,matchedItems});
      }
    });
    return hits;
  },[trimQ,filter,statusF,boqs,users]);

  const totalItems=results.reduce((s,r)=>s+r.matchedItems.length,0);

  const hl=(text,q)=>{
    if(!q||!text) return text;
    const idx=text.toLowerCase().indexOf(q.toLowerCase());
    if(idx===-1) return text;
    return <>{text.slice(0,idx)}<mark style={{background:"#f0a03060",color:"var(--text)",borderRadius:3,padding:"0 2px"}}>{text.slice(idx,idx+q.length)}</mark>{text.slice(idx+q.length)}</>;
  };

  return(
    <div className="fade-in">
      {/* Header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:700,marginBottom:4}}>🔍 Global Search</h1>
        <div style={{fontSize:13,color:"var(--muted)"}}>Search across all {boqs.length} BOQs and their line items</div>
      </div>

      {/* Search bar */}
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:20,marginBottom:20}}>
        <div style={{position:"relative",marginBottom:16}}>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:18,pointerEvents:"none"}}>🔍</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search by item name, BOQ ID, line item ID…"
            style={{width:"100%",padding:"12px 16px 12px 44px",fontSize:15,borderRadius:10,border:"1px solid var(--border)",background:"var(--s2)",color:"var(--text)",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
          />
          {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--muted)",fontSize:18,cursor:"pointer",lineHeight:1}}>✕</button>}
        </div>
        {/* Filter row */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:12,color:"var(--muted)",marginRight:4}}>Search in:</span>
          {[["all","All Fields"],["boqId","BOQ ID"],["itemName","Item Name"],["lineItemId","Line Item ID"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)}
              style={{fontSize:12,padding:"5px 12px",borderRadius:7,border:"1px solid var(--border)",background:filter===k?"var(--accent)":"var(--s2)",color:filter===k?"#fff":"var(--muted)",cursor:"pointer",fontWeight:filter===k?700:500}}>
              {l}
            </button>
          ))}
          <span style={{marginLeft:12,fontSize:12,color:"var(--muted)"}}>Status:</span>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)}
            style={{fontSize:12,padding:"5px 10px",borderRadius:7,border:"1px solid var(--border)",background:"var(--s2)",color:"var(--text)",cursor:"pointer",outline:"none"}}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABEL).map(([k,l])=><option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Results count */}
      {trimQ&&(
        <div style={{fontSize:13,color:"var(--muted)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          {results.length===0
            ? <span>No results for <strong style={{color:"var(--text)"}}>"{q}"</strong></span>
            : <><span style={{color:"var(--accent)",fontWeight:700}}>{results.length}</span> BOQ{results.length!==1?"s":""} matched
              {totalItems>0&&<> · <span style={{color:"#10b981",fontWeight:700}}>{totalItems}</span> line item{totalItems!==1?"s":""}</>}
              {" "}for <strong style={{color:"var(--text)"}}>"{q}"</strong>
            </>}
        </div>
      )}

      {/* Results */}
      {!trimQ&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:"var(--muted)"}}>
          <div style={{fontSize:48,marginBottom:12}}>🔍</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:8}}>Start typing to search</div>
          <div style={{fontSize:13}}>Search by item name, BOQ ID, line item ID or label across all BOQs</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {results.map(({boq,creator,boqMatch,matchedItems})=>{
          const sc=STATUS_COLOR[boq.status]||"#64748b";
          const sl=STATUS_LABEL[boq.status]||boq.status;
          return(
            <div key={boq.id} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12}}>
              {/* BOQ header row */}
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:matchedItems.length>0?"1px solid var(--border)":"none",cursor:"pointer",background:boqMatch?"var(--s2)":"transparent",borderRadius:matchedItems.length>0?"12px 12px 0 0":"12px"}}
                onClick={()=>onSelectBoq(boq)}
                onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                onMouseLeave={e=>e.currentTarget.style.background=boqMatch?"var(--s2)":"transparent"}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"var(--text)"}}>{hl(boq.boqId,filter==="all"||filter==="boqId"?trimQ:"")}</span>
                    <span style={{fontSize:10,fontWeight:700,color:sc,background:sc+"18",border:`1px solid ${sc}40`,borderRadius:5,padding:"2px 7px"}}>{sl}</span>
                    {boqMatch&&<span style={{fontSize:10,color:"#f0a030",background:"#f0a03018",border:"1px solid #f0a03040",borderRadius:5,padding:"2px 7px"}}>BOQ ID match</span>}
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>
                    {creator?.name||"Unknown"} · {new Date(boq.createdAt).toLocaleDateString("en-IN")} · {boq.items.length} items
                    {matchedItems.length>0&&<span style={{marginLeft:8,color:"#10b981",fontWeight:600}}>{matchedItems.length} item{matchedItems.length!==1?"s":""} matched</span>}
                  </div>
                </div>
                <span style={{color:"var(--muted)",fontSize:13}}>Open →</span>
              </div>

              {/* Matched line items */}
              {matchedItems.length>0&&(
                <div>
                  <div style={{overflowX:"auto",borderRadius:"0 0 12px 12px"}}>
                  {/* column header */}
                  <div style={{display:"grid",gridTemplateColumns:"110px 70px 1fr 60px 80px 80px 80px 80px",gap:10,padding:"6px 16px",background:"var(--s2)",borderBottom:"1px solid var(--border)",minWidth:700}}>
                    {["Line ID","Label","Item Name","Unit","Plan","Eng","QS","Site"].map(h=>(
                      <span key={h} style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",textAlign:["Plan","Eng","QS","Site"].includes(h)?"right":"left",whiteSpace:"nowrap"}}>{h}</span>
                    ))}
                  </div>
                  {matchedItems.slice(0,10).map((item,i)=>(
                    <div key={item.id} style={{display:"grid",gridTemplateColumns:"110px 70px 1fr 60px 80px 80px 80px 80px",gap:10,padding:"9px 16px",borderBottom:"1px solid var(--border)",alignItems:"center",background:i%2===0?"transparent":"var(--s2)",cursor:"pointer",minWidth:700}}
                      onClick={()=>onSelectBoq(boq)}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--s2)"}>
                      <span style={{fontFamily:"monospace",fontSize:11,color:item._matchedLid?"#f0a030":"var(--muted)",fontWeight:item._matchedLid?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{hl(item.lineItemId||"—",item._matchedLid?trimQ:"")}</span>
                      <span style={{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label||"—"}</span>
                      <span style={{fontSize:12,color:"var(--text)",fontWeight:item._matchedName?600:400,lineHeight:1.4}}>{hl(item.name||"—",item._matchedName?trimQ:"")}</span>
                      <span style={{fontSize:11,color:"var(--muted)",textAlign:"center",whiteSpace:"nowrap"}}>{item.unit||"—"}</span>
                      {[item.planQty,item.engQty,item.qsQty,item.siteQty].map((v,qi)=>(
                        <span key={qi} style={{fontSize:12,fontFamily:"monospace",textAlign:"right",color:v>0?"var(--text)":"var(--s3)",fontWeight:v>0?600:400,whiteSpace:"nowrap"}}>{v>0?v.toLocaleString("en-IN"):"—"}</span>
                      ))}
                    </div>
                  ))}
                  {matchedItems.length>10&&(
                    <div style={{padding:"8px 16px",fontSize:11,color:"var(--muted)",textAlign:"center",cursor:"pointer",minWidth:700}} onClick={()=>onSelectBoq(boq)}>
                      +{matchedItems.length-10} more — open BOQ to see all
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Admin: Dashboard ──────────────────────────────────────────────────────────
// ─── QUOTATION COMPARISON SYSTEM ─────────────────────────────────────────────

const RFQ_STORAGE_KEY="rfq_data_v1";
const genRfqId=()=>"RFQ-"+Date.now().toString(36).toUpperCase().slice(-6);

// In-memory store — persists within the session
let _rfqStore=[];
async function loadRfqs(){return[..._rfqStore];}
async function saveRfqs(rfqs){_rfqStore=[...rfqs];}

// ── Procurement: Quotations Page ──────────────────────────────────────────────
function QuotationsPage({user,vendorUsers}){
  const [rfqs,setRfqs]=useState([]);
  const [view,setView]=useState("list"); // "list"|"create"|"detail"
  const [selRfq,setSelRfq]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{loadRfqs().then(r=>{setRfqs(r);setLoading(false);});},[]);

  const refresh=async()=>{const r=await loadRfqs();setRfqs(r);};

  const handleCreate=async(rfq)=>{
    const updated=[...rfqs,rfq];
    setRfqs(updated);await saveRfqs(updated);setView("list");
  };

  const handleUpdate=async(rfq)=>{
    const updated=rfqs.map(r=>r.id===rfq.id?rfq:r);
    setRfqs(updated);await saveRfqs(updated);
  };

  const handleDelete=async(id)=>{
    if(!window.confirm("Delete this RFQ?"))return;
    const updated=rfqs.filter(r=>r.id!==id);
    setRfqs(updated);await saveRfqs(updated);
    if(selRfq?.id===id){setSelRfq(null);setView("list");}
  };

  if(loading)return <div style={{padding:40,textAlign:"center",color:"var(--muted)"}}>Loading quotations…</div>;

  if(view==="create")return <RFQCreateForm vendorUsers={vendorUsers} onSave={handleCreate} onCancel={()=>setView("list")}/>;
  if(view==="detail"&&selRfq){
    const live=rfqs.find(r=>r.id===selRfq.id)||selRfq;
    return <RFQDetail rfq={live} vendorUsers={vendorUsers} onBack={()=>{setView("list");refresh();}} onDelete={()=>handleDelete(live.id)} onUpdate={handleUpdate}/>;
  }

  // List view
  const pending=rfqs.filter(r=>r.responses.length<r.vendorEmails.length);
  const complete=rfqs.filter(r=>r.responses.length>=r.vendorEmails.length&&r.vendorEmails.length>0);
  const draft=rfqs.filter(r=>r.vendorEmails.length===0);

  return(
    <div className="fade-in">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
        <div>
          <h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:800}}>📝 Quotation Comparison</h1>
          <p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>Create RFQs, collect vendor quotes, compare & shortlist</p>
        </div>
        <button onClick={()=>setView("create")}
          style={{padding:"10px 20px",background:"var(--accent)",border:"none",borderRadius:9,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
          + New RFQ
        </button>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
        {[
          {l:"Total RFQs",v:rfqs.length,c:"#3b82f6"},
          {l:"Awaiting All Quotes",v:rfqs.filter(r=>r.responses.length<r.vendorEmails.length||r.vendorEmails.length===0).length,c:"#f0a030"},
          {l:"Ready to Compare",v:rfqs.filter(r=>r.responses.length>=r.vendorEmails.length&&r.vendorEmails.length>0).length,c:"#22c55e"},
          {l:"Total Vendors",v:vendorUsers.length,c:"#8b5cf6"},
        ].map(k=>(
          <div key={k.l} style={{background:"var(--surface)",border:`1px solid ${k.c}30`,borderRadius:10,padding:"13px 16px"}}>
            <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.c,fontFamily:"monospace"}}>{k.v}</div>
          </div>
        ))}
      </div>

      {rfqs.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:"var(--muted)"}}>
          <div style={{fontSize:48,marginBottom:14}}>📋</div>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)"}}>No RFQs yet</div>
          <p style={{marginTop:6,fontSize:13}}>Create your first Request for Quotation to get started</p>
          <button onClick={()=>setView("create")} style={{marginTop:16,padding:"10px 24px",background:"var(--accent)",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Create RFQ</button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {rfqs.slice().reverse().map(r=>{
            const responded=r.responses.length;
            const total=r.vendorEmails.length;
            const allIn=responded>=total&&total>0;
            const status=allIn?"complete":responded>0?"partial":"pending";
            const statusCfg={
              complete:{c:"#22c55e",bg:"#22c55e15",l:"All Quotes In — Ready to Compare"},
              partial: {c:"#f0a030",bg:"#f0a03015",l:`${responded}/${total} Submitted`},
              pending: {c:"#ef4444",bg:"#ef444415",l:`Awaiting Quotes (0/${total})`},
            };
            const cfg=statusCfg[status];
            return(
              <div key={r.id} onClick={()=>{setSelRfq(r);setView("detail");}}
                style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 18px",cursor:"pointer",transition:"border-color .15s,box-shadow .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)50";e.currentTarget.style.boxShadow="0 2px 12px #0003";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontFamily:"monospace",fontSize:11,color:"var(--muted)",background:"var(--s2)",padding:"2px 7px",borderRadius:5}}>{r.id}</span>
                      <span style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{r.itemName}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>{r.description||"No description"} · {r.quantity} {r.unit} · Deadline: {r.deadline||"—"}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {r.vendorEmails.map(e=>{
                        const v=vendorUsers.find(u=>u.email===e);
                        const hasResp=r.responses.find(res=>res.vendorEmail===e);
                        return(
                          <span key={e} style={{fontSize:10,padding:"2px 8px",borderRadius:20,border:`1px solid ${hasResp?"#22c55e40":"var(--border)"}`,background:hasResp?"#22c55e10":"var(--s2)",color:hasResp?"#22c55e":"var(--muted)"}}>
                            {hasResp?"✓ ":""}{v?.name||e}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,flexShrink:0}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:cfg.bg,color:cfg.c,border:`1px solid ${cfg.c}30`}}>{cfg.l}</span>
                    {allIn
                      ?<div style={{width:100,height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}><div style={{width:"100%",height:"100%",background:"#22c55e",borderRadius:3}}/></div>
                      :<span style={{fontSize:10,color:"var(--s3)",fontStyle:"italic"}}>🔒 sealed until all respond</span>
                    }
                    <span style={{fontSize:10,color:"var(--muted)"}}>{new Date(r.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"})}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Create RFQ Form ───────────────────────────────────────────────────────────
function RFQCreateForm({vendorUsers,onSave,onCancel}){
  const [form,setForm]=useState({itemName:"",description:"",quantity:"",unit:"No's",specs:"",deadline:"",vendorEmails:[]});
  const [err,setErr]=useState("");
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const toggleVendor=e=>setForm(p=>({...p,vendorEmails:p.vendorEmails.includes(e)?p.vendorEmails.filter(x=>x!==e):[...p.vendorEmails,e]}));

  const submit=()=>{
    if(!form.itemName.trim())return setErr("Item name is required.");
    if(!form.quantity||isNaN(form.quantity))return setErr("Enter a valid quantity.");
    if(form.vendorEmails.length===0)return setErr("Select at least one vendor.");
    if(form.vendorEmails.length>3)return setErr("Maximum 3 vendors per RFQ (company policy).");
    setErr("");
    onSave({id:genRfqId(),createdAt:Date.now(),...form,quantity:Number(form.quantity),responses:[]});
  };

  return(
    <div className="fade-in" style={{maxWidth:680,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
        <button onClick={onCancel} style={{background:"none",border:"none",color:"var(--muted)",fontSize:20,cursor:"pointer",padding:0}}>←</button>
        <div>
          <h1 style={{fontFamily:"Sora",fontSize:20,fontWeight:800}}>New Request for Quotation</h1>
          <p style={{color:"var(--muted)",fontSize:12,marginTop:2}}>Fill item details — vendors will receive a form to submit their quote</p>
        </div>
      </div>

      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:24,display:"flex",flexDirection:"column",gap:16}}>
        {/* Item details */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Item Name *</label>
            <input value={form.itemName} onChange={e=>set("itemName",e.target.value)} placeholder="e.g. 3C x 300 sqmm XLPE Cable"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Description</label>
            <textarea value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Brief description of the item…" rows={2}
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Quantity *</label>
            <input value={form.quantity} onChange={e=>set("quantity",e.target.value)} type="number" placeholder="0"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Unit</label>
            <select value={form.unit} onChange={e=>set("unit",e.target.value)}
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none"}}>
              {UNIT_LIST.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Technical Specifications</label>
            <textarea value={form.specs} onChange={e=>set("specs",e.target.value)} placeholder="Standards, make, grade, any other requirements…" rows={3}
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Quote Deadline</label>
            <input value={form.deadline} onChange={e=>set("deadline",e.target.value)} type="date"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",colorScheme:"dark"}}/>
          </div>
        </div>

        {/* Vendor selection */}
        <div>
          <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:8}}>
            Select Vendors * <span style={{fontSize:10,color:"var(--s3)",fontWeight:400,textTransform:"none"}}>(company policy: min 1, max 3)</span>
          </label>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {vendorUsers.map(v=>{
              const sel=form.vendorEmails.includes(v.email);
              const disabled=!sel&&form.vendorEmails.length>=3;
              return(
                <div key={v.id} onClick={()=>!disabled&&toggleVendor(v.email)}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:9,border:`1px solid ${sel?"var(--accent)":"var(--border)"}`,background:sel?"var(--accent)10":"var(--s2)",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,transition:"all .15s"}}>
                  <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${sel?"var(--accent)":"var(--border)"}`,background:sel?"var(--accent)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {sel&&<span style={{color:"#fff",fontSize:10,fontWeight:900}}>✓</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{v.name}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{v.email}</div>
                  </div>
                  {sel&&<span style={{fontSize:10,color:"var(--accent)",fontWeight:700}}>Selected</span>}
                </div>
              );
            })}
          </div>
        </div>

        {err&&<div style={{padding:"8px 12px",background:"#ef444415",border:"1px solid #ef444440",borderRadius:7,fontSize:12,color:"#ef4444"}}>{err}</div>}

        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={submit}
            style={{flex:1,padding:"11px",background:"var(--accent)",border:"none",borderRadius:9,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Create RFQ & Notify Vendors →
          </button>
          <button onClick={onCancel}
            style={{padding:"11px 20px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:9,color:"var(--muted)",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RFQ Detail + Comparison ───────────────────────────────────────────────────
function RFQDetail({rfq,vendorUsers,onBack,onDelete,onUpdate}){
  const responded=rfq.responses.length;
  const total=rfq.vendorEmails.length;
  const allIn=responded>=total&&total>0;
  const [negotiating,setNegotiating]=useState(null); // vendorEmail
  const [negoMsg,setNegoMsg]=useState("");
  const [negoTarget,setNegoTarget]=useState("");

  // Rank by unit price ascending
  const ranked=[...rfq.responses].sort((a,b)=>a.unitPrice-b.unitPrice);
  const rankLabel=(i)=>i===0?"🥇 L1":i===1?"🥈 L2":"🥉 L3";
  const rankColor=(i)=>i===0?"#22c55e":i===1?"#f0a030":"#ef4444";

  const awarded=rfq.awarded;

  const handleAward=async(vendorEmail)=>{
    await onUpdate({...rfq,awarded:vendorEmail,status:"awarded"});
  };

  const handleNegotiate=async()=>{
    if(!negoMsg.trim())return;
    const negoEntry={vendorEmail:negotiating,message:negoMsg,targetPrice:negoTarget?Number(negoTarget):null,sentAt:Date.now(),status:"pending"};
    const existing=(rfq.negotiations||[]).filter(n=>n.vendorEmail!==negotiating);
    await onUpdate({...rfq,negotiations:[...existing,negoEntry]});
    setNegotiating(null);setNegoMsg("");setNegoTarget("");
  };

  return(
    <div className="fade-in">
      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:22}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"var(--muted)",fontSize:20,cursor:"pointer",padding:0,marginTop:2}}>←</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"var(--muted)",background:"var(--s2)",padding:"2px 8px",borderRadius:5}}>{rfq.id}</span>
            <h1 style={{fontFamily:"Sora",fontSize:20,fontWeight:800}}>{rfq.itemName}</h1>
            {awarded&&<span style={{fontSize:11,fontWeight:700,background:"#22c55e15",border:"1px solid #22c55e40",borderRadius:20,padding:"3px 10px",color:"#22c55e"}}>✓ Vendor Selected</span>}
          </div>
          <div style={{fontSize:12,color:"var(--muted)"}}>
            {rfq.quantity} {rfq.unit} · Deadline: {rfq.deadline||"—"} · Created: {new Date(rfq.createdAt).toLocaleDateString("en-GB")}
          </div>
        </div>
        {!awarded&&<button onClick={onDelete} style={{padding:"6px 12px",background:"#ef444415",border:"1px solid #ef444430",borderRadius:7,color:"#ef4444",fontSize:11,fontWeight:600,cursor:"pointer"}}>Delete RFQ</button>}
      </div>

      {/* Item specs card */}
      {rfq.specs&&(
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Technical Specifications</div>
          <div style={{fontSize:12,color:"var(--text)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{rfq.specs}</div>
        </div>
      )}

      {/* Vendor status cards */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${total},1fr)`,gap:12,marginBottom:20}}>
        {rfq.vendorEmails.map((e,i)=>{
          const v=vendorUsers.find(u=>u.email===e);
          const resp=rfq.responses.find(r=>r.vendorEmail===e);
          const rankIdx=allIn&&resp?ranked.findIndex(r=>r.vendorEmail===e):-1;
          const nego=(rfq.negotiations||[]).find(n=>n.vendorEmail===e);
          const isAwarded=awarded===e;
          const isRejected=awarded&&!isAwarded; // another vendor was selected
          return(
            <div key={e} style={{background:"var(--surface)",border:`2px solid ${isAwarded?"#22c55e":isRejected?"var(--border)":allIn&&resp?"#22c55e40":resp?"#f0a03040":"var(--border)"}`,borderRadius:12,padding:"14px 16px",position:"relative",opacity:isRejected?0.45:1,transition:"opacity .2s"}}>
              {isAwarded&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"#22c55e",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 10px",borderRadius:20,whiteSpace:"nowrap"}}>✓ SELECTED</div>}
              {isRejected&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"var(--s3)",color:"var(--muted)",fontSize:10,fontWeight:700,padding:"2px 10px",borderRadius:20,whiteSpace:"nowrap"}}>Not Selected</div>}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:"#06b6d420",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏭</div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{v?.name||e}</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>{e}</div>
                </div>
              </div>
              {allIn&&resp?(
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:10,color:"var(--muted)"}}>Unit Price</span>
                    <span style={{fontSize:13,fontWeight:800,color:rankIdx===0?"#22c55e":rankIdx===1?"#f0a030":"#ef4444",fontFamily:"monospace"}}>₹{resp.unitPrice?.toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:10,color:"var(--muted)"}}>Total</span>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:"monospace"}}>₹{(resp.unitPrice*rfq.quantity)?.toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:10,color:"var(--muted)"}}>Delivery</span>
                    <span style={{fontSize:11,color:"var(--text)"}}>{resp.deliveryDays} days</span>
                  </div>
                  {rankIdx>=0&&<div style={{textAlign:"center",fontWeight:700,fontSize:12,color:rankColor(rankIdx),marginTop:2}}>{rankLabel(rankIdx)}</div>}
                  {/* Negotiation status */}
                  {nego&&(
                    <div style={{marginTop:6,padding:"6px 8px",background:nego.status==="resubmitted"?"#22c55e10":"#f0a03010",border:`1px solid ${nego.status==="resubmitted"?"#22c55e30":"#f0a03030"}`,borderRadius:6,fontSize:10,color:nego.status==="resubmitted"?"#22c55e":"#f0a030"}}>
                      {nego.status==="resubmitted"?"✓ Vendor revised quote":"💬 Negotiation sent · awaiting revision"}
                    </div>
                  )}
                  {/* Action buttons — show only if no vendor selected yet; for selected vendor show confirmation */}
                  {!awarded&&(
                    <div style={{display:"flex",gap:6,marginTop:8}}>
                      <button onClick={()=>handleAward(e)}
                        style={{flex:1,padding:"6px 8px",background:"#22c55e15",border:"1px solid #22c55e40",borderRadius:7,color:"#22c55e",fontSize:11,fontWeight:700,cursor:"pointer"}}
                        onMouseEnter={ev=>ev.currentTarget.style.background="#22c55e30"}
                        onMouseLeave={ev=>ev.currentTarget.style.background="#22c55e15"}>
                        ✓ Select
                      </button>
                      <button onClick={()=>{setNegotiating(e);setNegoMsg(nego?.message||"");setNegoTarget(nego?.targetPrice||"");}}
                        style={{flex:1,padding:"6px 8px",background:"#3b82f615",border:"1px solid #3b82f640",borderRadius:7,color:"#3b82f6",fontSize:11,fontWeight:700,cursor:"pointer"}}
                        onMouseEnter={ev=>ev.currentTarget.style.background="#3b82f630"}
                        onMouseLeave={ev=>ev.currentTarget.style.background="#3b82f615"}>
                        💬 Negotiate
                      </button>
                    </div>
                  )}
                  {isAwarded&&(
                    <div style={{marginTop:8,textAlign:"center",padding:"8px",background:"#22c55e10",borderRadius:7,border:"1px solid #22c55e30",fontSize:11,color:"#22c55e",fontWeight:700}}>✓ Selected Vendor</div>
                  )}
                </div>
              ):(
                resp?(
                  <div style={{textAlign:"center",padding:"12px 0"}}>
                    <div style={{fontSize:18,marginBottom:4}}>✅</div>
                    <div style={{fontSize:11,fontWeight:600,color:"#f0a030"}}>Quote Submitted</div>
                    <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>Waiting for other vendors</div>
                  </div>
                ):(
                  <div style={{textAlign:"center",padding:"12px 0",color:"var(--muted)",fontSize:11}}>
                    <div style={{fontSize:20,marginBottom:4}}>⏳</div>Awaiting quote
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Negotiate Modal */}
      {negotiating&&(()=>{
        const v=vendorUsers.find(u=>u.email===negotiating);
        const currentResp=rfq.responses.find(r=>r.vendorEmail===negotiating);
        return(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#00000088",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setNegotiating(null)}>
            <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:24,maxWidth:480,width:"100%"}} onClick={ev=>ev.stopPropagation()}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:800,color:"var(--text)",marginBottom:4}}>💬 Negotiate with {v?.name||negotiating}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>Current quote: ₹{currentResp?.unitPrice?.toLocaleString("en-IN")} / {rfq.unit} · {currentResp?.deliveryDays} days delivery</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Target Price (₹) — optional</label>
                  <input value={negoTarget} onChange={e=>setNegoTarget(e.target.value)} type="number" placeholder={`e.g. ${Math.round((currentResp?.unitPrice||0)*0.9).toLocaleString("en-IN")}`}
                    style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  {negoTarget&&currentResp?.unitPrice&&<div style={{fontSize:11,color:"#f0a030",marginTop:4}}>Asking for {Math.round((1-negoTarget/currentResp.unitPrice)*100)}% reduction from current price</div>}
                </div>
                <div>
                  <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Message to Vendor *</label>
                  <textarea value={negoMsg} onChange={e=>setNegoMsg(e.target.value)} rows={4}
                    placeholder="e.g. Thank you for your quote. We have received competitive offers. Can you revise your price and delivery timeline? Our target is ₹X per unit."
                    style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:16}}>
                <button onClick={handleNegotiate}
                  style={{flex:1,padding:"10px",background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  Send Negotiation →
                </button>
                <button onClick={()=>setNegotiating(null)}
                  style={{padding:"10px 16px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Comparison Table */}
      {!allIn&&responded>0&&(
        <div style={{background:"var(--surface)",border:"1px solid #f0a03040",borderRadius:12,padding:"24px",marginBottom:20,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:10}}>🔒</div>
          <div style={{fontSize:14,fontWeight:700,color:"#f0a030",marginBottom:6}}>Comparison Locked</div>
          <div style={{fontSize:12,color:"var(--muted)"}}>
            {responded} of {total} quotes received. Comparison sheet will be revealed once all {total} vendors have submitted.
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:14}}>
            {rfq.vendorEmails.map(e=>{
              const v=vendorUsers.find(u=>u.email===e);
              const done=rfq.responses.find(r=>r.vendorEmail===e);
              return(
                <span key={e} style={{fontSize:11,padding:"4px 12px",borderRadius:20,background:done?"#f0a03015":"var(--s2)",border:`1px solid ${done?"#f0a03040":"var(--border)"}`,color:done?"#f0a030":"var(--s3)"}}>
                  {done?"✓ ":"⏳ "}{v?.name||e}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {allIn&&responded>0&&(
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",marginBottom:20}}>
          <div style={{padding:"12px 16px",background:"var(--s2)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>📊 Quotation Comparison Sheet</span>
            <span style={{fontSize:11,color:"#22c55e",fontWeight:600}}>✓ All quotes received</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"var(--s2)"}}>
                  <th style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid var(--border)",minWidth:160}}>Parameter</th>
                  {ranked.map((resp,i)=>{
                    const v=vendorUsers.find(u=>u.email===resp.vendorEmail);
                    return(
                      <th key={resp.vendorEmail} style={{padding:"10px 14px",textAlign:"center",fontSize:11,fontWeight:700,borderBottom:"1px solid var(--border)",borderLeft:"1px solid var(--border)",minWidth:160,color:rankColor(i)}}>
                        {rankLabel(i)}<br/>
                        <span style={{fontSize:10,fontWeight:400,color:"var(--muted)"}}>{v?.name||resp.vendorEmail}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[
                  {l:"Unit Price (₹)",k:"unitPrice",fmt:v=>"₹"+Number(v).toLocaleString("en-IN"),highlight:true},
                  {l:`Total Amount (${rfq.quantity} ${rfq.unit})`,k:"_total",fmt:(v,r)=>"₹"+(r.unitPrice*rfq.quantity).toLocaleString("en-IN")},
                  {l:"Delivery (days)",k:"deliveryDays",fmt:v=>v+" days"},
                  {l:"Quote Validity",k:"validity",fmt:v=>v||"—"},
                  {l:"Payment Terms",k:"paymentTerms",fmt:v=>v||"—"},
                  {l:"Brand / Make",k:"brand",fmt:v=>v||"—"},
                  {l:"Warranty",k:"warranty",fmt:v=>v||"—"},
                  {l:"Remarks",k:"remarks",fmt:v=>v||"—"},
                  {l:"Submitted On",k:"submittedAt",fmt:v=>new Date(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})},
                ].map((row,ri)=>(
                  <tr key={row.k} style={{background:ri%2===0?"transparent":"var(--s2)"}}>
                    <td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"var(--muted)",borderBottom:"1px solid var(--border)"}}>{row.l}</td>
                    {ranked.map((resp,ci)=>{
                      const val=row.k==="_total"?row.fmt(null,resp):row.fmt(resp[row.k]);
                      const isL1=ci===0&&row.highlight;
                      return(
                        <td key={resp.vendorEmail} style={{padding:"10px 14px",textAlign:"center",fontSize:12,fontWeight:isL1?800:500,color:isL1?"#22c55e":"var(--text)",borderBottom:"1px solid var(--border)",borderLeft:"1px solid var(--border)",background:isL1?"#22c55e08":"transparent"}}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!awarded&&ranked.length>0&&(
            <div style={{padding:"12px 16px",background:"#22c55e08",borderTop:"1px solid #22c55e20",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🏆</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700,color:"#22c55e"}}>Recommended: {vendorUsers.find(u=>u.email===ranked[0].vendorEmail)?.name||ranked[0].vendorEmail}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>Lowest price — ₹{ranked[0].unitPrice?.toLocaleString("en-IN")} / {rfq.unit} · ₹{(ranked[0].unitPrice*rfq.quantity)?.toLocaleString("en-IN")} total · {ranked[0].deliveryDays}d delivery</div>
              </div>
              <button onClick={()=>handleAward(ranked[0].vendorEmail)}
                style={{padding:"8px 16px",background:"#22c55e",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                ✓ Select L1
              </button>
            </div>
          )}
          {awarded&&(
            <div style={{padding:"12px 16px",background:"#22c55e10",borderTop:"1px solid #22c55e30",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>✓</span>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#22c55e"}}>Selected: {vendorUsers.find(u=>u.email===awarded)?.name||awarded}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>This RFQ is closed. The selected vendor has been notified.</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vendor: My Quotations Page ────────────────────────────────────────────────
function VendorQuotesPage({user}){
  const [rfqs,setRfqs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selRfq,setSelRfq]=useState(null);
  const [submitted,setSubmitted]=useState(null);

  useEffect(()=>{loadRfqs().then(r=>{setRfqs(r);setLoading(false);});},[]);

  const myRfqs=rfqs.filter(r=>r.vendorEmails.includes(user.email));
  const pending=myRfqs.filter(r=>!r.responses.find(res=>res.vendorEmail===user.email));
  const done=myRfqs.filter(r=>r.responses.find(res=>res.vendorEmail===user.email));

  const handleSubmit=async(rfqId,resp)=>{
    const updated=rfqs.map(r=>{
      if(r.id!==rfqId)return r;
      const existing=r.responses.filter(res=>res.vendorEmail!==user.email);
      // Mark negotiation as resubmitted if one exists
      const negotiations=(r.negotiations||[]).map(n=>n.vendorEmail===user.email?{...n,status:"resubmitted"}:n);
      return{...r,responses:[...existing,{...resp,vendorEmail:user.email,submittedAt:Date.now()}],negotiations};
    });
    setRfqs(updated);
    await saveRfqs(updated);
    setSelRfq(null);
    setSubmitted(rfqId);
    setTimeout(()=>setSubmitted(null),3000);
  };

  if(loading)return <div style={{padding:40,textAlign:"center",color:"var(--muted)"}}>Loading…</div>;

  if(selRfq){
    const live=rfqs.find(r=>r.id===selRfq.id)||selRfq;
    const existing=live.responses.find(r=>r.vendorEmail===user.email);
    return <VendorQuoteForm rfq={live} existing={existing} vendorName={user.name} user={user} onSubmit={(resp)=>handleSubmit(live.id,resp)} onBack={()=>setSelRfq(null)}/>;
  }

  return(
    <div className="fade-in">
      <div style={{marginBottom:22}}>
        <h1 style={{fontFamily:"Sora",fontSize:22,fontWeight:800}}>🏭 My Quotations</h1>
        <p style={{color:"var(--muted)",fontSize:13,marginTop:4}}>Logged in as <b style={{color:"#06b6d4"}}>{user.name}</b></p>
      </div>

      {submitted&&(
        <div style={{background:"#22c55e15",border:"1px solid #22c55e40",borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>✅</span>
          <span style={{fontSize:13,fontWeight:600,color:"#22c55e"}}>Quote submitted successfully!</span>
        </div>
      )}

      {myRfqs.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:"var(--muted)"}}>
          <div style={{fontSize:48,marginBottom:14}}>📭</div>
          <div style={{fontSize:15,fontWeight:600,color:"var(--text)"}}>No RFQs assigned to you</div>
          <p style={{fontSize:12,marginTop:6}}>Procurement will send you quotation requests here</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pending.length>0&&<div style={{fontSize:11,fontWeight:700,color:"#f0a030",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>⏳ Pending — {pending.length}</div>}
          {pending.map(r=>(
            <div key={r.id} onClick={()=>setSelRfq(r)}
              style={{background:"var(--surface)",border:"1px solid #f0a03040",borderRadius:12,padding:"16px 18px",cursor:"pointer",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#f0a030";e.currentTarget.style.boxShadow="0 2px 12px #0003";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#f0a03040";e.currentTarget.style.boxShadow="none";}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontFamily:"monospace",fontSize:11,color:"var(--muted)",background:"var(--s2)",padding:"2px 7px",borderRadius:5}}>{r.id}</span>
                    <span style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{r.itemName}</span>
                  </div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{r.quantity} {r.unit} · Deadline: {r.deadline||"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f0a030",background:"#f0a03015",padding:"4px 12px",borderRadius:20,border:"1px solid #f0a03030",marginBottom:4}}>Submit Quote →</div>
                </div>
              </div>
            </div>
          ))}

          {done.length>0&&<div style={{fontSize:11,fontWeight:700,color:"#22c55e",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:10,marginBottom:2}}>✓ Submitted — {done.length}</div>}
          {done.map(r=>{
            const resp=r.responses.find(res=>res.vendorEmail===user.email);
            return(
              <div key={r.id} onClick={()=>setSelRfq(r)}
                style={{background:"var(--surface)",border:"1px solid #22c55e30",borderRadius:12,padding:"16px 18px",cursor:"pointer",opacity:0.85}}
                onMouseEnter={e=>{e.currentTarget.style.opacity="1";}} onMouseLeave={e=>{e.currentTarget.style.opacity="0.85";}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontFamily:"monospace",fontSize:11,color:"var(--muted)",background:"var(--s2)",padding:"2px 7px",borderRadius:5}}>{r.id}</span>
                      <span style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{r.itemName}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{r.quantity} {r.unit} · Quoted: ₹{resp?.unitPrice?.toLocaleString("en-IN")} / {r.unit}</div>
                  </div>
                  <span style={{fontSize:11,color:"#22c55e",fontWeight:700}}>✓ Submitted</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Vendor Quote Form ─────────────────────────────────────────────────────────
function VendorQuoteForm({rfq,existing,vendorName,user,onSubmit,onBack}){
  const [form,setForm]=useState({
    unitPrice:existing?.unitPrice||"",
    deliveryDays:existing?.deliveryDays||"",
    validity:existing?.validity||"30 days",
    paymentTerms:existing?.paymentTerms||"",
    brand:existing?.brand||"",
    warranty:existing?.warranty||"",
    remarks:existing?.remarks||"",
  });
  const [err,setErr]=useState("");
  const [confirming,setConfirming]=useState(false);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));

  const submit=()=>{
    if(!form.unitPrice||isNaN(form.unitPrice)||Number(form.unitPrice)<=0)return setErr("Enter a valid unit price.");
    if(!form.deliveryDays||isNaN(form.deliveryDays))return setErr("Enter delivery days.");
    setErr("");setConfirming(true);
  };
  const confirm=()=>onSubmit({...form,unitPrice:Number(form.unitPrice),deliveryDays:Number(form.deliveryDays)});

  return(
    <div className="fade-in" style={{maxWidth:640,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"var(--muted)",fontSize:20,cursor:"pointer",padding:0}}>←</button>
        <div>
          <h1 style={{fontFamily:"Sora",fontSize:19,fontWeight:800}}>Submit Quotation</h1>
          <p style={{color:"var(--muted)",fontSize:12,marginTop:2}}>Filling as <b style={{color:"#06b6d4"}}>{vendorName}</b></p>
        </div>
      </div>

      {/* RFQ summary */}
      <div style={{background:"var(--surface)",border:"1px solid var(--accent)30",borderRadius:12,padding:"14px 16px",marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:700,color:"var(--accent)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Request Details</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[["Item",rfq.itemName],["Quantity",`${rfq.quantity} ${rfq.unit}`],["Deadline",rfq.deadline||"—"],["RFQ ID",rfq.id]].map(([l,v])=>(
            <div key={l}><span style={{fontSize:10,color:"var(--muted)"}}>{l}: </span><span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{v}</span></div>
          ))}
        </div>
        {rfq.specs&&<div style={{marginTop:10,padding:"8px 10px",background:"var(--s2)",borderRadius:7,fontSize:11,color:"var(--muted)",lineHeight:1.5}}><b style={{color:"var(--text)"}}>Specs:</b> {rfq.specs}</div>}
      </div>

      {/* Negotiation message from procurement */}
      {(()=>{
        const myNego=(rfq.negotiations||[]).find(n=>n.vendorEmail===user.email);
        if(!myNego)return null;
        return(
          <div style={{background:"#3b82f615",border:"1px solid #3b82f640",borderRadius:12,padding:"14px 16px",marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,color:"#3b82f6",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>💬 Negotiation Message from Procurement</div>
            {myNego.targetPrice&&<div style={{fontSize:12,color:"var(--text)",marginBottom:6}}>Target Price: <b style={{color:"#f0a030"}}>₹{Number(myNego.targetPrice).toLocaleString("en-IN")} / {rfq.unit}</b></div>}
            <div style={{fontSize:12,color:"var(--text)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{myNego.message}</div>
            <div style={{fontSize:10,color:"var(--muted)",marginTop:6}}>Sent: {new Date(myNego.sentAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
          </div>
        );
      })()}
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:22,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Unit Price (₹) *</label>
            <input value={form.unitPrice} onChange={e=>set("unitPrice",e.target.value)} type="number" placeholder="0.00"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            {form.unitPrice>0&&<div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>Total: ₹{(form.unitPrice*rfq.quantity).toLocaleString("en-IN")} for {rfq.quantity} {rfq.unit}</div>}
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Delivery Time (days) *</label>
            <input value={form.deliveryDays} onChange={e=>set("deliveryDays",e.target.value)} type="number" placeholder="e.g. 14"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Quote Validity</label>
            <input value={form.validity} onChange={e=>set("validity",e.target.value)} placeholder="e.g. 30 days"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Payment Terms</label>
            <input value={form.paymentTerms} onChange={e=>set("paymentTerms",e.target.value)} placeholder="e.g. 30 days net"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Brand / Make</label>
            <input value={form.brand} onChange={e=>set("brand",e.target.value)} placeholder="e.g. Havells, Polycab"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Warranty</label>
            <input value={form.warranty} onChange={e=>set("warranty",e.target.value)} placeholder="e.g. 1 year"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:5}}>Remarks / Notes</label>
            <textarea value={form.remarks} onChange={e=>set("remarks",e.target.value)} rows={2} placeholder="Any additional terms, exclusions, notes…"
              style={{width:"100%",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
        </div>

        {err&&<div style={{padding:"8px 12px",background:"#ef444415",border:"1px solid #ef444440",borderRadius:7,fontSize:12,color:"#ef4444"}}>{err}</div>}

        {confirming?(
          <div style={{background:"#f0a03015",border:"1px solid #f0a03040",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#f0a030",marginBottom:8}}>⚠ Confirm Submission</div>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>Once submitted, your quote will be shared with the procurement team. You can update it by re-submitting.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={confirm} style={{flex:1,padding:"10px",background:"#22c55e",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>✓ Confirm & Submit</button>
              <button onClick={()=>setConfirming(false)} style={{padding:"10px 16px",background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--muted)",fontWeight:600,fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        ):(
          <button onClick={submit} style={{padding:"12px",background:"var(--accent)",border:"none",borderRadius:9,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Review & Submit Quote →
          </button>
        )}
      </div>
    </div>
  );
}
export default function App(){
  const [user,setUser]=useState(null);
  const [page,setPage]=useState("dashboard");
  const [sel,setSel]=useState(null);
  const [notifs,setNotifs]=useState({});
  const [users,setUsers]=useState(INITIAL_USERS);

  const [boqs,setBoqs]=useState([
    {
      id:1,boqId:"BOQ-DEMO01",createdBy:1,createdAt:Date.now()-86400000*4,
      status:"with_engineering",
      items:[
        {id:1,lineItemId:"2422849",label:"1.1.1",name:"RING MAIN UNIT- 11kV 5 Mod INDOOR TYPE IP-4X",unit:"No's",planQty:1,engQty:0,qsQty:0,siteQty:0},
        {id:2,lineItemId:"2422853",label:"1.1.2",name:"Earthing Truck (Busbar Side) with single phase PT and audio-visual alarm, safety interlock features",unit:"No's",planQty:2,engQty:0,qsQty:0,siteQty:0},
        {id:3,lineItemId:"2422882",label:"1.3.1",name:"3C X 300Sq.mm XLPE insulated Al. Ar. - Earthed type, FRLS HT Cable 11kV grade as per IS-7098 Part-2",unit:"Mtrs.",planQty:45,engQty:0,qsQty:0,siteQty:0},
      ],
      activityLog:[{time:Date.now()-86400000*4,user:"user_1",action:"Submitted to Engineering Team"}],
    },
    {
      id:2,boqId:"BOQ-DEMO02",createdBy:1,createdAt:Date.now()-86400000*3,
      status:"with_qs",
      items:[
        {id:1,lineItemId:"2423001",label:"5.1.1",name:"3.5C x 300 sq.mm Al. Ar. XLPE cable - FRLS",unit:"R.Mtrs",planQty:2400,engQty:2200,qsQty:0,siteQty:0},
        {id:2,lineItemId:"2423002",label:"5.1.2",name:"End Termination for above",unit:"Sets",planQty:64,engQty:60,qsQty:0,siteQty:0},
      ],
      activityLog:[
        {time:Date.now()-86400000*3,user:"user_1",action:"Submitted to Engineering Team"},
        {time:Date.now()-86400000*2,user:"Engineering Team",action:"Engineering quantities submitted — forwarded to Quantity Survey Team"},
      ],
    },
    {
      id:3,boqId:"BOQ-DEMO03",createdBy:1,createdAt:Date.now()-86400000*2,
      status:"with_site",
      items:[
        {id:1,lineItemId:"2422932",label:"2.1",name:"Main LT Panel - with automatic NOVEC-1230 flooding system",unit:"No's",planQty:1,engQty:1,qsQty:1,siteQty:0},
        {id:2,lineItemId:"2422933",label:"2.2",name:"ACCP PANEL-1 & 2 IP 4X AS PER SINGLE LINE DIAGRAM",unit:"No's",planQty:2,engQty:3,qsQty:2,siteQty:0},
        {id:3,lineItemId:"2422934",label:"2.3",name:"UTILITY PANEL IP 54 AS PER SINGLE LINE DIAGRAM",unit:"No's",planQty:1,engQty:1,qsQty:1,siteQty:0},
      ],
      activityLog:[
        {time:Date.now()-86400000*2,user:"user_1",action:"Submitted to Engineering Team"},
        {time:Date.now()-86400000*1.5,user:"Engineering Team",action:"Engineering quantities submitted — forwarded to Quantity Survey Team"},
        {time:Date.now()-86400000,user:"Quantity Survey Team",action:"QS quantities submitted — forwarded to Project Team"},
      ],
    },
  ]);

  const myNotifs=user?(notifs[user.id]||[]):[];
  const vendorUsers=users.filter(u=>u.role==="vendor");

  const push=(uid,notif)=>setNotifs(p=>({...p,[uid]:[...(p[uid]||[]),{id:Date.now(),...notif}]}));
  const clearNotifs=()=>setNotifs(p=>({...p,[user.id]:(p[user.id]||[]).map(n=>({...n,read:true}))}));
  const addBoq=boq=>{setBoqs(p=>[...p,boq]);setPage("my-boqs");};

  const updateBoq=(updated,event)=>{
    setBoqs(p=>p.map(b=>b.id===updated.id?updated:b));
    setSel(updated);
    const planUser=users.find(u=>u.role==="planning");
    const engUser=users.find(u=>u.role==="engineering");
    const qsUser=users.find(u=>u.role==="qs");
    const siteUser=users.find(u=>u.role==="site");

    if(event==="engineering_submitted"){
      const diff=updated.items.filter(i=>i.engQty!==i.planQty).length;
      push(planUser.id,{icon:"⚙️",read:false,time:Date.now(),message:`Engineering reviewed ${updated.boqId}. ${diff} item${diff!==1?"s have":" has"} quantity differences. Forwarded to QS Team.`});
      push(qsUser.id,{icon:"📋",read:false,time:Date.now(),message:`${updated.boqId} assigned to you. Engineering quantities are ready — please enter QS quantities.`});
    }
    if(event==="qs_submitted"){
      const diff=updated.items.filter(i=>i.qsQty!==i.engQty).length;
      push(planUser.id,{icon:"📏",read:false,time:Date.now(),message:`QS Team reviewed ${updated.boqId}. ${diff} item${diff!==1?"s differ":" differs"} between QS and Engineering. Forwarded to Project Team.`});
      push(siteUser.id,{icon:"🏗️",read:false,time:Date.now(),message:`${updated.boqId} assigned to you. QS quantities are complete — please enter Site quantities.`});
    }
    if(event==="site_submitted"){
      const diff=updated.items.filter(i=>i.siteQty!==i.engQty).length;
      push(planUser.id,{icon:"🏗️",read:false,time:Date.now(),message:`Project Team completed ${updated.boqId}. ${diff} item${diff!==1?"s differ":" differs"} between Site and Engineering. BOQ is now fully Completed.`});
      push(engUser.id,{icon:"✅",read:false,time:Date.now(),message:`${updated.boqId} has been completed by the Project Team.`});
      push(qsUser.id,{icon:"✅",read:false,time:Date.now(),message:`${updated.boqId} has been completed by the Project Team.`});
    }
  };

  if(!user) return <><style>{G}</style><LoginScreen onLogin={u=>{setUser(u);setPage(u.role==="vendor"?"quotes":"dashboard");}} users={users}/></>;

  // Helper: can user access this page?
  const canAccess=pg=>!user.pages||user.pages.includes(pg);

  const render=()=>{
    // ── BOQ detail views ──
    if(sel){
      if(user.role==="planning")    return <PlanningView    boq={sel} onBack={()=>setSel(null)} onUpdateBoq={(updated)=>{setBoqs(p=>p.map(b=>b.id===updated.id?updated:b));setSel(updated);}}/>;
      if(user.role==="engineering") return <EngineeringView boq={sel} onUpdate={updateBoq} onBack={()=>setSel(null)}/>;
      if(user.role==="qs")          return <QSView          boq={sel} onUpdate={updateBoq} onBack={()=>setSel(null)}/>;
      if(user.role==="site")        return <SiteView        boq={sel} onUpdate={updateBoq} onBack={()=>setSel(null)} users={users}/>;
    }
    if(user.role==="planning"){
      if(page==="dashboard"&&canAccess("dashboard")) return <PlanningDash boqs={boqs} user={user} setPage={setPage} notifications={myNotifs}/>;
      if(page==="create"&&canAccess("create"))       return <BOQCreator onSave={addBoq} user={user}/>;
      if(page==="my-boqs"&&canAccess("my-boqs"))     return <BOQList boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
      if(page==="search")                            return <GlobalSearch boqs={boqs} users={users} onSelectBoq={b=>{setSel(b);setPage("dashboard");}}/>;
      if(page==="reports"&&canAccess("reports"))     return <Reports boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
    }
    if(user.role==="engineering"){
      if(page==="dashboard"&&canAccess("dashboard")) return <Dashboard user={user} boqs={boqs} setPage={setPage} notifications={myNotifs} pendingStatus="with_engineering" pendingLabel="Enter engineering quantities for given line items"/>;
      if(page==="pending"&&canAccess("pending"))     return <BOQList boqs={boqs} user={user} filterStatus="with_engineering" onSelect={b=>setSel(b)} users={users}/>;
      if(page==="my-boqs"&&canAccess("my-boqs"))     return <BOQList boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
      if(page==="search")                            return <GlobalSearch boqs={boqs} users={users} onSelectBoq={b=>{setSel(b);setPage("dashboard");}}/>;
      if(page==="reports"&&canAccess("reports"))     return <Reports boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
    }
    if(user.role==="qs"){
      if(page==="dashboard"&&canAccess("dashboard")) return <Dashboard user={user} boqs={boqs} setPage={setPage} notifications={myNotifs} pendingStatus="with_qs" pendingLabel="Enter QS quantities and compare with Engineering"/>;
      if(page==="pending"&&canAccess("pending"))     return <BOQList boqs={boqs} user={user} filterStatus="with_qs" onSelect={b=>setSel(b)} users={users}/>;
      if(page==="my-boqs"&&canAccess("my-boqs"))     return <BOQList boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
      if(page==="search")                            return <GlobalSearch boqs={boqs} users={users} onSelectBoq={b=>{setSel(b);setPage("dashboard");}}/>;
      if(page==="reports"&&canAccess("reports"))     return <Reports boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
    }
    if(user.role==="site"){
      if(page==="dashboard"&&canAccess("dashboard")) return <Dashboard user={user} boqs={boqs} setPage={setPage} notifications={myNotifs} pendingStatus="with_site" pendingLabel="Enter site quantities and compare with Engineering"/>;
      if(page==="pending"&&canAccess("pending"))     return <BOQList boqs={boqs} user={user} filterStatus="with_site" onSelect={b=>setSel(b)} users={users}/>;
      if(page==="my-boqs"&&canAccess("my-boqs"))     return <BOQList boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
      if(page==="search")                            return <GlobalSearch boqs={boqs} users={users} onSelectBoq={b=>{setSel(b);setPage("dashboard");}}/>;
      if(page==="reports"&&canAccess("reports"))     return <Reports boqs={boqs} user={user} onSelect={b=>setSel(b)} users={users}/>;
    }
    // ── Vendor routes ──
    if(user.role==="vendor") return <VendorQuotesPage user={user}/>;
    // ── Procurement routes ──
    if(user.role==="procurement"){
      if(page==="quotations") return <QuotationsPage user={user} vendorUsers={vendorUsers}/>;
      if(canAccess("procurement")) return <ProcurementDashboard/>;
    }
    // No access fallback
    return <div style={{textAlign:"center",padding:"80px 20px",color:"var(--muted)"}}><div style={{fontSize:48,marginBottom:16}}>🚫</div><div style={{fontSize:18,fontWeight:600}}>Access Denied</div><p style={{marginTop:8}}>You don't have permission to view this page.</p></div>;
  };

  return(
    <>
      <style>{G}</style>
      <div style={{display:"flex",minHeight:"100vh"}}>
        <Sidebar user={user} page={page} setPage={p=>{setPage(p);setSel(null);}} onLogout={()=>{setUser(null);setSel(null);setPage("dashboard");}} boqs={boqs} notifications={myNotifs} onClearNotif={clearNotifs}/>
        <main style={{flex:1,padding:28,overflowY:"auto",background:"radial-gradient(ellipse at 80% 10%, #1e293b20 0%, transparent 60%)"}}>{render()}</main>
      </div>
    </>
  );
}
