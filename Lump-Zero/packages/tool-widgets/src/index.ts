export * from "./etsy-image-helper.tsx";
export * from "./cleaning-pricing-estimator.tsx";

import type { ToolComponentKey } from "@factory/niche-config";
import { CleaningPricingEstimator } from "./cleaning-pricing-estimator.tsx";
import { EtsyImageHelperTool } from "./etsy-image-helper.tsx";

export const toolComponentRegistry = {
  "etsy-image-helper": EtsyImageHelperTool,
  "cleaning-pricing-estimator": CleaningPricingEstimator
} satisfies Record<ToolComponentKey, React.ComponentType<ToolComponentProps>>;

export interface ToolComponentProps {
  siteId: string;
  pageId: string;
  defaultValues?: Record<string, string | number | boolean>;
  resourceHref?: string;
}
