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

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

export function analyzeNewtonRingImage(pixels, width, height, { pxPerMm = 161, wavelengthNm = 589 } = {}) {
  if (!(pixels instanceof Uint8ClampedArray) || width < 8 || height < 8 || pixels.length < width * height * 4) {
    throw new Error("图像像素数据无效");
  }
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) throw new Error("标定系数必须大于 0");
  const gray = new Float32Array(width * height);
  const roi = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
      gray[y * width + x] = value;
      if (x >= width * 0.2 && x <= width * 0.8 && y >= height * 0.2 && y <= height * 0.8) roi.push(value);
    }
  }
  const threshold = percentile(roi, 0.16);
  let weightedX = 0;
  let weightedY = 0;
  let weightTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < width * 0.2 || x > width * 0.8 || y < height * 0.2 || y > height * 0.8) continue;
      const weight = Math.max(0, threshold - gray[y * width + x]);
      weightedX += x * weight;
      weightedY += y * weight;
      weightTotal += weight;
    }
  }
  const centerX = weightTotal ? weightedX / weightTotal : width / 2;
  const centerY = weightTotal ? weightedY / weightTotal : height / 2;
  const maxRadius = Math.floor(Math.min(width, height) * 0.47);
  const radialSum = new Float32Array(maxRadius + 1);
  const radialCount = new Uint32Array(maxRadius + 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const radius = Math.round(Math.hypot(x - centerX, y - centerY));
      if (radius <= maxRadius) {
        radialSum[radius] += gray[y * width + x];
        radialCount[radius] += 1;
      }
    }
  }
  const profile = new Float32Array(maxRadius + 1);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    const raw = radialCount[radius] ? radialSum[radius] / radialCount[radius] : 0;
    const left = radius > 0 ? radialSum[radius - 1] / Math.max(1, radialCount[radius - 1]) : raw;
    const right = radius < maxRadius ? radialSum[radius + 1] / Math.max(1, radialCount[radius + 1]) : raw;
    profile[radius] = (left + raw + right) / 3;
  }
  const peaks = [];
  for (let radius = 6; radius < maxRadius - 2; radius += 1) {
    const isPeak = profile[radius] >= profile[radius - 1] && profile[radius] >= profile[radius + 1];
    const prominence = profile[radius] - Math.min(profile[radius - 2], profile[radius + 2]);
    if (isPeak && prominence >= 4 && (!peaks.length || radius - peaks[peaks.length - 1] >= 4)) peaks.push(radius);
  }
  const usablePeaks = peaks.slice(0, 40);
  let slope = 0;
  let fitQuality = 0;
  if (usablePeaks.length >= 3) {
    const xs = usablePeaks.map((_, index) => index + 1);
    const ys = usablePeaks.map((radius) => radius ** 2);
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const numerator = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0);
    const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
    slope = denominator ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;
    const total = ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
    const residual = ys.reduce((sum, value, index) => sum + (value - (slope * xs[index] + intercept)) ** 2, 0);
    fitQuality = total ? Math.max(0, Math.min(1, 1 - residual / total)) : 0;
  }
  const curvatureRadiusM = slope > 0 ? slope * (1e-3 / pxPerMm) ** 2 / (wavelengthNm * 1e-9) : null;
  return {
    source: "current-image",
    centerX,
    centerY,
    ringCount: usablePeaks.length,
    fitQuality,
    curvatureRadiusM,
  };
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
