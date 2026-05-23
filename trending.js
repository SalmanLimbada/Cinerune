import { initCollectionPage } from "./collection-page.js?v=20260515-bugfix2";

initCollectionPage({
  kind: "trending",
  slug: "trending",
  defaultType: "movie",
  mediaTypes: ["movie", "tv"],
  title: "Trending",
  statusNoun: (type) => type === "tv" ? "trending TV shows this week" : "trending movies this week"
});
