using UnityEngine;

namespace StoryClash.VerticalSlice.Visual
{
    public sealed class RiftContaminationSettings : MonoBehaviour
    {
        [SerializeField] private Material? contaminationMaterial;
        [SerializeField] private Color genreTint = new Color(0.65f, 0.35f, 1f, 0.22f);
        [SerializeField] private float pulseSpeed = 1.2f;
        [SerializeField] private float fractureStrength = 0.4f;

        private static readonly int TintColorId = Shader.PropertyToID("_TintColor");
        private static readonly int PulseSpeedId = Shader.PropertyToID("_PulseSpeed");
        private static readonly int FractureStrengthId = Shader.PropertyToID("_FractureStrength");

        public void Apply()
        {
            if (contaminationMaterial == null)
            {
                return;
            }

            contaminationMaterial.SetColor(TintColorId, genreTint);
            contaminationMaterial.SetFloat(PulseSpeedId, pulseSpeed);
            contaminationMaterial.SetFloat(FractureStrengthId, fractureStrength);
        }

        private void OnEnable()
        {
            Apply();
        }
    }
}
