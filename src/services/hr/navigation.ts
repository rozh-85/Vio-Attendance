export type HrTab =
  | "overview"
  | "people"
  | "employee-details"
  | "organization"
  | "time"
  | "leave"
  | "payroll"
  | "hiring"
  | "interviews"
  | "locations"
  | "rules"
  | "reports";

export const HR_NAV_GROUPS: {
  label: string;
  items: { id: HrTab; label: string }[];
}[] = [
  {
    label: "People",
    items: [
      { id: "overview", label: "Overview" },
      { id: "people", label: "People & profiles" },
      { id: "employee-details", label: "Employee details" },
      { id: "organization", label: "Organization" },
    ],
  },
  {
    label: "Workforce",
    items: [
      { id: "time", label: "Time & attendance" },
      { id: "leave", label: "Leave & holidays" },
      { id: "payroll", label: "Payroll" },
    ],
  },
  {
    label: "Talent",
    items: [
      { id: "hiring", label: "Recruitment" },
      { id: "interviews", label: "Interview tracking" },
    ],
  },
  {
    label: "Administration",
    items: [
      { id: "locations", label: "Locations & devices" },
      { id: "rules", label: "Rules & settings" },
      { id: "reports", label: "Reports & audit" },
    ],
  },
];

export const HR_TABS = HR_NAV_GROUPS.flatMap((group) => group.items);

export function isHrTab(value: string | null): value is HrTab {
  return HR_TABS.some((item) => item.id === value);
}

/** The sidebar label for a tab, e.g. for a "back to …" link. */
export function hrTabLabel(tab: HrTab): string {
  return HR_TABS.find((item) => item.id === tab)?.label ?? "HR management";
}
