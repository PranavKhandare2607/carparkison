---
name: Nominatim search pagination
description: How to paginate nearby-place results from public Nominatim without repeating provider results.
---

Nominatim's search endpoint has a maximum result count but does not provide a reliable offset-based page parameter. Do not forward UI pagination offsets to the provider. Fetch a bounded result set, cache it briefly by search context, and slice successive pages from that result set.

**Why:** Passing an unsupported offset can make “Load more” repeat the same places, while repeated full provider searches waste requests and can violate public-service usage expectations.

**How to apply:** Use this for nearby healthcare search. Keep requests bounded, preserve provider attribution, and use a short cache lifetime.
