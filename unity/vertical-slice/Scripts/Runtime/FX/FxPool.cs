using System.Collections.Generic;
using UnityEngine;

namespace StoryClash.VerticalSlice.FX
{
    public sealed class FxPool : MonoBehaviour
    {
        [SerializeField] private Transform? poolRoot;

        private readonly Dictionary<string, Queue<GameObject>> pools = new();

        public GameObject Acquire(string key, GameObject prefab)
        {
            if (!pools.TryGetValue(key, out var queue))
            {
                queue = new Queue<GameObject>();
                pools[key] = queue;
            }

            if (queue.Count > 0)
            {
                var reused = queue.Dequeue();
                reused.SetActive(true);
                return reused;
            }

            return Instantiate(prefab);
        }

        public void Release(string key, GameObject instance)
        {
            if (!pools.TryGetValue(key, out var queue))
            {
                queue = new Queue<GameObject>();
                pools[key] = queue;
            }

            instance.SetActive(false);
            instance.transform.SetParent(poolRoot, false);
            queue.Enqueue(instance);
        }
    }
}
