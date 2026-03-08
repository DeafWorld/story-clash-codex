import "@testing-library/jest-dom/vitest";
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsProvider, createNoopAnalyticsAdapter } from "@factory/analytics";
import { EtsyImageHelperTool } from "@factory/tool-widgets";

describe("tool widget smoke coverage", () => {
  it("updates the export guidance and copies the summary", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });

    const user = userEvent.setup();
    render(
      <AnalyticsProvider adapter={createNoopAnalyticsAdapter()}>
        <EtsyImageHelperTool siteId="etsy-image-helper" pageId="etsy-image-helper-tool" />
      </AnalyticsProvider>
    );

    await user.selectOptions(screen.getByLabelText(/surface preset/i), "big-banner");
    await user.clear(screen.getByLabelText(/source width/i));
    await user.type(screen.getByLabelText(/source width/i), "2200");
    await user.clear(screen.getByLabelText(/source height/i));
    await user.type(screen.getByLabelText(/source height/i), "500");

    expect(screen.getByText(/recommended export/i)).toBeInTheDocument();
    expect(screen.getByText(/1600 x 400px/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy summary/i }));
    expect(await screen.findByRole("button", { name: /summary copied/i })).toBeInTheDocument();
  });
});
