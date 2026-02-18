import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const PROFILE_STORAGE_KEY = "pc-demo-profile";

type DemoProfile = {
  id: string;
  label: string;
  role: "project_manager" | "viewer" | "site_admin";
};

const DEMO_PROFILES: DemoProfile[] = [
  { id: "pm-demo", label: "Project Manager", role: "project_manager" },
  { id: "viewer-demo", label: "Viewer", role: "viewer" },
  { id: "admin-demo", label: "Site Admin", role: "site_admin" }
];

type Doc = {
  id: string;
  filename: string;
  createdAt: string;
  jobStatus: string;
  jobId: string;
  taskId: string;
  completedAt?: string;
  durationMs?: number;
};

type TaskRow = {
  recordId: string;
  documentId: string;
  projectName: string;
  gcName: string;
  scName: string;
  trade: string;
  taskId: string;
  taskName: string;
  locationPath: string;
  upstreamTaskId: string;
  downstreamTaskId: string;
  dependencyType: string;
  lagDays: number;
  plannedStart: string;
  plannedFinish: string;
  durationDays: number;
  scAvailableFrom: string;
  scAvailableTo: string;
  allocationPct: number;
  constraintType: string;
  constraintNote: string;
  constraintImpactDays: number;
  status: string;
  percentComplete: number;
  sourcePage: number;
  sourceSnippet: string;
  extractedAt: string;
};

type Notification = {
  id: string;
  taskId?: string;
  documentId?: string;
  title: string;
  body: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  createdAt: string;
};

function authHeaders(profile: DemoProfile): HeadersInit {
  return {
    "x-user-id": profile.id,
    "x-user-role": profile.role
  };
}

async function fetchDocuments(profile: DemoProfile): Promise<Doc[]> {
  const response = await fetch(`${API_BASE}/documents`, { headers: authHeaders(profile) });
  if (!response.ok) return [];
  return (await response.json()) as Doc[];
}

function formatDuration(durationMs?: number): string {
  if (!durationMs || durationMs < 0) return "-";
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function Shell({
  children,
  profile,
  setProfile
}: {
  children: React.ReactNode;
  profile: DemoProfile;
  setProfile: (profile: DemoProfile) => void;
}) {
  return (
    <div className="layout">
      <aside>
        <div className="brand">
          <p className="eyebrow">Operations Console</p>
          <h1>Project Compass</h1>
        </div>
        <label className="profile-switcher">
          Active demo user
          <select
            value={profile.id}
            onChange={(event) => {
              const selected = DEMO_PROFILES.find((item) => item.id === event.target.value);
              if (selected) setProfile(selected);
            }}
          >
            {DEMO_PROFILES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <p className="role-pill">Role: {profile.role.replace("_", " ")}</p>
        <nav>
          <NavLink to="/">
            <span>Upload</span>
          </NavLink>
          <NavLink to="/documents">
            <span>Documents</span>
          </NavLink>
          <NavLink to="/extracted">
            <span>Extracted Data</span>
          </NavLink>
          <NavLink to="/notifications">
            <span>Notifications</span>
          </NavLink>
        </nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function UploadPage({ profile }: { profile: DemoProfile }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [message, setMessage] = React.useState("No upload started.");

  async function upload() {
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${API_BASE}/documents`, {
      method: "POST",
      headers: authHeaders(profile),
      body: form
    });

    if (!response.ok) {
      setMessage("Upload failed.");
      return;
    }

    const payload = await response.json();
    setMessage(`Created document ${payload.documentId}, job ${payload.jobId}, task ${payload.taskId}.`);
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>Upload PDF</h2>
        <p>Submit construction schedules and run extraction jobs.</p>
      </div>
      <div className="stack">
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div>
          <button onClick={upload} disabled={!file}>Submit</button>
        </div>
        <p className="muted">{message}</p>
      </div>
    </section>
  );
}

function DocumentsPage({ profile }: { profile: DemoProfile }) {
  const [docs, setDocs] = React.useState<Doc[]>([]);

  React.useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      const nextDocs = await fetchDocuments(profile);
      if (!mounted) return;
      setDocs(nextDocs);

      const hasInFlightJobs = nextDocs.some((doc) => doc.jobStatus === "queued" || doc.jobStatus === "processing");
      if (hasInFlightJobs) timer = setTimeout(load, 3000);
    };

    load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [profile]);

  return (
    <section className="panel">
      <div className="section-head section-head-row">
        <div>
          <h2>Documents / Jobs</h2>
          <p>Track ingestion and extraction run progress in real time.</p>
        </div>
        <button onClick={async () => setDocs(await fetchDocuments(profile))}>Refresh</button>
      </div>
      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Task ID</th>
            <th>Status</th>
            <th>Created</th>
            <th>Finished</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.filename}</td>
              <td>{doc.taskId || "-"}</td>
              <td><span className={`badge ${doc.jobStatus}`}>{doc.jobStatus}</span></td>
              <td>{new Date(doc.createdAt).toLocaleString()}</td>
              <td>{doc.completedAt ? new Date(doc.completedAt).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function ExtractedDataPage({ profile }: { profile: DemoProfile }) {
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [selectedTaskId, setSelectedTaskId] = React.useState("");
  const [taskRows, setTaskRows] = React.useState<TaskRow[]>([]);
  const [rawJson, setRawJson] = React.useState<string>("{}");
  const [loading, setLoading] = React.useState(false);

  const loadDocs = React.useCallback(async () => {
    const items = await fetchDocuments(profile);
    setDocs(items);
    if (!selectedId && items[0]) setSelectedId(items[0].id);
  }, [profile, selectedId]);

  const loadDetail = React.useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const response = await fetch(`${API_BASE}/documents/${selectedId}`, { headers: authHeaders(profile) });
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const data = await response.json();
    setSelectedTaskId(String(data?.job?.taskId ?? ""));
    setTaskRows(data.taskRows ?? []);
    setRawJson(JSON.stringify(data, null, 2));
    setLoading(false);
  }, [profile, selectedId]);

  React.useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  React.useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function downloadCsv() {
    if (!selectedId) return;
    const response = await fetch(`${API_BASE}/documents/${selectedId}/export.csv`, {
      headers: authHeaders(profile)
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const doc = docs.find((item) => item.id === selectedId);
    const filename = `${(doc?.filename ?? "document").replace(/\.pdf$/i, "")}-extraction.csv`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>Extracted Data</h2>
        <p>Inspect normalized task records and download structured outputs.</p>
        {selectedTaskId && <p className="muted">Processing Task ID: {selectedTaskId}</p>}
      </div>
      <div className="toolbar">
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select a document</option>
          {docs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.filename} ({doc.jobStatus})
            </option>
          ))}
        </select>
        <button onClick={loadDocs}>Refresh Documents</button>
        <button onClick={loadDetail} disabled={!selectedId}>Refresh Details</button>
        <button onClick={downloadCsv} disabled={!selectedId}>Download CSV</button>
      </div>
      {loading && <p className="muted">Loading extraction...</p>}
      {!loading && selectedId && (
        <>
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>Row ID</th>
                <th>Task</th>
                <th>Task Ref ID</th>
                <th>Subcontractor</th>
                <th>Trade</th>
                <th>Dependency</th>
                <th>Start Timestamp</th>
                <th>Finish Timestamp</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((row) => (
                <tr key={row.recordId}>
                  <td>{row.recordId}</td>
                  <td>{row.taskName || row.taskId || "(unknown task)"}</td>
                  <td>{row.taskId || "-"}</td>
                  <td>{row.scName || "-"}</td>
                  <td>{row.trade || "-"}</td>
                  <td>{row.dependencyType} {row.lagDays ? `(${row.lagDays}d)` : ""}</td>
                  <td>{row.plannedStart || "-"}</td>
                  <td>{row.plannedFinish || "-"}</td>
                  <td>{row.status} ({Math.round(row.percentComplete)}%)</td>
                  <td>p{row.sourcePage}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!taskRows.length && <p className="muted">No extracted rows yet for this document.</p>}
          <h3>Raw JSON Output</h3>
          <pre className="json-box">{rawJson}</pre>
        </>
      )}
      {!selectedId && <p className="muted">Select a document to view extraction output.</p>}
    </section>
  );
}

function NotificationsPage({ profile }: { profile: DemoProfile }) {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);

  const load = React.useCallback(async () => {
    const response = await fetch(`${API_BASE}/notifications`, {
      headers: authHeaders(profile)
    });
    if (!response.ok) return;
    setNotifications(await response.json());
  }, [profile]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="panel">
      <div className="section-head section-head-row">
        <div>
          <h2>Notifications</h2>
          <p>System and workflow alerts across projects.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>
      <ul className="stack-list">
        {notifications.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <div>{item.body}</div>
            <small>Task: {item.taskId || "-"} | Document: {item.documentId || "-"}</small>
            <small>Finished: {item.completedAt ? new Date(item.completedAt).toLocaleString() : "-"}</small>
            <small>Duration: {item.durationMs ? formatDuration(item.durationMs) : "-"}</small>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
      {!notifications.length && <p className="muted">No notifications yet.</p>}
    </section>
  );
}

function App() {
  const [profile, setProfile] = React.useState<DemoProfile>(() => {
    const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
    return DEMO_PROFILES.find((item) => item.id === saved) ?? DEMO_PROFILES[0];
  });

  React.useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, profile.id);
  }, [profile]);

  return (
    <BrowserRouter>
      <Shell profile={profile} setProfile={setProfile}>
        <Routes>
          <Route path="/" element={<UploadPage profile={profile} />} />
          <Route path="/documents" element={<DocumentsPage profile={profile} />} />
          <Route path="/extracted" element={<ExtractedDataPage profile={profile} />} />
          <Route path="/notifications" element={<NotificationsPage profile={profile} />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
