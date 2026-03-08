import "@testing-library/jest-dom/vitest";
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AnalyticsProvider, createNoopAnalyticsAdapter } from "@factory/analytics";
import { CleaningPricingEstimator, calculateCleaningEstimate } from "@factory/tool-widgets";

describe("cleaning pricing tool", () => {
  it("calculates a pricing range with add-ons", () => {
    const result = calculateCleaningEstimate({
      squareFootage: 1500,
      bedrooms: 3,
      bathrooms: 2,
      serviceType: "deep",
      frequency: "biweekly",
      addOns: ["fridge", "oven"]
    });

    expect(result.lowEstimate).toBeGreaterThan(0);
    expect(result.highEstimate).toBeGreaterThan(result.lowEstimate);
    expect(result.summary).toMatch(/average target/i);
  });

  it("shows validation and recovers to a working estimate", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsProvider adapter={createNoopAnalyticsAdapter()}>
        <CleaningPricingEstimator siteId="cleaning-pricing" pageId="cleaning-pricing-tool" />
      </AnalyticsProvider>
    );

    await user.clear(screen.getByLabelText(/square footage/i));
    await user.type(screen.getByLabelText(/square footage/i), "0");
    expect(screen.getByText(/greater than zero/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/square footage/i));
    await user.type(screen.getByLabelText(/square footage/i), "1800");
    expect(await screen.findByText(/working price range/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open checklist/i })).toHaveAttribute("href", "/resources/cleaning-pricing-checklist/");
  });
});
