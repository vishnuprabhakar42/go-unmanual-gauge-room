/**
 * Demo seed (dev / demos / e2e). Password for all users: demo1234 (development only).
 * Grows each milestone: M0 = org, plants, departments, locations, users per role, number series.
 *
 *   pnpm db:seed           seeds an empty database
 *   pnpm db:reset          wipes, migrates and seeds
 */
import "dotenv/config";
import { createId } from "@paralleldrive/cuid2";
import type { Role } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db";
import { computeNextDue, istMidnight } from "../src/domain/due";
import { istParts } from "../src/domain/india/format";
import { stopBoss } from "../src/server/jobs/boss";
import { hashPassword } from "../src/server/passwords";
import { newQrToken } from "../src/server/services/instruments";
import {
  approveRequest,
  createRequestsFromSelection,
  releaseRequest,
  submitRequest,
} from "../src/server/services/calibration-requests";
import { challanCandidates, createChallan, dispatchChallan, issueChallan, receiveItems } from "../src/server/services/challans";
import { attachCertificate } from "../src/server/services/certificates";
import { approvePurchaseOrder, sendPurchaseOrder } from "../src/server/services/purchase-orders";
import { generateAuditPack, requestAuditPack } from "../src/server/services/audit-pack";
import { objectKey, storage } from "../src/server/storage";
import { renderDemoCertificate } from "./demo-certificate";
import { createPlantWithSeries } from "../src/server/services/setup";
import { tenantDb, withTenantTx, type TenantTx } from "../src/server/tenant";

export const DEMO_ORG_NAME = "Demo Auto Components Pvt Ltd";
export const DEMO_PASSWORD = "demo1234";

const PLANTS = [
  {
    name: "Chakan Plant",
    code: "PLT1",
    gstin: "27AADCD4321K1ZR",
    address: "Plot 12, MIDC Phase II, Chakan, Pune, Maharashtra 410501",
  },
  {
    name: "Hosur Plant",
    code: "PLT2",
    gstin: "33AADCD4321K2ZX",
    address: "SIPCOT Industrial Complex Phase I, Hosur, Tamil Nadu 635126",
  },
];

const DEPARTMENTS = ["Machine Shop", "Assembly", "Quality Lab", "Press Shop", "Heat Treatment"];
const LOCATIONS: Record<string, string[]> = {
  "Gauge Room": ["Cabinet A", "Cabinet B", "Cabinet C"],
  "Shop Floor": ["Cell 1", "Cell 2", "Cell 3"],
  "Quality Lab": ["Bench 1", "Bench 2"],
};

/** One user per role; plant-limited roles get PLT1/PLT2 to exercise plant scoping. */
const USERS: { email: string; name: string; role: Role; plant: string | null; phone?: string }[] = [
  { email: "admin@demoauto.test", name: "Anita Deshmukh", role: "ORG_ADMIN", plant: null },
  { email: "quality@demoauto.test", name: "Rajesh Kulkarni", role: "QUALITY_HEAD", plant: null, phone: "919800000001" },
  { email: "gauge1@demoauto.test", name: "Suresh Patil", role: "GAUGE_INCHARGE", plant: "PLT1", phone: "919800000002" },
  { email: "gauge2@demoauto.test", name: "Karthik Raman", role: "GAUGE_INCHARGE", plant: "PLT2", phone: "919800000003" },
  { email: "purchase@demoauto.test", name: "Meera Iyer", role: "PURCHASE", plant: null },
  { email: "stores@demoauto.test", name: "Vikas Jadhav", role: "STORES", plant: "PLT1" },
  { email: "stores2@demoauto.test", name: "Prakash Murugan", role: "STORES", plant: "PLT2" },
  { email: "operator@demoauto.test", name: "Ganesh More", role: "OPERATOR", plant: "PLT1" },
];
// VENDOR_USER demo accounts are added with the vendor master in M3/M5.

type TypeSeed = {
  name: string;
  category: "DIMENSIONAL" | "PRESSURE" | "THERMAL" | "ELECTRICAL" | "MASS" | "TORQUE";
  parameter: string;
  unit: string;
  freq: number;
  tol: string;
  hsn: string;
  range: [number, number] | null;
  lc: number | null;
  makes: string[];
  prefix: string;
  lead?: number;
};

/** Demo calibration standards (code, edition year) and adjustability per type name. */
const TYPE_STANDARDS: Record<string, { code: string | null; year: number | null; adjustable: boolean }> = {
  "Digital Vernier Caliper 0–150 mm": { code: "ISO 13385-1", year: 2019, adjustable: false },
  "Outside Micrometer 0–25 mm": { code: "ISO 3611", year: 2010, adjustable: true },
  "Height Gauge 0–300 mm": { code: "ISO 13225", year: 2012, adjustable: true },
  "Dial Gauge 0–10 mm": { code: "ISO 463", year: 2006, adjustable: true },
  "Plain Plug Gauge": { code: "ISO 1938-1", year: 2015, adjustable: false },
  "Plain Ring Gauge": { code: "ISO 1938-1", year: 2015, adjustable: false },
  "Slip Gauge Set (87 pcs)": { code: "ISO 3650", year: 1998, adjustable: false },
  "Pressure Gauge 0–10 bar": { code: "EN 837-1", year: 1996, adjustable: true },
  "Thermocouple Type K": { code: "IEC 60584-1", year: 2013, adjustable: false },
  "Digital Thermometer": { code: null, year: null, adjustable: true },
  "Digital Multimeter": { code: null, year: null, adjustable: true },
  "Clamp Meter": { code: null, year: null, adjustable: true },
  "Torque Wrench 20–100 Nm": { code: "ISO 6789-1", year: 2017, adjustable: true },
  "Weighing Balance 0–30 kg": { code: "OIML R 76-1", year: 2006, adjustable: true },
  "Granite Surface Plate": { code: "ISO 8512-2", year: 1990, adjustable: false },
};

/** M8: type standards + instrument adjustability (idempotent; also used to upgrade an existing demo DB). */
async function seedStandards(tx: TenantTx) {
  for (const [name, std] of Object.entries(TYPE_STANDARDS)) {
    const type = await tx.instrumentType.findFirst({ where: { name } });
    if (!type) continue;
    if (std.code && !type.standardCode)
      await tx.instrumentType.update({
        where: { id: type.id },
        data: { standardCode: std.code, standardDate: istMidnight(std.year!, 1, 1) },
      });
    await tx.instrument.updateMany({ where: { typeId: type.id, adjustable: null }, data: { adjustable: std.adjustable } });
  }
}

/** 15 instrument types typical of an auto-component plant. HSN codes are editable org data. */
const TYPES: TypeSeed[] = [
  {
    name: "Digital Vernier Caliper 0–150 mm",
    category: "DIMENSIONAL",
    parameter: "Length",
    unit: "mm",
    freq: 12,
    tol: "±0.02 mm",
    hsn: "9017",
    range: [0, 150],
    lc: 0.01,
    makes: ["Mitutoyo", "Insize", "Baker"],
    prefix: "VC",
  },
  {
    name: "Outside Micrometer 0–25 mm",
    category: "DIMENSIONAL",
    parameter: "Length",
    unit: "mm",
    freq: 12,
    tol: "±2 µm",
    hsn: "9031",
    range: [0, 25],
    lc: 0.001,
    makes: ["Mitutoyo", "Baker"],
    prefix: "MM",
  },
  {
    name: "Height Gauge 0–300 mm",
    category: "DIMENSIONAL",
    parameter: "Length",
    unit: "mm",
    freq: 12,
    tol: "±0.03 mm",
    hsn: "9017",
    range: [0, 300],
    lc: 0.01,
    makes: ["Mitutoyo", "Insize"],
    prefix: "HG",
  },
  {
    name: "Dial Gauge 0–10 mm",
    category: "DIMENSIONAL",
    parameter: "Length",
    unit: "mm",
    freq: 6,
    tol: "±0.01 mm",
    hsn: "9031",
    range: [0, 10],
    lc: 0.01,
    makes: ["Mitutoyo", "Baker", "Kristeel"],
    prefix: "DG",
  },
  {
    name: "Plain Plug Gauge",
    category: "DIMENSIONAL",
    parameter: "Diameter",
    unit: "mm",
    freq: 6,
    tol: "IT6",
    hsn: "9031",
    range: null,
    lc: null,
    makes: ["Pioneer", "Rapid"],
    prefix: "PG",
    lead: 15,
  },
  {
    name: "Plain Ring Gauge",
    category: "DIMENSIONAL",
    parameter: "Diameter",
    unit: "mm",
    freq: 6,
    tol: "IT6",
    hsn: "9031",
    range: null,
    lc: null,
    makes: ["Pioneer", "Rapid"],
    prefix: "RG",
    lead: 15,
  },
  {
    name: "Slip Gauge Set (87 pcs)",
    category: "DIMENSIONAL",
    parameter: "Length",
    unit: "mm",
    freq: 24,
    tol: "Grade 1",
    hsn: "9031",
    range: [1, 100],
    lc: null,
    makes: ["Mitutoyo", "Mahr"],
    prefix: "SG",
    lead: 45,
  },
  {
    name: "Pressure Gauge 0–10 bar",
    category: "PRESSURE",
    parameter: "Pressure",
    unit: "bar",
    freq: 12,
    tol: "±1% FS",
    hsn: "9026",
    range: [0, 10],
    lc: 0.2,
    makes: ["Wika", "Baumer", "H Guru"],
    prefix: "PRG",
  },
  {
    name: "Thermocouple Type K",
    category: "THERMAL",
    parameter: "Temperature",
    unit: "°C",
    freq: 12,
    tol: "±2.2 °C",
    hsn: "9025",
    range: [0, 1200],
    lc: 1,
    makes: ["Tempsens", "Pyro Electric"],
    prefix: "TC",
  },
  {
    name: "Digital Thermometer",
    category: "THERMAL",
    parameter: "Temperature",
    unit: "°C",
    freq: 12,
    tol: "±1 °C",
    hsn: "9025",
    range: [-50, 300],
    lc: 0.1,
    makes: ["Fluke", "Testo"],
    prefix: "DT",
  },
  {
    name: "Digital Multimeter",
    category: "ELECTRICAL",
    parameter: "Voltage/Current/Resistance",
    unit: "V",
    freq: 12,
    tol: "±0.5% rdg",
    hsn: "9030",
    range: [0, 1000],
    lc: 0.01,
    makes: ["Fluke", "Kusam Meco", "Mastech"],
    prefix: "DMM",
  },
  {
    name: "Clamp Meter",
    category: "ELECTRICAL",
    parameter: "Current",
    unit: "A",
    freq: 12,
    tol: "±2% rdg",
    hsn: "9030",
    range: [0, 600],
    lc: 0.1,
    makes: ["Fluke", "Kusam Meco"],
    prefix: "CM",
  },
  {
    name: "Torque Wrench 20–100 Nm",
    category: "TORQUE",
    parameter: "Torque",
    unit: "Nm",
    freq: 12,
    tol: "±4%",
    hsn: "8204",
    range: [20, 100],
    lc: 1,
    makes: ["Norbar", "Taparia", "Stahlwille"],
    prefix: "TW",
  },
  {
    name: "Weighing Balance 0–30 kg",
    category: "MASS",
    parameter: "Mass",
    unit: "kg",
    freq: 12,
    tol: "±5 g",
    hsn: "8423",
    range: [0, 30],
    lc: 0.001,
    makes: ["Essae", "Contech"],
    prefix: "WB",
  },
  {
    name: "Granite Surface Plate",
    category: "DIMENSIONAL",
    parameter: "Flatness",
    unit: "µm",
    freq: 24,
    tol: "Grade 0",
    hsn: "9031",
    range: null,
    lc: null,
    makes: ["Eagle", "Kristeel"],
    prefix: "SP",
    lead: 45,
  },
];

/** Type mix for 600 instruments (verniers, micrometers and gauges dominate a real gauge room). */
const TYPE_WEIGHTS = [16, 12, 4, 12, 14, 8, 2, 8, 4, 3, 4, 2, 6, 3, 2];

function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** M1: instrument types + 600 instruments with a realistic spread of due dates. */
async function seedInstruments(tx: TenantTx, organizationId: string, plantIds: Record<string, string>) {
  // ── Instrument types and 600 instruments ──
  const types = await tx.instrumentType.createManyAndReturn({
    data: TYPES.map((t) => ({
      organizationId,
      name: t.name,
      category: t.category,
      parameter: t.parameter,
      unit: t.unit,
      defaultFrequencyValue: t.freq,
      defaultFrequencyUnit: "MONTHS" as const,
      defaultTolerance: t.tol,
      nablRequired: true,
      hsnCode: t.hsn,
      defaultLeadTimeDays: t.lead ?? null,
    })),
  });
  const typeByName = new Map(types.map((t) => [t.name, t]));
  const rand = prng(20261022);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const totalWeight = TYPE_WEIGHTS.reduce((a, b) => a + b, 0);
  const pickType = () => {
    let r = rand() * totalWeight;
    for (let i = 0; i < TYPES.length; i++) if ((r -= TYPE_WEIGHTS[i]) < 0) return TYPES[i];
    return TYPES[0];
  };
  const depts = await tx.department.findMany({ select: { id: true, plantId: true, name: true } });
  const locs = await tx.location.findMany({ where: { parentId: { not: null } }, select: { id: true, plantId: true } });
  const today = istParts(new Date());
  const todayIst = istMidnight(today.year, today.month, today.day);
  const counters = new Map<string, number>();
  const custodians = ["Ramesh S.", "Pooja K.", "Ajay M.", "Sunil P.", "Neha D.", null];

  const instruments = Array.from({ length: 600 }, (_, i) => {
    const t = pickType();
    const type = typeByName.get(t.name)!;
    const plantCode = i % 3 === 2 ? "PLT2" : "PLT1"; // ~2/3 at Chakan
    const plantId = plantIds[plantCode];
    const n = (counters.get(`${plantCode}${t.prefix}`) ?? 0) + 1;
    counters.set(`${plantCode}${t.prefix}`, n);
    const freqMonths = t.freq;
    // Next-due spread: ~8% overdue, ~35% due in 60 days, rest later; a few never calibrated
    const r = rand();
    const dueOffsetDays =
      r < 0.08 ? -Math.ceil(rand() * 45) : r < 0.43 ? Math.floor(rand() * 60) : 60 + Math.floor(rand() * freqMonths * 30 - 60);
    const neverCalibrated = rand() < 0.02;
    const targetDue = new Date(todayIst.getTime() + dueOffsetDays * 86_400_000);
    const p = istParts(targetDue);
    // last calibration = target due − frequency (calendar months)
    const lastMonthIndex = p.month - 1 - freqMonths;
    const lastCal = istMidnight(
      p.year + Math.floor(lastMonthIndex / 12),
      (((lastMonthIndex % 12) + 12) % 12) + 1,
      Math.min(p.day, 28),
    );
    const lastCalibratedAt = neverCalibrated ? null : lastCal;
    const nextDueAt = lastCalibratedAt ? computeNextDue(lastCalibratedAt, freqMonths, "MONTHS") : null;
    const plantDepts = depts.filter((d) => d.plantId === plantId);
    const plantLocs = locs.filter((l) => l.plantId === plantId);
    const size = t.range === null ? 10 + Math.floor(rand() * 60) : null;
    return {
      organizationId,
      plantId,
      code: `${plantCode === "PLT1" ? "C" : "H"}-${t.prefix}-${String(n).padStart(3, "0")}`,
      typeId: type.id,
      description: size ? `${t.name.replace("Plain ", "")} Ø${size} H7` : null,
      make: pick(t.makes),
      model: null,
      serialNo: `${t.prefix}${String(100000 + Math.floor(rand() * 899999))}`,
      rangeMin: t.range?.[0] ?? null,
      rangeMax: t.range?.[1] ?? null,
      unit: t.unit,
      leastCount: t.lc,
      tolerancePlus: null,
      toleranceMinus: null,
      acceptanceCriteria: t.tol,
      departmentId: pick(plantDepts).id,
      locationId: pick(plantLocs).id,
      custodianName: pick(custodians),
      criticality: (rand() < 0.25 ? "A" : rand() < 0.7 ? "B" : "C") as "A" | "B" | "C",
      calibrationSource: "EXTERNAL" as const,
      frequencyValue: freqMonths,
      frequencyUnit: "MONTHS" as const,
      lastCalibratedAt,
      nextDueAt,
      status: (rand() < 0.55 ? "IN_USE" : "IN_STORE") as "IN_USE" | "IN_STORE",
      nablRequired: true,
      purchaseValue: [1500, 3500, 8000, 12500, 25000, 45000][Math.floor(rand() * 6)],
      qrToken: newQrToken(),
    };
  });
  const created = await tx.instrument.createManyAndReturn({ data: instruments, select: { id: true } });
  await tx.instrumentEvent.createMany({
    data: created.map((c) => ({ organizationId, instrumentId: c.id, type: "CREATED" as const, payload: { source: "seed" } })),
  });
}

type ScopeSeed = [
  discipline: string,
  parameter: string,
  min: number | null,
  max: number | null,
  unit: string | null,
  cmc: string,
];

const VENDORS: {
  name: string;
  gstin: string | null;
  stateCode: string;
  address: string;
  accreditationType: "NABL" | "OEM";
  nablCertNo: string | null;
  validDays: number | null;
  onsite: boolean;
  contact: { name: string; email: string; phone: string };
  notes: string | null;
  scopes: ScopeSeed[];
}[] = [
  {
    name: "Precision Calibration Labs Pvt Ltd",
    gstin: "27AABCN5678M1ZT",
    stateCode: "27",
    address: "Gat 214, Bhosari MIDC, Pune, Maharashtra 411026",
    accreditationType: "NABL",
    nablCertNo: "CC-2451",
    validDays: 300,
    onsite: true,
    contact: { name: "Sachin Kale", email: "orders@precisioncal.test", phone: "919822000001" },
    notes: null,
    scopes: [
      ["Mechanical (Dimension)", "Length", 0, 1000, "mm", "1.8 µm + 3L µm"],
      ["Mechanical (Dimension)", "Diameter", 1, 200, "mm", "1.2 µm"],
      ["Mechanical (Dimension)", "Flatness", 0, 50, "µm", "0.8 µm"],
      ["Mechanical (Pressure)", "Pressure", 0, 700, "bar", "0.05% of reading"],
    ],
  },
  {
    name: "Metro Metrology Services",
    gstin: "29AAECP2468Q1ZM",
    stateCode: "29",
    address: "No. 42, Peenya Industrial Area Phase 2, Bengaluru, Karnataka 560058",
    accreditationType: "NABL",
    nablCertNo: "CC-3310",
    validDays: 45, // expiring soon → shows on the dashboard
    onsite: false,
    contact: { name: "Lakshmi Rao", email: "cal@metrometrology.test", phone: "919845000002" },
    notes: null,
    scopes: [
      ["Mechanical (Dimension)", "Length", 0, 300, "mm", "2.5 µm"],
      ["Mechanical (Dimension)", "Diameter", 1, 150, "mm", "1.5 µm"],
      ["Thermal", "Temperature", -50, 1200, "°C", "0.6 °C"],
      ["Mechanical (Torque)", "Torque", 5, 1000, "Nm", "0.5% of reading"],
    ],
  },
  {
    name: "Southern Thermal & Electrical Cal Lab",
    gstin: "33AAFCT1357R1ZW",
    stateCode: "33",
    address: "Plot 9, SIDCO Industrial Estate, Ambattur, Chennai, Tamil Nadu 600098",
    accreditationType: "NABL",
    nablCertNo: "CC-1987",
    validDays: 500,
    onsite: true,
    contact: { name: "R. Senthil", email: "service@southerncal.test", phone: "919840000003" },
    notes: null,
    scopes: [
      ["Thermal", "Temperature", -80, 1300, "°C", "0.3 °C"],
      ["Electro-technical", "Voltage", 0, 1000, "V", "0.02% of reading"],
      ["Electro-technical", "Current", 0, 1000, "A", "0.1% of reading"],
      ["Mechanical (Mass)", "Mass", 0, 50, "kg", "0.2 g"],
    ],
  },
  {
    name: "Mitutoyo South Asia — Service Centre",
    gstin: "27AAGCS9753L1ZL",
    stateCode: "27",
    address: "Andheri East, Mumbai, Maharashtra 400093",
    accreditationType: "OEM",
    nablCertNo: null,
    validDays: null,
    onsite: false,
    contact: { name: "Service desk", email: "service@mitutoyo-oem.test", phone: "912200000004" },
    notes:
      "OEM service centre for Mitutoyo digital instruments (repairs + calibration). Approved 12-04-2026 after audit; certificates traceable via NABL-accredited masters.",
    scopes: [["Mechanical (Dimension)", "Length", 0, 600, "mm", "OEM procedure"]],
  },
];

/** Contract rates (₹) per instrument type name; 18% GST. Torque wrenches have no contract → RFQ. */
const CONTRACTS: { number: string; vendor: string; rates: [type: string, rate: number, tat: number][] }[] = [
  {
    number: "RC/2026-27/PCL",
    vendor: "Precision Calibration Labs Pvt Ltd",
    rates: [
      ["Digital Vernier Caliper 0–150 mm", 450, 7],
      ["Outside Micrometer 0–25 mm", 500, 7],
      ["Height Gauge 0–300 mm", 900, 7],
      ["Dial Gauge 0–10 mm", 400, 5],
      ["Plain Plug Gauge", 300, 5],
      ["Plain Ring Gauge", 350, 5],
      ["Slip Gauge Set (87 pcs)", 4500, 10],
      ["Pressure Gauge 0–10 bar", 600, 7],
      ["Granite Surface Plate", 3500, 3],
    ],
  },
  {
    number: "RC/2026-27/STE",
    vendor: "Southern Thermal & Electrical Cal Lab",
    rates: [
      ["Thermocouple Type K", 900, 10],
      ["Digital Thermometer", 700, 7],
      ["Digital Multimeter", 1200, 10],
      ["Clamp Meter", 1000, 10],
      ["Weighing Balance 0–30 kg", 1500, 5],
    ],
  },
];

/** M3: four labs (3 NABL + 1 OEM) with scope, and two active annual rate contracts. */
async function seedVendors(tx: TenantTx, organizationId: string) {
  const now = Date.now();
  const vendorIds: Record<string, string> = {};
  for (const v of VENDORS) {
    const vendor = await tx.vendor.create({
      data: {
        ownerOrganizationId: organizationId,
        name: v.name,
        gstin: v.gstin,
        pan: v.gstin ? v.gstin.slice(2, 12) : null,
        address: v.address,
        stateCode: v.stateCode,
        contacts: [{ ...v.contact, isPrimary: true }],
        accreditationType: v.accreditationType,
        nablCertNo: v.nablCertNo,
        nablValidUntil: v.validDays ? new Date(now + v.validDays * 86_400_000) : null,
        onsiteCapable: v.onsite,
      },
    });
    vendorIds[v.name] = vendor.id;
    await tx.vendorLink.create({ data: { organizationId, vendorId: vendor.id, isApproved: true, evaluationNotes: v.notes } });
    await tx.vendorScope.createMany({
      data: v.scopes.map(([discipline, parameter, rangeMin, rangeMax, unit, cmc]) => ({
        vendorId: vendor.id,
        discipline,
        parameter,
        rangeMin,
        rangeMax,
        unit,
        cmc,
      })),
    });
  }
  const types = new Map((await tx.instrumentType.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]));
  const fyStart = new Date(Date.UTC(2026, 3, 1) - 330 * 60_000);
  const fyEnd = new Date(Date.UTC(2027, 2, 31, 23, 59) - 330 * 60_000);
  for (const c of CONTRACTS) {
    const contract = await tx.rateContract.create({
      data: {
        organizationId,
        vendorId: vendorIds[c.vendor],
        number: c.number,
        validFrom: fyStart,
        validTo: fyEnd,
        status: "ACTIVE",
      },
    });
    await tx.rateContractItem.createMany({
      data: c.rates
        .filter(([type]) => types.has(type))
        .map(([type, rate, tatDays]) => ({
          organizationId,
          contractId: contract.id,
          instrumentTypeId: types.get(type)!,
          rate,
          gstPercent: 18,
          tatDays,
        })),
    });
  }
}

/**
 * M4: a released request with an approved 12-instrument PO at Chakan, ready for a delivery challan.
 * Built through the real services (as the gauge in-charge / quality head / purchase users) so every
 * status, job and audit row is consistent.
 */
async function seedDispatchScenario(organizationId: string) {
  const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const [gauge, quality, purchase] = await Promise.all([
    user("gauge1@demoauto.test"),
    user("quality@demoauto.test"),
    user("purchase@demoauto.test"),
  ]);
  const plant = await prisma.plant.findFirstOrThrow({ where: { organizationId, code: "PLT1" } });
  const as = (actorId: string) => ({ organizationId, actorId, plantIds: "ALL" as const, ip: null });

  const picked = await prisma.instrument.findMany({
    where: {
      organizationId,
      plantId: plant.id,
      archivedAt: null,
      status: { in: ["IN_STORE", "IN_USE"] },
      type: { name: { in: ["Digital Vernier Caliper 0–150 mm", "Outside Micrometer 0–25 mm"] } },
      requestItems: { none: {} },
    },
    orderBy: { nextDueAt: "asc" },
    take: 12,
    select: { id: true },
  });
  if (picked.length < 12) return false;
  const { requests } = await withTenantTx(as(gauge.id), (tx) =>
    createRequestsFromSelection(
      tx,
      picked.map((p) => p.id),
      "Monthly calibration batch (demo)",
    ),
  );
  const requestId = requests[0].id;
  await withTenantTx(as(gauge.id), (tx) => submitRequest(tx, requestId));
  await withTenantTx(as(quality.id), (tx) => approveRequest(tx, requestId));
  const released = await withTenantTx(as(purchase.id), (tx) => releaseRequest(tx, requestId));
  for (const po of released.purchaseOrders) await withTenantTx(as(purchase.id), (tx) => approvePurchaseOrder(tx, po.id));
  return released.purchaseOrders.length > 0;
}

/** M5: lab portal logins (password demo1234 in dev; in production labs sign in by emailed link). */
const LAB_USERS = [
  { email: "lab@precisioncal.test", name: "Sachin Kale", vendor: "Precision Calibration Labs Pvt Ltd" },
  { email: "lab@metrometrology.test", name: "Lakshmi Rao", vendor: "Metro Metrology Services" },
];

async function seedLabUsers(organizationId: string) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of LAB_USERS) {
    const vendor = await prisma.vendor.findFirst({ where: { name: u.vendor, links: { some: { organizationId } } } });
    if (!vendor || (await prisma.user.findUnique({ where: { email: u.email } }))) continue;
    const user = await prisma.user.create({ data: { email: u.email, name: u.name, passwordHash, emailVerified: new Date() } });
    await prisma.vendorUser.create({ data: { vendorId: vendor.id, userId: user.id } });
  }
}

/** M5: 8 dial gauges out at Precision Calibration Labs on a dispatched challan; 3 already back. */
async function seedAtLabScenario(organizationId: string) {
  const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const [gauge, quality, purchase, stores] = await Promise.all(
    ["gauge1@demoauto.test", "quality@demoauto.test", "purchase@demoauto.test", "stores@demoauto.test"].map(user),
  );
  const as = (actorId: string) => ({ organizationId, actorId, plantIds: "ALL" as const, ip: null });
  const plant = await prisma.plant.findFirstOrThrow({ where: { organizationId, code: "PLT1" } });
  const picked = await prisma.instrument.findMany({
    where: {
      organizationId,
      plantId: plant.id,
      archivedAt: null,
      status: { in: ["IN_STORE", "IN_USE"] },
      type: { name: "Dial Gauge 0–10 mm" },
      requestItems: { none: {} },
    },
    orderBy: { nextDueAt: "asc" },
    take: 8,
    select: { id: true },
  });
  if (picked.length < 8) return false;
  const { requests } = await withTenantTx(as(gauge.id), (tx) =>
    createRequestsFromSelection(
      tx,
      picked.map((p) => p.id),
      "Dial gauges — at lab (demo)",
    ),
  );
  const requestId = requests[0].id;
  await withTenantTx(as(gauge.id), (tx) => submitRequest(tx, requestId));
  await withTenantTx(as(quality.id), (tx) => approveRequest(tx, requestId));
  const released = await withTenantTx(as(purchase.id), (tx) => releaseRequest(tx, requestId));
  const po = released.purchaseOrders[0];
  if (!po) return false;
  await withTenantTx(as(purchase.id), (tx) => approvePurchaseOrder(tx, po.id));
  await withTenantTx(as(purchase.id), (tx) => sendPurchaseOrder(tx, po.id, process.env.APP_URL ?? "http://localhost:3000"));
  const db = tenantDb(as(stores.id));
  const { items } = await challanCandidates(db, po.id);
  const challan = await withTenantTx(as(stores.id), (tx) =>
    createChallan(tx, {
      poId: po.id,
      lines: items.map((i) => ({
        poItemId: i.poItemId,
        value: i.value ?? 3500,
        hsnCode: i.hsnCode || null,
        description: i.description,
      })),
    }),
  );
  await withTenantTx(as(stores.id), (tx) => issueChallan(tx, challan.id));
  await withTenantTx(as(stores.id), (tx) =>
    dispatchChallan(tx, challan.id, { transportMode: "VEHICLE", vehicleNo: "MH14AB1234" }),
  );
  const lines = await prisma.deliveryChallanItem.findMany({
    where: { challanId: challan.id },
    orderBy: { createdAt: "asc" },
    take: 3,
  });
  await withTenantTx(as(stores.id), (tx) =>
    receiveItems(
      tx,
      challan.id,
      lines.map((l) => l.id),
      "Returned with seal intact",
    ),
  );
  return true;
}

/**
 * M6: 4 pressure gauges back from Precision Calibration Labs with certificates waiting for verification.
 * PRG certificates are generated PDFs; the last one has a point out of tolerance (→ FAIL / OOT).
 */
async function seedVerificationScenario(organizationId: string) {
  const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const [gauge, quality, purchase, stores] = await Promise.all(
    ["gauge1@demoauto.test", "quality@demoauto.test", "purchase@demoauto.test", "stores@demoauto.test"].map(user),
  );
  const as = (actorId: string) => ({ organizationId, actorId, plantIds: "ALL" as const, ip: null });
  const plant = await prisma.plant.findFirstOrThrow({ where: { organizationId, code: "PLT1" } });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const picked = await prisma.instrument.findMany({
    where: {
      organizationId,
      plantId: plant.id,
      archivedAt: null,
      status: { in: ["IN_STORE", "IN_USE"] },
      type: { name: "Pressure Gauge 0–10 bar" },
      requestItems: { none: {} },
    },
    orderBy: { nextDueAt: "asc" },
    take: 4,
    select: { id: true },
  });
  if (picked.length < 4) return false;
  const { requests } = await withTenantTx(as(gauge.id), (tx) =>
    createRequestsFromSelection(
      tx,
      picked.map((p) => p.id),
      "Pressure gauges — certificates to verify (demo)",
    ),
  );
  const requestId = requests[0].id;
  await withTenantTx(as(gauge.id), (tx) => submitRequest(tx, requestId));
  await withTenantTx(as(quality.id), (tx) => approveRequest(tx, requestId));
  const released = await withTenantTx(as(purchase.id), (tx) => releaseRequest(tx, requestId));
  const po = released.purchaseOrders[0];
  if (!po) return false;
  await withTenantTx(as(purchase.id), (tx) => approvePurchaseOrder(tx, po.id));
  await withTenantTx(as(purchase.id), (tx) => sendPurchaseOrder(tx, po.id, process.env.APP_URL ?? "http://localhost:3000"));
  const db = tenantDb(as(stores.id));
  const { items } = await challanCandidates(db, po.id);
  const challan = await withTenantTx(as(stores.id), (tx) =>
    createChallan(tx, {
      poId: po.id,
      lines: items.map((i) => ({
        poItemId: i.poItemId,
        value: i.value ?? 2500,
        hsnCode: i.hsnCode || null,
        description: i.description,
      })),
    }),
  );
  await withTenantTx(as(stores.id), (tx) => issueChallan(tx, challan.id));
  await withTenantTx(as(stores.id), (tx) => dispatchChallan(tx, challan.id, { transportMode: "BY_HAND" }));
  const lines = await prisma.deliveryChallanItem.findMany({ where: { challanId: challan.id }, select: { id: true } });
  await withTenantTx(as(stores.id), (tx) =>
    receiveItems(
      tx,
      challan.id,
      lines.map((l) => l.id),
      "Received with certificates",
    ),
  );

  const jobs = await prisma.calibrationJob.findMany({
    where: { organizationId, poItem: { poId: po.id } },
    include: { instrument: { select: { code: true, serialNo: true, make: true } }, vendor: true },
    orderBy: { instrument: { code: "asc" } },
  });
  const today = new Date();
  const d = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replaceAll("/", "-");
  const nextDue = new Date(today);
  nextDue.setFullYear(nextDue.getFullYear() + 1);
  for (const [n, job] of jobs.entries()) {
    const failing = n === jobs.length - 1;
    const readings = [0, 2.5, 5, 7.5, 10].map((nominal, i) => {
      const drift = failing && nominal >= 7.5 ? 0.18 : [0.02, -0.04, 0.05, -0.03, 0.06][i];
      return {
        nominal,
        asFound: Math.round((nominal + drift * 1.5) * 100) / 100,
        asLeft: Math.round((nominal + drift) * 100) / 100,
        permissible: 0.1,
        uncertainty: 0.02,
      };
    });
    const certificateNo = `PCL/26-27/P${String(4100 + n)}`;
    const pdf = await renderDemoCertificate({
      lab: { name: job.vendor!.name, address: job.vendor!.address ?? "", accreditationNo: job.vendor!.nablCertNo ?? "" },
      certificateNo,
      ulrNo: `${(job.vendor!.nablCertNo ?? "CC0000").replace("-", "")}26${String(410000 + n).padStart(9, "0")}F`,
      customer: org.name,
      instrument: {
        description: "Pressure Gauge 0–10 bar",
        code: job.instrument.code,
        serialNo: job.instrument.serialNo ?? "",
        make: job.instrument.make,
        range: "0 – 10 bar",
      },
      receivedOn: d(today),
      calibratedOn: d(today),
      nextDue: d(nextDue),
      readings,
      unit: "bar",
    });
    await withTenantTx(as(gauge.id), (tx) =>
      attachCertificate(tx, job.id, { name: `${job.instrument.code}_${certificateNo.replaceAll("/", "-")}.pdf`, bytes: pdf }),
    );
  }
  return true;
}

/**
 * M7: six months of completed calibrations at Chakan (POs, jobs, certificates, one closed OOT) so reports and
 * the audit pack have history, plus one generated audit pack. History is written directly (audited), not
 * replayed through every workflow step.
 */
async function seedHistory(organizationId: string) {
  const quality = await prisma.user.findUniqueOrThrow({ where: { email: "quality@demoauto.test" }, select: { id: true } });
  const gauge = await prisma.user.findUniqueOrThrow({ where: { email: "gauge1@demoauto.test" }, select: { id: true } });
  const ctx = { organizationId, actorId: gauge.id, plantIds: "ALL" as const, ip: null };
  const plant = await prisma.plant.findFirstOrThrow({ where: { organizationId, code: "PLT1" } });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const vendors = new Map(
    (await prisma.vendor.findMany({ where: { links: { some: { organizationId } } } })).map((v) => [v.name, v]),
  );
  const rateFor = new Map<string, { vendor: string; rate: number; tat: number }>();
  for (const c of CONTRACTS) for (const [type, rate, tat] of c.rates) rateFor.set(type, { vendor: c.vendor, rate, tat });
  const DAY = 86_400_000;
  const now = Date.now();
  const picked = await prisma.instrument.findMany({
    where: {
      organizationId,
      plantId: plant.id,
      archivedAt: null,
      status: { in: ["IN_STORE", "IN_USE"] },
      requestItems: { none: {} },
      jobs: { none: {} },
      nextDueAt: { gt: new Date(now + 150 * DAY) },
      type: { name: { in: [...rateFor.keys()] } },
    },
    include: { type: true },
    orderBy: { code: "asc" },
    take: 48,
  });
  if (picked.length < 12) return false;
  const rand = prng(7);
  // 8 per month over the last 6 months; Metro returns late a third of the time
  const plan = picked.map((inst, i) => {
    const r = rateFor.get(inst.type.name)!;
    const month = Math.floor(i / 8); // 0 = most recent
    const sent = new Date(now - (25 + month * 30 + Math.floor(rand() * 10)) * DAY);
    const late = r.vendor.startsWith("Metro") ? rand() < 0.35 : rand() < 0.08;
    const tat = late ? r.tat + 3 + Math.floor(rand() * 6) : Math.max(2, r.tat - Math.floor(rand() * 3));
    const calibrated = new Date(sent.getTime() + Math.max(1, tat - 1) * DAY);
    const received = new Date(sent.getTime() + tat * DAY);
    return {
      inst,
      r,
      month,
      sent,
      received,
      calibrated,
      verified: new Date(received.getTime() + DAY),
      fail: i === 5 || i === 30,
    };
  });

  // Certificates (rendered outside the transaction)
  type Reading = { nominal: number; asFound: number; asLeft: number; permissible: number; uncertainty: number };
  const files: { id: string; fileKey: string; size: number; certificateNo: string; readings: Reading[] }[] = [];
  for (const [n, p] of plan.entries()) {
    const v = vendors.get(p.r.vendor)!;
    const span = (p.inst.rangeMax?.toNumber() ?? 10) - (p.inst.rangeMin?.toNumber() ?? 0);
    const tol = Math.round(span * 0.002 * 1000) / 1000 || 0.01;
    const points = [0, 0.5, 1].map((f) => Math.round(((p.inst.rangeMin?.toNumber() ?? 0) + span * f) * 1000) / 1000);
    const readings = points.map((nominal, i) => {
      const drift = p.fail && i === 2 ? tol * 1.8 : tol * [0.2, -0.3, 0.4][i];
      return {
        nominal,
        asFound: Math.round((nominal + drift * 1.2) * 1000) / 1000,
        asLeft: Math.round((nominal + drift) * 1000) / 1000,
        permissible: tol,
        uncertainty: Math.round(tol * 0.25 * 1000) / 1000,
      };
    });
    const certificateNo = `${v.name.split(" ")[0].slice(0, 3).toUpperCase()}/26-27/H${String(1000 + n)}`;
    const d = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replaceAll("/", "-");
    const pdf = await renderDemoCertificate({
      lab: { name: v.name, address: v.address ?? "", accreditationNo: v.nablCertNo ?? "OEM" },
      certificateNo,
      ulrNo: v.nablCertNo ? `${v.nablCertNo.replace("-", "")}26${String(300000 + n).padStart(9, "0")}F` : "—",
      customer: org.name,
      instrument: {
        description: p.inst.type.name,
        code: p.inst.code,
        serialNo: p.inst.serialNo ?? "",
        make: p.inst.make,
        range: p.inst.type.name,
      },
      receivedOn: d(p.sent),
      calibratedOn: d(p.calibrated),
      nextDue: d(new Date(p.calibrated.getTime() + 365 * DAY)),
      readings,
      unit: p.inst.unit ?? "",
      reference: `Reference standards traceable to NPL India (${p.inst.type.category.toLowerCase()})`,
    });
    const id = createId();
    const fileKey = objectKey(organizationId, "certificates", `${p.inst.code}.pdf`, id);
    await storage().put({ key: fileKey, body: pdf, contentType: "application/pdf" });
    files.push({ id, fileKey, size: pdf.length, certificateNo, readings });
  }

  await withTenantTx(ctx, async (tx) => {
    // one PO per vendor per month
    const groups = new Map<string, typeof plan>();
    for (const p of plan) groups.set(`${p.r.vendor}|${p.month}`, [...(groups.get(`${p.r.vendor}|${p.month}`) ?? []), p]);
    let seq = 0;
    for (const [key, items] of groups) {
      const v = vendors.get(key.split("|")[0])!;
      const subtotal = items.reduce((a, p) => a + p.r.rate, 0);
      const sentAt = new Date(Math.min(...items.map((p) => p.sent.getTime())) - 2 * DAY);
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId,
          plantId: plant.id,
          vendorId: v.id,
          number: `PO/PLT1/H/${String(++seq).padStart(3, "0")}`,
          source: "RATE_CONTRACT",
          status: "CLOSED",
          subtotal,
          gstAmount: Math.round(subtotal * 0.18 * 100) / 100,
          total: Math.round(subtotal * 1.18 * 100) / 100,
          interState: v.stateCode !== "27",
          approvedById: quality.id,
          approvedAt: sentAt,
          sentAt,
          createdAt: sentAt,
        },
      });
      for (const p of items) {
        const f = files[plan.indexOf(p)];
        const poItem = await tx.purchaseOrderItem.create({
          data: {
            organizationId,
            poId: po.id,
            instrumentId: p.inst.id,
            description: p.inst.type.name,
            rate: p.r.rate,
            gstPercent: 18,
            tatDays: p.r.tat,
          },
        });
        const job = await tx.calibrationJob.create({
          data: {
            organizationId,
            plantId: plant.id,
            instrumentId: p.inst.id,
            vendorId: v.id,
            poItemId: poItem.id,
            status: "CLOSED",
            sentAt: p.sent,
            atLabAt: new Date(p.sent.getTime() + DAY),
            receivedAt: p.received,
            calibratedAt: p.calibrated,
            certificateNo: f.certificateNo,
            ulrNo: v.nablCertNo ? `${v.nablCertNo.replace("-", "")}26H${f.certificateNo.slice(-4)}F` : null,
            nablMarkPresent: v.accreditationType === "NABL",
            labAccreditationNo: v.nablCertNo,
            result: p.fail ? "FAIL" : "PASS",
            nextDueAt: p.fail ? null : computeNextDue(p.calibrated, p.inst.frequencyValue, p.inst.frequencyUnit),
            certificateFileId: f.id,
            verifiedById: gauge.id,
            verifiedAt: p.verified,
            standardCode: p.inst.standardCode ?? p.inst.type.standardCode,
            standardDate: p.inst.standardCode ? p.inst.standardDate : p.inst.type.standardDate,
            createdAt: p.sent,
          },
        });
        await tx.attachment.create({
          data: {
            id: f.id,
            organizationId,
            entityType: "CalibrationJob",
            entityId: job.id,
            fileKey: f.fileKey,
            fileName: `${p.inst.code}.pdf`,
            mime: "application/pdf",
            size: f.size,
            uploadedBy: gauge.id,
            createdAt: p.received,
          },
        });
        await tx.calibrationReading.createMany({
          data: f.readings.map((r, position) => {
            const error = Math.round((r.asLeft - r.nominal) * 1e6) / 1e6;
            return {
              organizationId,
              jobId: job.id,
              position,
              pointLabel: `${r.nominal} ${p.inst.unit ?? ""}`.trim(),
              nominal: r.nominal,
              asFound: r.asFound,
              asLeft: r.asLeft,
              error,
              permissibleError: r.permissible,
              uncertainty: r.uncertainty,
              pass: Math.abs(error) <= r.permissible + 1e-9,
              asFoundPass: Math.abs(r.asFound - r.nominal) <= r.permissible + 1e-9,
            };
          }),
        });
        if (p.fail) {
          await tx.ootCase.create({
            data: {
              organizationId,
              plantId: plant.id,
              jobId: job.id,
              instrumentId: p.inst.id,
              status: "CLOSED",
              trigger: "AS_LEFT_FAIL",
              lastGoodCalibrationAt: p.inst.lastCalibratedAt,
              impactNotes: "Used for in-process checks on Line 2; error at upper range only.",
              affectedProducts:
                "Lots checked since last good calibration re-inspected (sample 20/lot) — all within drawing limits.",
              disposition: "ADJUSTED",
              dispositionNotes: "Re-adjusted and recalibrated by the lab; product impact nil.",
              decidedById: quality.id,
              decidedAt: new Date(p.verified.getTime() + 2 * DAY),
              capaRef: `CAPA-26-0${30 + plan.indexOf(p)}`,
              closedAt: new Date(p.verified.getTime() + 5 * DAY),
              createdAt: p.verified,
            },
          });
        } else {
          await tx.instrument.update({
            where: { id: p.inst.id },
            data: {
              lastCalibratedAt: p.calibrated,
              nextDueAt: computeNextDue(p.calibrated, p.inst.frequencyValue, p.inst.frequencyUnit),
            },
          });
        }
      }
    }
  });

  // A ready audit pack for this financial year to date
  const from = new Date(now - 200 * DAY);
  const pack = await withTenantTx({ ...ctx, actorId: quality.id }, (tx) =>
    requestAuditPack(tx, {
      plantId: plant.id,
      from: istMidnight(istParts(from).year, istParts(from).month, 1),
      to: new Date(now),
    }),
  );
  await generateAuditPack(pack.id, organizationId);
  return true;
}

async function main() {
  // Demo data never lands in a real production database by accident; set ALLOW_DEMO_SEED=true for a demo server.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true")
    throw new Error("Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true for a demo server)");
  const existing = await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME } });
  if (existing) {
    // Additive: bring an existing demo org up to the current milestone without wiping it.
    const ctx = { organizationId: existing.id, actorId: null, plantIds: "ALL" as const, ip: null };
    const added = await withTenantTx(ctx, async (tx) => {
      const done: string[] = [];
      if (!(await tx.instrumentType.count())) {
        const plants = await tx.plant.findMany({ select: { id: true, code: true } });
        await seedInstruments(tx, existing.id, Object.fromEntries(plants.map((p) => [p.code, p.id])));
        done.push("instrument types and 600 instruments");
      }
      if (!(await tx.vendor.count())) {
        await seedVendors(tx, existing.id);
        done.push("4 calibration labs and 2 rate contracts");
      }
      if (!(await tx.instrumentType.count({ where: { standardCode: { not: null } } }))) {
        await seedStandards(tx);
        done.push("calibration standards and adjustable flags");
      }
      return done;
    });
    if (
      !(await prisma.purchaseOrder.count({ where: { organizationId: existing.id } })) &&
      (await seedDispatchScenario(existing.id))
    ) {
      added.push("an approved 12-instrument PO ready for dispatch");
    }
    if (!(await prisma.vendorUser.count())) {
      await seedLabUsers(existing.id);
      added.push("lab portal logins");
    }
    if (
      !(await prisma.deliveryChallan.count({ where: { organizationId: existing.id } })) &&
      (await seedAtLabScenario(existing.id))
    ) {
      added.push("8 dial gauges at Precision Calibration Labs (3 back)");
    }
    if (
      !(await prisma.calibrationJob.count({
        where: { organizationId: existing.id, instrument: { type: { name: "Pressure Gauge 0–10 bar" } } },
      })) &&
      (await seedVerificationScenario(existing.id))
    ) {
      added.push("4 pressure gauge certificates waiting for verification (1 failing)");
    }
    if (!(await prisma.auditPack.count({ where: { organizationId: existing.id } })) && (await seedHistory(existing.id))) {
      added.push("6 months of calibration history and an audit pack");
    }
    console.log(
      added.length
        ? `Added ${added.join(", ")} to "${DEMO_ORG_NAME}".`
        : `"${DEMO_ORG_NAME}" is already seeded — run \`pnpm db:reset\` for a fresh copy.`,
    );
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const organizationId = createId();
  const ctx = { organizationId, actorId: null, plantIds: "ALL" as const, ip: null };

  await withTenantTx(ctx, async (tx) => {
    await tx.organization.create({
      data: {
        id: organizationId,
        name: DEMO_ORG_NAME,
        gstin: "27AADCD4321K1ZR",
        pan: "AADCD4321K",
        address: "Plot 12, MIDC Phase II, Chakan, Pune, Maharashtra 410501",
        settings: { dueSoonDays: 30, requireRequestApproval: true, challanCopies: 3, timezone: "Asia/Kolkata" },
      },
    });

    const plantIds: Record<string, string> = {};
    for (const p of PLANTS) {
      const plant = await createPlantWithSeries(tx, p);
      plantIds[p.code] = plant.id;

      await tx.department.createMany({ data: DEPARTMENTS.map((name) => ({ organizationId, plantId: plant.id, name })) });
      for (const [parentName, children] of Object.entries(LOCATIONS)) {
        const parent = await tx.location.create({ data: { organizationId, plantId: plant.id, name: parentName } });
        await tx.location.createMany({
          data: children.map((name) => ({ organizationId, plantId: plant.id, name, parentId: parent.id })),
        });
      }
    }

    await seedInstruments(tx, organizationId, plantIds);
    await seedStandards(tx);
    await seedVendors(tx, organizationId);

    for (const u of USERS) {
      const user = await tx.user.create({
        data: { email: u.email, name: u.name, phone: u.phone ?? null, passwordHash, emailVerified: new Date() },
      });
      await tx.membership.create({
        data: { organizationId, userId: user.id, role: u.role, plantId: u.plant ? plantIds[u.plant] : null },
      });
    }
  });

  await seedDispatchScenario(organizationId);
  await seedLabUsers(organizationId);
  await seedAtLabScenario(organizationId);
  await seedVerificationScenario(organizationId);
  await seedHistory(organizationId);
  console.log(
    `Seeded "${DEMO_ORG_NAME}": ${PLANTS.length} plants, ${TYPES.length} instrument types, 600 instruments, ${USERS.length} users (password: ${DEMO_PASSWORD}).`,
  );
  for (const u of USERS) console.log(`  ${u.role.padEnd(15)} ${u.email}${u.plant ? ` (${u.plant})` : ""}`);
  for (const u of LAB_USERS) console.log(`  ${"LAB PORTAL".padEnd(15)} ${u.email} (${u.vendor})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopBoss(); // seeding sends notifications (queued jobs); release the pg-boss sender so the script exits
    await prisma.$disconnect();
  });
