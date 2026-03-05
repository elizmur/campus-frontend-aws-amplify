import React, { useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {type Incident, IncidentPriority, IncidentStatus} from "../../types/incidentTypes.ts";
import {useAppDispatch, useAppSelector} from "../../state/hooks.ts";
import {
    closeIncidentThunk,
    getIncidentsThunk,
    updateIncidentStatusThunk
} from "../../state/slices/incidentSlice.ts";
import {usePolling} from "../../hooks/usePolling.ts";
import type {ColumnDef} from "@tanstack/react-table";
import TableTanStack from "../../components/TableTanStack.tsx";
import {PollingInline} from "../../components/PollingInline.tsx";
import {TableFilters} from "../../components/TableFilters.tsx";
import "../../styles/tables.css";

const STATUS_OPTIONS_INCIDENT: IncidentStatus[] = [
    IncidentStatus.New,
    IncidentStatus.Assign,
    IncidentStatus.InProgress,
    IncidentStatus.Resolved,
    IncidentStatus.Closed,
];

const PRIORITY_OPTIONS_INCIDENT: IncidentPriority[] = [
    IncidentPriority.P1,
    IncidentPriority.P2,
    IncidentPriority.P3,
    IncidentPriority.P4,
];

const POLL_MS = 60_000;

export const IncidentAdminTable: React.FC = () => {
    const {
        incidents,
        incidentsSyncing,
        incidentsLastSyncAt,
        incidentsNewCount,

        requestCloseByIncidentId,
        isRequestClosed,
    } = useAppSelector((s) => s.incident);

    const dispatch = useAppDispatch();
    const location = useLocation();

    const enabled = location.pathname.startsWith("/admin/incident");

    const tick = useCallback(() => {
        dispatch(getIncidentsThunk({ source: "poll" }));
    }, [dispatch]);

    usePolling({
        enabled,
        intervalMs: POLL_MS,
        isSyncing: incidentsSyncing,
        tick,
    });

    const forceRefresh = useCallback(() => {
        dispatch(getIncidentsThunk({ source: "manual" }));
    }, [dispatch]);

    const handleStatusChange = useCallback(
        (incident: Incident, nextStatus: IncidentStatus) => {
            const current = incident.status;
            if (nextStatus === current) return;

            dispatch(
                updateIncidentStatusThunk({
                    id: incident.incidentId,
                    updates: { status: nextStatus },
                })
            );
        },
        [dispatch]
    );

    const handleRequestClose = useCallback(
        (incident: Incident) => {
            if (incident.status === IncidentStatus.Closed) return;

            if (requestCloseByIncidentId?.[incident.incidentId]) return;

            dispatch(closeIncidentThunk(incident.incidentId));
        },
        [dispatch, requestCloseByIncidentId]
    );

    const columns = useMemo<ColumnDef<Incident>[]>(
        () => [
            {
                header: "ID",
                accessorKey: "incidentId",
                minSize: 200,
                cell: ({ getValue }) => getValue(),
            },
            {
                header: "ID's Ticket",
                accessorKey: "ticketIds",
                minSize: 220,
                cell: ({ getValue }) => {
                    const v = getValue<unknown>();
                    if (Array.isArray(v)) return v.join(", ");
                    return (v as string) ?? "—";
                },
            },
            {
                header: "Description",
                accessorKey: "description",
                minSize: 200,
                cell: ({ getValue }) => {
                    const value = (getValue() ?? "") as string;
                    return value.length > 80 ? value.slice(0, 80) + "…" : value;
                },
            },
            { header: "Category", accessorKey: "category" },

            {
                id: "priority",
                accessorKey: "priority",
                minSize: 80,
                filterFn: (row, columnId, filterValue) => {
                    if (!filterValue || filterValue === "ALL") return true;
                    return row.getValue(columnId) === filterValue;
                },
                cell: ({ getValue }) => getValue(),
            },
            {
                id: "status",
                accessorKey: "status",
                minSize: 150,
                filterFn: (row, columnId, filterValue) => {
                    if (!filterValue || filterValue === "ALL") return true;
                    return row.getValue(columnId) === filterValue;
                },
                cell: ({ getValue, row }) => {
                    const incident = row.original;
                    const currentIncidentStatus = getValue<IncidentStatus>();

                    if (incident.status !== IncidentStatus.Resolved) {
                        return <span>{currentIncidentStatus.replace("_", " ")}</span>;
                    }

                    return (
                        <select
                            className="table-select"
                            value={currentIncidentStatus}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                e.stopPropagation();
                                const next = e.target.value as IncidentStatus;
                                handleStatusChange(incident, next);
                            }}
                        >
                            <option value={IncidentStatus.Resolved}>
                                {IncidentStatus.Resolved.replace("_", " ")}
                            </option>
                            <option value={IncidentStatus.InProgress}>
                                {IncidentStatus.InProgress.replace("_", " ")}
                            </option>
                        </select>
                    );
                },
            },

            {
                id: "adminAction",
                header: "Close",
                minSize: 180,
                cell: ({ row }) => {
                    const incident = row.original;

                    const closeReq = requestCloseByIncidentId?.[incident.incidentId];
                    const alreadyRequested = Boolean(closeReq);

                    const canRequestClose =
                        incident.status === IncidentStatus.Resolved &&
                        !alreadyRequested &&
                        !isRequestClosed;

                    return (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            {canRequestClose ? (
                                <button
                                    className="secondary-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRequestClose(incident);
                                    }}
                                    disabled={isRequestClosed}
                                    title="Send close request to user"
                                >
                                    Request close
                                </button>
                            ) : null}
                        </div>
                    );
                },
            },

            {
                header: "Assigned by",
                accessorKey: "assignedBy",
                cell: ({ row }) => (row.original.assignedBy ? row.original.assignedBy : "—"),
            },

            {
                header: "Created at",
                accessorKey: "createdAt",
                cell: ({ getValue }) => {
                    const value = getValue<string | undefined>();
                    return value ? new Date(value).toLocaleString() : "—";
                },
            },

        ],
        [handleRequestClose, handleStatusChange, isRequestClosed, requestCloseByIncidentId]
    );

    return (
        <TableTanStack<Incident>
            title={
                <PollingInline
                    newCount={incidentsNewCount}
                    syncing={incidentsSyncing}
                    lastSyncAt={incidentsLastSyncAt}
                    onRefresh={forceRefresh}
                />
            }
            data={incidents}
            columns={columns}
            renderTopRight={(table) => (
                <TableFilters
                    table={table}
                    statusOptions={STATUS_OPTIONS_INCIDENT}
                    priorityOptions={PRIORITY_OPTIONS_INCIDENT}
                />
            )}

            isRowClickable={() => false}
            getRowClassName={(row) => {
                const inc = row.original;
                const hasCloseRequest = Boolean(requestCloseByIncidentId?.[inc.incidentId]);
                return hasCloseRequest ? "incident-close-requested" : "";
            }}
        />
    );
};
export default IncidentAdminTable;
