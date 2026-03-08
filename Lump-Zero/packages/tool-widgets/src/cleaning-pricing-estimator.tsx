import { useEffect, useMemo, useState } from "react";
import { buildEvent, useAnalytics } from "@factory/analytics";
import type { ToolMetric, ToolResult } from "@factory/niche-config";
import type { ToolComponentProps } from "./index";

export type CleaningServiceType = "standard" | "deep" | "move-out";
export type CleaningFrequency = "one-time" | "weekly" | "biweekly" | "monthly";

export interface CleaningToolInput {
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  serviceType: CleaningServiceType;
  frequency: CleaningFrequency;
  addOns: string[];
}

export interface CleaningPricingResult extends ToolResult {
  lowEstimate: number;
  highEstimate: number;
  averageEstimate: number;
  pricingNotes: string[];
}

const ADD_ON_PRICES: Record<string, number> = {
  fridge: 20,
  oven: 25,
  windows: 30,
  laundry: 15
};

const STORAGE_KEY = "lump-zero:cleaning-pricing";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function calculateCleaningEstimate(input: CleaningToolInput): CleaningPricingResult {
  const baseRatePerSquareFoot: Record<CleaningServiceType, number> = {
    standard: 0.11,
    deep: 0.16,
    "move-out": 0.18
  };

  const frequencyDiscount: Record<CleaningFrequency, number> = {
    "one-time": 1,
    weekly: 0.86,
    biweekly: 0.92,
    monthly: 0.97
  };

  const bedroomCharge = input.bedrooms * 8;
  const bathroomCharge = input.bathrooms * 12;
  const addOnTotal = input.addOns.reduce((sum, addOn) => sum + (ADD_ON_PRICES[addOn] ?? 0), 0);
  const rawBase = input.squareFootage * baseRatePerSquareFoot[input.serviceType] + bedroomCharge + bathroomCharge + addOnTotal;
  const adjusted = rawBase * frequencyDiscount[input.frequency];
  const lowEstimate = Math.max(60, Math.round(adjusted * 0.9));
  const highEstimate = Math.round(adjusted * 1.15);
  const averageEstimate = Math.round((lowEstimate + highEstimate) / 2);

  const metrics: ToolMetric[] = [
    { label: "Estimate range", value: `${currency(lowEstimate)} to ${currency(highEstimate)}` },
    { label: "Average target", value: currency(averageEstimate) },
    { label: "Service type", value: input.serviceType.replace("-", " ") }
  ];

  const pricingNotes = [
    `${input.frequency === "one-time" ? "One-time work" : `${input.frequency} service`} changes the estimate because recurring work usually reduces setup time.`,
    `${input.bedrooms} bedrooms and ${input.bathrooms} bathrooms add labor even when square footage looks moderate.`,
    input.addOns.length ? `Selected add-ons contribute ${currency(addOnTotal)} to the working estimate before the range buffer.` : "No add-ons selected, so the estimate reflects core cleaning labor only."
  ];

  const summary = `Cleaning estimate for a ${input.squareFootage} sq ft ${input.serviceType} service: ${currency(lowEstimate)} to ${currency(highEstimate)} with an average target of ${currency(averageEstimate)}. ${pricingNotes.join(" ")}`;

  return {
    headline: "Working price range",
    summary,
    metrics,
    guidance: [
      "Use the average target as your quoting anchor, then move up or down based on travel, condition, and client complexity.",
      "Treat deep cleans and move-out work as separate offers so recurring clients do not expect the heavier scope for the lower recurring rate."
    ],
    warnings: input.squareFootage < 700 ? ["Very small homes often need a minimum visit price even if the square-foot math comes out lower."] : undefined,
    lowEstimate,
    highEstimate,
    averageEstimate,
    pricingNotes
  };
}

function toggleAddOn(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function CleaningPricingEstimator({ siteId, pageId, defaultValues, resourceHref = "/resources/cleaning-pricing-checklist/" }: ToolComponentProps) {
  const analytics = useAnalytics();
  const [squareFootage, setSquareFootage] = useState(String(defaultValues?.squareFootage ?? 1400));
  const [bedrooms, setBedrooms] = useState(String(defaultValues?.bedrooms ?? 3));
  const [bathrooms, setBathrooms] = useState(String(defaultValues?.bathrooms ?? 2));
  const [serviceType, setServiceType] = useState(String(defaultValues?.serviceType ?? "standard") as CleaningServiceType);
  const [frequency, setFrequency] = useState(String(defaultValues?.frequency ?? "one-time") as CleaningFrequency);
  const [addOns, setAddOns] = useState<string[]>([]);
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
      const persisted = JSON.parse(raw) as Partial<{ squareFootage: string; bedrooms: string; bathrooms: string; serviceType: CleaningServiceType; frequency: CleaningFrequency; addOns: string[] }>;
      if (persisted.squareFootage) {
        setSquareFootage(persisted.squareFootage);
      }
      if (persisted.bedrooms) {
        setBedrooms(persisted.bedrooms);
      }
      if (persisted.bathrooms) {
        setBathrooms(persisted.bathrooms);
      }
      if (persisted.serviceType) {
        setServiceType(persisted.serviceType);
      }
      if (persisted.frequency) {
        setFrequency(persisted.frequency);
      }
      if (persisted.addOns) {
        setAddOns(persisted.addOns);
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
        squareFootage,
        bedrooms,
        bathrooms,
        serviceType,
        frequency,
        addOns
      })
    );
  }, [addOns, bathrooms, bedrooms, frequency, serviceType, squareFootage]);

  const validationMessage = useMemo(() => {
    const values = [Number(squareFootage), Number(bedrooms), Number(bathrooms)];
    if (values.some((value) => !Number.isFinite(value))) {
      return "Enter numeric values for square footage, bedrooms, and bathrooms.";
    }

    if (Number(squareFootage) <= 0 || Number(bedrooms) < 0 || Number(bathrooms) < 0) {
      return "Use a square footage greater than zero and room counts that are zero or higher.";
    }

    return null;
  }, [bathrooms, bedrooms, squareFootage]);

  const result = useMemo(() => {
    if (validationMessage) {
      return null;
    }

    return calculateCleaningEstimate({
      squareFootage: Number(squareFootage),
      bedrooms: Number(bedrooms),
      bathrooms: Number(bathrooms),
      serviceType,
      frequency,
      addOns
    });
  }, [addOns, bathrooms, bedrooms, frequency, serviceType, squareFootage, validationMessage]);

  useEffect(() => {
    if (!result) {
      return;
    }

    analytics.track(
      buildEvent({
        type: "tool_used",
        siteId,
        pageId,
        detail: `${serviceType}:${frequency}`
      })
    );
  }, [analytics, frequency, pageId, result, serviceType, siteId]);

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
        detail: `${serviceType}:${frequency}`
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
        detail: `${serviceType}:${frequency}`
      })
    );
    setPrinted(true);
    window.print();
    window.setTimeout(() => setPrinted(false), 1800);
  }

  return (
    <div className="tool-shell">
      <div>
        <p className="eyebrow">Fast pricing pass</p>
        <h2 className="section-title" style={{ marginTop: "0.45rem" }}>
          Cleaning pricing estimator
        </h2>
        <p className="section-copy">Build a fast working estimate before you commit to a quote, then refine it with condition, travel time, and package scope.</p>
      </div>

      <div className="form-grid">
        <div className="field-stack">
          <label htmlFor="squareFootage">Square footage</label>
          <input id="squareFootage" type="number" min="1" inputMode="numeric" value={squareFootage} onChange={(event) => setSquareFootage(event.target.value)} />
        </div>
        <div className="field-stack">
          <label htmlFor="bedrooms">Bedrooms</label>
          <input id="bedrooms" type="number" min="0" inputMode="numeric" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} />
        </div>
        <div className="field-stack">
          <label htmlFor="bathrooms">Bathrooms</label>
          <input id="bathrooms" type="number" min="0" step="1" inputMode="numeric" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} />
        </div>
        <div className="field-stack">
          <label htmlFor="serviceType">Service type</label>
          <select id="serviceType" value={serviceType} onChange={(event) => setServiceType(event.target.value as CleaningServiceType)}>
            <option value="standard">Standard clean</option>
            <option value="deep">Deep clean</option>
            <option value="move-out">Move-out clean</option>
          </select>
        </div>
        <div className="field-stack">
          <label htmlFor="frequency">Frequency</label>
          <select id="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as CleaningFrequency)}>
            <option value="one-time">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <fieldset className="field-stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="legend-title">Add-ons</legend>
          <div className="checkbox-grid">
            {Object.keys(ADD_ON_PRICES).map((addOn) => (
              <label key={addOn} className="checkbox-card" htmlFor={`addon-${addOn}`}>
                <input id={`addon-${addOn}`} type="checkbox" checked={addOns.includes(addOn)} onChange={() => setAddOns((current) => toggleAddOn(current, addOn))} />
                <span>{addOn}</span>
                <small>{currency(ADD_ON_PRICES[addOn])}</small>
              </label>
            ))}
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
            <p>{result.summary}</p>
          </div>
          <div className="result-card">
            <h3>Pricing notes</h3>
            {result.pricingNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <div className="action-row">
            <button className="button button-primary" type="button" onClick={() => void copySummary()}>
              {copied ? "Estimate copied" : "Copy estimate"}
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
            <p className="section-copy">Use the average estimate as your quoting anchor, then layer in travel, condition, pet hair, and lockout logistics before you send the final number.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
