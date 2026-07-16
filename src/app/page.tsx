"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createEmployee,
  deleteEmployee,
  ensureCsrfToken,
  getEmployee,
  getMe,
  listEmployees,
  login,
  logout,
  patchEmployee,
  updateEmployee,
  uploadEmployeePhoto,
} from "@/lib/api";

type LogEntry = { name: string; ok: boolean; detail: string };

async function tinyPngFile(): Promise<File> {
  // 1x1 transparent PNG
  const bytes = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ), (c) => c.charCodeAt(0));
  return new File([bytes], "probe.png", { type: "image/png" });
}
import {
  clearSession,
  getStoredUser,
  getToken,
  type StoredUser,
} from "@/lib/client-auth";

export default function Home() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    /// If the user is not logged in, redirect to the login page
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    
    let cancelled = false;

    async function run() {
      const entries: LogEntry[] = [];

      async function call<T>(
        name: string,
        fn: () => Promise<T>,
      ): Promise<T | undefined> {
        try {
          const result = await fn();
          console.log(`[api] ${name}`, result);
          entries.push({
            name,
            ok: true,
            detail: JSON.stringify(result ?? null, null, 2),
          });
          if (!cancelled) setLogs([...entries]);
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[api] ${name}`, err);
          entries.push({ name, ok: false, detail: message });
          if (!cancelled) setLogs([...entries]);
          return undefined;
        }
      }

      await call("login", () =>
        login("admin@company.com", "admin123"),
      );

      await call("ensureCsrfToken", () => ensureCsrfToken());

      await call("getMe", () => getMe());

      const listed = await call("listEmployees", () => listEmployees());

      const firstId = listed?.employees[0]?.id;
      if (firstId) {
        await call("getEmployee", () => getEmployee(firstId));
      } else {
        console.warn("[api] getEmployee skipped — no employees in list");
        entries.push({
          name: "getEmployee",
          ok: false,
          detail: "skipped — no employees",
        });
        if (!cancelled) setLogs([...entries]);
      }

      const stamp = Date.now();
      const created = await call("createEmployee", () =>
        createEmployee({
          name: `API Probe ${stamp}`,
          email: `api.probe.${stamp}@company.com`,
          role: "Engineer",
          department: "Engineering",
          phone: "555-0100",
          password: "probe1234",
        }),
      );

      if (created?.id) {
        await call("updateEmployee", () =>
          updateEmployee(created.id, {
            name: `API Probe Updated ${stamp}`,
            email: created.email,
            role: "Senior Engineer",
            department: "Engineering",
            phone: "555-0101",
          }),
        );

        await call("patchEmployee", () =>
          patchEmployee(created.id, { role: "Staff Engineer" }),
        );

        const photo = await tinyPngFile();
        await call("uploadEmployeePhoto", () =>
          uploadEmployeePhoto(created.id, photo),
        );

        await call("deleteEmployee", async () => {
          await deleteEmployee(created.id);
          return { deleted: created.id };
        });
      } else {
        for (const name of [
          "updateEmployee",
          "patchEmployee",
          "uploadEmployeePhoto",
          "deleteEmployee",
        ]) {
          console.warn(`[api] ${name} skipped — createEmployee failed`);
          entries.push({
            name,
            ok: false,
            detail: "skipped — createEmployee failed",
          });
        }
        if (!cancelled) setLogs([...entries]);
      }

      await call("logout", async () => {
        await logout();
        return { ok: true };
      });

      if (!cancelled) setDone(true);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: "var(--font-geist-mono), monospace", padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
        API probe
      </h1>
      <p>
        Calling every export in <code>src/lib/api.ts</code> — check the browser
        console for results.
      </p>
      <p>{done ? "Done." : "Running…"}</p>
      <ol>
        {logs.map((entry) => (
          <li key={entry.name} style={{ marginBottom: 12 }}>
            <strong style={{ color: entry.ok ? "green" : "crimson" }}>
              {entry.name}
            </strong>
            <pre
              style={{
                margin: "4px 0 0",
                whiteSpace: "pre-wrap",
                fontSize: 12,
                maxHeight: 160,
                overflow: "auto",
                background: "#f4f4f4",
                padding: 8,
              }}
            >
              {entry.detail}
            </pre>
          </li>
        ))}
      </ol>
    </main>
  );
}