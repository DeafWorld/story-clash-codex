using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace StoryClash.VerticalSlice.Visual
{
    public sealed class UrpVisualIdentityPass : MonoBehaviour
    {
        [SerializeField] private Volume? globalVolume;
        [SerializeField] private float vignetteIntensity = 0.34f;
        [SerializeField] private float bloomIntensity = 0.52f;
        [SerializeField] private float colorSaturation = -10f;

        private void OnEnable()
        {
            Apply();
        }

        public void Apply()
        {
            if (globalVolume == null || globalVolume.profile == null)
            {
                return;
            }

            if (globalVolume.profile.TryGet(out Vignette vignette))
            {
                vignette.intensity.value = vignetteIntensity;
                vignette.active = true;
            }

            if (globalVolume.profile.TryGet(out Bloom bloom))
            {
                bloom.intensity.value = bloomIntensity;
                bloom.active = true;
            }

            if (globalVolume.profile.TryGet(out ColorAdjustments grading))
            {
                grading.saturation.value = colorSaturation;
                grading.active = true;
            }
        }
    }
}
