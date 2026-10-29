import { SetupChecklist } from "@/components/setup-checklist";
import { GooglePanel } from "@/components/google-panel";
import { GoogleGuide } from "@/components/google-guide";
export default function Setup() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
      <h1 className="text-3xl font-semibold">Setup</h1>
      <p className="text-sm text-zinc-400">
        Connect your tools, then bring your first list.
      </p>
      <SetupChecklist />
      <GooglePanel />
      <GoogleGuide />
    </div>
  );
}
