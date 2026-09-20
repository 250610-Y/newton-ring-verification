export const BASE_SYSTEM_RADIUS = 1 / ((213 / 161) ** 2);

export function calculateCalibratedRadius(baseRadius, basePxPerMm, pxPerMm) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) {
    throw new Error("基准曲率半径必须大于 0");
  }
  if (!Number.isFinite(basePxPerMm) || basePxPerMm <= 0 || !Number.isFinite(pxPerMm) || pxPerMm <= 0) {
    throw new Error("标定系数必须大于 0");
  }
  return baseRadius * (basePxPerMm / pxPerMm) ** 2;
}

export function verifyRadius(studentRadius, systemRadius) {
  if (!Number.isFinite(systemRadius) || systemRadius <= 0) {
    throw new Error("系统曲率半径必须大于 0");
  }
  if (!Number.isFinite(studentRadius) || studentRadius <= 0) {
    throw new Error("学生曲率半径必须大于 0");
  }
  const relativeError = Math.abs(studentRadius - systemRadius) / systemRadius;
  const epsilon = Number.EPSILON * 16;
  if (relativeError <= 0.08 + epsilon) return { status: "qualified", relativeError, label: "合格" };
  if (relativeError <= 0.2 + epsilon) return { status: "operation-error", relativeError, label: "操作误差" };
  return { status: "review", relativeError, label: "重点复核" };
}

export function filterRecords(records, query = "", status = "all") {
  const normalizedQuery = query.trim().toLowerCase();
  return records.filter((record) => {
    const matchesQuery = !normalizedQuery || record.id.toLowerCase().includes(normalizedQuery);
    const matchesStatus = status === "all" || record.status === status;
    return matchesQuery && matchesStatus;
  });
}

export function serializeRecordsCsv(records) {
  const header = "学生编号,系统曲率半径,学生曲率半径,相对误差,判定";
  const rows = records.map((record) => [
    record.id,
    record.systemRadius,
    record.studentRadius,
    `${(record.relativeError * 100).toFixed(2)}%`,
    record.label,
  ].join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}
