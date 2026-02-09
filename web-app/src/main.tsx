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
};

type ExtractionField = {
  id: string;
  name: string;
  value: string;
  confidence: number;
  sourcePage: number;
  sourceBBox: [number, number, number, number];
  createdAt: string;
};

type Notification = {
  id: string;
  title: string;
  body: string;
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
        <h1>Project Compass</h1>
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
        <p className="role-pill">Role: {profile.role}</p>
        <nav>
          <NavLink to="/">Upload</NavLink>
          <NavLink to="/documents">Documents</NavLink>
          <NavLink to="/extracted">Extracted Data</NavLink>
          <NavLink to="/issues">Issue Queue</NavLink>
          <NavLink to="/notifications">Notifications</NavLink>
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
    setMessage(`Created document ${payload.documentId} and job ${payload.jobId}.`);
  }

  return (
    <section>
      <h2>Upload PDF</h2>
      <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={upload} disabled={!file}>Submit</button>
      <p>{message}</p>
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
    <section>
      <h2>Documents / Jobs</h2>
      <button onClick={async () => setDocs(await fetchDocuments(profile))}>Refresh</button>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.filename}</td>
              <td><span className={`badge ${doc.jobStatus}`}>{doc.jobStatus}</span></td>
              <td>{new Date(doc.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function IssueQueuePage({ profile }: { profile: DemoProfile }) {
  const [issues, setIssues] = React.useState<Array<{ id: string; details: string; status: string }>>([]);

  const load = React.useCallback(async () => {
    const docs = await fetchDocuments(profile);
    const all = await Promise.all(
      docs.map(async (doc) => {
        const data = await fetch(`${API_BASE}/documents/${doc.id}`, { headers: authHeaders(profile) }).then((r) => r.json());
        return data.issues.map((issue: { id: string; details: string; status: string }) => ({
          ...issue
        }));
      })
    );
    setIssues(all.flat());
  }, [profile]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <section>
      <h2>Issue Queue</h2>
      <button onClick={load}>Refresh</button>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id}>{issue.details} ({issue.status})</li>
        ))}
      </ul>
      {!issues.length && <p>No issues yet.</p>}
    </section>
  );
}

function ExtractedDataPage({ profile }: { profile: DemoProfile }) {
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [fields, setFields] = React.useState<ExtractionField[]>([]);
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
    setFields(data.fields ?? []);
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
    <section>
      <h2>Extracted Data</h2>
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
      {loading && <p>Loading extraction...</p>}
      {!loading && selectedId && (
        <>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
                <th>Confidence</th>
                <th>Source Page</th>
                <th>Source Box</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id}>
                  <td>{field.name}</td>
                  <td>{field.value}</td>
                  <td>{Math.round(field.confidence * 100)}%</td>
                  <td>{field.sourcePage}</td>
                  <td>{JSON.stringify(field.sourceBBox)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!fields.length && <p>No extracted fields yet for this document.</p>}
          <h3>Raw JSON Output</h3>
          <pre className="json-box">{rawJson}</pre>
        </>
      )}
      {!selectedId && <p>Select a document to view extraction output.</p>}
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
    <section>
      <h2>Notifications</h2>
      <button onClick={load}>Refresh</button>
      <ul>
        {notifications.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <div>{item.body}</div>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
      {!notifications.length && <p>No notifications yet.</p>}
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
          <Route path="/issues" element={<IssueQueuePage profile={profile} />} />
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
