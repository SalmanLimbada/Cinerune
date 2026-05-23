import { initCollectionPage } from "./collection-page.js?v=20260515-bugfix2";

initCollectionPage({
  kind: "airing-today",
  slug: "airing-today",
  defaultType: "tv",
  mediaTypes: ["tv"],
  title: () => "TV Airing Today",
  statusNoun: () => "TV shows airing today"
});
