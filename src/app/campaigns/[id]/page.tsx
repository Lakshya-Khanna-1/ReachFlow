import { CampaignWorkspace } from "@/components/campaign-workspace";
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CampaignWorkspace id={(await params).id} />;
}
