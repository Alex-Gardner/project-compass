import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Doc = {
  id: string;
  filename: string;
  createdAt: string;
  jobStatus: string;
  jobId: string;
};

type Notification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <aside>
        <h1>Project Compass</h1>
        <nav>
          <NavLink to="/">Upload</NavLink>
          <NavLink to="/documents">Documents</NavLink>
          <NavLink to="/issues">Issue Queue</NavLink>
          <NavLink to="/notifications">Notifications</NavLink>
        </nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function UploadPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [message, setMessage] = React.useState("No upload started.");

  async function upload() {
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${API_BASE}/documents`, {
      method: "POST",
      headers: { "x-user-id": "dev-user" },
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

function DocumentsPage() {
  const [docs, setDocs] = React.useState<Doc[]>([]);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const response = await fetch(`${API_BASE}/documents`);
      if (!response.ok || !mounted) return;
      setDocs(await response.json());
    };

    load();
    const timer = setInterval(load, 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section>
      <h2>Documents / Jobs</h2>
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

function IssueQueuePage() {
  const [issues, setIssues] = React.useState<Array<{ id: string; details: string; status: string }>>([]);

  React.useEffect(() => {
    const load = async () => {
      const docs = await fetch(`${API_BASE}/documents`).then((r) => r.json() as Promise<Doc[]>);
      const all = await Promise.all(
        docs.map(async (doc) => {
          const data = await fetch(`${API_BASE}/documents/${doc.id}`).then((r) => r.json());
          return data.issues.map((issue: { id: string; details: string; status: string }) => ({
            ...issue
          }));
        })
      );
      setIssues(all.flat());
    };

    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section>
      <h2>Issue Queue</h2>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id}>{issue.details} ({issue.status})</li>
        ))}
      </ul>
      {!issues.length && <p>No issues yet.</p>}
    </section>
  );
}

function NotificationsPage() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);

  React.useEffect(() => {
    const load = async () => {
      const response = await fetch(`${API_BASE}/notifications`, {
        headers: { "x-user-id": "dev-user" }
      });
      if (!response.ok) return;
      setNotifications(await response.json());
    };

    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section>
      <h2>Notifications</h2>
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
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/issues" element={<IssueQueuePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
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
