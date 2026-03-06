using UnityEngine;

namespace StoryClash.VerticalSlice.FX
{
    public sealed class QualityGovernor : MonoBehaviour
    {
        [SerializeField] private int highQualityLevel = 2;
        [SerializeField] private int mediumQualityLevel = 1;
        [SerializeField] private int lowQualityLevel = 0;
        [SerializeField] private float downshiftThresholdMs = 24f;
        [SerializeField] private float upshiftThresholdMs = 14f;
        [SerializeField] private float observeSeconds = 2f;

        private float elapsed;
        private float frameAccumulated;
        private int frameCount;

        private void Update()
        {
            frameAccumulated += Time.unscaledDeltaTime * 1000f;
            frameCount += 1;
            elapsed += Time.unscaledDeltaTime;

            if (elapsed < observeSeconds || frameCount == 0)
            {
                return;
            }

            var avg = frameAccumulated / frameCount;
            var current = QualitySettings.GetQualityLevel();

            if (avg > downshiftThresholdMs)
            {
                if (current > lowQualityLevel)
                {
                    QualitySettings.SetQualityLevel(current - 1, true);
                }
            }
            else if (avg < upshiftThresholdMs)
            {
                if (current < highQualityLevel)
                {
                    QualitySettings.SetQualityLevel(current + 1, true);
                }
            }

            elapsed = 0f;
            frameAccumulated = 0f;
            frameCount = 0;
        }
    }
}
