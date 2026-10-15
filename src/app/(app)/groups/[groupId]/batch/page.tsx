import type { Metadata } from "next";
import { BatchFlow } from "@/components/batch/batch-flow";
import { features } from "@/env";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadOr404 } from "@/server/load";
import { myCreditsLeft } from "@/server/ai/request";
import { getGroupDetail } from "@/server/services/groups";

export const metadata: Metadata = { title: "Settle with AI" };

export default async function BatchPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const user = await requireUser(`/groups/${groupId}/batch`);
  const { group, me, members } = await loadOr404(() => getGroupDetail(db, user.id, groupId));
  const { left: quotaLeft } = await myCreditsLeft();

  return (
    <BatchFlow
      group={{ id: group.id, name: group.name, kind: group.kind, currency: group.currency }}
      members={members.map((m) => ({ id: m.id, name: m.displayName }))}
      meId={me.id}
      scanEnabled={features.scanning}
      quotaLeft={quotaLeft}
    />
  );
}
