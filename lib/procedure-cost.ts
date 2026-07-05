export type ProcedureMaterialKind = "supply" | "lab";
export type ProcedureTreatmentFamily =
  | "restorative"
  | "surgery"
  | "endo"
  | "removable"
  | "other";

export interface ProcedureMaterialDraft {
  id: string;
  name: string;
  kind: ProcedureMaterialKind;
  cost_cents: number;
}

export interface ProcedureVisitDraft {
  id: string;
  label: string;
  clinical_hours: number;
  items: ProcedureMaterialDraft[];
}

export interface ProcedureDraft {
  id: string;
  name: string;
  code: string | null;
  family: ProcedureTreatmentFamily;
  visits: ProcedureVisitDraft[];
  notes: string | null;
}

export interface ProcedureVisitBreakdown {
  supply_cost_cents: number;
  lab_cost_cents: number;
  direct_cost_cents: number;
}

export interface ProcedureCostBreakdown {
  supply_cost_cents: number;
  lab_cost_cents: number;
  direct_cost_cents: number;
  overhead_cost_cents: number;
  total_cost_cents: number;
  total_clinical_hours: number;
  visit_count: number;
  cost_per_hour_cents: number | null;
}

type ItemSeed = [kind: ProcedureMaterialKind, name: string, cost_cents: number];

type VisitSeed = {
  label: string;
  hours: number;
  items: ItemSeed[];
};

type ProcedureSeed = {
  id: string;
  name: string;
  family: ProcedureTreatmentFamily;
  notes?: string | null;
  visits: VisitSeed[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function supply(name: string, cost_cents: number): ItemSeed {
  return ["supply", name, cost_cents];
}

function lab(name: string, cost_cents: number): ItemSeed {
  return ["lab", name, cost_cents];
}

function buildProcedureDrafts(seeds: ProcedureSeed[]): ProcedureDraft[] {
  return seeds.map((procedure) => ({
    id: procedure.id,
    name: procedure.name,
    code: null,
    family: procedure.family,
    notes: procedure.notes ?? null,
    visits: procedure.visits.map((visit, visitIndex) => ({
      id: `${procedure.id}-${slugify(visit.label) || `visit-${visitIndex + 1}`}`,
      label: visit.label,
      clinical_hours: visit.hours,
      items: visit.items.map(([kind, name, cost_cents], itemIndex) => ({
        id: `${procedure.id}-${slugify(visit.label) || `visit-${visitIndex + 1}`}-${
          itemIndex + 1
        }`,
        name,
        kind,
        cost_cents,
      })),
    })),
  }));
}

const PROCEDURE_SEED_DATA: ProcedureSeed[] = [
  {
    id: "complete-denture",
    name: "Complete Denture",
    family: "removable",
    visits: [
      {
        label: "1 - Impressions",
        hours: 1,
        items: [
          supply("Accudent impression syringe", 129),
          supply("Accudent impression trays", 244),
          supply("Accudent impression shipping + tax", 204),
          supply("Blue bite impression material", 100),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - JRR",
        hours: 0.5,
        items: [lab("Bite rim lab cost", 0), supply("Patient bib", 13)],
      },
      {
        label: "3 - Wax Try In",
        hours: 0.5,
        items: [lab("Wax try in lab cost", 65000), supply("Patient bib", 13)],
      },
      {
        label: "4 - Delivery",
        hours: 0.5,
        items: [
          lab("Processing of denture lab cost", 3600),
          supply("PIP brush", 20),
          supply("PIP paste", 200),
          supply("Burs", 8200),
          supply("Case", 120),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "5 - 24 Hr Adj",
        hours: 0.5,
        items: [
          supply("PIP brush", 20),
          supply("PIP paste", 200),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "6 - Week Adj",
        hours: 0.5,
        items: [
          supply("PIP paste", 200),
          supply("PIP brush", 20),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "partial-denture",
    name: "Partial Denture",
    family: "removable",
    visits: [
      {
        label: "1 - Impressions",
        hours: 1,
        items: [
          supply("Accudent impression syringe", 129),
          supply("Accudent impression trays", 244),
          supply("Accudent impression shipping + tax", 204),
          supply("Blue bite impression material", 100),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - Framework & Wax Try In",
        hours: 0.5,
        items: [
          supply("Fit checker", 230),
          lab("Frame and wax lab cost", 37700),
          supply("Burs", 1000),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "3 - Delivery",
        hours: 0.5,
        items: [
          lab("Processing of partial lab cost", 1800),
          supply("PIP brush", 20),
          supply("PIP paste", 200),
          supply("Burs", 8200),
          supply("Case", 120),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "4 - 24 Hr Adj",
        hours: 0.5,
        items: [
          supply("PIP paste", 200),
          supply("PIP brush", 20),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "5 - Week Adj",
        hours: 0.5,
        items: [
          supply("PIP paste", 200),
          supply("PIP brush", 20),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "essex-retainer",
    name: "Essex Retainer",
    family: "removable",
    visits: [
      {
        label: "1 - Scan",
        hours: 0.5,
        items: [
          supply("Scan sleeves", 500),
          lab("Essex retainer lab cost", 12900),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - Delivery",
        hours: 0.5,
        items: [
          supply("Articulating paper", 0),
          supply("Patient bib", 13),
          supply("Burs", 1000),
        ],
      },
    ],
  },
  {
    id: "smile-transitions",
    name: "Smile Transitions",
    family: "removable",
    visits: [
      {
        label: "1 - Scan",
        hours: 0.5,
        items: [
          supply("Scan sleeves", 500),
          supply("Patient bib", 13),
          supply("Smile transitions", 39200),
        ],
      },
      {
        label: "2 - Delivery",
        hours: 0.5,
        items: [
          supply("Articulating paper", 0),
          supply("Temp cement", 700),
          supply("Burs", 1000),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "all-on-4",
    name: "All on 4",
    family: "surgery",
    notes:
      "Imported from the workbook structure. Clinical hours likely need refinement once the full surgical workflow is confirmed.",
    visits: [
      {
        label: "Implant Placement",
        hours: 0.5,
        items: [
          supply("Anesthesia cost", 250000),
          supply("Oxygen", 40000),
          supply("Cotton tip applicator", 2),
          supply("Anesthetic", 0),
          supply("Guide cost", 0),
          supply("Implant burs", 0),
          supply("Fixation pins", 20000),
          supply("Implant cost", 75000),
          supply("MUA cost", 105000),
          supply("Needle", 15),
        ],
      },
      {
        label: "Conversion",
        hours: 0.5,
        items: [
          supply("Burs", 80000),
          supply("White caps", 0),
          supply("TI bases", 0),
          supply("Rubber dam", 0),
          supply("Acrylic", 0),
          supply("Fasteners", 0),
          supply("Suture", 300),
        ],
      },
      {
        label: "Final Denture",
        hours: 0.5,
        items: [lab("Final denture", 585000)],
      },
    ],
  },
  {
    id: "two-overdentures",
    name: "2 Overdentures",
    family: "removable",
    visits: [
      {
        label: "1 - Impressions",
        hours: 1,
        items: [
          supply("Accudent impression syringe", 129),
          supply("Accudent impression trays", 244),
          supply("Accudent impression shipping + tax", 204),
          supply("Blue bite impression material", 100),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - JRR",
        hours: 0.5,
        items: [lab("Bite rim lab cost", 0), supply("Patient bib", 13)],
      },
      {
        label: "3 - Wax Try In",
        hours: 0.5,
        items: [lab("Wax try in lab cost", 37900), supply("Patient bib", 13)],
      },
      {
        label: "4 - Delivery + Surgery",
        hours: 0.5,
        items: [
          lab("Processing of denture lab cost", 3600),
          supply("PIP brush", 20),
          supply("PIP paste", 200),
          supply("Burs", 8200),
          supply("Case", 120),
          supply("Implants", 20000),
          supply("Sutures", 300),
          supply("Topical", 25),
          supply("Cotton tip applicator", 0),
          supply("Anesthetic", 600),
          supply("Needle", 15),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "5 - 24 Hr Adj",
        hours: 0.5,
        items: [
          supply("PIP brush", 20),
          supply("PIP paste", 200),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "6 - Week Adj",
        hours: 0.5,
        items: [
          supply("PIP paste", 200),
          supply("PIP brush", 20),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "6 - Conversion",
        hours: 1,
        items: [
          supply("Chairside pick up material", 2000),
          supply("Locator abutment", 37800),
          supply("Inserts and cap", 9900),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "night-guard",
    name: "Night guard",
    family: "removable",
    visits: [
      {
        label: "1 - Scan",
        hours: 0.25,
        items: [
          supply("Scan sleeves", 500),
          lab("Lab cost", 8900),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - Deliver",
        hours: 0.5,
        items: [supply("Articulating paper", 0), supply("Patient bib", 13)],
      },
    ],
  },
  {
    id: "crown",
    name: "Crown",
    family: "restorative",
    visits: [
      {
        label: "1 - Prep",
        hours: 1,
        items: [
          supply("Topical", 25),
          supply("Cotton tip applicator", 2),
          supply("Anesthetic", 200),
          supply("Needle", 15),
          supply("Triple tray", 25),
          supply("Algenote (box of 4 carts)", 215),
          supply("Burs", 0),
          supply("Scan sleeves", 500),
          supply("Acid etch", 75),
          supply("Desensitizer", 100),
          supply("Bond", 90),
          supply("BU", 0),
          supply("Cord", 0),
          supply("Gauze", 0),
          supply("Cotton rolls", 0),
          supply("Temp crown material", 700),
          supply("Temp cement", 500),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - Delivery",
        hours: 0.5,
        items: [
          supply("Superoxyl", 300),
          supply("Ivoclean", 400),
          supply("Cotton rolls", 0),
          supply("Microbrushes", 0),
          supply("Cement", 1000),
          supply("Articulating paper", 0),
          lab("Lab fee", 10800),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "bridge",
    name: "Bridge",
    family: "restorative",
    visits: [
      {
        label: "1 - Prep",
        hours: 1.5,
        items: [
          supply("Topical", 25),
          supply("Cotton tip applicator", 0),
          supply("Anesthetic", 300),
          supply("Needle", 15),
          supply("Triple tray", 25),
          supply("Algenote (box of 8 carts)", 200),
          supply("Burs", 0),
          supply("Scan sleeves", 500),
          supply("Acid etch", 75),
          supply("Desensitizer", 100),
          supply("Bond", 90),
          supply("BU", 0),
          supply("Cord", 0),
          supply("Gauze", 0),
          supply("Cotton rolls", 0),
          supply("Temp crown material", 700),
          supply("Temp cement", 500),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - Delivery",
        hours: 0.5,
        items: [
          supply("Superoxyl", 300),
          supply("Ivoclean", 400),
          supply("Cotton rolls", 0),
          supply("Microbrushes", 0),
          supply("Cement", 2000),
          supply("Articulating paper", 0),
          lab("Lab fee", 27600),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "filling",
    name: "Filling",
    family: "restorative",
    visits: [
      {
        label: "1 - Prep",
        hours: 0.5,
        items: [
          supply("Topical", 25),
          supply("Cotton tip applicator", 2),
          supply("Anesthetic", 100),
          supply("Needle", 15),
          supply("Matrix", 0),
          supply("Wedge", 0),
          supply("Ring", 0),
          supply("Burs", 0),
          supply("Microbrush", 0),
          supply("Acid etch", 75),
          supply("Desensitizer", 100),
          supply("Bond", 90),
          supply("RBC", 0),
          supply("Cord", 0),
          supply("Gauze", 0),
          supply("Cotton rolls", 0),
          supply("Articulating paper", 0),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "single-implant",
    name: "Single implant",
    family: "surgery",
    notes:
      "Imported from the workbook structure. Clinical hours for the implant sequence may still need fine-tuning.",
    visits: [
      {
        label: "1 - Placement",
        hours: 1,
        items: [
          supply("Bone putty", 15000),
          supply("Blade", 0),
          supply("Implants", 10000),
          supply("Sutures", 300),
          supply("Topical", 25),
          supply("Cotton tip applicator", 2),
          supply("Anesthetic", 300),
          supply("Needle", 15),
          supply("Patient bib", 13),
        ],
      },
      {
        label: "2 - Uncovering",
        hours: 0.5,
        items: [supply("Healing abutment", 5000), supply("Patient bib", 13)],
      },
      {
        label: "3 - Impression",
        hours: 0.5,
        items: [supply("Scan body", 5000), supply("Patient bib", 13)],
      },
      {
        label: "4 - Crown Delivery",
        hours: 0.5,
        items: [
          supply("Teflon", 0),
          supply("Burs", 0),
          supply("Articulating paper", 0),
          supply("Bond", 90),
          supply("RBC", 0),
          lab("Lab fee", 50000),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
  {
    id: "nitrous",
    name: "Nitrous",
    family: "other",
    visits: [
      {
        label: "1 - Use",
        hours: 0.5,
        items: [
          supply("Nasal hood", 1700),
          supply("Oxygen", 850),
          supply("Nitrous", 1225),
          supply("Delivery charge", 600),
          supply("Rental fee", 500),
        ],
      },
    ],
  },
  {
    id: "root-canal",
    name: "Root Canal",
    family: "endo",
    notes:
      "Imported from the workbook structure. This procedure still needs confirmed clinical hours if you want the overhead allocation tighter.",
    visits: [
      {
        label: "1 - Visit",
        hours: 0.5,
        items: [
          supply("Topical", 25),
          supply("Cotton tip applicator", 2),
          supply("Anesthetic", 300),
          supply("Needle", 15),
          supply("Rubber dam", 0),
          supply("Handfiles", 0),
          supply("Rec files", 3400),
          supply("Burs block", 2100),
          supply("CaOH", 500),
          supply("Bioceramic sealer", 1000),
          supply("Gutta percha points", 0),
          supply("Dry points", 0),
          supply("Touch and heat tips", 0),
          supply("Patient bib", 13),
        ],
      },
    ],
  },
];

export const DEFAULT_PROCEDURE_DRAFTS: ProcedureDraft[] =
  buildProcedureDrafts(PROCEDURE_SEED_DATA);

export function calculateVisitTotals(
  visit: ProcedureVisitDraft,
): ProcedureVisitBreakdown {
  const supplyCostCents = visit.items
    .filter((item) => item.kind === "supply")
    .reduce((sum, item) => sum + item.cost_cents, 0);

  const labCostCents = visit.items
    .filter((item) => item.kind === "lab")
    .reduce((sum, item) => sum + item.cost_cents, 0);

  return {
    supply_cost_cents: supplyCostCents,
    lab_cost_cents: labCostCents,
    direct_cost_cents: supplyCostCents + labCostCents,
  };
}

export function calculateProcedureCost(
  procedure: ProcedureDraft,
  overheadPerOperatoryHourCents: number | null,
): ProcedureCostBreakdown {
  const visitTotals = procedure.visits.map(calculateVisitTotals);
  const totalClinicalHours = procedure.visits.reduce(
    (sum, visit) => sum + visit.clinical_hours,
    0,
  );
  const supplyCostCents = visitTotals.reduce(
    (sum, visit) => sum + visit.supply_cost_cents,
    0,
  );
  const labCostCents = visitTotals.reduce(
    (sum, visit) => sum + visit.lab_cost_cents,
    0,
  );
  const directCostCents = supplyCostCents + labCostCents;
  const overheadCostCents =
    overheadPerOperatoryHourCents === null
      ? 0
      : Math.round(overheadPerOperatoryHourCents * totalClinicalHours);
  const totalCostCents = directCostCents + overheadCostCents;

  return {
    supply_cost_cents: supplyCostCents,
    lab_cost_cents: labCostCents,
    direct_cost_cents: directCostCents,
    overhead_cost_cents: overheadCostCents,
    total_cost_cents: totalCostCents,
    total_clinical_hours: totalClinicalHours,
    visit_count: procedure.visits.length,
    cost_per_hour_cents:
      totalClinicalHours > 0
        ? Math.round(totalCostCents / totalClinicalHours)
        : null,
  };
}
