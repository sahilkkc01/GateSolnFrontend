import React, { useEffect, useState } from "react";
import { socket } from "./socket";

const BASE_URL = "http://10.40.40.208:5000";

export default function App() {
  const [matched, setMatched] = useState([]);
  const [mismatch, setMismatch] = useState([]);
  const [invalid, setInvalid] = useState([]);
  const [exception, setException] = useState([]);

  const [tab, setTab] = useState("matched");

  /* ================= LOAD DASHBOARD INIT ================= */

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    const res = await fetch(`${BASE_URL}/api/gate/dashboard`);
    const data = await res.json();

    setMatched(data.filter((d) => d.status === "matched"));
    setMismatch(data.filter((d) => d.status === "mismatch"));
    setInvalid(data.filter((d) => d.status === "invalid"));
    setException(data.filter((d) => d.status === "exception"));
  };

  /* ================= SOCKET LISTENER ================= */

  useEffect(() => {
    socket.on("connect", () => {
      console.log("🟢 Connected to socket");
    });

    socket.on("gate:update", (record) => {
      // Remove existing record if exists
      removeIfExists(record.id);

      // Push to correct state
      if (record.status === "matched") setMatched((prev) => [record, ...prev]);
      else if (record.status === "mismatch")
        setMismatch((prev) => [record, ...prev]);
      else if (record.status === "invalid")
        setInvalid((prev) => [record, ...prev]);
      else if (record.status === "exception")
        setException((prev) => [record, ...prev]);
    });

    return () => {
      socket.off("gate:update");
    };
  }, []);

  const removeIfExists = (id) => {
    setMatched((prev) => prev.filter((i) => i.id !== id));
    setMismatch((prev) => prev.filter((i) => i.id !== id));
    setInvalid((prev) => prev.filter((i) => i.id !== id));
    setException((prev) => prev.filter((i) => i.id !== id));
  };

  /* ================= RENDER TABLE ================= */

  const renderTable = (list, status) => {
    if (!list.length) {
      return (
        <div style={styles.emptyState}>
          <p>No {status} records found</p>
        </div>
      );
    }

    return (
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Gate Info</th>
              <th style={styles.th}>Permit Number</th>
              <th style={styles.th}>CTMS Vehicle</th>
              <th style={styles.th}>Mapped Container</th>
              <th style={styles.th}>CCLS Container</th>
              <th style={styles.th}>CCLS Vehicle</th>
              <th style={styles.th}>Expiry</th>
              <th style={styles.th}>LDD</th>
              <th style={styles.th}>Status</th>
              {(status === "mismatch" || status === "invalid" || status === "exception") && (
                <th style={styles.th}>Reason</th>
              )}
            </tr>
          </thead>
          <tbody>
            {list.map((item, index) => (
              <tr
                key={item.id}
                style={{
                  ...styles.tableRow,
                  backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8f9fa",
                }}
              >
                <td style={styles.td}>
                  <div style={styles.gateInfo}>
                    <strong>{item.gateType}</strong>
                    <span style={styles.gateNumber}>Gate {item.gateNo}</span>
                  </div>
                </td>
                <td style={styles.td}>{item.permitNumber || "N/A"}</td>
                <td style={styles.td}>{item.ctmsVehicleNumber || "N/A"}</td>
                <td style={styles.td}>{item.mappedContainer || "N/A"}</td>
                <td style={styles.td}>{item.cclsContainerNumber || "N/A"}</td>
                <td style={styles.td}>{item.cclsVehicleNumber || "N/A"}</td>
                <td style={styles.td}>
                  {item.cclsExpiry
                    ? new Date(item.cclsExpiry).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "N/A"}
                </td>
                <td style={styles.td}>{item.cclsLddFlag || "N/A"}</td>
                <td style={styles.td}>
                  <span style={styles.statusBadge(item.status)}>
                    {item.status.toUpperCase()}
                  </span>
                </td>
                {(status === "mismatch" || status === "invalid" || status === "exception") && (
                  <td style={{ ...styles.td, color: "#dc3545", fontWeight: "500" }}>
                    {item.reason || "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const getCurrentList = () => {
    switch (tab) {
      case "matched":
        return { list: matched, status: "matched" };
      case "mismatch":
        return { list: mismatch, status: "mismatch" };
      case "invalid":
        return { list: invalid, status: "invalid" };
      case "exception":
        return { list: exception, status: "exception" };
      default:
        return { list: [], status: "" };
    }
  };

  const { list, status } = getCurrentList();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🚦 Live Gate Dashboard</h1>
        <div style={styles.timestamp}>
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div style={styles.tabContainer}>
        <button
          onClick={() => setTab("matched")}
          style={tab === "matched" ? styles.tabActive : styles.tab}
        >
          <span style={styles.tabIcon}>✓</span>
          Matched
          <span style={styles.badge("#28a745")}>{matched.length}</span>
        </button>
        <button
          onClick={() => setTab("mismatch")}
          style={tab === "mismatch" ? styles.tabActive : styles.tab}
        >
          <span style={styles.tabIcon}>⚠</span>
          Mismatch
          <span style={styles.badge("#dc3545")}>{mismatch.length}</span>
        </button>
        <button
          onClick={() => setTab("invalid")}
          style={tab === "invalid" ? styles.tabActive : styles.tab}
        >
          <span style={styles.tabIcon}>✕</span>
          Invalid
          <span style={styles.badge("#fd7e14")}>{invalid.length}</span>
        </button>
        <button
          onClick={() => setTab("exception")}
          style={tab === "exception" ? styles.tabActive : styles.tab}
        >
          <span style={styles.tabIcon}>!</span>
          Exception
          <span style={styles.badge("#6c757d")}>{exception.length}</span>
        </button>
      </div>

      {renderTable(list, status)}
    </div>
  );
}

/* ================= STYLES ================= */

const styles = {
  container: {
    padding: "30px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    backgroundColor: "#f0f2f5",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "25px",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    color: "#1a1a1a",
    fontWeight: "600",
  },
  timestamp: {
    color: "#6c757d",
    fontSize: "14px",
  },
  tabContainer: {
    display: "flex",
    gap: "10px",
    marginBottom: "25px",
    borderBottom: "2px solid #dee2e6",
    paddingBottom: "0",
  },
  tab: {
    padding: "12px 24px",
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "500",
    color: "#6c757d",
    borderBottom: "3px solid transparent",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    position: "relative",
    bottom: "-2px",
  },
  tabActive: {
    padding: "12px 24px",
    border: "none",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    color: "#1a1a1a",
    borderBottom: "3px solid #0d6efd",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    position: "relative",
    bottom: "-2px",
  },
  tabIcon: {
    fontSize: "16px",
  },
  badge: (bgColor) => ({
    backgroundColor: bgColor,
    color: "#ffffff",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "600",
    marginLeft: "6px",
  }),
  tableContainer: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  },
  tableHeader: {
    backgroundColor: "#f8f9fa",
    borderBottom: "2px solid #dee2e6",
  },
  th: {
    padding: "16px 12px",
    textAlign: "left",
    fontWeight: "600",
    color: "#495057",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tableRow: {
    borderBottom: "1px solid #dee2e6",
    transition: "background-color 0.15s ease",
  },
  td: {
    padding: "14px 12px",
    color: "#212529",
    verticalAlign: "middle",
  },
  gateInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  gateNumber: {
    fontSize: "12px",
    color: "#6c757d",
  },
  statusBadge: (status) => ({
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "0.5px",
    display: "inline-block",
    color: "#ffffff",
    backgroundColor:
      status === "matched"
        ? "#28a745"
        : status === "mismatch"
        ? "#dc3545"
        : status === "invalid"
        ? "#fd7e14"
        : status === "exception"
        ? "#6c757d"
        : "#0d6efd",
  }),
  emptyState: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    padding: "60px 20px",
    textAlign: "center",
    color: "#6c757d",
    fontSize: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
};