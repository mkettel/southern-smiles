/**
 * Southern Smiles Org Board — full hierarchy data.
 * Based on the Hubbard Management org board PDF.
 * This is a reference/display data structure, separate from the stat tracking schema.
 */

export interface OrgSection {
  name: string;
  assignee?: string;
  responsibilities: string[];
}

export interface OrgDepartment {
  name: string;
  director?: string;
  sections: OrgSection[];
}

export interface OrgDivision {
  number: number;
  name: string;
  color: string;
  executive?: string;
  vfp?: string;
  stats?: string[];
  departments: OrgDepartment[];
}

export const orgBoardData: OrgDivision[] = [
  {
    number: 7,
    name: "Executive",
    color: "#6b7280",
    executive: "Monzer Shakally",
    vfp: "Viable, Solvent Dental Office & Its Product",
    stats: ["Cash vs Bills", "% of Rising Stats", "Profit", "Total Reserves", "# of Patients Reactivated"],
    departments: [
      {
        name: "Executive Department",
        director: "Office Manager",
        sections: [
          { name: "Office of the Owner", assignee: "Monzer Shakally", responsibilities: ["Goals and Strategic Planning", "Policy Development & Authorization"] },
          { name: "Planning & Policy Section", assignee: "Monzer Shakally", responsibilities: ["Goals and Strategic Planning", "Policy Development & Authorization"] },
          { name: "Technical Standards Section", assignee: "Monzer Shakally", responsibilities: ["Standards Development & Implementation", "Clinical Standardization", "Keeping Technical Standards Intact"] },
          { name: "Finance Office", assignee: "Monzer Shakally", responsibilities: ["Banking/Financial Planning/Approval", "Liaison w/ Accountants & Div 3"] },
          { name: "Estates Section", responsibilities: ["Repair & Maintenance of Estates"] },
        ],
      },
      {
        name: "Dept of External Affairs & Liaison",
        sections: [
          { name: "Legal Section", responsibilities: ["Government & Licensing Officer Litigation"] },
          { name: "Legal Rudements Section", responsibilities: ["Corporate Rudiments & OSHA Compliance", "Licensing & Insurance Rudiments"] },
          { name: "Community Relations Section", responsibilities: ["Awareness Campaigns & Community Relocations", "PR Events & Charitable Causes", "Opinion Leaders"] },
        ],
      },
    ],
  },
  {
    number: 1,
    name: "Communication",
    color: "#eab308",
    executive: "Lesley P",
    vfp: "Established, Secure, Productive Personnel",
    stats: ["# Staff in Normal or Above", "Letters In/Out", "Bulk Mail Out"],
    departments: [
      {
        name: "Dept of Routing and Personnel",
        director: "Monzer Shakally",
        sections: [
          { name: "Front Desk", assignee: "Lesley P", responsibilities: ["Maintain Phone/Printer/Scanner/Fax/Email", "Reception Area Maintenance", "Record Scan & Upkeep", "Routing Slip Origination", "Putting A-sign Out", "Turn LED Signs On"] },
          { name: "HR Section", assignee: "M Shakally", responsibilities: ["Personnel Allocation & Assignment", "Personnel Attendance & Leaving", "Personnel Files & Admin", "Personnel Interview & Hiring", "Promo & Advertising"] },
          { name: "Personnel Hatting Section", assignee: "M Shakally", responsibilities: ["Hat Assembly & Issuance", "Hat Checking"] },
        ],
      },
      {
        name: "Dept of Communication",
        director: "Lesley P",
        sections: [
          { name: "Internal Comm Section", assignee: "Lesley P", responsibilities: ["Comm Center Upkeep", "Mail Distribution"] },
          { name: "External Comm Section", assignee: "Lesley P", responsibilities: ["Bulk Mail", "Phone Systems & Email"] },
          { name: "IT Specialist", assignee: "M Shakally", responsibilities: ["Computer Coordination", "Comm Systems"] },
        ],
      },
      {
        name: "Dept of Inspections & Reports",
        director: "M Shakally",
        sections: [
          { name: "Inspections & Reports Section", assignee: "M Shakally", responsibilities: ["Staff Reports", "Checklist & Stats Inspection", "Stat Collection", "OIC"] },
          { name: "Ethics Section", assignee: "M Shakally", responsibilities: ["Staff Ethics Handlings"] },
        ],
      },
    ],
  },
  {
    number: 2,
    name: "Sales",
    color: "#f97316",
    executive: "Lesley G",
    vfp: "1- Income Greater than Outflow + Reserves, 2- Sold and Delivered Products",
    stats: ["# Consults", "Close %"],
    departments: [
      {
        name: "Dept of Marketing",
        director: "M Shakally",
        sections: [
          { name: "Marketing Research & Planning Section", assignee: "M Shakally", responsibilities: ["Media Research", "Internet Research", "Social Media Research", "Overall Marketing Planning", "Campaign Planning", "Coordination with Div 6 Marketing Liaison"] },
          { name: "Promo Assembly Section", assignee: "M Shakally", responsibilities: ["Design & Copy Writing", "Internet/Social Media Advertising", "New Patient Advertising", "Existing Patient Advertising", "Internal & External Marketing Distribution"] },
          { name: "Stocks & Display Section", assignee: "M Shakally", responsibilities: ["Fills in products we carry like whitening", "Fills in educational pamphlets and brochure"] },
          { name: "Product Sales Section", assignee: "M Shakally", responsibilities: ["Product Sales"] },
        ],
      },
      {
        name: "Dept of Patient Education",
        director: "M Shakally",
        sections: [
          { name: "Patient Records Section", assignee: "Lesley P", responsibilities: ["Record Maintenance & Address Corrections", "Mailing List Creation & Maintenance"] },
          { name: "TX Coordinator", assignee: "Lesley G", responsibilities: ["Patient Treatment Acceptance & Sign Up", "New Patient Exams & Consultations", "TX Plan Follow Up", "TX Plan Presentation"] },
        ],
      },
    ],
  },
  {
    number: 3,
    name: "Treasury",
    color: "#22c55e",
    executive: "Lesley G",
    vfp: "Preserved and Valuable Assets and Preserves",
    stats: ["Collections"],
    departments: [
      {
        name: "Dept of Income",
        director: "M Shakally",
        sections: [
          { name: "Collections Section", assignee: "Lesley G", responsibilities: ["Collections", "Patient Invoicing & Billing", "Patient Ledger Upkeep", "Walkout Statements", "Past Due Collections", "Accounts Receivables", "Patient Balance Billing"] },
          { name: "Insurance Verification & Billing Section", assignee: "Lesley G", responsibilities: ["Insurance Billing", "Insurance Follow Up"] },
        ],
      },
      {
        name: "Dept of Disbursement",
        director: "M Shakally",
        sections: [
          { name: "Purchasing Section", assignee: "I. Mendez", responsibilities: ["Large Equipment Purchasing/Facility Upgrades", "Liaison w/ Div 7"] },
          { name: "Accounts Payable Section", assignee: "M Shakally", responsibilities: ["Input Bills into Quickbooks", "Cutting Checks for CFO", "Maintain Creditor Files"] },
          { name: "Payroll Section", assignee: "M Shakally", responsibilities: ["Liaison w/ Div 7", "Insures labor hours are accurate", "Insures payroll is submitted on time"] },
        ],
      },
      {
        name: "Dept of Records, Assets & Material",
        director: "M Shakally",
        sections: [
          { name: "Banking Section", assignee: "I. Mendez", responsibilities: ["Financial Records & Audits", "Check Deposits & Accounts Reconciliation", "R&F Taxes"] },
          { name: "Assets & Material Section", assignee: "L. Mendez", responsibilities: ["Equipment Maintenance", "Maintains Assets of Organization", "Update Equipment Files"] },
          { name: "Admin Supplies Section", assignee: "L. Martinez", responsibilities: ["Liaison w/ Div 7"] },
        ],
      },
    ],
  },
  {
    number: 4,
    name: "Production",
    color: "#3b82f6",
    executive: "Monzer Shakally",
    vfp: "Correctly Treated Patients Who are Healthy and Happy",
    stats: ["% Appt Kept", "% Recall Appt Kept", "Total Production $"],
    departments: [
      {
        name: "Dept of Patient Services",
        director: "M Shakally",
        sections: [
          { name: "Tech Recep. & Routing Section", assignee: "Lesley P", responsibilities: ["Doctor Schedule", "Hygiene Schedule", "Patient Confirmation", "Patient Re-call", "Chart Routing"] },
          { name: "Patient Chart Section", responsibilities: ["Chart Assembly", "Chart Routing"] },
        ],
      },
      {
        name: "Dept of Preparations",
        director: "L. Martinez",
        sections: [
          { name: "Set-up & Preparations Section", assignee: "L. Martinez", responsibilities: ["Room Set-up", "Sterilization", "Pt Preparation"] },
          { name: "Dental Supply & Inventory Section", assignee: "L. Martinez", responsibilities: ["Room Stock", "Supply Orders", "Supply Inventory"] },
          { name: "Lab Section", assignee: "L. Martinez", responsibilities: ["Lab Case Prep", "Lab Case Follow-Up", "Lab Communication"] },
        ],
      },
      {
        name: "Dept of Production",
        director: "Monzer Shakally",
        sections: [
          { name: "Dental Section", assignee: "Monzer Shakally", responsibilities: ["Doctor", "Lead Assistant", "Assistant"] },
          { name: "Hygiene Section", responsibilities: ["Hygienist"] },
          { name: "Specialist Referral Section", assignee: "I. Mendez", responsibilities: ["Specialist Liaison"] },
        ],
      },
    ],
  },
  {
    number: 5,
    name: "Qualifications",
    color: "#a855f7",
    executive: "TBD",
    vfp: "Corrected Organization Products",
    stats: ["Collections/Staff", "# Positive Patient Reviews", "# Tech Hub Articles", "# Admin Hub Articles", "Staff Training Progress"],
    departments: [
      {
        name: "Dept of Validity",
        sections: [
          { name: "Patient Follow-Up Section", responsibilities: ["Quality Control Surveys", "Service Alert Origination", "Care Calls"] },
          { name: "Quality Control Section", responsibilities: ["Develop Checklists for Different Positions", "X-ray Review", "Review TX Plans Delivered"] },
        ],
      },
      {
        name: "Dept of Staff Development",
        sections: [
          { name: "Staff Training Section", responsibilities: ["Staff Training", "CE Programs", "Seminars/Symposiums", "Post Drilling"] },
          { name: "Staff Assistance Section", responsibilities: ["Coordinates Needed Staff Assistance"] },
        ],
      },
      {
        name: "Dept of Correction",
        sections: [
          { name: "Review Section", responsibilities: ["Dissatisfied Patient Liaison", "Corrected Services Initiated", "Corrected Products"] },
          { name: "Staff Corrections Section", responsibilities: ["Corrected Staff"] },
        ],
      },
    ],
  },
  {
    number: 6,
    name: "Public",
    color: "#ef4444",
    executive: "Lesley Galindo",
    vfp: "Expanded Acceptance and Use of Practice Services",
    stats: ["# of New Reaches", "# of New Patients", "# of Events", "# of Reviews"],
    departments: [
      {
        name: "Dept of Public Contact",
        director: "L. Galindo",
        sections: [
          { name: "Introductory Events Section", responsibilities: ["Health Fairs"] },
          { name: "New Public Contact Section", responsibilities: ["Coordination with Marketing Dept", "Flyers/Direct Mail/Radio/TV/Internet Marketing"] },
          { name: "New Patient Scheduling Section", assignee: "Potentially Lesley P", responsibilities: ["Coord with TX Coord and Scheduling Coord"] },
        ],
      },
      {
        name: "Dept of Referrals",
        director: "L. Galindo",
        sections: [
          { name: "Patient Referral Section", responsibilities: ["Care Enough to Share Program", "Patient Referral Program"] },
          { name: "Business Networking Section", responsibilities: ["Professional Referral Programs", "Networking and Alliances"] },
        ],
      },
      {
        name: "Dept of Public Relations",
        director: "L. Galindo",
        sections: [
          { name: "Success Section", assignee: "Evelis", responsibilities: ["Responding to Google Reviews", "Updates Website"] },
          { name: "PR Events Section", assignee: "M Shakally", responsibilities: ["PR Events", "Public Service Programs", "Writing Press Releases", "Charitable Causes Liaison"] },
        ],
      },
    ],
  },
];
