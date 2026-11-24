---
name: cause-campaign
description: Find real charity stories for a brand to fund as a cause campaign, or for a creator to film. Use when asked for cause marketing ideas, charity partners, or stories to tell, in the UK.
---

# Cause campaign

Storra lists real charity stories. A brand funds one, a creator tells it, the charity makes it happen.
The tools need no sign-in and only read.

## Pick the server

| Who is asking | Tools (server `storra-brands` or `storra-creators`) |
|---|---|
| A brand, agency or marketer | `find_campaign_stories`, `get_campaign_story`, `list_causes` |
| A creator or their manager | `search_stories_to_tell`, `get_story`, `list_causes` |

Unclear who it is for? Ask once, or default to brand.

## Steps

1. **Work out the angle.** For a brand: what it sells, who its customers are, where it operates, the season.
   For a creator: their audience, niche and city. Turn that into two or three short search words
   (`children Christmas`, `mental health`, `animal rescue`). Nothing long: the match is on words.
2. **Call `list_causes` once** if the topic is vague, then filter with `cause` exactly as listed.
   Use `location` for a place and `limit` (default 10, max 25) to keep results short.
3. **Search.** Run two or three different queries rather than one broad one, and drop repeats by `slug`.
4. **Read the best three to five** with `get_campaign_story` or `get_story`, passing the `slug`.
5. **Recommend.** For each pick give the title, charity, place, why it fits this brand or creator in one
   sentence, and the `url` from the result. Rank them and say which comes first.

## Rules

- Coverage is UK stories only for now. If asked for another country, say other countries are coming soon and that they can email socials@getstorra.com to ask for them; do not invent stories.
- Link every story with its `url` exactly as returned.
- Say only what the tool returned. Never invent a charity, figure, quote or place.
- No results? Widen the query or drop the `location`, then say plainly that nothing fit.
- Brands: do not ask for a sum of money in the pitch. Describe what the brand takes part in.
- Do not say where a story was sourced from; the tools do not return it.
- Write British English and plain hyphens.
