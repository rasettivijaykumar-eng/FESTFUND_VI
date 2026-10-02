import { CommunityChat } from "../components/CommunityChat";
import { useFestivalScope } from "../hooks/useFestivalScope";
import { EmptyState, PageHeader, Skeleton } from "../components/ui";

export function CommunityPage() {
  const { festId, current, loading } = useFestivalScope();
  if (loading) return <Skeleton className="h-72" />;
  if (!festId) return <EmptyState title="Choose a festival" body="Select a festival in the header to open its community room." />;

  return (
    <div className="space-y-4">
      <PageHeader title="Community chat" subtitle={`${current?.name || festId} · A separate room for this festival`} />
      <CommunityChat festId={festId} access="member" />
    </div>
  );
}