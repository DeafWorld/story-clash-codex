using UnityEngine;

namespace StoryClash.VerticalSlice.UI
{
    public sealed class MobileVotingLayoutSpec : MonoBehaviour
    {
        public const float MinCardHeightPx = 72f;
        public const float TargetCardHeightPx = 80f;
        public const float VerticalSpacingPx = 12f;
        public const float TapScale = 0.97f;

        [SerializeField] private RectTransform? votingContainer;
        [SerializeField] private RectTransform[] cards = new RectTransform[0];
        [SerializeField] private RectTransform? timerBand;

        public bool Validate(out string reason)
        {
            if (votingContainer == null)
            {
                reason = "Missing voting container.";
                return false;
            }

            foreach (var card in cards)
            {
                if (card == null)
                {
                    continue;
                }
                if (card.rect.height < MinCardHeightPx)
                {
                    reason = $"Card height {card.rect.height:F1}px is below {MinCardHeightPx}px.";
                    return false;
                }
            }

            if (timerBand == null)
            {
                reason = "Missing persistent timer band.";
                return false;
            }

            reason = "ok";
            return true;
        }
    }
}
