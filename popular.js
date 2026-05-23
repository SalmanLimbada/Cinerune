import { initCollectionPage } from "./collection-page.js?v=20260515-bugfix2";

initCollectionPage({
  kind: "popular",
  slug: "popular",
  defaultType: "movie",
  mediaTypes: ["movie", "tv"],
  title: "Popular",
  statusNoun: (type) => type === "tv" ? "popular TV shows" : "popular movies"
});
