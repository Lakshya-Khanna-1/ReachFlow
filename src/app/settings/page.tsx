import { SettingsForm } from "@/components/settings-form";
import { GooglePanel } from "@/components/google-panel";
import { GoogleGuide } from "@/components/google-guide";
export default function Settings() {
  return (
    <>
      <SettingsForm />
      <div className="mx-auto max-w-5xl space-y-6 px-6 pb-10 md:px-10">
        <GooglePanel />
        <GoogleGuide />
      </div>
    </>
  );
}
