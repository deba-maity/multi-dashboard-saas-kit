import { useInfiniteQuery } from "@tanstack/react-query";
import { taskStatuses, taskStatusLabels, type TaskStatus, type ApiPagination } from "@saas-kit/shared";
import { api } from "../../lib/api";
import { isDemo } from "../../lib/demo";
import { loadReport } from "../../lib/report";
import { cellText } from "../../lib/format";
import { Button } from "./Button";

type Row = Record<string, unknown>;
type BoardProps = { scope: string; search: string; onOpen: (row: Row) => void };

function TaskLane({ status, scope, search, onOpen }: BoardProps & { status: TaskStatus }) {
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: ["dashboard", "projects", scope, "board", status, search],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: "6", status, search });
      if (!isDemo) return api<{ rows: Row[]; pagination: ApiPagination }>("/tasks?" + params, {signal});
      params.set("sort", "dueDate");
      return (await loadReport("projects", params, signal)).table;
    },
    getNextPageParam: ({ pagination }) => pagination.page < pagination.pageCount ? pagination.page + 1 : undefined
  });
  const rows = data?.pages.flatMap((page) => page.rows) ?? [];
  return <section aria-label={taskStatusLabels[status] + " tasks"} className="min-w-0 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
    <h3 className="mb-3 flex items-center justify-between font-semibold">{taskStatusLabels[status]}
      <span className="rounded-full bg-white px-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{data?.pages[0].pagination.total ?? "…"}</span></h3>
    {error && <Button variant="secondary" onClick={() => refetch()}>Retry loading tasks</Button>}
    {data && !rows.length && <p className="text-sm text-zinc-500">No matching tasks</p>}
    <div className="grid gap-2">{rows.map((row) => <button key={String(row.id)} onClick={() => onOpen(row)}
      className="rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm hover:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
      <span className="block text-xs text-zinc-500">{String(row.project)}</span>
      <strong className="my-1 block text-sm">{String(row.title)}</strong>
      <span className="block text-xs text-zinc-600 dark:text-zinc-400">{String(row.assignee)} · {String(row.priority)} priority</span>
      {row.dueDate != null && <span className="mt-2 block text-xs text-zinc-600 dark:text-zinc-400">Due {cellText({key: "dueDate", label: "Due date", type: "date"}, row.dueDate)}</span>}
    </button>)}</div>
    {hasNextPage && <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>Load more tasks</Button>}
  </section>;
}

export function TaskBoard(props: BoardProps) {
  return <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {taskStatuses.map((status) => <TaskLane key={status} {...props} status={status} />)}
  </div>;
}
