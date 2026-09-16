import { redirect } from "next/navigation";
import { inspectPlatformConfig } from "../lib/platform/config";

export const dynamic = "force-dynamic";

export default function Home() { redirect(inspectPlatformConfig().mode !== "disabled" ? "/platform" : "/projects"); }
