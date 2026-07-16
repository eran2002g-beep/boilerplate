"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmployee,
  deleteEmployee,
  ensureCsrfToken,
  getEmployee,
  getMe,
  listEmployees,
  logout as apiLogout,
  patchEmployee,
  updateEmployee,
  uploadEmployeePhoto,
  type AuthProfile,
  type EmployeeFilters,
  type EmployeePayload,
} from "@/lib/api";
import {
  clearSession,
  getStoredUser,
  getToken,
  type StoredUser,
} from "@/lib/client-auth";
import type { Employee } from "@/lib/types";
import styles from "./employees.module.css";

type FormState = {
  name: string;
  email: string;
  role: string;
  department: string;
  phone: string;
  password: string;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  role: "",
  department: "",
  phone: "",
  password: "",
};

const emptyFilters: EmployeeFilters = { q: "", role: "", department: "" };
const DEFAULT_LIMIT = 5;
const LIMIT_OPTIONS = [1, 5, 10, 25, 50] as const;

export default function EmployeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [filters, setFilters] = useState<EmployeeFilters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfile(await getMe());
  }, []);

  const loadAll = useCallback(
    async (
      nextFilters: EmployeeFilters = filters,
      nextPage: number = page,
      nextLimit: number = limit,
    ) => {
      const data = await listEmployees({
        ...nextFilters,
        page: nextPage,
        limit: nextLimit,
      });
      setEmployees(data.employees);
      setTotal(data.total);
      setPage(data.page);
      setLimit(data.limit);
      setTotalPages(data.totalPages);
      setHasNext(data.hasNext);
      setHasPrev(data.hasPrev);

      // If we landed past the last page (e.g. after a delete), step back.
      if (data.employees.length === 0 && data.total > 0 && data.page > 1) {
        return loadAll(nextFilters, data.page - 1, nextLimit);
      }

      return data;
    },
    [filters, page, limit],
  );

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());

    (async () => {
      try {
        await ensureCsrfToken(true);
        await Promise.all([
          loadProfile(),
          loadAll(emptyFilters, 1, DEFAULT_LIMIT),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        if (String((err as Error).message).toLowerCase().includes("token")) {
          clearSession();
          router.replace("/login");
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function logout() {
    await apiLogout();
    clearSession();
    router.replace("/login");
  }

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setForm({
      name: emp.name,
      email: emp.email,
      role: emp.role,
      department: emp.department,
      phone: emp.phone || "",
      password: "",
    });
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const payload: EmployeePayload = {
      name: form.name,
      email: form.email,
      role: form.role,
      department: form.department,
      phone: form.phone || undefined,
    };

    try {
      if (editingId) {
        if (form.password) payload.password = form.password;
        await updateEmployee(editingId, payload);
        setMessage("Employee updated (PUT)");
      } else {
        if (!form.password) {
          setError("password is required");
          setBusy(false);
          return;
        }
        await createEmployee({ ...payload, password: form.password });
        setMessage("Employee created (POST)");
      }
      resetForm();
      await Promise.all([loadAll(), loadProfile()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFilter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Filters change → always restart at page 1
      await loadAll(filters, 1, limit);
      setMessage(
        `Filtered list (${[
          filters.q && `q=${filters.q}`,
          filters.role && `role=${filters.role}`,
          filters.department && `department=${filters.department}`,
        ]
          .filter(Boolean)
          .join(", ") || "no filters"})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Filter failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearFilters() {
    setFilters(emptyFilters);
    setBusy(true);
    try {
      await loadAll(emptyFilters, 1, limit);
      setMessage("Showing all employees");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function goToPage(nextPage: number) {
    setBusy(true);
    setError(null);
    try {
      await loadAll(filters, nextPage, limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Page load failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeLimit(nextLimit: number) {
    setBusy(true);
    setError(null);
    try {
      // Page size change → restart at page 1
      await loadAll(filters, 1, nextLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change page size");
    } finally {
      setBusy(false);
    }
  }

  async function patchRole(emp: Employee) {
    setBusy(true);
    setError(null);
    try {
      const nextRole = emp.role === "Engineer" ? "Senior Engineer" : "Engineer";
      await patchEmployee(emp.id, { role: nextRole });
      setMessage(`Patched role → ${nextRole}`);
      await Promise.all([loadAll(), loadProfile()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Patch failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this employee?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEmployee(id);
      if (selectedId === id) setSelectedId(null);
      if (editingId === id) resetForm();
      setMessage("Employee deleted (DELETE)");
      await Promise.all([loadAll(), loadProfile()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function viewOne(id: string) {
    setBusy(true);
    setError(null);
    try {
      const employee = await getEmployee(id);
      setSelectedId(id);
      setMessage(`Loaded ${employee.name} (GET /api/employees/${id})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(id: string, file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadEmployeePhoto(id, file);
      setMessage("Photo uploaded");
      await Promise.all([loadAll(), loadProfile()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const me = profile?.employee;
  const rangeFrom = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeTo = total === 0 ? 0 : (page - 1) * limit + employees.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>JWT · CSRF · rate-limited API</p>
          <h1 className={styles.title}>Employees</h1>
        </div>
        <div className={styles.userBar}>
          <span className={styles.muted}>
            {user?.name}
            {user?.kind ? ` (${user.kind})` : ""}
          </span>
          <button type="button" className={styles.ghost} onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {profile && (
        <section className={styles.profile}>
          <div className={styles.profileMain}>
            {me?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.photoUrl} alt="" className={styles.profileAvatar} />
            ) : (
              <div className={styles.profileAvatarPlaceholder}>
                {(profile.name || "?").slice(0, 1)}
              </div>
            )}
            <div>
              <p className={styles.eyebrow}>Your profile · GET /api/auth/me</p>
              <h2 className={styles.profileName}>{profile.name}</h2>
              <p className={styles.muted}>
                {profile.email} · {profile.kind}
              </p>
              {me ? (
                <p className={styles.muted}>
                  {me.role} · {me.department}
                  {me.phone ? ` · ${me.phone}` : ""}
                </p>
              ) : (
                <p className={styles.muted}>
                  Admin account — no employee record
                </p>
              )}
            </div>
          </div>
          {me && (
            <div className={styles.profileActions}>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => viewOne(me.id)}
                disabled={busy}
              >
                View my record
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => startEdit(me)}
                disabled={busy}
              >
                Edit my profile
              </button>
            </div>
          )}
        </section>
      )}

      {(message || error) && (
        <p className={error ? styles.error : styles.success}>
          {error || message}
        </p>
      )}

      <div className={styles.grid}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {editingId ? "Update employee (PUT)" : "Add employee (POST)"}
          </h2>
          <form className={styles.form} onSubmit={onSubmit}>
            {(
              ["name", "email", "role", "department", "phone", "password"] as const
            ).map((field) => (
              <label key={field} className={styles.label}>
                {field === "password"
                  ? editingId
                    ? "password (optional — leave blank to keep)"
                    : "password (login)"
                  : field}
                <input
                  className={styles.input}
                  type={
                    field === "email"
                      ? "email"
                      : field === "password"
                        ? "password"
                        : "text"
                  }
                  value={form[field]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [field]: e.target.value }))
                  }
                  required={field !== "phone" && !(editingId && field === "password")}
                  autoComplete={field === "password" ? "new-password" : "off"}
                  minLength={field === "password" && !editingId ? 8 : undefined}
                />
              </label>
            ))}
            <div className={styles.row}>
              <button className={styles.button} type="submit" disabled={busy}>
                {editingId ? "Save (PUT)" : "Create (POST)"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={resetForm}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>
              All employees (GET) · {total} result{total === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              className={styles.ghost}
              onClick={() =>
                loadAll(filters, page, limit).catch((e) => setError(e.message))
              }
              disabled={busy}
            >
              Refresh
            </button>
          </div>

          <form className={styles.filters} onSubmit={onFilter}>
            <label className={styles.label}>
              Search (q)
              <input
                className={styles.input}
                value={filters.q ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="name, email, role…"
              />
            </label>
            <label className={styles.label}>
              Role
              <input
                className={styles.input}
                value={filters.role ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, role: e.target.value }))
                }
                placeholder="Engineer"
              />
            </label>
            <label className={styles.label}>
              Department
              <input
                className={styles.input}
                value={filters.department ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, department: e.target.value }))
                }
                placeholder="Product"
              />
            </label>
            <div className={styles.row}>
              <button className={styles.button} type="submit" disabled={busy}>
                Apply filters
              </button>
              <button
                type="button"
                className={styles.ghost}
                onClick={clearFilters}
                disabled={busy}
              >
                Clear
              </button>
            </div>
          </form>

          <ul className={styles.list}>
            {employees.length === 0 && (
              <li className={styles.empty}>No employees match these filters.</li>
            )}
            {employees.map((emp) => (
              <li
                key={emp.id}
                className={`${styles.item} ${selectedId === emp.id ? styles.itemActive : ""} ${me?.id === emp.id ? styles.itemMine : ""}`}
              >
                <div className={styles.itemMain}>
                  {emp.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={emp.photoUrl}
                      alt=""
                      className={styles.avatar}
                    />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {emp.name.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <p className={styles.empName}>
                      {emp.name}
                      {me?.id === emp.id ? " · you" : ""}
                    </p>
                    <p className={styles.muted}>
                      {emp.role} · {emp.department}
                    </p>
                    <p className={styles.muted}>{emp.email}</p>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() => viewOne(emp.id)}
                    disabled={busy}
                  >
                    GET
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(emp)}
                    disabled={busy}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => patchRole(emp)}
                    disabled={busy}
                  >
                    PATCH role
                  </button>
                  <label className={styles.upload}>
                    Photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      hidden
                      onChange={(e) =>
                        uploadPhoto(emp.id, e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => remove(emp.id)}
                    disabled={busy}
                  >
                    DELETE
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.pagination}>
            <p className={styles.muted}>
              {total === 0
                ? "No results"
                : `Showing ${rangeFrom}–${rangeTo} of ${total}`}
              {" · "}
              Page {page} of {totalPages}
            </p>
            <div className={styles.paginationControls}>
              <label className={styles.limitLabel}>
                Per page
                <select
                  className={styles.select}
                  value={limit}
                  disabled={busy}
                  onChange={(e) => changeLimit(Number(e.target.value))}
                >
                  {LIMIT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.ghost}
                disabled={busy || !hasPrev}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.ghost}
                disabled={busy || !hasNext}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {selected && (
        <section className={styles.detail}>
          <h2 className={styles.sectionTitle}>Selected employee</h2>
          <pre className={styles.pre}>{JSON.stringify(selected, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
