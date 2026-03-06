using System;
using StoryClash.VerticalSlice.Core;

namespace StoryClash.VerticalSlice.Networking
{
    public sealed class SnapshotEnvelope
    {
        public string RoomCode = string.Empty;
        public GmPhase Phase;
        public int SnapshotVersion;
        public long ServerTimeMs;
        public long Tick;
        public string? LockedChoiceId;
        public string? VotedChoiceId;
        public bool VoteLocked;
    }

    public sealed class ReconcileResult
    {
        public bool Applied;
        public bool SuppressReplay;
        public bool ShowSyncToast;
    }

    public sealed class AuthoritativeSnapshotReconciler
    {
        public long LastAppliedTick { get; private set; }
        public string? LastServerVote { get; private set; }

        public ReconcileResult ApplySnapshot(SnapshotEnvelope snapshot, string? localVoteChoiceId)
        {
            if (snapshot.Tick <= LastAppliedTick)
            {
                return new ReconcileResult
                {
                    Applied = false,
                    SuppressReplay = true,
                    ShowSyncToast = false,
                };
            }

            var hadConflict = !string.Equals(localVoteChoiceId, snapshot.VotedChoiceId, StringComparison.Ordinal);
            LastAppliedTick = snapshot.Tick;
            LastServerVote = snapshot.VotedChoiceId;

            return new ReconcileResult
            {
                Applied = true,
                SuppressReplay = snapshot.VoteLocked || !string.IsNullOrEmpty(snapshot.VotedChoiceId),
                ShowSyncToast = hadConflict,
            };
        }
    }
}
