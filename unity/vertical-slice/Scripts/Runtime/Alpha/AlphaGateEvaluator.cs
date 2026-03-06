using System;
using System.Collections.Generic;
using System.Linq;

namespace StoryClash.VerticalSlice.Alpha
{
    [Serializable]
    public struct SessionResult
    {
        public bool ReachedRecap;
        public bool GmWouldRunAgain;
        public int BlockerCount;
    }

    [Serializable]
    public struct AlphaGateResult
    {
        public bool Passed;
        public int SessionCount;
        public int RecapCount;
        public int RerunCount;
        public int BlockerCount;
    }

    public static class AlphaGateEvaluator
    {
        public static AlphaGateResult Evaluate(IEnumerable<SessionResult> sessions)
        {
            var list = sessions.ToList();
            var recapCount = list.Count(s => s.ReachedRecap);
            var rerunCount = list.Count(s => s.GmWouldRunAgain);
            var blockerCount = list.Sum(s => s.BlockerCount);

            var passed =
                list.Count >= 10 &&
                recapCount >= 8 &&
                rerunCount >= 7 &&
                blockerCount == 0;

            return new AlphaGateResult
            {
                Passed = passed,
                SessionCount = list.Count,
                RecapCount = recapCount,
                RerunCount = rerunCount,
                BlockerCount = blockerCount,
            };
        }
    }
}
