import React, { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Download,
  Calendar,
  Send,
  CheckCircle,
  Plus,
  Printer,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchReports,
  generateReport,
  submitReportToAdmin,
  UniversityReport,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

const REPORT_TYPES = [
  { id: "student_acquisition", label: "Student Acquisition Report" },
  { id: "university_growth", label: "University Growth Report" },
  { id: "hotel_recruitment", label: "Hotel Recruitment Report" },
  { id: "hotel_performance", label: "Hotel Performance Report" },
  { id: "digital_marketing", label: "Digital Marketing Report" },
  { id: "customer_care", label: "Customer Care & CSAT Report" },
  { id: "team_performance", label: "Team Productivity Report" },
  { id: "financial_commission", label: "Financial & Commission Report" },
  { id: "monthly_performance", label: "Monthly Branch Comprehensive Report" },
];

function downloadCsv(filename: string, data: Record<string, unknown>) {
  const headers = ["Metric", "Value"];
  const rows = Object.entries(data).map(([key, val]) => [
    key,
    typeof val === "object" ? JSON.stringify(val) : String(val),
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.join(","), ...rows.map((e) => e.map((x) => `"${x.replace(/"/g, '""')}"`).join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function AmbassadorReportsScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<UniversityReport[]>([]);

  // Generator State
  const [selectedType, setSelectedType] = useState("monthly_performance");
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);

  const loadReportsList = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchReports(authFetch, currentUniversity.id);
      setReports(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadReportsList();
  }, [loadReportsList]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity) return;
    try {
      setGenerating(true);
      await generateReport(authFetch, {
        universityId: currentUniversity.id,
        reportType: selectedType,
        startDate,
        endDate,
      });
      await loadReportsList();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to compile report.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitToAdmin = async (reportId: string) => {
    if (!window.confirm("Submit this official report directly to Central MealVest Administration?")) return;
    try {
      await submitReportToAdmin(authFetch, reportId, currentUniversity?.id);
      await loadReportsList();
      alert("Report successfully submitted to Central Admin.");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to submit report.");
    }
  };

  const handlePrint = (report: UniversityReport) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${report.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #111; }
            h1 { font-size: 20px; border-bottom: 2px solid #059669; padding-bottom: 8px; }
            .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            th { background-color: #f8f9fa; }
            .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
          </style>
        </head>
        <body>
          <h1>MEALVEST UNIVERSITY OPERATIONS REPORT</h1>
          <h2>${report.title}</h2>
          <div class="meta">
            <strong>Institution:</strong> ${currentUniversity?.name}<br/>
            <strong>Window:</strong> ${report.start_date} to ${report.end_date}<br/>
            <strong>Generated:</strong> ${new Date(report.created_at).toLocaleString()}
          </div>
          <table>
            <thead>
              <tr><th>Metric / Data Field</th><th>Recorded Value</th></tr>
            </thead>
            <tbody>
              ${Object.entries(report.summary_data)
                .map(
                  ([k, v]) =>
                    `<tr><td><strong>${k}</strong></td><td>${typeof v === "object" ? JSON.stringify(v) : v}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
          <div class="footer">
            MealVest Official Branch Record · Confidential · Eat Smart. Spend Smart.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>University Reports Centre</h1>
          <p style={styles.subtitle}>
            Compile official branch operational data, export to CSV/PDF & submit to Central Administration
          </p>
        </div>
      </div>

      {/* Report Generator Form */}
      <div style={styles.generatorCard}>
        <h2 style={styles.cardHeading}>Compile Real-Time University Report</h2>
        <p style={styles.cardSub}>
          Reports are derived directly from live database figures, never mock numbers.
        </p>

        <form onSubmit={handleGenerate} style={styles.formRow}>
          <div style={{ ...styles.field, flex: 2 }}>
            <label style={styles.label}>Select Report Specification</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={styles.select}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ ...styles.field, flex: 1 }}>
            <label style={styles.label}>Start Date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.input}
            >
            </input>
          </div>

          <div style={{ ...styles.field, flex: 1 }}>
            <label style={styles.label}>End Date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.input}
            >
            </input>
          </div>

          <button type="submit" disabled={generating} style={styles.generateBtn}>
            <FileText size={16} />
            <span>{generating ? "Compiling..." : "Generate Report"}</span>
          </button>
        </form>
      </div>

      {/* Generated Reports List */}
      <div style={styles.reportsCard}>
        <div style={styles.reportsHeader}>
          <h2 style={styles.cardHeading}>Compiled Branch Reports ({reports.length})</h2>
        </div>

        {loading && reports.length === 0 ? (
          <div style={styles.loadingContainer}>
            <Spinner size="large" color="#059669" />
          </div>
        ) : reports.length === 0 ? (
          <div style={styles.emptyCard}>
            <FileText size={32} color="#9CA3AF" />
            <p>No reports generated yet. Select a report above to compile live branch figures.</p>
          </div>
        ) : (
          <div style={styles.reportList}>
            {reports.map((r) => (
              <div key={r.id} style={styles.reportItem}>
                <div style={styles.reportIconCircle}>
                  <FileText size={20} color="#059669" />
                </div>

                <div style={styles.reportInfo}>
                  <div style={styles.reportTitleRow}>
                    <h3 style={styles.reportTitle}>{r.title}</h3>
                    {r.submitted_to_admin ? (
                      <span style={styles.submittedPill}>
                        <CheckCircle size={12} />
                        <span>Submitted to Admin</span>
                      </span>
                    ) : (
                      <span style={styles.draftPill}>Local Branch Report</span>
                    )}
                  </div>

                  <span style={styles.reportMeta}>
                    <Calendar size={12} style={{ marginRight: 4 }} />
                    Window: {r.start_date} to {r.end_date} · Compiled: {new Date(r.created_at).toLocaleDateString()}
                  </span>

                  {/* Summary preview tags */}
                  <div style={styles.summaryTags}>
                    {Object.entries(r.summary_data).slice(0, 4).map(([k, v]) => (
                      <span key={k} style={styles.summaryTag}>
                        {k.replace(/([A-Z])/g, " $1")}: <strong>{String(v)}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={styles.reportActions}>
                  <button
                    onClick={() => downloadCsv(r.title.toLowerCase().replace(/[^a-z0-9]/g, "_"), r.summary_data)}
                    style={styles.actionBtn}
                    title="Export CSV"
                  >
                    <Download size={14} />
                    <span>CSV</span>
                  </button>

                  <button
                    onClick={() => handlePrint(r)}
                    style={styles.actionBtn}
                    title="Print / Save PDF"
                  >
                    <Printer size={14} />
                    <span>Print/PDF</span>
                  </button>

                  {!r.submitted_to_admin && (
                    <button
                      onClick={() => handleSubmitToAdmin(r.id)}
                      style={styles.submitAdminBtn}
                      title="Submit to Central MealVest Administration"
                    >
                      <Send size={13} />
                      <span>Submit to Admin</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    margin: "4px 0 0 0",
  },
  generatorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  cardSub: {
    fontSize: 12,
    color: "#6B7280",
    margin: "4px 0 16px 0",
  },
  formRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
  },
  select: {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 13,
    outline: "none",
  },
  input: {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 13,
    outline: "none",
  },
  generateBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    color: "#FFFFFF",
    border: "none",
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    height: 40,
  },
  reportsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    border: "1px solid #E5E7EB",
  },
  reportsHeader: {
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    display: "flex",
    justifyContent: "center",
  },
  emptyCard: {
    padding: 40,
    textAlign: "center",
    color: "#9CA3AF",
    border: "1px dashed #E5E7EB",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  reportList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  reportItem: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
  },
  reportIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reportInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  reportTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  submittedPill: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: "#ECFDF5",
    color: "#059669",
    padding: "2px 8px",
    borderRadius: 6,
  },
  draftPill: {
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: "#F3F4F6",
    color: "#6B7280",
    padding: "2px 8px",
    borderRadius: 6,
  },
  reportMeta: {
    fontSize: 12,
    color: "#6B7280",
    display: "flex",
    alignItems: "center",
  },
  summaryTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  summaryTag: {
    fontSize: 11,
    backgroundColor: "#FFFFFF",
    border: "1px solid #E5E7EB",
    padding: "2px 8px",
    borderRadius: 4,
    color: "#4B5563",
  },
  reportActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "7px 12px",
    borderRadius: 6,
    border: "1px solid #D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    cursor: "pointer",
  },
  submitAdminBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#111827",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
};
