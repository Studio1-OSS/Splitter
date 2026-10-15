import type { Metadata } from "next";
import { SplitWizard } from "@/components/split/split-wizard";
import { GROUP_KINDS, isGroupKind } from "@/config/categories";
import { features } from "@/env";
import { myCreditsLeft } from "@/server/ai/request";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadOr404 } from "@/server/load";
import { getGroupDetail } from "@/server/services/groups";

export const metadata: Metadata = { title: "New expense" };

export default async function NewExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const user = await requireUser(`/groups/${groupId}/new`);
  const { group, me, members } = await loadOr404(() => getGroupDetail(db, user.id, groupId));
  const credits = features.scanning ? await myCreditsLeft() : null;

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-8">
      <SplitWizard
        scanEnabled={features.scanning}
        credits={credits}
        mode={{
          kind: "group",
          groupId: group.id,
          groupName: group.name,
          currency: group.currency,
          members: members.map((m) => ({ id: m.id, name: m.displayName })),
          meId: me.id,
          defaultCategory: isGroupKind(group.kind) ? GROUP_KINDS[group.kind].defaultCategory : "other",
        }}
      />
    </div>
  );
}
