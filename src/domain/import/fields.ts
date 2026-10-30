/** Target fields for instrument import, with header synonyms for auto-mapping. */
export type ImportFieldKey =
  | "code"
  | "type"
  | "description"
  | "make"
  | "model"
  | "serialNo"
  | "range"
  | "rangeMin"
  | "rangeMax"
  | "unit"
  | "leastCount"
  | "tolerance"
  | "acceptanceCriteria"
  | "plant"
  | "department"
  | "location"
  | "custodianName"
  | "criticality"
  | "calibrationSource"
  | "frequency"
  | "lastCalibratedAt"
  | "nextDueAt"
  | "nablRequired"
  | "purchaseValue"
  | "status"
  | "standardCode"
  | "standardDate"
  | "adjustable"
  | "notes";

export type ImportField = { key: ImportFieldKey; label: string; required?: boolean; synonyms: string[] };

export const IMPORT_FIELDS: readonly ImportField[] = [
  {
    key: "code",
    label: "Instrument code",
    required: true,
    synonyms: [
      "code",
      "instrument code",
      "gauge code",
      "id no",
      "id number",
      "instrument id",
      "gauge id",
      "asset no",
      "asset code",
      "identification no",
      "tag no",
      "inst no",
      "gauge no",
      "sr code",
    ],
  },
  {
    key: "type",
    label: "Instrument type",
    required: true,
    synonyms: [
      "type",
      "instrument type",
      "instrument name",
      "gauge type",
      "instrument",
      "equipment",
      "name of instrument",
      "gauge name",
      "item",
      "category",
    ],
  },
  {
    key: "description",
    label: "Description",
    synonyms: ["description", "desc", "details", "specification", "spec", "particulars"],
  },
  { key: "make", label: "Make", synonyms: ["make", "manufacturer", "brand", "mfr", "company"] },
  { key: "model", label: "Model", synonyms: ["model", "model no", "model number"] },
  {
    key: "serialNo",
    label: "Serial no.",
    synonyms: ["serial no", "serial number", "sl no", "s no", "sr no", "serial", "mfg sr no", "m sr no"],
  },
  { key: "range", label: "Range (e.g. 0-150 mm)", synonyms: ["range", "measuring range", "capacity", "size", "range size"] },
  { key: "rangeMin", label: "Range min", synonyms: ["range min", "min range", "minimum", "from", "lower range"] },
  { key: "rangeMax", label: "Range max", synonyms: ["range max", "max range", "maximum", "to", "upper range"] },
  { key: "unit", label: "Unit", synonyms: ["unit", "uom", "units"] },
  { key: "leastCount", label: "Least count", synonyms: ["least count", "lc", "resolution", "l c", "accuracy"] },
  {
    key: "tolerance",
    label: "Tolerance (±)",
    synonyms: ["tolerance", "permissible error", "acceptance tolerance", "tol", "mpe"],
  },
  {
    key: "acceptanceCriteria",
    label: "Acceptance criteria",
    synonyms: ["acceptance criteria", "criteria", "acceptance", "standard", "reference standard"],
  },
  { key: "plant", label: "Plant code", synonyms: ["plant", "plant code", "unit code", "factory", "site"] },
  { key: "department", label: "Department", synonyms: ["department", "dept", "section", "area", "shop", "user department"] },
  { key: "location", label: "Location", synonyms: ["location", "loc", "place", "storage location", "cabinet", "line", "cell"] },
  {
    key: "custodianName",
    label: "Custodian",
    synonyms: ["custodian", "user", "issued to", "owner", "responsible", "holder", "in charge"],
  },
  {
    key: "criticality",
    label: "Criticality (A/B/C)",
    synonyms: ["criticality", "critical", "class", "category abc", "priority"],
  },
  {
    key: "calibrationSource",
    label: "Calibration source",
    synonyms: ["calibration source", "cal source", "agency", "inhouse external", "calibration type", "cal by", "calibrated by"],
  },
  {
    key: "frequency",
    label: "Calibration frequency",
    synonyms: [
      "frequency",
      "cal frequency",
      "calibration frequency",
      "interval",
      "cal interval",
      "periodicity",
      "freq",
      "calibration interval",
      "frequency months",
    ],
  },
  {
    key: "lastCalibratedAt",
    label: "Last calibration date",
    synonyms: [
      "last calibration date",
      "last cal date",
      "cal date",
      "calibration date",
      "last calibrated",
      "calibrated on",
      "date of calibration",
      "done on",
      "last cal",
      "cal done date",
    ],
  },
  {
    key: "nextDueAt",
    label: "Next due date",
    synonyms: [
      "next due date",
      "due date",
      "next cal date",
      "next calibration date",
      "cal due",
      "due on",
      "next due",
      "calibration due date",
    ],
  },
  { key: "nablRequired", label: "NABL required", synonyms: ["nabl", "nabl required", "nabl y n", "accredited"] },
  {
    key: "purchaseValue",
    label: "Value (₹)",
    synonyms: ["value", "purchase value", "cost", "price", "amount", "rate", "asset value"],
  },
  { key: "status", label: "Status", synonyms: ["status", "condition", "current status"] },
  {
    key: "standardCode",
    label: "Calibration standard",
    synonyms: [
      "standard",
      "calibration standard",
      "std",
      "standard code",
      "is code",
      "iso standard",
      "reference standard",
      "procedure",
      "cal procedure",
    ],
  },
  {
    key: "standardDate",
    label: "Standard date",
    synonyms: ["standard date", "std date", "standard year", "edition", "standard edition"],
  },
  {
    key: "adjustable",
    label: "Adjustable",
    synonyms: ["adjustable", "adjustable non adjustable", "adj", "adjustable y n", "type of gauge"],
  },
  { key: "notes", label: "Notes", synonyms: ["notes", "remarks", "remark", "comments", "comment"] },
];

export const IMPORT_FIELD_KEYS = IMPORT_FIELDS.map((f) => f.key);
export const REQUIRED_FIELDS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);
