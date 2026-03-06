using System;
using System.Collections.Generic;
using UnityEngine;

namespace StoryClash.VerticalSlice.Analytics
{
    [Serializable]
    public struct FunnelMetric
    {
        public string Name;
        public float Value;
    }

    public sealed class SessionFunnelAnalyticsV2 : MonoBehaviour
    {
        private readonly Dictionary<string, float> counters = new();
        private float readStartTime;
        private float voteOpenTime;

        public IReadOnlyDictionary<string, float> Counters => counters;

        public void TrackHandshakeAccepted(bool accepted)
        {
            Increment("handshake_total", 1f);
            if (accepted)
            {
                Increment("handshake_accepted", 1f);
            }
        }

        public void TrackReadPhaseStarted()
        {
            readStartTime = Time.unscaledTime;
            Increment("beats_started", 1f);
        }

        public void TrackReadyGateCleared()
        {
            var latency = Mathf.Max(0f, Time.unscaledTime - readStartTime);
            Increment("read_to_ready_sum_s", latency);
            Increment("read_to_ready_count", 1f);
            voteOpenTime = Time.unscaledTime;
        }

        public void TrackVoteLocked()
        {
            var latency = Mathf.Max(0f, Time.unscaledTime - voteOpenTime);
            Increment("vote_lock_sum_s", latency);
            Increment("vote_lock_count", 1f);
        }

        public void TrackReconnectRecovered()
        {
            Increment("reconnect_recovered", 1f);
        }

        public void TrackRecapShareReached()
        {
            Increment("recap_share_reach", 1f);
        }

        public FunnelMetric[] Snapshot()
        {
            var output = new FunnelMetric[counters.Count];
            var index = 0;
            foreach (var entry in counters)
            {
                output[index++] = new FunnelMetric { Name = entry.Key, Value = entry.Value };
            }
            return output;
        }

        private void Increment(string key, float delta)
        {
            counters.TryGetValue(key, out var current);
            counters[key] = current + delta;
        }
    }
}
