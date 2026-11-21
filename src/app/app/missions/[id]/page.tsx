import { MissionControl } from "@/components/mission-control";

export const metadata = { title: "Mission" };

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MissionControl id={id} />;
}
