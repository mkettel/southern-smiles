import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import { formatStatValue, formatPercentChange, formatDelta } from "@/lib/utils";
import type { DashboardStat, Profile, OicLogEntry } from "@/lib/types";
import { format } from "date-fns";

interface WeeklyReportProps {
  practiceName: string;
  contactInfo?: { address?: string | null; phone?: string | null; website?: string | null };
  weekLabel: string;
  generatedAt: string;
  stats: DashboardStat[];
  missing: { profile: Profile; missingStats: string[] }[];
  oicEntries: OicLogEntry[];
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
  },
  // Header
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    color: "#6b7280",
  },
  generatedAt: {
    fontSize: 7,
    color: "#9ca3af",
    marginTop: 4,
  },
  // Division sections
  divisionHeader: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#f3f4f6",
    padding: 6,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 2,
  },
  // Table
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  colStat: { width: "22%" },
  colEmployee: { width: "18%" },
  colValue: { width: "18%", textAlign: "right" },
  colChange: { width: "18%", textAlign: "right" },
  colCondition: { width: "24%", textAlign: "right" },
  // Condition badge
  conditionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    alignSelf: "flex-end",
  },
  // Sections
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  // Missing
  missingRow: {
    flexDirection: "row",
    paddingVertical: 3,
    gap: 8,
  },
  missingName: {
    fontFamily: "Helvetica-Bold",
    width: "25%",
  },
  missingStats: {
    color: "#6b7280",
    flex: 1,
  },
  // OIC
  oicRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
    gap: 8,
  },
  oicDate: {
    width: "15%",
    color: "#6b7280",
  },
  oicText: {
    flex: 1,
  },
  oicBy: {
    width: "20%",
    color: "#9ca3af",
    textAlign: "right",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 7,
    color: "#9ca3af",
  },
  noData: {
    color: "#9ca3af",
    fontStyle: "italic",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
});

function ConditionBadge({ condition }: { condition: ConditionName | null }) {
  if (!condition) return <Text style={styles.noData}>—</Text>;
  const config = CONDITION_CONFIG[condition];
  return (
    <Text
      style={[
        styles.conditionBadge,
        {
          backgroundColor: config.color + "20",
          color: config.color,
        },
      ]}
    >
      {config.label}
    </Text>
  );
}

export function WeeklyReport({
  practiceName,
  contactInfo,
  weekLabel,
  generatedAt,
  stats,
  missing,
  oicEntries,
}: WeeklyReportProps) {
  // Group stats by division
  const grouped = new Map<
    string,
    { label: string; number: number; stats: DashboardStat[] }
  >();
  for (const statData of stats) {
    const div = statData.division;
    const key = div?.id ?? "unknown";
    const label = div ? `Div ${div.number} – ${div.name}` : "Other";
    const num = div?.number ?? 99;
    if (!grouped.has(key)) {
      grouped.set(key, { label, number: num, stats: [] });
    }
    grouped.get(key)!.stats.push(statData);
  }
  const sortedGroups = Array.from(grouped.values()).sort(
    (a, b) => a.number - b.number
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{practiceName}</Text>
          <Text style={styles.subtitle}>Weekly Stats Report — {weekLabel}</Text>
          <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
        </View>

        {/* Stats by Division */}
        {sortedGroups.map((group) => (
          <View key={group.label} wrap={false}>
            <Text style={styles.divisionHeader}>{group.label}</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colStat]}>
                Stat
              </Text>
              <Text style={[styles.tableHeaderText, styles.colEmployee]}>
                Employee
              </Text>
              <Text style={[styles.tableHeaderText, styles.colValue]}>
                Value
              </Text>
              <Text style={[styles.tableHeaderText, styles.colChange]}>
                Change
              </Text>
              <Text style={[styles.tableHeaderText, styles.colCondition]}>
                Condition
              </Text>
            </View>
            {group.stats.map((statData) => {
              const { stat, employee, currentEntry, previousEntry } = statData;
              const hasCurrentData =
                currentEntry?.value !== null &&
                currentEntry?.value !== undefined;
              const displayEntry = hasCurrentData
                ? currentEntry
                : previousEntry;
              const displayValue = displayEntry?.value ?? null;
              const condition =
                displayEntry?.final_condition ??
                displayEntry?.auto_condition ??
                null;
              const delta =
                hasCurrentData && previousEntry
                  ? (currentEntry?.value ?? 0) - previousEntry.value
                  : null;
              const percentChange = hasCurrentData
                ? (currentEntry?.percent_change ?? null)
                : null;

              return (
                <View key={stat.id} style={styles.tableRow}>
                  <Text style={styles.colStat}>{stat.name}</Text>
                  <Text style={[styles.colEmployee, { color: "#6b7280" }]}>
                    {employee.full_name}
                  </Text>
                  <Text style={[styles.colValue, { fontFamily: "Helvetica-Bold" }]}>
                    {displayValue !== null
                      ? formatStatValue(displayValue, stat.stat_type)
                      : "—"}
                    {!hasCurrentData && displayValue !== null ? " *" : ""}
                  </Text>
                  <Text
                    style={[
                      styles.colChange,
                      {
                        color:
                          delta !== null
                            ? delta > 0
                              ? stat.good_direction === "up"
                                ? "#16a34a"
                                : "#dc2626"
                              : delta < 0
                                ? stat.good_direction === "down"
                                  ? "#16a34a"
                                  : "#dc2626"
                                : "#6b7280"
                            : "#6b7280",
                      },
                    ]}
                  >
                    {percentChange !== null
                      ? formatPercentChange(percentChange)
                      : "—"}
                  </Text>
                  <View style={styles.colCondition}>
                    <ConditionBadge condition={condition} />
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* Footnote for last week data */}
        {stats.some(
          (s) =>
            (s.currentEntry?.value === null ||
              s.currentEntry?.value === undefined) &&
            s.previousEntry !== null
        ) && (
          <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 6 }}>
            * Value from previous week (current week not yet submitted)
          </Text>
        )}

        {/* Missing Submissions */}
        {missing.length > 0 && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Missing Submissions</Text>
            {missing.map(({ profile, missingStats }) => (
              <View key={profile.id} style={styles.missingRow}>
                <Text style={styles.missingName}>{profile.full_name}</Text>
                <Text style={styles.missingStats}>
                  {missingStats.join(", ")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* OIC Log */}
        {oicEntries.length > 0 && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>OIC Log</Text>
            {oicEntries.map((entry) => (
              <View key={entry.id} style={styles.oicRow}>
                <Text style={styles.oicDate}>
                  {format(
                    new Date(entry.effective_date + "T00:00:00"),
                    "MMM d"
                  )}
                </Text>
                <Text style={styles.oicText}>{entry.entry_text}</Text>
                <Text style={styles.oicBy}>
                  {entry.profile?.full_name ?? "Unknown"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{practiceName} — Stats & Conditions Report</Text>
          {contactInfo && (
            <Text style={{ marginTop: 2 }}>
              {[contactInfo.address, contactInfo.phone, contactInfo.website]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
