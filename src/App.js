import React, { useEffect, useState } from "react";
import axios from "axios";
import { socket } from "./socket";

const API = "http://localhost:5000/api/gate";

const FIELDS = [
  { key: "permitNumber", label: "Permit Number" },
  { key: "containerNumber", label: "Container Number" },
  { key: "containerSize", label: "Container Size" },
  { key: "containerType", label: "Container Type" },
  { key: "containerStatus", label: "Container Status" },
  { key: "vehicleNumber", label: "Vehicle Number" },
  { key: "slineCode", label: "Sline Code" }
];

export default function App() {
  const [tab, setTab] = useState("mismatch");
  const [mismatch, setMismatch] = useState([]);
  const [matched, setMatched] = useState([]);
  const [invalid, setInvalid] = useState([]);
  const [editing, setEditing] = useState(null); // {rowIdx, field}

  /* ================= INITIAL LOAD ================= */
  useEffect(() => {
    async function load() {
      const mis = await axios.get(`${API}/mismatch`);
      const mat = await axios.get(`${API}/matched`);
      const inv = await axios.get(`${API}/invalid`);

      setMismatch(mis.data.data || []);
      setMatched(mat.data.data || []);
      setInvalid(inv.data.data || []);
    }
    load();
  }, []);

  /* ================= SOCKET ================= */
  useEffect(() => {
    socket.on("gate:mismatch", d => setMismatch(p => [d, ...p]));
    socket.on("gate:matched", d => setMatched(p => [d, ...p]));
    socket.on("gate:invalid", d => setInvalid(p => [d, ...p]));

    return () => {
      socket.off("gate:mismatch");
      socket.off("gate:matched");
      socket.off("gate:invalid");
    };
  }, []);

  /* ================= HELPERS ================= */
  const hasMismatch = (row, key) => {
    const c = (row.client[key] || "").toString().trim();
    const s = (row.soapData?.[key] || "").toString().trim();
    return c !== s && s !== "";
  };

  const updateField = (idx, key, value) => {
    setMismatch(prev => {
      const copy = [...prev];
      copy[idx].client[key] = value;
      return copy;
    });
  };

  /* ================= CONFIRM ================= */
  const confirm = async (row) => {
    await axios.post(`${API}/validate`, {
      ...row.client,
      confirmedByUser: true
    });

    setMismatch(prev => prev.filter(r => r !== row));
    setMatched(prev => [
      { client: row.client, soapData: row.soapData, source: "manual" },
      ...prev
    ]);

    alert("Saved successfully");
  };

  /* ================= UI ================= */
  return (
    <div style={{ padding: 16, background: "#eef2ff", minHeight: "100vh" }}>
      <h2>🚦 Gate Validation Dashboard</h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Tab label={`❌ No Match (${mismatch.length})`} active={tab==="mismatch"} onClick={()=>setTab("mismatch")} />
        <Tab label={`✅ Matched (${matched.length})`} active={tab==="matched"} onClick={()=>setTab("matched")} />
        <Tab label={`🚫 Invalid (${invalid.length})`} active={tab==="invalid"} onClick={()=>setTab("invalid")} />
      </div>

      {/* ================= NO MATCH ================= */}
      {tab === "mismatch" && mismatch.map((row, idx) => (
        <Card key={idx} title={`Mismatch #${idx+1}`} color="#dc2626" action={() => confirm(row)}>
          <TwoCol>
            {/* CTLS */}
            <Col title="CTLS (Editable)">
              {FIELDS.map(f => {
                const mismatchField = hasMismatch(row, f.key);
                const isEditing = editing?.idx===idx && editing?.key===f.key;

                return (
                  <Field key={f.key} label={f.label}>
                    {isEditing ? (
                      <input
                        autoFocus
                        defaultValue={row.client[f.key] || ""}
                        onBlur={e => {
                          updateField(idx, f.key, e.target.value);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => mismatchField && setEditing({idx, key:f.key})}
                        style={{
                          border: mismatchField ? "2px solid #ef4444" : "1px solid #ccc",
                          background: mismatchField ? "#fee2e2" : "#fff",
                          padding: 6,
                          cursor: mismatchField ? "pointer" : "default"
                        }}
                      >
                        {row.client[f.key] || "-"} {mismatchField && "✏️"}
                      </div>
                    )}
                  </Field>
                );
              })}
            </Col>

            {/* CCLS */}
            <Col title="CCLS (Read Only)">
              {FIELDS.map(f => (
                <Field key={f.key} label={f.label}>
                  <div style={{ background:"#f9fafb", padding:6 }}>
                    {row.soapData?.[f.key] || "-"}
                  </div>
                </Field>
              ))}
            </Col>
          </TwoCol>
        </Card>
      ))}

      {/* ================= MATCHED ================= */}
      {tab === "matched" && matched.map((row, idx) => (
        <Card key={idx} title={`Matched #${idx+1}`} color="#059669">
          <TwoCol>
            <Col title="CTLS">
              {FIELDS.map(f => <div key={f.key}>{row.client[f.key] || "-"}</div>)}
            </Col>
            <Col title="CCLS">
              {FIELDS.map(f => <div key={f.key}>{row.soapData?.[f.key] || "-"}</div>)}
            </Col>
          </TwoCol>
        </Card>
      ))}

      {/* ================= INVALID ================= */}
      {tab === "invalid" && invalid.map((row, idx) => (
        <Card key={idx} title={`🚫 Invalid Permit #${idx+1}`} color="#6b7280">
          <TwoCol>
            <Col title="CTLS">
              {FIELDS.map(f => <div key={f.key}>{row.client[f.key] || "-"}</div>)}
            </Col>
            <Col title="CCLS">
              {FIELDS.map(f => <div key={f.key}>{row.soapData?.[f.key] || "-"}</div>)}
              <div style={{ color:"#dc2626", marginTop:10, fontWeight:700 }}>
                Permit Expired
              </div>
            </Col>
          </TwoCol>
        </Card>
      ))}
    </div>
  );
}

/* ================= SMALL UI HELPERS ================= */

const Tab = ({label, active, onClick}) => (
  <button
    onClick={onClick}
    style={{
      flex:1,
      padding:10,
      fontWeight:600,
      background: active ? "#1f2937" : "#fff",
      color: active ? "#fff" : "#374151",
      borderRadius:6,
      cursor:"pointer"
    }}
  >
    {label}
  </button>
);

const Card = ({title, color, action, children}) => (
  <div style={{ background:"#fff", marginBottom:16, border:`2px solid ${color}`, borderRadius:8 }}>
    <div style={{ background:color, color:"#fff", padding:10, display:"flex", justifyContent:"space-between" }}>
      <span>{title}</span>
      {action && <button onClick={action}>Confirm & Save</button>}
    </div>
    <div style={{ padding:16 }}>{children}</div>
  </div>
);

const TwoCol = ({children}) => (
  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>{children}</div>
);

const Col = ({title, children}) => (
  <div>
    <h4>{title}</h4>
    {children}
  </div>
);

const Field = ({label, children}) => (
  <div style={{ marginBottom:10 }}>
    <div style={{ fontSize:12, fontWeight:600 }}>{label}</div>
    {children}
  </div>
);
