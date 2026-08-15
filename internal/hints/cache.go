package hints

import (
	"fmt"
	"sync"
)

// HistoryBucket collapses an exact prior-attempt count into a small number of buckets
// (0, 1, 2, "3 or more") so the cache below stays bounded per (level, signature) instead
// of growing one entry per every possible count a child could rack up.
func HistoryBucket(priorCount int) int {
	if priorCount > 3 {
		return 3
	}
	if priorCount < 0 {
		return 0
	}
	return priorCount
}

// Cache holds LLM-rephrased hint text keyed by (level_id, error_signature,
// history_bucket) -- queue item 4: "so repeats are instant on the Pi." In-memory and
// per-process by design: it doesn't need to survive a restart (the model call it saves
// is cheap enough to redo once), and process-lifetime is exactly the scope where "the
// same mistake, the same number of times before" is likely to repeat in one sitting.
type Cache struct {
	mu    sync.Mutex
	items map[string]string
}

func NewCache() *Cache {
	return &Cache{items: make(map[string]string)}
}

func cacheKey(levelID, signature string, bucket int) string {
	return fmt.Sprintf("%s|%s|%d", levelID, signature, bucket)
}

func (c *Cache) Get(levelID, signature string, bucket int) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.items[cacheKey(levelID, signature, bucket)]
	return v, ok
}

func (c *Cache) Set(levelID, signature string, bucket int, text string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[cacheKey(levelID, signature, bucket)] = text
}
