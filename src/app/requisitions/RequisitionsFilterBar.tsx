"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@/components/NavIcons";

interface Props {
  initialSearch: string;
  initialStatus: string;
  initialProjectId: string;
  filter?: string;
  company?: string;
  projects: Array<{ id: string; name: string; code: string }>;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_HEAD", label: "Pending Head" },
  { value: "PENDING_CHECKER", label: "Pending Checker" },
  { value: "PENDING_ACCOUNTS", label: "Pending Accounts" },
  { value: "PENDING_DIRECTOR", label: "Pending Director" },
  { value: "PENDING_MD", label: "Pending MD" },
  { value: "APPROVED", label: "Approved" },
  { value: "FORWARDED", label: "Forwarded" },
  { value: "PARTIAL_PAID", label: "Partially Paid" },
  { value: "EXECUTED", label: "Executed / Paid" },
  { value: "SETTLED", label: "Settled" },
  { value: "RETURNED", label: "Returned" },
  { value: "REJECTED", label: "Rejected" },
];

export default function RequisitionsFilterBar({
  initialSearch,
  initialStatus,
  initialProjectId,
  filter,
  company,
  projects,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchText, setSearchText] = useState(initialSearch);

  function pushQuery(overrides: {
    search?: string;
    status?: string;
    project?: string;
  }) {
    const params = new URLSearchParams();
    if (filter) params.set("filter", filter);
    if (company) params.set("company", company);
    const nextSearch = overrides.search !== undefined ? overrides.search : searchText;
    const nextStatus = overrides.status !== undefined ? overrides.status : initialStatus;
    const nextProject = overrides.project !== undefined ? overrides.project : initialProjectId;

    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextStatus) params.set("status", nextStatus);
    if (nextProject) params.set("project", nextProject);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/requisitions?${qs}` : "/requisitions");
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushQuery({ search: searchText });
  }

  const hasFilters = Boolean(initialSearch || initialStatus || initialProjectId);

  return (
    <form
      onSubmit={handleSearchSubmit}
      className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-wrap items-center gap-2"
    >
      <div className="relative flex-1 min-w-[200px]">
        <IconSearch className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by voucher #, maker, PO #, or particulars..."
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:border-gray-900 focus:outline-none"
        />
      </div>

      <select
        value={initialProjectId}
        onChange={(e) => pushQuery({ project: e.target.value })}
        className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white font-medium text-gray-700 max-w-[210px]"
        aria-label="Filter by project"
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={initialStatus}
        onChange={(e) => pushQuery({ status: e.target.value })}
        className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white font-medium text-gray-700"
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-1.5 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
      >
        {isPending ? "Filtering..." : "Search"}
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearchText("");
            pushQuery({ search: "", status: "", project: "" });
          }}
          className="px-2.5 py-1.5 rounded-md border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
        >
          Clear
        </button>
      )}
    </form>
  );
}
