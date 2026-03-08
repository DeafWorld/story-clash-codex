import { useEffect, useMemo, useState } from "react";
import { buildEvent, useAnalytics } from "@factory/analytics";
import type { ToolMetric, ToolResult } from "@factory/niche-config";
import type { ToolComponentProps } from "./index";

export interface EtsySurfacePreset {
  id: string;
  label: string;
  recommendedWidth: number;
  recommendedHeight: number;
  minimumWidth: number;
  minimumHeight: number;
  notes: string;
}

export const etsySurfacePresets: EtsySurfacePreset[] = [
  {
    id: "listing-photo",
    label: "Listing photo",
    recommendedWidth: 2000,
    recommendedHeight: 2000,
    minimumWidth: 635,
    minimumHeight: 635,
    notes: "Square-first exports give Etsy thumbnails and zoom views more breathing room."
  },
  {
    id: "shop-icon",
    label: "Shop icon",
    recommendedWidth: 500,
    recommendedHeight: 500,
    minimumWidth: 500,
    minimumHeight: 500,
    notes: "Keep the mark centered so it survives tight avatar crops."
  },
  {
    id: "profile-photo",
    label: "Profile photo",
    recommendedWidth: 400,
    recommendedHeight: 400,
    minimumWidth: 400,
    minimumHeight: 400,
    notes: "Square portraits hold up better across mobile and desktop."
  },
  {
    id: "big-banner",
    label: "Big banner",
    recommendedWidth: 1600,
    recommendedHeight: 400,
    minimumWidth: 1200,
    minimumHeight: 300,
    notes: "A 4 to 1 crop works best when the message sits in the center band."
  },
  {
    id: "mini-banner",
    label: "Mini banner",
    recommendedWidth: 1600,
    recommendedHeight: 213,
    minimumWidth: 1200,
    minimumHeight: 160,
    notes: "Mini banners are narrow, so edge-heavy artwork usually fails."
  },
  {
    id: "order-receipt-banner",
    label: "Order receipt banner",
    recommendedWidth: 760,
    recommendedHeight: 100,
    minimumWidth: 760,
    minimumHeight: 100,
    notes: "Keep the layout lean so small receipt views stay readable."
  }
];

export type CropPreference = "center" | "top" | "preserve";

export interface EtsyToolInput {
  presetId: string;
  width: number;
  height: number;
  cropPreference: CropPreference;
}

export interface EtsyToolResult extends ToolResult {
  aspectRatio: string;
  targetWidth: number;
  targetHeight: number;
  qualityStatus: "excellent" | "usable" | "risky";
  qualityWarning?: string;
  cropGuidance: string;
  resizeGuidance: string;
}

const STORAGE_KEY = "lump-zero:etsy-image-helper";

export function getPresetById(presetId: string): EtsySurfacePreset {
  const preset = etsySurfacePresets.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error(`Unknown Etsy preset: ${presetId}`);
  }
  return preset;
}

export function aspectRatioLabel(width: number, height: number): string {
  const gcd = greatestCommonDivisor(width, height);
  return `${width / gcd}:${height / gcd}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function describeCropDelta(width: number, height: number, cropPreference: CropPreference): string {
  if (width === 0 && height === 0) {
    return "The source already matches the target ratio, so export at the recommended size without adding a fresh crop.";
  }

  if (width > 0) {
    const cropHint = cropPreference === "top" ? "Trim the extra width while keeping the top-weighted subject steady." : "Center-crop the extra width so the key subject stays balanced.";
    return `${cropHint} Remove about ${width}px from the width before export.`;
  }

  if (cropPreference === "preserve") {
    return `Your source is taller than the target. Resize to fit the width, then add quiet background or padding instead of trimming roughly ${height}px from the height.`;
  }

  return `Your source is taller than the target. ${cropPreference === "top" ? "Trim from the bottom first" : "Center-crop the height"} and remove about ${height}px before export.`;
}

export function calculateEtsyImageResult(input: EtsyToolInput): EtsyToolResult {
  const preset = getPresetById(input.presetId);
  const currentRatio = input.width / input.height;
  const targetRatio = preset.recommendedWidth / preset.recommendedHeight;
  let cropWidth = 0;
  let cropHeight = 0;

  if (currentRatio > targetRatio) {
    const targetWidthAtCurrentHeight = Math.round(input.height * targetRatio);
    cropWidth = Math.max(0, input.width - targetWidthAtCurrentHeight);
  } else if (currentRatio < targetRatio) {
    const targetHeightAtCurrentWidth = Math.round(input.width / targetRatio);
    cropHeight = Math.max(0, input.height - targetHeightAtCurrentWidth);
  }

  let qualityStatus: EtsyToolResult["qualityStatus"] = "excellent";
  let qualityWarning: string | undefined;

  if (input.width < preset.minimumWidth || input.height < preset.minimumHeight) {
    qualityStatus = "risky";
    qualityWarning = `This source is below the safer minimum for ${preset.label.toLowerCase()}. Start from a larger original if you can.`;
  } else if (input.width < preset.recommendedWidth || input.height < preset.recommendedHeight) {
    qualityStatus = "usable";
    qualityWarning = `This source can work, but it sits below the recommended export target for ${preset.label.toLowerCase()}. Avoid heavy recropping.`;
  }

  const cropGuidance = describeCropDelta(cropWidth, cropHeight, input.cropPreference);
  const resizeGuidance = `Export at ${preset.recommendedWidth} by ${preset.recommendedHeight} pixels (${aspectRatioLabel(
    preset.recommendedWidth,
    preset.recommendedHeight
  )}) for ${preset.label.toLowerCase()}. ${preset.notes}`;

  const metrics: ToolMetric[] = [
    { label: "Target", value: `${preset.recommendedWidth} x ${preset.recommendedHeight}px` },
    { label: "Aspect ratio", value: aspectRatioLabel(preset.recommendedWidth, preset.recommendedHeight) },
    { label: "Quality", value: qualityStatus }
  ];

  const summary = `${preset.label}: export ${preset.recommendedWidth}x${preset.recommendedHeight} (${aspectRatioLabel(
    preset.recommendedWidth,
    preset.recommendedHeight
  )}). Source ${input.width}x${input.height} is ${qualityStatus}. ${qualityWarning ?? "Source quality is comfortably above the recommended target."} ${cropGuidance}`;

  return {
    headline: `${preset.label} export plan`,
    summary,
    metrics,
    guidance: [resizeGuidance, cropGuidance],
    warnings: qualityWarning ? [qualityWarning] : undefined,
    aspectRatio: aspectRatioLabel(preset.recommendedWidth, preset.recommendedHeight),
    targetWidth: preset.recommendedWidth,
    targetHeight: preset.recommendedHeight,
    qualityStatus,
    qualityWarning,
    cropGuidance,
    resizeGuidance
  };
}

export function EtsyImageHelperTool({ siteId, pageId, defaultValues, resourceHref = "/resources/etsy-image-prep-checklist/" }: ToolComponentProps) {
  const analytics = useAnalytics();
  const [presetId, setPresetId] = useState(String(defaultValues?.presetId ?? "listing-photo"));
  const [width, setWidth] = useState(String(defaultValues?.width ?? 2000));
  const [height, setHeight] = useState(String(defaultValues?.height ?? 2000));
  const [cropPreference, setCropPreference] = useState<CropPreference>(String(defaultValues?.cropPreference ?? "center") as CropPreference);
  const [copied, setCopied] = useState(false);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const persisted = JSON.parse(raw) as Partial<{ presetId: string; width: string; height: string; cropPreference: CropPreference }>;
      if (persisted.presetId) {
        setPresetId(persisted.presetId);
      }
      if (persisted.width) {
        setWidth(persisted.width);
      }
      if (persisted.height) {
        setHeight(persisted.height);
      }
      if (persisted.cropPreference) {
        setCropPreference(persisted.cropPreference);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        presetId,
        width,
        height,
        cropPreference
      })
    );
  }, [cropPreference, height, presetId, width]);

  const validationMessage = useMemo(() => {
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);

    if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) {
      return "Enter numeric width and height values before using the helper.";
    }

    if (parsedWidth <= 0 || parsedHeight <= 0) {
      return "Width and height must both be greater than zero.";
    }

    return null;
  }, [height, width]);

  const result = useMemo(() => {
    if (validationMessage) {
      return null;
    }

    return calculateEtsyImageResult({
      presetId,
      width: Number(width),
      height: Number(height),
      cropPreference
    });
  }, [cropPreference, height, presetId, validationMessage, width]);

  useEffect(() => {
    if (!result) {
      return;
    }

    analytics.track(
      buildEvent({
        type: "tool_used",
        siteId,
        pageId,
        detail: presetId
      })
    );
  }, [analytics, pageId, presetId, result, siteId]);

  async function copySummary() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(result.summary);
    analytics.track(
      buildEvent({
        type: "summary_copied",
        siteId,
        pageId,
        detail: presetId
      })
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function printSummary() {
    if (!result) {
      return;
    }

    analytics.track(
      buildEvent({
        type: "tool_printed",
        siteId,
        pageId,
        detail: presetId
      })
    );
    setPrinted(true);
    window.print();
    window.setTimeout(() => setPrinted(false), 1800);
  }

  return (
    <div className="tool-shell">
      <div>
        <p className="eyebrow">Live preset checker</p>
        <h2 className="section-title" style={{ marginTop: "0.45rem" }}>
          Etsy image helper
        </h2>
        <p className="section-copy">
          Enter the current source size and get an Etsy-specific target, crop note, and quality verdict instantly.
        </p>
      </div>

      <div className="form-grid">
        <div className="field-stack">
          <label htmlFor="preset">Surface preset</label>
          <select id="preset" name="preset" value={presetId} onChange={(event) => setPresetId(event.target.value)}>
            {etsySurfacePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-stack">
          <label htmlFor="width">Source width (px)</label>
          <input id="width" name="width" type="number" inputMode="numeric" min="1" value={width} onChange={(event) => setWidth(event.target.value)} />
        </div>

        <div className="field-stack">
          <label htmlFor="height">Source height (px)</label>
          <input id="height" name="height" type="number" inputMode="numeric" min="1" value={height} onChange={(event) => setHeight(event.target.value)} />
        </div>

        <fieldset className="field-stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="legend-title">Crop preference</legend>
          <div className="radio-row">
            <label className="radio-chip" htmlFor="crop-center">
              <input id="crop-center" type="radio" name="cropPreference" checked={cropPreference === "center"} onChange={() => setCropPreference("center")} />
              Center crop
            </label>
            <label className="radio-chip" htmlFor="crop-top">
              <input id="crop-top" type="radio" name="cropPreference" checked={cropPreference === "top"} onChange={() => setCropPreference("top")} />
              Top-weighted
            </label>
            <label className="radio-chip" htmlFor="crop-preserve">
              <input
                id="crop-preserve"
                type="radio"
                name="cropPreference"
                checked={cropPreference === "preserve"}
                onChange={() => setCropPreference("preserve")}
              />
              Preserve more source
            </label>
          </div>
        </fieldset>
      </div>

      {validationMessage ? (
        <div className="warning-box">{validationMessage}</div>
      ) : result ? (
        <div className="result-grid">
          {result.warnings?.map((warning) => (
            <div key={warning} className="warning-box">
              {warning}
            </div>
          ))}
          <div className="metric-grid">
            {result.metrics.map((metric) => (
              <div key={metric.label} className="metric-card">
                <span className="metric-label">{metric.label}</span>
                <strong className="metric-value">{metric.value}</strong>
              </div>
            ))}
          </div>
          <div className="result-card">
            <h3>{result.headline}</h3>
            <p>{result.resizeGuidance}</p>
            <p>{result.cropGuidance}</p>
          </div>
          <div className="result-card">
            <h3>Copyable prep summary</h3>
            <p>{result.summary}</p>
          </div>
          <div className="action-row">
            <button className="button button-primary" type="button" onClick={() => void copySummary()}>
              {copied ? "Summary copied" : "Copy summary"}
            </button>
            <button className="button button-secondary" type="button" onClick={printSummary}>
              {printed ? "Print opened" : "Print summary"}
            </button>
            <a className="button button-secondary" href={resourceHref}>
              Open checklist
            </a>
          </div>
          <div className="notice-card compact-card">
            <h3 className="section-title">What to do next</h3>
            <p className="section-copy">Confirm the target ratio, adjust the crop before export, and use the checklist to keep the same prep flow across every Etsy surface.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
