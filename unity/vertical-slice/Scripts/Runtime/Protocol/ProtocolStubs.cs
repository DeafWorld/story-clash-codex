using System;

namespace StoryClash.Protocol
{
    public static class ProtocolStubs
    {
        public const string ProtocolVersion = "1.0.0";
        public const int SnapshotVersion = 1;

        public static readonly string[] ClientEvents =
        {
            "client_hello",
            "join_room",
            "leave_room",
            "gm_publish_beat",
            "gm_publish_choices",
            "gm_mark_ready",
            "player_mark_ready",
            "player_vote",
            "player_freeform",
            "gm_publish_consequence",
            "gm_next_beat"
        };

        public static readonly string[] ServerEvents =
        {
            "server_hello",
            "reconnect_state",
            "gm_state_update",
            "beat_published",
            "choices_opened",
            "vote_update",
            "vote_locked",
            "consequence_published",
            "room_updated",
            "server_error"
        };

        public static readonly string[] SnapshotRequiredFields =
        {
            "roomCode",
            "gmState",
            "snapshotVersion",
            "serverTimeMs",
            "tick"
        };
    }
}
