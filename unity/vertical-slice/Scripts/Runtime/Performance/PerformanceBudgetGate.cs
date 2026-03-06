using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Profiling;

namespace StoryClash.VerticalSlice.Performance
{
    public sealed class PerformanceBudgetGate : MonoBehaviour
    {
        [Serializable]
        public struct Budget
        {
            public float P95FrameMs;
            public float LongFramePercent;
            public float MaxMemoryGrowthMb;
        }

        public event Action<string>? BudgetBreached;

        [SerializeField] private Budget budget60Fps = new Budget { P95FrameMs = 16.7f, LongFramePercent = 8f, MaxMemoryGrowthMb = 32f };
        [SerializeField] private Budget budget30Fps = new Budget { P95FrameMs = 33.3f, LongFramePercent = 12f, MaxMemoryGrowthMb = 48f };
        [SerializeField] private float sampleWindowSeconds = 6f;
        [SerializeField] private bool use60FpsBudget = true;

        private readonly List<float> frameMs = new();
        private float longFrames;
        private float elapsed;
        private long startMemory;

        private void OnEnable()
        {
            startMemory = Profiler.GetTotalAllocatedMemoryLong();
            frameMs.Clear();
            longFrames = 0;
            elapsed = 0;
        }

        private void Update()
        {
            var ms = Time.unscaledDeltaTime * 1000f;
            frameMs.Add(ms);
            elapsed += Time.unscaledDeltaTime;

            var threshold = use60FpsBudget ? 16.7f : 33.3f;
            if (ms > threshold)
            {
                longFrames += 1;
            }

            if (elapsed < sampleWindowSeconds)
            {
                return;
            }

            EvaluateAndReset();
        }

        private void EvaluateAndReset()
        {
            if (frameMs.Count == 0)
            {
                return;
            }

            var activeBudget = use60FpsBudget ? budget60Fps : budget30Fps;
            var p95 = Percentile(frameMs, 95f);
            var longFrameRate = (longFrames / frameMs.Count) * 100f;
            var memoryGrowthMb = (Profiler.GetTotalAllocatedMemoryLong() - startMemory) / (1024f * 1024f);

            if (p95 > activeBudget.P95FrameMs)
            {
                BudgetBreached?.Invoke($"p95 frame time breach: {p95:F2}ms > {activeBudget.P95FrameMs:F2}ms");
            }
            if (longFrameRate > activeBudget.LongFramePercent)
            {
                BudgetBreached?.Invoke($"long frame rate breach: {longFrameRate:F1}% > {activeBudget.LongFramePercent:F1}%");
            }
            if (memoryGrowthMb > activeBudget.MaxMemoryGrowthMb)
            {
                BudgetBreached?.Invoke($"memory growth breach: {memoryGrowthMb:F1}MB > {activeBudget.MaxMemoryGrowthMb:F1}MB");
            }

            frameMs.Clear();
            longFrames = 0;
            elapsed = 0;
            startMemory = Profiler.GetTotalAllocatedMemoryLong();
        }

        private static float Percentile(List<float> values, float percentile)
        {
            values.Sort();
            var index = Mathf.Clamp(Mathf.CeilToInt((percentile / 100f) * values.Count) - 1, 0, values.Count - 1);
            return values[index];
        }
    }
}
