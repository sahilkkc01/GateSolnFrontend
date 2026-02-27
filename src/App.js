import React, { useEffect, useState } from "react";
import { socket } from "./socket";

// import Tesseract from "tesseract.js";
import Webcam from "react-webcam";
// import PaddleOCR from "@paddlejs-models/ocr";
const BASE_URL = "http://10.40.40.208:5000";
const IMAGE_BASE = "http://10.40.40.139:8000";

/* ================= REASON LABEL MAP ================= */

const reasonLabels = {
  ldd_flag_L: "LDD Flag is L",
  permit_expired: "Permit Expired",
  container_mismatch: "Container Mismatch",
  vehicle_mismatch: "Vehicle Mismatch",
  ctms_container_missing: "CTMS Container Missing",
  ctms_vehicle_missing: "CTMS Vehicle Missing",
  ccls_no_response: "No Response from CCLS",
  already_surveyed: "Permit Already Surveyed",
};

export default function App() {
  const getGateFolder = (gateType, gateNo) => {
  const map = {
    INGATE: {
      "2": "GATE23",
      "4": "GATE45",
    },
    OUTGATE: {
      "1": "GATE12",
      "3": "GATE34",
    },
  };

  return map[gateType]?.[gateNo] || gateNo;
};
  const [records, setRecords] = useState([]);
  const [tab, setTab] = useState("matched");
  const [gateFilter, setGateFilter] = useState("INGATE");
  const [editingData, setEditingData] = useState({});
  const [showModal, setShowModal] = useState(false);

  const [manualPermit, setManualPermit] = useState("");
  const [manualGateType, setManualGateType] = useState("INGATE");
  const [manualGateNo, setManualGateNo] = useState("");
  
  const webcamRef = React.useRef(null);

const [cameraItem, setCameraItem] = useState(null);
const [cameraPhotoIndex, setCameraPhotoIndex] = useState(null);
const [capturedImage, setCapturedImage] = useState(null);
const [sealNumber, setSealNumber] = useState("");
const [ocrLoading, setOcrLoading] = useState(false);
const [sealUploading, setSealUploading] = useState(false);
const [actionLoadingId, setActionLoadingId] = useState(null);

const openCamera = (item, index) => {
  setCameraItem(item);
  setCameraPhotoIndex(index);
};

const shouldCheckLdd = (gateType, permitNumber) => {
  if (!permitNumber) return false;

  if (gateType === "INGATE" && permitNumber.startsWith("PMA"))
    return true;

  if (
    gateType === "OUTGATE" &&
    (permitNumber.startsWith("PMD") ||
     permitNumber.startsWith("GPCQ"))
  )
    return true;

  return false;
};

const captureImage = async () => {
  const imageSrc = webcamRef.current.getScreenshot();

  if (!imageSrc) {
    alert("Failed to capture image");
    return;
  }

  setCapturedImage(imageSrc);
  setOcrLoading(true);

  try {
    //  Convert base64 to Blob
    const blob = await fetch(imageSrc).then((r) => r.blob());

    const formData = new FormData();
    formData.append("image", blob, "seal.jpg"); // Append the image as a file

    // Send the image to OCR API (if needed for seal number extraction)
    const response = await fetch("http://10.40.40.70:5000/extract_text", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    console.log("OCR Response:", data);

    if (data.detected_numbers) {
      const cleaned = data.detected_numbers;
      setSealNumber(cleaned);
    } else {
      setSealNumber("");
    }
  } catch (err) {
    console.error(err);
    alert("Text extraction failed");
  }

  setOcrLoading(false);
};

const submitSeal = async () => {
  if (!sealNumber) {
    alert("Seal number is required");
    return;
  }

  setSealUploading(true);  //  START LOADER

  try {
    const imageSrc = capturedImage;
    const blob = await fetch(imageSrc).then((r) => r.blob());

    const formData = new FormData();
    formData.append("gateRecordId", cameraItem.id);
    formData.append("photoIndex", cameraPhotoIndex);
    formData.append("sealNumber", sealNumber);
    formData.append("photo", blob, "seal-photo.jpg");

    const response = await fetch(`${BASE_URL}/api/gate/sealphoto`, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      alert("Seal uploaded successfully");
      setCameraItem(null);
      setCapturedImage(null);
      setSealNumber("");
    } else {
      alert(`Error: ${result.error || "Unknown error"}`);
    }
  } catch (err) {
    console.error("Error submitting seal:", err);
    alert("Failed to upload seal");
  }

  setSealUploading(false); //  STOP LOADER
};

const closeCamera = () => {
  setCameraItem(null);
  setCapturedImage(null);
  setSealNumber("");
};

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    const res = await fetch(`${BASE_URL}/api/gate/dashboard`);
    const data = await res.json();
    setRecords(data);
  };

  useEffect(() => {
    socket.on("gate:update", (record) => {
      setRecords((prev) => {
        const filtered = prev.filter((r) => r.id !== record.id);
        return [record, ...filtered];
      });
    });

    return () => socket.off("gate:update");
  }, []);

const isEditable =
  (tab === "matched" || tab === "mismatch") &&
  tab !== "submitted";

const handleChange = (id, field, value) => {
  const upperValue = value?.toUpperCase();

  setEditingData((prev) => ({
    ...prev,
    [id]: {
      ...prev[id],
      [field]: upperValue,
    },
  }));
};

const handleSubmit = async (item) => {
  setActionLoadingId(item.id); //  start loader

  const updated = editingData[item.id];

 const payload = {
  id: item.id,
  ctmsVehicleNumber:
    updated?.ctmsVehicleNumber ?? item.ctmsVehicleNumber,
  mappedContainer:
    updated?.mappedContainer ?? item.mappedContainer,

  damage_status:
    updated?.damage_status ?? item.damage_status ?? "N",

  damage_remark:
    updated?.damage_remark ?? item.damage_remark ?? null,
};
if (
  payload.damage_status === "Y" &&
  (!payload.damage_remark || payload.damage_remark.trim() === "")
) {
  alert("Damage remark is required when damage is marked YES");
  setActionLoadingId(null);
  return;
}

  const apiUrl =
    tab === "matched"
      ? `${BASE_URL}/api/gate/submit`
      : `${BASE_URL}/api/gate/update`;

  const method = tab === "matched" ? "POST" : "PUT";

  try {
    const res = await fetch(apiUrl, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Request failed");
    }
  } catch (err) {
    console.error(err);
    alert("Server error");
  }

  setActionLoadingId(null); //  stop loader
  loadDashboard();
};

 const handleManualStart = async () => {
  if (!manualPermit || !manualGateType || !manualGateNo) {
    alert("All fields are required");
    return;
  }

  try {
    await fetch(`${BASE_URL}/api/manualpermit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permitNumber: manualPermit,
        gateType: manualGateType,
        gateNo: manualGateNo,
      }),
    });

    setShowModal(false);
    setManualPermit("");
    setManualGateNo("");

  } catch (err) {
    console.error("Manual Permit Error:", err);
    alert("Failed to start vehicle");
  }
};


  /* ================= FILTERING ================= */

  const getCount = (statusType) =>
    records.filter(
      (r) => r.gateType === gateFilter && r.status === statusType
    ).length;

  const filtered = records
    .filter((r) => r.gateType === gateFilter)
    .filter((r) => r.status === tab);

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.headerRow}>
        <h1 style={styles.title}> Live Gate Dashboard</h1>

        <button
          style={styles.manualBtn}
          onClick={() => setShowModal(true)}
        >
          + Manual Entry
        </button>
      </div>

      {/* GATE FILTER BUTTONS */}
      <div style={styles.gateFilterRow}>
        <button
          onClick={() => setGateFilter("INGATE")}
          style={
            gateFilter === "INGATE"
              ? styles.gateActive
              : styles.gateBtn
          }
        >
          INGATE
        </button>

        <button
          onClick={() => setGateFilter("OUTGATE")}
          style={
            gateFilter === "OUTGATE"
              ? styles.gateActive
              : styles.gateBtn
          }
        >
          OUTGATE
        </button>
      </div>

      {/* STATUS TABS */}
      <div style={styles.tabs}>
       {["matched", "mismatch", "invalid", "exception", "submitted"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={tab === t ? styles.tabActive : styles.tab}
          >
            {t.toUpperCase()} ({getCount(t)})
          </button>
        ))}
      </div>

      {/* RECORDS */}
      {filtered.map((item) => (
        <div key={item.id} style={styles.card}>
          <div style={styles.topHeader}>
            <div>
              <div style={styles.gateInfo}>
                {item.gateType} - Gate {item.gateNo}
              </div>

              <div style={styles.permitLabel}>Permit Number</div>
              <div style={styles.permitValue}>
                {item.permitNumber || "N/A"}
              </div>
            </div>

            <div style={styles.status(item.status)}>
              {item.status.toUpperCase()}
            </div>
          </div>

          {item.status !== "matched" && (
            <div style={styles.reasonBox}>
              ⚠ {reasonLabels[item.reason] || item.reason || "Unknown Issue"}
            </div>
          )}

          <div style={styles.compareGrid}>
            {/* CTMS */}
            <div>
              <h3>CTMS</h3>

              {isEditable ? (
                <>
                  <InputField
                    label="Vehicle Number"
                    value={
                      editingData[item.id]?.ctmsVehicleNumber ??
                      item.ctmsVehicleNumber ??
                      ""
                    }
                    onChange={(val) =>
                      handleChange(item.id, "ctmsVehicleNumber", val)
                    }
                  />

                  <InputField
                    label="Mapped Container"
                    value={
                      editingData[item.id]?.mappedContainer ??
                      item.mappedContainer ??
                      ""
                    }
                    onChange={(val) =>
                      handleChange(item.id, "mappedContainer", val)
                    }
                  />
                </>
              ) : (
                <>
                  <DisplayField
                    label="Vehicle Number"
                    value={item.ctmsVehicleNumber}
                  />
                  <DisplayField
                    label="Mapped Container"
                    value={item.mappedContainer}
                  />
                </>
              )}
           {item.status !== "submitted" &&
 shouldCheckLdd(item.gateType, item.permitNumber) &&
 item?.cclsLddFlag?.trim() === "L" && (
  <div style={{ marginTop: 15 }}>
    <h4>Seal Verification</h4>
    <div style={{ display: "flex", gap: 10 }}>
      {[1, 2].map((index) => (
        <button
          key={index}
          style={styles.manualBtn}
          onClick={() => openCamera(item, index)}
        >
           Capture Photo {index}
        </button>
      ))}
    </div>
  </div>
)}
            </div>

            {/* CCLS */}
            <div>
              <h3>CCLS</h3>

              <DisplayField
                label="Vehicle Number"
                value={item.cclsVehicleNumber}
              />

              <DisplayField
                label="Container Number"
                value={item.cclsContainerNumber}
              />

              <DisplayField
                label="Expiry"
                value={
                  item.cclsExpiry
                    ? new Date(item.cclsExpiry).toLocaleString("en-IN")
                    : "N/A"
                }
              />

              <DisplayField label="LDD Flag" value={item.cclsLddFlag} />
            </div>
          </div>
{tab === "matched" && (
  <div style={{ marginTop: 20, padding: 15, background: "#f8f9fa", borderRadius: 8 }}>
    <h4>Damage Details</h4>

    {/* Damage Toggle */}
    <div style={{ marginBottom: 10 }}>
      <label style={{ marginRight: 15 }}>
        <input
          type="radio"
          name={`damage_${item.id}`}
          value="N"
          checked={
            (editingData[item.id]?.damage_status ??
              item.damage_status ??
              "N") === "N"
          }
          onChange={() =>
            handleChange(item.id, "damage_status", "N")
          }
        />
        {" "}No Damage
      </label>

      <label>
        <input
          type="radio"
          name={`damage_${item.id}`}
          value="Y"
          checked={
            (editingData[item.id]?.damage_status ??
              item.damage_status ??
              "N") === "Y"
          }
          onChange={() =>
            handleChange(item.id, "damage_status", "Y")
          }
        />
        {" "}Damaged
      </label>
    </div>

    {/* Remark (only show if Y selected) */}
    {(editingData[item.id]?.damage_status ??
      item.damage_status ??
      "N") === "Y" && (
      <InputField
        label="Damage Remark"
        value={
          editingData[item.id]?.damage_remark ??
          item.damage_remark ??
          ""
        }
       onChange={(val) =>
  handleChange(item.id, "damage_remark", val.toUpperCase())
}
      />
    )}
  </div>
)}
    {isEditable && (
  <button
    style={styles.submitBtn}
    onClick={() => handleSubmit(item)}
    disabled={actionLoadingId === item.id}
  >
    {actionLoadingId === item.id
      ? tab === "matched"
        ? "Submitting..."
        : "Saving..."
      : tab === "matched"
      ? "Submit"
      : "Save Changes"}
  </button>
)}

          {/* ================= IMAGES ================= */}

<div style={styles.imageContainer}>
  {item.vehicleImage && (
    <div>
      <h4>Vehicle Image</h4>
      <img
        src={`${IMAGE_BASE}/${item.gateType}/${getGateFolder(
          item.gateType,
          item.gateNo
        )}/licence_plate/${item.vehicleImage}`}
        alt="Vehicle"
        style={styles.image}
        onError={(e) => (e.target.style.display = "none")}
      />
    </div>
  )}

  {item.driverImage && (
    <div>
      <h4>Driver Image</h4>
      <img
        src={`${IMAGE_BASE}/${item.gateType}/${getGateFolder(
          item.gateType,
          item.gateNo
        )}/driver/${item.driverImage}`}
        alt="Driver"
        style={styles.image}
        onError={(e) => (e.target.style.display = "none")}
      />
    </div>
  )}
  {/* ================= SEAL DETAILS ================= */}
{/* ================= SEAL DETAILS ================= */}

{(item.sealNumber1 || item.sealPhoto1 || item.sealNumber2 || item.sealPhoto2) && (
  <div style={{ marginTop: 20 }}>
    <h4>Seal Details</h4>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      
      {/* Seal 1 */}
      <div>
        <h5>Seal 1</h5>
        {item.sealNumber1 && (
          <div style={{ marginBottom: 8 }}>
            <strong>Number:</strong> {item.sealNumber1}
          </div>
        )}
        {item.sealPhoto1 && (
          <img
            src={`${BASE_URL}/${item.sealPhoto1}`}
            alt="Seal 1"
            style={styles.image}
            onError={(e) => (e.target.style.display = "none")}
          />
        )}
      </div>

      {/* Seal 2 */}
      <div>
        <h5>Seal 2</h5>
        {item.sealNumber2 && (
          <div style={{ marginBottom: 8 }}>
            <strong>Number:</strong> {item.sealNumber2}
          </div>
        )}
        {item.sealPhoto2 && (
          <img
            src={`${BASE_URL}/${item.sealPhoto2}`}
            alt="Seal 2"
            style={styles.image}
            onError={(e) => (e.target.style.display = "none")}
          />
        )}
      </div>

    </div>
  </div>
)}
{item.containerImage && (
  <div>
    <h4>Container Image</h4>
    <img
     src={`${IMAGE_BASE}/${item.gateType}/${getGateFolder(
          item.gateType,
          item.gateNo
        )}/container/${item.containerImage}`}
      alt="Container"
      style={styles.image}
      onError={(e) => (e.target.style.display = "none")}
    />
  </div>
)}
</div>
        </div>
      ))}

      {/* MODAL */}
      {cameraItem && (
  <div style={styles.modalOverlay}>
    <div style={{ ...styles.modal, width: 500 }}>
      <h3>Seal Capture</h3>

      {!capturedImage ? (
        <>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            style={{ width: "100%", borderRadius: 8 }}
            videoConstraints={{ facingMode: "environment" }}
          />

          <button
            style={{ ...styles.manualBtn, marginTop: 10 }}
            onClick={captureImage}
          >
            Capture
          </button>
        </>
      ) : (
        <>
          <img
            src={capturedImage}
            alt="Captured"
            style={{ width: "100%", borderRadius: 8 }}
          />

          {ocrLoading ? (
            <p>Extracting seal number...</p>
          ) : (
            <>
              <div style={{ marginTop: 10 }}>
                <label>Seal Number</label>
                <input
                  style={styles.input}
                  value={sealNumber}
                  onChange={(e) => setSealNumber(e.target.value.toUpperCase())}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  style={styles.cancelBtn}
                  onClick={() => {
                    setCapturedImage(null);
                    setSealNumber("");
                  }}
                >
                  Retake
                </button>

                <button
  style={styles.manualBtn}
  onClick={submitSeal}
  disabled={sealUploading}
>
  {sealUploading ? "Uploading..." : "Submit"}
</button>
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <button style={styles.cancelBtn} onClick={closeCamera}>
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>Manual Vehicle Start</h3>

            <div style={{ marginBottom: 12 }}>
              <label>Permit Number</label>
              <input
                style={styles.input}
                value={manualPermit}
                onChange={(e) => setManualPermit(e.target.value.toUpperCase())}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Gate Type</label>
              <select
                style={styles.input}
                value={manualGateType}
                onChange={(e) => {
                  setManualGateType(e.target.value);
                  setManualGateNo("");
                }}
              >
                <option value="INGATE">INGATE</option>
                <option value="OUTGATE">OUTGATE</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Gate No</label>
              <select
                style={styles.input}
                value={manualGateNo}
                onChange={(e) => setManualGateNo(e.target.value)}
              >
                <option value="">Select Gate</option>
                {(manualGateType === "INGATE"
                  ? ["2", "4"]
                  : ["1", "3"]
                ).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                style={styles.cancelBtn}
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>

              <button style={styles.manualBtn} onClick={handleManualStart}>
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= SMALL COMPONENTS ================= */

const InputField = ({ label, value, onChange }) => (
  <div style={{ marginBottom: 15 }}>
    <div style={{ fontSize: 12, marginBottom: 5 }}>{label}</div>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={styles.input}
    />
  </div>
);

const DisplayField = ({ label, value }) => (
  <div style={{ marginBottom: 15 }}>
    <div style={{ fontSize: 12, marginBottom: 5 }}>{label}</div>
    <div style={styles.readOnly}>{value || "N/A"}</div>
  </div>
);

/* ================= STYLES ================= */

const styles = {
  container: { padding: 30, background: "#f4f6f9", minHeight: "100vh" },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { marginBottom: 20 },
  manualBtn: {
    padding: "8px 15px",
    background: "#198754",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  gateFilterRow: { display: "flex", gap: 10, marginBottom: 15 },
  gateBtn: {
    padding: "8px 15px",
    background: "#dee2e6",
    border: "none",
    borderRadius: 6,
  },
  gateActive: {
    padding: "8px 15px",
    background: "#0d6efd",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
  tabs: { display: "flex", gap: 10, marginBottom: 20 },
  tab: { padding: "8px 15px", background: "#e9ecef", border: "none" },
  tabActive: {
    padding: "8px 15px",
    background: "#0d6efd",
    color: "#fff",
    border: "none",
  },
  card: {
    background: "#fff",
    padding: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  topHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  gateInfo: { fontSize: 18, fontWeight: 600 },
  permitLabel: { fontSize: 12, color: "#6c757d" },
  permitValue: { fontSize: 18, fontWeight: 600 },
  reasonBox: {
    background: "#fff3cd",
    padding: 10,
    borderRadius: 6,
    marginBottom: 15,
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  },
  input: {
    width: "100%",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #ccc",
  },
  readOnly: {
    padding: 8,
    background: "#f8f9fa",
    borderRadius: 4,
  },
  submitBtn: {
    marginTop: 15,
    padding: "8px 15px",
    background: "#28a745",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
  cancelBtn: {
    padding: "6px 12px",
    background: "#6c757d",
    color: "#fff",
    border: "none",
    borderRadius: 4,
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    background: "#fff",
    padding: 20,
    borderRadius: 8,
    width: 350,
  },
  status: (status) => ({
    padding: "6px 12px",
    borderRadius: 4,
    fontSize: 12,
    color: "#fff",
    background:
      status === "matched"
        ? "#28a745"
        : status === "mismatch"
        ? "#dc3545"
        : status === "invalid"
        ? "#fd7e14"
        : "#6c757d",
  }),
  imageContainer: {
  marginTop: 20,
  display: "flex",
  gap: 30,
  flexWrap: "wrap",
},

image: {
  width: 250,
  borderRadius: 8,
  border: "1px solid #ddd",
},

};

