/**
 * species-list.js
 *
 * The master list of study species, shared by the taxon resolver and the
 * curation server. This is the single source of truth for WHAT is being
 * studied; resolved taxon_ids and curated photos live in data/*.json.
 *
 * Each entry is one "card" = one answer in the game's dropdown.
 *
 *   id          slug, stable identity across re-runs
 *   commonName  the answer text students pick
 *   sciName     best-known scientific name; "" means the resolver must
 *               search by common name and will flag it for manual review
 *   group       taxonomic grouping, used for section headers / filtering
 *   query       optional override for the iNaturalist taxon search
 *   stage       optional life-stage label when several cards share a taxon
 *               (e.g. Eastern Newt adult vs eft) — photos are assigned to
 *               the right card by hand during curation
 *   hasCall     true if this species also needs audio (frog/toad calls);
 *               sounds are curated now, used by the game in a later pass
 *   note        anything needing human judgement, surfaced in the UI
 */

const FISH = [
  { id: "muskellunge", commonName: "Muskellunge", sciName: "Esox masquinongy", group: "Pike & Mudminnows" },
  { id: "northern-pike", commonName: "Northern Pike", sciName: "Esox lucius", group: "Pike & Mudminnows" },
  { id: "grass-pickerel", commonName: "Grass Pickerel", sciName: "Esox americanus", group: "Pike & Mudminnows", note: "Grass Pickerel is the subspecies E. a. vermiculatus; iNat may resolve to the species E. americanus (Redfin Pickerel)." },
  { id: "central-mudminnow", commonName: "Central Mudminnow", sciName: "Umbra limi", group: "Pike & Mudminnows" },

  { id: "gizzard-shad", commonName: "Gizzard Shad", sciName: "Dorosoma cepedianum", group: "Herrings" },

  { id: "brown-trout", commonName: "Brown Trout", sciName: "Salmo trutta", group: "Trout & Salmon" },
  { id: "rainbow-trout", commonName: "Rainbow Trout", sciName: "Oncorhynchus mykiss", group: "Trout & Salmon" },
  { id: "brook-trout", commonName: "Brook Trout", sciName: "Salvelinus fontinalis", group: "Trout & Salmon" },

  { id: "walleye", commonName: "Walleye", sciName: "Sander vitreus", group: "Perches & Darters" },
  { id: "sauger", commonName: "Sauger", sciName: "Sander canadensis", group: "Perches & Darters" },
  { id: "yellow-perch", commonName: "Yellow Perch", sciName: "Perca flavescens", group: "Perches & Darters" },
  { id: "fantail-darter", commonName: "Fantail Darter", sciName: "Etheostoma flabellare", group: "Perches & Darters" },
  { id: "rainbow-darter", commonName: "Rainbow Darter", sciName: "Etheostoma caeruleum", group: "Perches & Darters" },
  { id: "johnny-darter", commonName: "Johnny Darter", sciName: "Etheostoma nigrum", group: "Perches & Darters" },
  { id: "northern-logperch", commonName: "Northern Logperch", sciName: "Percina caprodes", group: "Perches & Darters", note: "Percina caprodes is often called simply Logperch on iNat." },

  { id: "flathead-catfish", commonName: "Flathead Catfish", sciName: "Pylodictis olivaris", group: "Catfishes" },
  { id: "channel-catfish", commonName: "Channel Catfish", sciName: "Ictalurus punctatus", group: "Catfishes" },
  { id: "black-bullhead", commonName: "Black Bullhead", sciName: "Ameiurus melas", group: "Catfishes" },
  { id: "stonecat", commonName: "Stonecat", sciName: "Noturus flavus", group: "Catfishes" },

  { id: "shorthead-redhorse", commonName: "Shorthead Redhorse", sciName: "Moxostoma macrolepidotum", group: "Suckers" },
  { id: "white-sucker", commonName: "White Sucker", sciName: "Catostomus commersonii", group: "Suckers" },
  { id: "northern-hogsucker", commonName: "Northern Hogsucker", sciName: "Hypentelium nigricans", group: "Suckers" },
  { id: "quillback-carpsucker", commonName: "Quillback Carpsucker", sciName: "Carpiodes cyprinus", group: "Suckers" },
  { id: "bigmouth-buffalo", commonName: "Bigmouth Buffalo", sciName: "Ictiobus cyprinellus", group: "Suckers" },

  { id: "white-bass", commonName: "White Bass", sciName: "Morone chrysops", group: "Temperate Basses" },
  { id: "yellow-bass", commonName: "Yellow Bass", sciName: "Morone mississippiensis", group: "Temperate Basses" },
  { id: "wiper", commonName: "Wiper", sciName: "", group: "Temperate Basses", query: "Morone chrysops", note: "HYBRID: Wiper = White Bass x Striped Bass (Morone chrysops x M. saxatilis). iNaturalist has no clean species taxon for this. Resolve by hand or drop this card." },

  { id: "common-carp", commonName: "Carp", sciName: "Cyprinus carpio", group: "Carps & Minnows" },
  { id: "grass-carp", commonName: "Grass Carp", sciName: "Ctenopharyngodon idella", group: "Carps & Minnows" },
  { id: "red-shiner", commonName: "Red Shiner", sciName: "Cyprinella lutrensis", group: "Carps & Minnows" },
  { id: "fathead-minnow", commonName: "Fathead Minnow", sciName: "Pimephales promelas", group: "Carps & Minnows" },
  { id: "bluntnose-minnow", commonName: "Bluntnose Minnow", sciName: "Pimephales notatus", group: "Carps & Minnows" },
  { id: "golden-shiner", commonName: "Golden Shiner", sciName: "Notemigonus crysoleucas", group: "Carps & Minnows" },
  { id: "common-shiner", commonName: "Common Shiner", sciName: "Luxilus cornutus", group: "Carps & Minnows" },
  { id: "bigmouth-shiner", commonName: "Bigmouth Shiner", sciName: "Notropis dorsalis", group: "Carps & Minnows" },
  { id: "creek-chub", commonName: "Creek Chub", sciName: "Semotilus atromaculatus", group: "Carps & Minnows" },
  { id: "hornyhead-chub", commonName: "Hornyhead Chub", sciName: "Nocomis biguttatus", group: "Carps & Minnows" },
  { id: "central-stoneroller", commonName: "Central Stoneroller", sciName: "Campostoma anomalum", group: "Carps & Minnows" },
  { id: "southern-redbelly-dace", commonName: "Southern Redbelly Dace", sciName: "Chrosomus erythrogaster", group: "Carps & Minnows" },
  { id: "blacknose-dace", commonName: "Blacknose Dace", sciName: "Rhinichthys atratulus", group: "Carps & Minnows" },

  { id: "bowfin", commonName: "Bowfin", sciName: "Amia calva", group: "Primitive Fishes" },
  { id: "paddlefish", commonName: "Paddlefish", sciName: "Polyodon spathula", group: "Primitive Fishes" },
  { id: "lake-sturgeon", commonName: "Lake Sturgeon", sciName: "Acipenser fulvescens", group: "Primitive Fishes" },
  { id: "shovelnose-sturgeon", commonName: "Shovelnose Sturgeon", sciName: "Scaphirhynchus platorynchus", group: "Primitive Fishes" },
  { id: "longnose-gar", commonName: "Longnose Gar", sciName: "Lepisosteus osseus", group: "Primitive Fishes" },
  { id: "shortnose-gar", commonName: "Shortnose Gar", sciName: "Lepisosteus platostomus", group: "Primitive Fishes" },
  { id: "silver-lamprey", commonName: "Silver Lamprey", sciName: "Ichthyomyzon unicuspis", group: "Primitive Fishes" },

  { id: "black-crappie", commonName: "Black Crappie", sciName: "Pomoxis nigromaculatus", group: "Sunfishes" },
  { id: "white-crappie", commonName: "White Crappie", sciName: "Pomoxis annularis", group: "Sunfishes" },
  { id: "bluegill", commonName: "Bluegill", sciName: "Lepomis macrochirus", group: "Sunfishes" },
  { id: "redear-sunfish", commonName: "Redear Sunfish", sciName: "Lepomis microlophus", group: "Sunfishes" },
  { id: "green-sunfish", commonName: "Green Sunfish", sciName: "Lepomis cyanellus", group: "Sunfishes" },
  { id: "orangespotted-sunfish", commonName: "Orangespotted Sunfish", sciName: "Lepomis humilis", group: "Sunfishes" },
  { id: "pumpkinseed", commonName: "Pumpkinseed", sciName: "Lepomis gibbosus", group: "Sunfishes" },
  { id: "warmouth", commonName: "Warmouth", sciName: "Lepomis gulosus", group: "Sunfishes" },
  { id: "rock-bass", commonName: "Rock Bass", sciName: "Ambloplites rupestris", group: "Sunfishes" },
  { id: "largemouth-bass", commonName: "Largemouth Bass", sciName: "Micropterus nigricans", group: "Sunfishes", note: "iNat split Largemouth Bass: M. nigricans is the widespread species; M. salmoides is now Florida Bass. Must resolve to M. nigricans." },
  { id: "smallmouth-bass", commonName: "Smallmouth Bass", sciName: "Micropterus dolomieu", group: "Sunfishes" },

  { id: "freshwater-drum", commonName: "Freshwater Drum", sciName: "Aplodinotus grunniens", group: "Other Fishes" },
  { id: "burbot", commonName: "Burbot", sciName: "Lota lota", group: "Other Fishes" },
  { id: "mooneye", commonName: "Mooneye", sciName: "Hiodon tergisus", group: "Other Fishes" },
  { id: "brook-stickleback", commonName: "Brook Stickleback", sciName: "Culaea inconstans", group: "Other Fishes" },
  { id: "slimy-sculpin", commonName: "Slimy Sculpin", sciName: "Cottus cognatus", group: "Other Fishes" },
  { id: "blackstripe-topminnow", commonName: "Blackstripe Topminnow", sciName: "Fundulus notatus", group: "Other Fishes" },
  { id: "american-eel", commonName: "American Eel", sciName: "Anguilla rostrata", group: "Other Fishes" },
];

const HERPS = [
  // --- Salamanders ---
  { id: "blue-spotted-salamander", commonName: "Blue-Spotted Salamander", sciName: "Ambystoma laterale", group: "Salamanders" },
  { id: "smallmouth-salamander", commonName: "Smallmouth Salamander", sciName: "Ambystoma texanum", group: "Salamanders" },
  { id: "tiger-salamander", commonName: "Tiger Salamander", sciName: "Ambystoma tigrinum", group: "Salamanders" },
  { id: "mudpuppy", commonName: "Mudpuppy", sciName: "Necturus maculosus", group: "Salamanders" },
  { id: "eastern-newt-adult", commonName: "Eastern Newt (Adult)", sciName: "Notophthalmus viridescens", group: "Salamanders", stage: "adult", note: "Shares a taxon with the Eft card — assign aquatic adult photos here." },
  { id: "eastern-newt-eft", commonName: "Eastern Newt (Eft)", sciName: "Notophthalmus viridescens", group: "Salamanders", stage: "eft", note: "Shares a taxon with the Adult card — assign terrestrial orange eft photos here." },

  // --- Frogs & Toads ---
  { id: "american-toad", commonName: "American Toad", sciName: "Anaxyrus americanus", group: "Frogs & Toads", hasCall: true },
  { id: "blanchards-cricket-frog", commonName: "Blanchard's Cricket Frog", sciName: "Acris blanchardi", group: "Frogs & Toads", hasCall: true },
  { id: "eastern-gray-tree-frog", commonName: "Eastern Gray Tree Frog", sciName: "Hyla versicolor", group: "Frogs & Toads", hasCall: true, note: "H. versicolor is visually identical to Cope's Gray Treefrog (H. chrysoscelis) — call is the reliable separator. Watch for misidentified photos." },
  { id: "spring-peeper", commonName: "Spring Peeper", sciName: "Pseudacris crucifer", group: "Frogs & Toads", hasCall: true },
  { id: "boreal-chorus-frog", commonName: "Boreal Chorus Frog", sciName: "Pseudacris maculata", group: "Frogs & Toads", hasCall: true },
  { id: "plains-leopard-frog", commonName: "Plains Leopard Frog", sciName: "Lithobates blairi", group: "Frogs & Toads" },
  { id: "bull-frog", commonName: "Bull Frog", sciName: "Lithobates catesbeianus", group: "Frogs & Toads", hasCall: true },
  { id: "green-frog", commonName: "Green Frog", sciName: "Lithobates clamitans", group: "Frogs & Toads", hasCall: true },
  { id: "pickerel-frog", commonName: "Pickerel Frog", sciName: "Lithobates palustris", group: "Frogs & Toads" },
  { id: "northern-leopard-frog", commonName: "Northern Leopard Frog", sciName: "Lithobates pipiens", group: "Frogs & Toads", hasCall: true },

  // --- Turtles ---
  { id: "common-snapping-turtle", commonName: "Common Snapping Turtle", sciName: "Chelydra serpentina", group: "Turtles" },
  { id: "spiny-softshell", commonName: "Spiny Softshell", sciName: "Apalone spinifera", group: "Turtles" },
  { id: "smooth-softshell", commonName: "Smooth Softshell", sciName: "Apalone mutica", group: "Turtles" },
  { id: "ornate-box-turtle", commonName: "Ornate Box Turtle", sciName: "Terrapene ornata", group: "Turtles" },
  { id: "northern-painted-turtle", commonName: "Northern Painted Turtle", sciName: "Chrysemys picta", group: "Turtles", note: "Northern Painted is the subspecies C. p. marginata; iNat may resolve to the species C. picta." },
  { id: "blandings-turtle", commonName: "Blanding's Turtle", sciName: "Emydoidea blandingii", group: "Turtles" },
  { id: "northern-map-turtle", commonName: "Northern Map Turtle", sciName: "Graptemys geographica", group: "Turtles" },
  { id: "false-map-turtle", commonName: "False Map Turtle", sciName: "Graptemys pseudogeographica", group: "Turtles" },
  { id: "eastern-musk-turtle", commonName: "Eastern Musk Turtle", sciName: "Sternotherus odoratus", group: "Turtles" },
  { id: "wood-turtle", commonName: "Wood Turtle", sciName: "Glyptemys insculpta", group: "Turtles" },
  { id: "yellow-mud-turtle", commonName: "Yellow Mud Turtle", sciName: "Kinosternon flavescens", group: "Turtles" },

  // --- Snakes ---
  { id: "north-american-racer", commonName: "North American Racer", sciName: "Coluber constrictor", group: "Snakes" },
  { id: "eastern-hognosed-snake", commonName: "Eastern Hog-nosed Snake", sciName: "Heterodon platirhinos", group: "Snakes" },
  { id: "speckled-king-snake", commonName: "Speckled King Snake", sciName: "Lampropeltis holbrooki", group: "Snakes" },
  { id: "eastern-milk-snake", commonName: "Eastern Milk Snake", sciName: "Lampropeltis triangulum", group: "Snakes" },
  { id: "northern-water-snake", commonName: "Northern Water Snake", sciName: "Nerodia sipedon", group: "Snakes" },
  { id: "smooth-green-snake", commonName: "Smooth Green Snake", sciName: "Opheodrys vernalis", group: "Snakes" },
  { id: "western-rat-snake", commonName: "Western Rat Snake", sciName: "Pantherophis obsoletus", group: "Snakes" },
  { id: "western-fox-snake", commonName: "Western Fox Snake", sciName: "Pantherophis ramspotti", group: "Snakes", note: "Western Fox Snake was split from P. vulpinus (Eastern Fox Snake) — P. ramspotti is the western form." },
  { id: "gopher-snake", commonName: "Gopher Snake (Bullsnake)", sciName: "Pituophis catenifer", group: "Snakes" },
  { id: "grahams-crawfish-snake", commonName: "Graham's Crawfish Snake", sciName: "Regina grahamii", group: "Snakes" },
  { id: "brown-snake", commonName: "Brown Snake", sciName: "Storeria dekayi", group: "Snakes" },
  { id: "common-garter-snake", commonName: "Common Garter Snake", sciName: "Thamnophis sirtalis", group: "Snakes" },
  { id: "copperhead", commonName: "Copperhead", sciName: "Agkistrodon contortrix", group: "Snakes" },
  { id: "timber-rattlesnake", commonName: "Timber Rattlesnake", sciName: "Crotalus horridus", group: "Snakes" },
  { id: "prairie-rattlesnake", commonName: "Prairie Rattlesnake", sciName: "Crotalus viridis", group: "Snakes" },
  { id: "eastern-massasauga", commonName: "Eastern Massasauga Rattlesnake", sciName: "Sistrurus catenatus", group: "Snakes" },

  // --- Lizards ---
  { id: "five-lined-skink", commonName: "Five-lined Skink", sciName: "Plestiodon fasciatus", group: "Lizards" },
];

const CATEGORIES = {
  fish: { label: "Fishes", species: FISH },
  herps: { label: "Herps", species: HERPS },
};

module.exports = { FISH, HERPS, CATEGORIES };
