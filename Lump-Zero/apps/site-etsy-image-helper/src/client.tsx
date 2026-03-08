import "@factory/ui/styles.css";
import { bootstrapSiteClient } from "@factory/site-runtime";
import type { SiteContent } from "@factory/niche-config";
import generatedSiteContent from "../content/generated/site-content.json";

bootstrapSiteClient(generatedSiteContent as SiteContent);
