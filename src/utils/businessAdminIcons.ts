export type BusinessIconCategory = 'nails' | 'hair' | 'massage' | 'cosmetics' | 'classic';

export const BUSINESS_ICON_CATEGORIES = [
  {
    "id": "nails",
    "label": "ציפורניים"
  },
  {
    "id": "hair",
    "label": "שיער ומספרה"
  },
  {
    "id": "massage",
    "label": "עיסוי וספא"
  },
  {
    "id": "cosmetics",
    "label": "קוסמטיקה"
  },
  {
    "id": "classic",
    "label": "אלגנטי"
  }
] as const;

// Twenty-four original profession-specific vector designs per category: 12 motifs, each in open and seal compositions.

export const BUSINESS_ICON_SYMBOLS = [
  {
    "id": "nails",
    "label": "בקבוק לק",
    "category": "nails"
  },
  {
    "id": "nailpolish",
    "label": "מברשת לק",
    "category": "nails"
  },
  {
    "id": "nailhand",
    "label": "יד מטופחת",
    "category": "nails"
  },
  {
    "id": "nailfile",
    "label": "ציפורן שקד",
    "category": "nails"
  },
  {
    "id": "naillamp",
    "label": "פרנץ׳ מרובע",
    "category": "nails"
  },
  {
    "id": "naildrop",
    "label": "ציפורני בלרינה",
    "category": "nails"
  },
  {
    "id": "nailbrush",
    "label": "פצירה מקצועית",
    "category": "nails"
  },
  {
    "id": "nailcolor",
    "label": "מנורת ג׳ל",
    "category": "nails"
  },
  {
    "id": "nailgem",
    "label": "פדיקור",
    "category": "nails"
  },
  {
    "id": "nailflower",
    "label": "כלי עיטור",
    "category": "nails"
  },
  {
    "id": "nailsparkles",
    "label": "שמן קוטיקולה",
    "category": "nails"
  },
  {
    "id": "nailheart",
    "label": "ציפורן עם פרח",
    "category": "nails"
  },
  {
    "id": "nailwand",
    "label": "בקבוק לק — חותם",
    "category": "nails"
  },
  {
    "id": "nailleaf",
    "label": "מברשת לק — חותם",
    "category": "nails"
  },
  {
    "id": "nailcircle",
    "label": "יד מטופחת — חותם",
    "category": "nails"
  },
  {
    "id": "nailbadge",
    "label": "ציפורן שקד — חותם",
    "category": "nails"
  },
  {
    "id": "nailfan",
    "label": "פרנץ׳ מרובע — חותם",
    "category": "nails"
  },
  {
    "id": "nailshape",
    "label": "ציפורני בלרינה — חותם",
    "category": "nails"
  },
  {
    "id": "nailmirror",
    "label": "פצירה מקצועית — חותם",
    "category": "nails"
  },
  {
    "id": "nailsun",
    "label": "מנורת ג׳ל — חותם",
    "category": "nails"
  },
  {
    "id": "nailpipette",
    "label": "פדיקור — חותם",
    "category": "nails"
  },
  {
    "id": "naillayers",
    "label": "כלי עיטור — חותם",
    "category": "nails"
  },
  {
    "id": "nailhandheart",
    "label": "שמן קוטיקולה — חותם",
    "category": "nails"
  },
  {
    "id": "nailglow",
    "label": "ציפורן עם פרח — חותם",
    "category": "nails"
  },
  {
    "id": "scissors",
    "label": "מספריים קלאסיות",
    "category": "hair"
  },
  {
    "id": "comb",
    "label": "מסרק מקצועי",
    "category": "hair"
  },
  {
    "id": "hairdryer",
    "label": "פן",
    "category": "hair"
  },
  {
    "id": "hairbrush",
    "label": "מברשת עגולה",
    "category": "hair"
  },
  {
    "id": "barberpole",
    "label": "מכונת תספורת",
    "category": "hair"
  },
  {
    "id": "hairwaves",
    "label": "תער ספרים",
    "category": "hair"
  },
  {
    "id": "hairspray",
    "label": "תלתלים",
    "category": "hair"
  },
  {
    "id": "hairmirror",
    "label": "שיער גלי",
    "category": "hair"
  },
  {
    "id": "hairface",
    "label": "מחליק שיער",
    "category": "hair"
  },
  {
    "id": "hairlayers",
    "label": "קערת צבע",
    "category": "hair"
  },
  {
    "id": "hairshine",
    "label": "כיסא מספרה",
    "category": "hair"
  },
  {
    "id": "hairstraightener",
    "label": "מספריים ומסרק",
    "category": "hair"
  },
  {
    "id": "haircurl",
    "label": "מספריים קלאסיות — חותם",
    "category": "hair"
  },
  {
    "id": "hairtrim",
    "label": "מסרק מקצועי — חותם",
    "category": "hair"
  },
  {
    "id": "haircolor",
    "label": "פן — חותם",
    "category": "hair"
  },
  {
    "id": "haircare",
    "label": "מברשת עגולה — חותם",
    "category": "hair"
  },
  {
    "id": "hairfan",
    "label": "מכונת תספורת — חותם",
    "category": "hair"
  },
  {
    "id": "hairflower",
    "label": "תער ספרים — חותם",
    "category": "hair"
  },
  {
    "id": "hairstyle",
    "label": "תלתלים — חותם",
    "category": "hair"
  },
  {
    "id": "hairpart",
    "label": "שיער גלי — חותם",
    "category": "hair"
  },
  {
    "id": "hairclip",
    "label": "מחליק שיער — חותם",
    "category": "hair"
  },
  {
    "id": "hairwash",
    "label": "קערת צבע — חותם",
    "category": "hair"
  },
  {
    "id": "haircurlers",
    "label": "כיסא מספרה — חותם",
    "category": "hair"
  },
  {
    "id": "hairglow",
    "label": "מספריים ומסרק — חותם",
    "category": "hair"
  },
  {
    "id": "massagehands",
    "label": "אבנים חמות",
    "category": "massage"
  },
  {
    "id": "massagestones",
    "label": "עיסוי גב",
    "category": "massage"
  },
  {
    "id": "massageoil",
    "label": "מיטת טיפולים",
    "category": "massage"
  },
  {
    "id": "candle",
    "label": "שמן עיסוי",
    "category": "massage"
  },
  {
    "id": "lotus",
    "label": "נר ארומטי",
    "category": "massage"
  },
  {
    "id": "massgewaves",
    "label": "כדור צמחי מרפא",
    "category": "massage"
  },
  {
    "id": "spaBath",
    "label": "קערת ספא",
    "category": "massage"
  },
  {
    "id": "spaShower",
    "label": "ידיים מטפלות",
    "category": "massage"
  },
  {
    "id": "spaBubbles",
    "label": "רפלקסולוגיה",
    "category": "massage"
  },
  {
    "id": "spaLeaf",
    "label": "צוואר וכתפיים",
    "category": "massage"
  },
  {
    "id": "spaHeart",
    "label": "לוטוס ספא",
    "category": "massage"
  },
  {
    "id": "spaFan",
    "label": "מגבת מגולגלת",
    "category": "massage"
  },
  {
    "id": "spaMoon",
    "label": "אבנים חמות — חותם",
    "category": "massage"
  },
  {
    "id": "spaSun",
    "label": "עיסוי גב — חותם",
    "category": "massage"
  },
  {
    "id": "spaHands",
    "label": "מיטת טיפולים — חותם",
    "category": "massage"
  },
  {
    "id": "spaFace",
    "label": "שמן עיסוי — חותם",
    "category": "massage"
  },
  {
    "id": "spaWater",
    "label": "נר ארומטי — חותם",
    "category": "massage"
  },
  {
    "id": "spaGlow",
    "label": "כדור צמחי מרפא — חותם",
    "category": "massage"
  },
  {
    "id": "spaAroma",
    "label": "קערת ספא — חותם",
    "category": "massage"
  },
  {
    "id": "spaRoom",
    "label": "ידיים מטפלות — חותם",
    "category": "massage"
  },
  {
    "id": "spaCare",
    "label": "רפלקסולוגיה — חותם",
    "category": "massage"
  },
  {
    "id": "spaCup",
    "label": "צוואר וכתפיים — חותם",
    "category": "massage"
  },
  {
    "id": "spaNatural",
    "label": "לוטוס ספא — חותם",
    "category": "massage"
  },
  {
    "id": "spaBalance",
    "label": "מגבת מגולגלת — חותם",
    "category": "massage"
  },
  {
    "id": "face",
    "label": "פרופיל פנים",
    "category": "cosmetics"
  },
  {
    "id": "lashes",
    "label": "מסכת פנים",
    "category": "cosmetics"
  },
  {
    "id": "brow",
    "label": "ריסים ארוכים",
    "category": "cosmetics"
  },
  {
    "id": "makeupbrush",
    "label": "עיצוב גבות",
    "category": "cosmetics"
  },
  {
    "id": "lipstick",
    "label": "שפתיים",
    "category": "cosmetics"
  },
  {
    "id": "skincare",
    "label": "שפתון",
    "category": "cosmetics"
  },
  {
    "id": "mirror",
    "label": "מברשת איפור",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticEye",
    "label": "קרם פנים",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticPalette",
    "label": "סרום פנים",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticWand",
    "label": "רולר לפנים",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticFlower",
    "label": "מראה ידנית",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticGem",
    "label": "גוואשה",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticBrush",
    "label": "פרופיל פנים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticBottle",
    "label": "מסכת פנים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticSerum",
    "label": "ריסים ארוכים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticFace",
    "label": "עיצוב גבות — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticSparkles",
    "label": "שפתיים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticHand",
    "label": "שפתון — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticLeaf",
    "label": "מברשת איפור — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticHeart",
    "label": "קרם פנים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticSun",
    "label": "סרום פנים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticCheck",
    "label": "רולר לפנים — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticShapes",
    "label": "מראה ידנית — חותם",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticDrop",
    "label": "גוואשה — חותם",
    "category": "cosmetics"
  },
  {
    "id": "classicMirror",
    "label": "מראה אובלית",
    "category": "classic"
  },
  {
    "id": "flower",
    "label": "פרח קמליה",
    "category": "classic"
  },
  {
    "id": "classicLotus",
    "label": "לוטוס עדין",
    "category": "classic"
  },
  {
    "id": "diamond",
    "label": "יהלום בחיתוך",
    "category": "classic"
  },
  {
    "id": "sparkle",
    "label": "כוכב אור",
    "category": "classic"
  },
  { "id": "nailsHandGem", "label": "מניקור תכשיטי", "category": "nails" },
  { "id": "nailsPolishRose", "label": "בקבוק לק ורוד", "category": "nails" },
  { "id": "nailsHandSeal", "label": "יד מטופחת בזהב", "category": "nails" },
  { "id": "nailsBrushArt", "label": "מברשת ועיטור", "category": "nails" },
  { "id": "hairScissorsGem", "label": "מספריים ותלתל", "category": "hair" },
  { "id": "hairCombCurls", "label": "מסרק ותלתלים", "category": "hair" },
  { "id": "hairDryer", "label": "מייבש שיער", "category": "hair" },
  { "id": "hairBarberPole", "label": "מספריים ומוט ספר", "category": "hair" },
  { "id": "massageStoneHands", "label": "אבני עיסוי", "category": "massage" },
  { "id": "massageHands", "label": "עיסוי גב", "category": "massage" },
  { "id": "massageOil", "label": "שמן ולבנדר", "category": "massage" },
  { "id": "massageTowels", "label": "מגבות וספא", "category": "massage" },
  { "id": "cosmeticsEye", "label": "איפור עיניים", "category": "cosmetics" },
  { "id": "cosmeticsFace", "label": "טיפוח פנים", "category": "cosmetics" },
  { "id": "cosmeticsSkin", "label": "טיפוח וזוהר", "category": "cosmetics" },
  { "id": "cosmeticsMakeup", "label": "איפור מקצועי", "category": "cosmetics" }
] as const;

const LEGACY_BUSINESS_ICON_SYMBOLS = [
  {
    "id": "crown",
    "label": "כתר",
    "glyph": "👑"
  },
  {
    "id": "butterfly",
    "label": "פרפר",
    "glyph": "🦋"
  },
  {
    "id": "leaf",
    "label": "עלה",
    "glyph": "🌿"
  },
  {
    "id": "moon",
    "label": "ירח",
    "glyph": "🌙"
  },
  {
    "id": "sun",
    "label": "שמש",
    "glyph": "☀️"
  },
  {
    "id": "heart",
    "label": "לב",
    "glyph": "💖"
  },
  {
    "id": "hibiscus",
    "label": "היביסקוס",
    "glyph": "🌺"
  },
  {
    "id": "bouquet",
    "label": "זר פרחים",
    "glyph": "💐"
  },
  {
    "id": "palette",
    "label": "פלטה",
    "glyph": "🎨"
  },
  {
    "id": "lavender",
    "label": "לבנדר",
    "glyph": "🪻"
  },
  {
    "id": "sunflower",
    "label": "חמנייה",
    "glyph": "🌻"
  },
  {
    "id": "shell",
    "label": "צדף",
    "glyph": "🐚"
  },
  {
    "id": "peacock",
    "label": "טווס",
    "glyph": "🦚"
  },
  {
    "id": "eye",
    "label": "עין טובה",
    "glyph": "🧿"
  },
  {
    "id": "music",
    "label": "מוזיקה",
    "glyph": "🎼"
  },
  {
    "id": "wand",
    "label": "שרביט",
    "glyph": "🪄"
  },
  {
    "id": "star",
    "label": "כוכב",
    "glyph": "⭐"
  },
  {
    "id": "orange",
    "label": "תפוז",
    "glyph": "🍊"
  }
] as const;

export const BUSINESS_ICON_COLORS = [
  {
    "id": "purple",
    "label": "סגול",
    "value": "#6d28d9"
  },
  {
    "id": "pink",
    "label": "ורוד",
    "value": "#be185d"
  },
  {
    "id": "teal",
    "label": "טורקיז",
    "value": "#0f766e"
  },
  {
    "id": "blue",
    "label": "כחול",
    "value": "#1d4ed8"
  },
  {
    "id": "red",
    "label": "אדום",
    "value": "#b91c1c"
  },
  {
    "id": "orange",
    "label": "כתום",
    "value": "#c2410c"
  },
  {
    "id": "green",
    "label": "ירוק",
    "value": "#15803d"
  },
  {
    "id": "gold",
    "label": "זהב",
    "value": "#a16207"
  },
  {
    "id": "wine",
    "label": "בורדו",
    "value": "#881337"
  },
  {
    "id": "indigo",
    "label": "אינדיגו",
    "value": "#4338ca"
  },
  {
    "id": "mint",
    "label": "מנטה",
    "value": "#047857"
  },
  {
    "id": "peach",
    "label": "אפרסק",
    "value": "#ea580c"
  },
  {
    "id": "slate",
    "label": "אפור",
    "value": "#334155"
  },
  {
    "id": "black",
    "label": "שחור",
    "value": "#18181b"
  },
  {
    "id": "cyan",
    "label": "תכלת",
    "value": "#0e7490"
  },
  {
    "id": "fuchsia",
    "label": "פוקסיה",
    "value": "#a21caf"
  }
] as const;

const ICON_ART: Record<string, string> = {
  "nails": "<rect x=\"24\" y=\"8\" width=\"16\" height=\"18\" rx=\"3\"/><rect x=\"19\" y=\"27\" width=\"26\" height=\"27\" rx=\"7\"/><path d=\"M25 34v12M25 50h14M29 12v10M35 12v10\"/>",
  "nailpolish": "<path d=\"M18 49c2-12 6-20 14-28l9 9c-8 8-16 14-23 19Z M31 20 40 7l10 9-9 13 M24 36l7 6M17 54c8 1 17-1 24-7\"/>",
  "nailhand": "<path d=\"M22 56c-7-9-11-16-12-22-1-4 4-5 6-1l5 8V17c0-6 7-6 7 0v17-24c0-6 7-6 7 0v24-20c0-6 7-6 7 0v22-14c0-6 7-6 7 0v20c0 6-3 10-6 14 M23 17h3M30 10h3M37 14h3M44 22h3\"/>",
  "nailfile": "<path d=\"M21 47V26c0-10 6-17 11-21 5 4 11 11 11 21v21c0 10-22 10-22 0Z M23 21c5 5 13 5 18 0M26 44v-9\"/>",
  "naillamp": "<path d=\"M21 13q11-5 22 0v34c0 12-22 12-22 0Z M21 21q11 5 22 0M26 31v12\"/>",
  "naildrop": "<path d=\"M20 20 26 7h12l6 13-3 30q-9 9-18 0Z M22 20q10 4 20 0M27 32v12\"/>",
  "nailbrush": "<g transform=\"rotate(35 32 32)\"><rect x=\"26\" y=\"7\" width=\"12\" height=\"50\" rx=\"6\"/><path d=\"M29 20h6M29 25h6M29 30h6M29 35h6M29 40h6M29 45h6\"/></g>",
  "nailcolor": "<path d=\"M9 45V33c0-13 9-21 23-21s23 8 23 21v12H9Z M15 45V33q17-12 34 0v12M24 18h16M13 51h38M24 37v4M32 36v5M40 37v4\"/>",
  "nailgem": "<path d=\"M24 53c-12-3-9-14-2-23 5-7 4-16 7-20 3-5 8-2 7 3l-1 15c8 4 12 10 12 17 0 10-14 12-23 8Z M29 13h5M22 43q7-6 17 0\"/><circle cx=\"43\" cy=\"19\" r=\"3\"/><circle cx=\"49\" cy=\"25\" r=\"2.6\"/><circle cx=\"52\" cy=\"32\" r=\"2.2\"/>",
  "nailflower": "<path d=\"M16 49 44 17M20 52 48 20M17 48l5 4M42 18l6 4\"/><circle cx=\"49\" cy=\"13\" r=\"3\"/><circle cx=\"14\" cy=\"54\" r=\"2\"/><path d=\"M16 17v8M12 21h8M35 44v10M30 49h10\"/>",
  "nailsparkles": "<rect x=\"22\" y=\"27\" width=\"20\" height=\"27\" rx=\"5\"/><path d=\"M25 27V17h14v10M28 17V8h8v9M32 33c-9 11-7 15 0 15s9-4 0-15Z\"/>",
  "nailheart": "<path d=\"M20 46V25q0-17 12-19 12 2 12 19v21q0 10-12 10T20 46Z M24 18h16\"/><circle cx=\"32\" cy=\"36\" r=\"2\"/><path d=\"M30 34c-7-10 6-10 4 0 10-7 10 6 0 4 7 10-6 10-4 0-10 7-10-6 0-4Z\"/>",
  "nailwand": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"24\" y=\"8\" width=\"16\" height=\"18\" rx=\"3\"/><rect x=\"19\" y=\"27\" width=\"26\" height=\"27\" rx=\"7\"/><path d=\"M25 34v12M25 50h14M29 12v10M35 12v10\"/></g>",
  "nailleaf": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M18 49c2-12 6-20 14-28l9 9c-8 8-16 14-23 19Z M31 20 40 7l10 9-9 13 M24 36l7 6M17 54c8 1 17-1 24-7\"/></g>",
  "nailcircle": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M22 56c-7-9-11-16-12-22-1-4 4-5 6-1l5 8V17c0-6 7-6 7 0v17-24c0-6 7-6 7 0v24-20c0-6 7-6 7 0v22-14c0-6 7-6 7 0v20c0 6-3 10-6 14 M23 17h3M30 10h3M37 14h3M44 22h3\"/></g>",
  "nailbadge": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M21 47V26c0-10 6-17 11-21 5 4 11 11 11 21v21c0 10-22 10-22 0Z M23 21c5 5 13 5 18 0M26 44v-9\"/></g>",
  "nailfan": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M21 13q11-5 22 0v34c0 12-22 12-22 0Z M21 21q11 5 22 0M26 31v12\"/></g>",
  "nailshape": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M20 20 26 7h12l6 13-3 30q-9 9-18 0Z M22 20q10 4 20 0M27 32v12\"/></g>",
  "nailmirror": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><g transform=\"rotate(35 32 32)\"><rect x=\"26\" y=\"7\" width=\"12\" height=\"50\" rx=\"6\"/><path d=\"M29 20h6M29 25h6M29 30h6M29 35h6M29 40h6M29 45h6\"/></g></g>",
  "nailsun": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M9 45V33c0-13 9-21 23-21s23 8 23 21v12H9Z M15 45V33q17-12 34 0v12M24 18h16M13 51h38M24 37v4M32 36v5M40 37v4\"/></g>",
  "nailpipette": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M24 53c-12-3-9-14-2-23 5-7 4-16 7-20 3-5 8-2 7 3l-1 15c8 4 12 10 12 17 0 10-14 12-23 8Z M29 13h5M22 43q7-6 17 0\"/><circle cx=\"43\" cy=\"19\" r=\"3\"/><circle cx=\"49\" cy=\"25\" r=\"2.6\"/><circle cx=\"52\" cy=\"32\" r=\"2.2\"/></g>",
  "naillayers": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M16 49 44 17M20 52 48 20M17 48l5 4M42 18l6 4\"/><circle cx=\"49\" cy=\"13\" r=\"3\"/><circle cx=\"14\" cy=\"54\" r=\"2\"/><path d=\"M16 17v8M12 21h8M35 44v10M30 49h10\"/></g>",
  "nailhandheart": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"22\" y=\"27\" width=\"20\" height=\"27\" rx=\"5\"/><path d=\"M25 27V17h14v10M28 17V8h8v9M32 33c-9 11-7 15 0 15s9-4 0-15Z\"/></g>",
  "nailglow": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M20 46V25q0-17 12-19 12 2 12 19v21q0 10-12 10T20 46Z M24 18h16\"/><circle cx=\"32\" cy=\"36\" r=\"2\"/><path d=\"M30 34c-7-10 6-10 4 0 10-7 10 6 0 4 7 10-6 10-4 0-10 7-10-6 0-4Z\"/></g>",
  "scissors": "<circle cx=\"20\" cy=\"46\" r=\"7\"/><circle cx=\"43\" cy=\"46\" r=\"7\"/><path d=\"M24 40 45 8c2 11-2 19-10 27M39 40 18 8c-2 11 2 19 10 27\"/><circle cx=\"32\" cy=\"30\" r=\"1.5\"/>",
  "comb": "<g transform=\"rotate(-25 32 32)\"><rect x=\"9\" y=\"21\" width=\"46\" height=\"9\" rx=\"3\"/><path d=\"M13 30v14M19 30v14M25 30v14M31 30v14M37 30v14M43 30v14M49 30v14\"/></g>",
  "hairdryer": "<path d=\"M13 17h20c12 0 18 6 18 14s-6 14-18 14H13V17Z M13 23H7v16h6M26 45l3 12h11l-5-12M52 23l5-3M54 31h6M52 39l5 3\"/><circle cx=\"34\" cy=\"31\" r=\"7\"/><path d=\"M31 27v8M37 27v8\"/>",
  "hairbrush": "<rect x=\"21\" y=\"8\" width=\"22\" height=\"29\" rx=\"9\"/><path d=\"M27 37v18h10V37M17 15h4M17 22h4M17 29h4M43 15h4M43 22h4M43 29h4M27 15v15M32 13v19M37 15v15\"/>",
  "barberpole": "<rect x=\"22\" y=\"21\" width=\"20\" height=\"34\" rx=\"6\"/><path d=\"M22 21V11h20v10M25 6v5M30 6v5M35 6v5M40 6v5M22 28h20\"/><rect x=\"29\" y=\"35\" width=\"6\" height=\"10\" rx=\"2\"/>",
  "hairwaves": "<path d=\"M13 46 43 11q7-5 10 1L28 43M20 40 8 53q-2 6 4 5l20-17M32 39l-5-4M44 13l5 4\"/><circle cx=\"22\" cy=\"43\" r=\"1.5\"/>",
  "hairspray": "<path d=\"M44 9c-30-5-34 18-20 24 13 6 24-8 13-14-9-5-16 9-8 17 5 5 14 8 11 15-3 6-11 7-17 3M38 7c14 5 19 17 11 26M20 36c-9 3-9 14-3 20\"/>",
  "hairmirror": "<path d=\"M18 54C4 27 17 9 33 9c18 0 26 24 13 43M25 53c-8-14-8-31 1-37M32 54c-7-14-7-28 2-37M40 52c-7-12-7-24 2-30M13 39c7 5 9 10 9 17\"/>",
  "hairface": "<g transform=\"rotate(-25 32 32)\"><path d=\"M25 55V9h7v42q0 6-7 4Z M32 51 43 9l7 2-11 42q-2 6-7-2Z M27 15v23M43 16l-6 22\"/></g>",
  "hairlayers": "<path d=\"M10 30h44c0 16-8 23-22 23S10 46 10 30Z M7 30h50M19 23l15-17 7 5-16 19M32 9l6 5M23 42q6 6 15 3\"/>",
  "hairshine": "<rect x=\"18\" y=\"10\" width=\"28\" height=\"22\" rx=\"5\"/><path d=\"M18 26H9v15h46V26h-9M15 41v5h34v-5M32 46v10M22 56h20M24 17h16\"/>",
  "hairstraightener": "<path d=\"M11 10h42v7H11ZM16 17v9M23 17v9M30 17v9M37 17v9M44 17v9M51 17v9M23 46 44 28M39 46 20 28\"/><circle cx=\"19\" cy=\"50\" r=\"5\"/><circle cx=\"43\" cy=\"50\" r=\"5\"/>",
  "haircurl": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><circle cx=\"20\" cy=\"46\" r=\"7\"/><circle cx=\"43\" cy=\"46\" r=\"7\"/><path d=\"M24 40 45 8c2 11-2 19-10 27M39 40 18 8c-2 11 2 19 10 27\"/><circle cx=\"32\" cy=\"30\" r=\"1.5\"/></g>",
  "hairtrim": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><g transform=\"rotate(-25 32 32)\"><rect x=\"9\" y=\"21\" width=\"46\" height=\"9\" rx=\"3\"/><path d=\"M13 30v14M19 30v14M25 30v14M31 30v14M37 30v14M43 30v14M49 30v14\"/></g></g>",
  "haircolor": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M13 17h20c12 0 18 6 18 14s-6 14-18 14H13V17Z M13 23H7v16h6M26 45l3 12h11l-5-12M52 23l5-3M54 31h6M52 39l5 3\"/><circle cx=\"34\" cy=\"31\" r=\"7\"/><path d=\"M31 27v8M37 27v8\"/></g>",
  "haircare": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"21\" y=\"8\" width=\"22\" height=\"29\" rx=\"9\"/><path d=\"M27 37v18h10V37M17 15h4M17 22h4M17 29h4M43 15h4M43 22h4M43 29h4M27 15v15M32 13v19M37 15v15\"/></g>",
  "hairfan": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"22\" y=\"21\" width=\"20\" height=\"34\" rx=\"6\"/><path d=\"M22 21V11h20v10M25 6v5M30 6v5M35 6v5M40 6v5M22 28h20\"/><rect x=\"29\" y=\"35\" width=\"6\" height=\"10\" rx=\"2\"/></g>",
  "hairflower": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M13 46 43 11q7-5 10 1L28 43M20 40 8 53q-2 6 4 5l20-17M32 39l-5-4M44 13l5 4\"/><circle cx=\"22\" cy=\"43\" r=\"1.5\"/></g>",
  "hairstyle": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M44 9c-30-5-34 18-20 24 13 6 24-8 13-14-9-5-16 9-8 17 5 5 14 8 11 15-3 6-11 7-17 3M38 7c14 5 19 17 11 26M20 36c-9 3-9 14-3 20\"/></g>",
  "hairpart": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M18 54C4 27 17 9 33 9c18 0 26 24 13 43M25 53c-8-14-8-31 1-37M32 54c-7-14-7-28 2-37M40 52c-7-12-7-24 2-30M13 39c7 5 9 10 9 17\"/></g>",
  "hairclip": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><g transform=\"rotate(-25 32 32)\"><path d=\"M25 55V9h7v42q0 6-7 4Z M32 51 43 9l7 2-11 42q-2 6-7-2Z M27 15v23M43 16l-6 22\"/></g></g>",
  "hairwash": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M10 30h44c0 16-8 23-22 23S10 46 10 30Z M7 30h50M19 23l15-17 7 5-16 19M32 9l6 5M23 42q6 6 15 3\"/></g>",
  "haircurlers": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"18\" y=\"10\" width=\"28\" height=\"22\" rx=\"5\"/><path d=\"M18 26H9v15h46V26h-9M15 41v5h34v-5M32 46v10M22 56h20M24 17h16\"/></g>",
  "hairglow": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M11 10h42v7H11ZM16 17v9M23 17v9M30 17v9M37 17v9M44 17v9M51 17v9M23 46 44 28M39 46 20 28\"/><circle cx=\"19\" cy=\"50\" r=\"5\"/><circle cx=\"43\" cy=\"50\" r=\"5\"/></g>",
  "massagehands": "<path d=\"M12 47c0-10 40-10 40 0s-40 10-40 0Z M18 34c0-9 28-9 28 0s-28 9-28 0Z M24 22c0-7 16-7 16 0s-16 7-16 0Z M25 8q-4 3 0 6M34 5q-4 4 0 8M42 8q-4 3 0 6\"/>",
  "massagestones": "<path d=\"M9 49q12-20 27-18l17 6M14 52h41M15 9l12 10 5 10M24 8l9 11 4 10M38 9 32 21M48 12 39 26M19 40q12-11 27-2\"/><circle cx=\"51\" cy=\"29\" r=\"5\"/>",
  "massageoil": "<rect x=\"9\" y=\"29\" width=\"46\" height=\"13\" rx=\"4\"/><path d=\"M14 42v13M50 42v13M14 49h36M12 29v-5h13v5M34 12q-5 4 0 8M44 9q-5 4 0 8\"/>",
  "candle": "<rect x=\"21\" y=\"26\" width=\"22\" height=\"29\" rx=\"6\"/><path d=\"M26 26V15h12v11M28 15V8h16M32 33c-9 10-7 15 0 15s9-5 0-15Z\"/>",
  "lotus": "<path d=\"M20 30h24v24H20ZM16 55h32M32 27c-11-6-2-14 0-20 3 6 10 14 0 20Z M26 35v12M24 30q8 4 16 0\"/>",
  "massgewaves": "<path d=\"M26 23 23 9q9 4 18 0l-3 14M24 23h16v6H24ZM25 29c-19 14-13 27 7 27s26-13 7-27M30 12v9M35 12v9M25 36q-9 8-2 13\"/>",
  "spaBath": "<path d=\"M9 31h46c-2 14-10 23-23 23S11 45 9 31Z M15 40h34M23 24c-8-8 8-7 0-15M33 24c-8-8 8-7 0-15M43 24c-8-8 8-7 0-15M24 56h16\"/>",
  "spaShower": "<path d=\"M8 46c6-7 10-13 15-13l10 4c3 2 1 5-2 5l-8-2M8 56l18-8 19-2c7-2 11-8 12-13M56 20c-6 7-10 13-15 13l-10-4c-3-2-1-5 2-5l8 2M56 10l-18 8-19 2C12 22 8 28 7 33\"/>",
  "spaBubbles": "<path d=\"M23 54c-11-3-8-14-2-23 6-8 3-16 7-21 3-4 9-1 7 5l-1 13c9 5 14 12 11 21-2 8-15 8-22 5Z\"/><circle cx=\"28\" cy=\"34\" r=\"2\"/><circle cx=\"25\" cy=\"44\" r=\"2\"/><circle cx=\"35\" cy=\"48\" r=\"2\"/><path d=\"M43 12h8M47 8v8M43 22h8M47 18v8\"/>",
  "spaLeaf": "<path d=\"M22 10q-3 13 5 19v7L9 43v11M42 10q3 13-5 19v7l18 7v11M22 40q10 8 20 0M18 47l-1 7M46 47l1 7M26 12q6-6 12 0\"/>",
  "spaHeart": "<path d=\"M32 48C18 37 18 23 32 9c14 14 14 28 0 39Z M32 48C15 49 8 38 8 24c14 2 23 11 24 24Z M32 48c17 1 24-10 24-24-14 2-23 11-24 24Z M17 54h30\"/>",
  "spaFan": "<path d=\"M16 24h29c17 0 17 28 0 28H16C-1 52-1 24 16 24Z M45 31c-10 0-10 14 0 14 5 0 5-7 0-7M17 18h27M22 12h17M13 31q-8 7 0 14\"/>",
  "spaMoon": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M12 47c0-10 40-10 40 0s-40 10-40 0Z M18 34c0-9 28-9 28 0s-28 9-28 0Z M24 22c0-7 16-7 16 0s-16 7-16 0Z M25 8q-4 3 0 6M34 5q-4 4 0 8M42 8q-4 3 0 6\"/></g>",
  "spaSun": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M9 49q12-20 27-18l17 6M14 52h41M15 9l12 10 5 10M24 8l9 11 4 10M38 9 32 21M48 12 39 26M19 40q12-11 27-2\"/><circle cx=\"51\" cy=\"29\" r=\"5\"/></g>",
  "spaHands": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"9\" y=\"29\" width=\"46\" height=\"13\" rx=\"4\"/><path d=\"M14 42v13M50 42v13M14 49h36M12 29v-5h13v5M34 12q-5 4 0 8M44 9q-5 4 0 8\"/></g>",
  "spaFace": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"21\" y=\"26\" width=\"22\" height=\"29\" rx=\"6\"/><path d=\"M26 26V15h12v11M28 15V8h16M32 33c-9 10-7 15 0 15s9-5 0-15Z\"/></g>",
  "spaWater": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M20 30h24v24H20ZM16 55h32M32 27c-11-6-2-14 0-20 3 6 10 14 0 20Z M26 35v12M24 30q8 4 16 0\"/></g>",
  "spaGlow": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M26 23 23 9q9 4 18 0l-3 14M24 23h16v6H24ZM25 29c-19 14-13 27 7 27s26-13 7-27M30 12v9M35 12v9M25 36q-9 8-2 13\"/></g>",
  "spaAroma": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M9 31h46c-2 14-10 23-23 23S11 45 9 31Z M15 40h34M23 24c-8-8 8-7 0-15M33 24c-8-8 8-7 0-15M43 24c-8-8 8-7 0-15M24 56h16\"/></g>",
  "spaRoom": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M8 46c6-7 10-13 15-13l10 4c3 2 1 5-2 5l-8-2M8 56l18-8 19-2c7-2 11-8 12-13M56 20c-6 7-10 13-15 13l-10-4c-3-2-1-5 2-5l8 2M56 10l-18 8-19 2C12 22 8 28 7 33\"/></g>",
  "spaCare": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M23 54c-11-3-8-14-2-23 6-8 3-16 7-21 3-4 9-1 7 5l-1 13c9 5 14 12 11 21-2 8-15 8-22 5Z\"/><circle cx=\"28\" cy=\"34\" r=\"2\"/><circle cx=\"25\" cy=\"44\" r=\"2\"/><circle cx=\"35\" cy=\"48\" r=\"2\"/><path d=\"M43 12h8M47 8v8M43 22h8M47 18v8\"/></g>",
  "spaCup": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M22 10q-3 13 5 19v7L9 43v11M42 10q3 13-5 19v7l18 7v11M22 40q10 8 20 0M18 47l-1 7M46 47l1 7M26 12q6-6 12 0\"/></g>",
  "spaNatural": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M32 48C18 37 18 23 32 9c14 14 14 28 0 39Z M32 48C15 49 8 38 8 24c14 2 23 11 24 24Z M32 48c17 1 24-10 24-24-14 2-23 11-24 24Z M17 54h30\"/></g>",
  "spaBalance": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M16 24h29c17 0 17 28 0 28H16C-1 52-1 24 16 24Z M45 31c-10 0-10 14 0 14 5 0 5-7 0-7M17 18h27M22 12h17M13 31q-8 7 0 14\"/></g>",
  "face": "<path d=\"M15 54c4-7 10-8 16-9V35c-8-4-11-12-8-20 5-13 25-11 27 3l-4 9 4 5-7 2c0 10-4 13-12 11M23 15c8 6 16 5 25 0M37 26h4M41 38h-5\"/>",
  "lashes": "<path d=\"M13 27c0-27 38-27 38 0 0 18-11 29-19 29S13 45 13 27Z M19 27q5-5 10 0M35 27q5-5 10 0M29 32l-2 8h8M25 46q7 4 14 0M18 16q14 8 28 0\"/>",
  "brow": "<path d=\"M11 26q21 24 42 0M13 29l-5 6M19 35l-3 8M27 39l-1 9M36 39l1 9M45 35l3 8M51 29l5 6M16 18q16-8 32 0\"/>",
  "makeupbrush": "<path d=\"M8 30q19-20 46-9-20-4-42 15Z M14 44q17-11 34-1M23 15l3 5M32 12l1 6M41 13l-1 6\"/>",
  "lipstick": "<path d=\"M7 32c11-3 14-16 25-7 11-9 14 4 25 7-15 3-35 3-50 0Z M7 32c14 25 36 25 50 0M17 34q15 10 30 0\"/>",
  "skincare": "<rect x=\"22\" y=\"36\" width=\"20\" height=\"20\" rx=\"2\"/><path d=\"M25 36V19l14-9v26M25 25h14M22 43h20M28 48v4\"/>",
  "mirror": "<path d=\"M26 34h12l-2 22h-8l-2-22Z M26 34c-10-8-11-16-4-25 5 4 15 4 20 0 7 9 6 17-4 25M24 26h16M28 17l2 8M35 17l-1 8\"/>",
  "cosmeticEye": "<rect x=\"14\" y=\"26\" width=\"36\" height=\"27\" rx=\"6\"/><rect x=\"16\" y=\"18\" width=\"32\" height=\"8\" rx=\"2\"/><path d=\"M14 34h36M25 44h14M23 13q9-7 18-2\"/>",
  "cosmeticPalette": "<rect x=\"21\" y=\"28\" width=\"22\" height=\"27\" rx=\"5\"/><path d=\"M26 28V18h12v10M28 18V8h8v10M21 38h22M28 45h8M49 13c-5 7-5 10 0 10s5-3 0-10Z\"/>",
  "cosmeticWand": "<rect x=\"15\" y=\"12\" width=\"34\" height=\"14\" rx=\"6\"/><path d=\"M12 17v14h40V17M32 31v8M28 39h8v16h-8Z M23 15v8M42 15v8\"/>",
  "cosmeticFlower": "<path d=\"M32 9c-24 0-24 31 0 31s24-31 0-31Z M27 40v14h10V40M23 21l8-7M24 29l17-14\"/>",
  "cosmeticGem": "<path d=\"M14 18c3-12 16-10 18-4 7-9 22-2 21 8-2 10-13 24-27 31-10 4-16-5-11-14 4-7-6-12-1-21Z M23 24q3-8 8-5M23 43q12-8 19-20\"/>",
  "cosmeticBrush": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M15 54c4-7 10-8 16-9V35c-8-4-11-12-8-20 5-13 25-11 27 3l-4 9 4 5-7 2c0 10-4 13-12 11M23 15c8 6 16 5 25 0M37 26h4M41 38h-5\"/></g>",
  "cosmeticBottle": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M13 27c0-27 38-27 38 0 0 18-11 29-19 29S13 45 13 27Z M19 27q5-5 10 0M35 27q5-5 10 0M29 32l-2 8h8M25 46q7 4 14 0M18 16q14 8 28 0\"/></g>",
  "cosmeticSerum": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M11 26q21 24 42 0M13 29l-5 6M19 35l-3 8M27 39l-1 9M36 39l1 9M45 35l3 8M51 29l5 6M16 18q16-8 32 0\"/></g>",
  "cosmeticFace": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M8 30q19-20 46-9-20-4-42 15Z M14 44q17-11 34-1M23 15l3 5M32 12l1 6M41 13l-1 6\"/></g>",
  "cosmeticSparkles": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M7 32c11-3 14-16 25-7 11-9 14 4 25 7-15 3-35 3-50 0Z M7 32c14 25 36 25 50 0M17 34q15 10 30 0\"/></g>",
  "cosmeticHand": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"22\" y=\"36\" width=\"20\" height=\"20\" rx=\"2\"/><path d=\"M25 36V19l14-9v26M25 25h14M22 43h20M28 48v4\"/></g>",
  "cosmeticLeaf": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M26 34h12l-2 22h-8l-2-22Z M26 34c-10-8-11-16-4-25 5 4 15 4 20 0 7 9 6 17-4 25M24 26h16M28 17l2 8M35 17l-1 8\"/></g>",
  "cosmeticHeart": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"14\" y=\"26\" width=\"36\" height=\"27\" rx=\"6\"/><rect x=\"16\" y=\"18\" width=\"32\" height=\"8\" rx=\"2\"/><path d=\"M14 34h36M25 44h14M23 13q9-7 18-2\"/></g>",
  "cosmeticSun": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"21\" y=\"28\" width=\"22\" height=\"27\" rx=\"5\"/><path d=\"M26 28V18h12v10M28 18V8h8v10M21 38h22M28 45h8M49 13c-5 7-5 10 0 10s5-3 0-10Z\"/></g>",
  "cosmeticCheck": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><rect x=\"15\" y=\"12\" width=\"34\" height=\"14\" rx=\"6\"/><path d=\"M12 17v14h40V17M32 31v8M28 39h8v16h-8Z M23 15v8M42 15v8\"/></g>",
  "cosmeticShapes": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M32 9c-24 0-24 31 0 31s24-31 0-31Z M27 40v14h10V40M23 21l8-7M24 29l17-14\"/></g>",
  "cosmeticDrop": "<path d=\"M17 7a28 28 0 1 0 30 0\"/><circle cx=\"32\" cy=\"5\" r=\"1.4\"/><g transform=\"translate(8 8) scale(.75)\"><path d=\"M14 18c3-12 16-10 18-4 7-9 22-2 21 8-2 10-13 24-27 31-10 4-16-5-11-14 4-7-6-12-1-21Z M23 24q3-8 8-5M23 43q12-8 19-20\"/></g>",
  "classicMirror": "<ellipse cx=\"32\" cy=\"26\" rx=\"18\" ry=\"21\"/><path d=\"M32 47v10M20 57h24M23 24l12-11M25 34l17-16\"/>",
  "flower": "<path d=\"M32 10c18-12 30 5 16 17 20 6 15 26-3 24-3 17-23 16-26 0-18 2-22-18-4-24C1 15 14-2 32 10Z M32 20c16-7 20 14 5 15-4 15-20 6-14-5-5-8 6-15 9-10Z\"/>",
  "classicLotus": "<path d=\"M32 51C13 41 20 19 32 5c12 14 19 36 0 46Z M32 51C12 54 3 39 7 21c15 5 22 14 25 30Z M32 51c20 3 29-12 25-30-15 5-22 14-25 30Z M19 58q13 4 26-2M32 43V22\"/>",
  "diamond": "<path d=\"M8 23 20 10h24l12 13-24 33L8 23Z M8 23h48M20 10l12 46 12-46M20 10l-3 13M44 10l3 13\"/>",
  "sparkle": "<path d=\"M32 7c3 17 8 22 25 25-17 3-22 8-25 25-3-17-8-22-25-25 17-3 22-8 25-25Z M12 8v10M7 13h10M51 47v10M46 52h10\"/>",
  "crown": "<path d=\"M12 20 22 30 32 11 42 30 52 20l-6 29H18L12 20Z M18 55h28\"/>",
  "butterfly": "<path d=\"M32 51V22M31 25C-1-9 1 35 26 35 0 52 24 65 32 40M33 25C65-9 63 35 38 35c26 17 2 30-6 5M32 22l-7-10M32 22l7-10\"/>",
  "leaf": "<path d=\"M13 54C2 23 28 8 53 8c0 30-14 48-40 46Z M13 54 43 18M24 42V29M24 42h14M34 32V21\"/>",
  "moon": "<path d=\"M43 9C3 0-3 56 34 56c10 0 17-6 21-13C23 51 15 22 43 9Z\"/>",
  "sun": "<circle cx=\"32\" cy=\"32\" r=\"13\"/><path d=\"M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6\"/>",
  "heart": "<path d=\"M32 53C-9 27 12 0 32 20 52 0 73 27 32 53Z M15 24q0-8 8-7\"/>",
  "hibiscus": "<path d=\"M32 10c18-12 30 5 16 17 20 6 15 26-3 24-3 17-23 16-26 0-18 2-22-18-4-24C1 15 14-2 32 10Z M32 20c16-7 20 14 5 15-4 15-20 6-14-5-5-8 6-15 9-10Z\"/><path d=\"M32 32 48 13\"/><circle cx=\"50\" cy=\"11\" r=\"2\"/>",
  "bouquet": "<path d=\"M32 10c18-12 30 5 16 17 20 6 15 26-3 24-3 17-23 16-26 0-18 2-22-18-4-24C1 15 14-2 32 10Z M32 20c16-7 20 14 5 15-4 15-20 6-14-5-5-8 6-15 9-10Z\"/><path d=\"M25 54l4 6h6l4-6\"/>",
  "palette": "<path d=\"M50 40c-9-2-19 8-23 13C4 59-2 29 14 14c22-20 50 0 42 15-2 4-11 2-6 11Z\"/><circle cx=\"20\" cy=\"25\" r=\"3\"/><circle cx=\"32\" cy=\"17\" r=\"3\"/><circle cx=\"43\" cy=\"22\" r=\"3\"/>",
  "lavender": "<path d=\"M29 56 35 8M31 43c-20-9-11-16 1-5M33 32c-20-9-11-16 1-5M34 21c-17-8-9-14 1-5M32 43c20-9 11-16 1-5M34 31c20-9 11-16 1-5M35 20c17-8 9-14 1-5\"/>",
  "sunflower": "<path d=\"M32 10c18-12 30 5 16 17 20 6 15 26-3 24-3 17-23 16-26 0-18 2-22-18-4-24C1 15 14-2 32 10Z M32 20c16-7 20 14 5 15-4 15-20 6-14-5-5-8 6-15 9-10Z\"/><circle cx=\"32\" cy=\"32\" r=\"7\"/>",
  "shell": "<path d=\"M12 45C-3 20 12 8 22 15 27 0 39 0 44 15c12-7 24 7 8 30l-12 6H24L12 45Z M24 51l-8-27M32 51V17M40 51l8-27M24 56h16\"/>",
  "peacock": "<path d=\"M32 55C-6 36 5 9 22 22c-4-25 25-25 20 0C60 9 70 36 32 55Z M32 55 18 25M32 55V15M32 55l15-30\"/><circle cx=\"32\" cy=\"39\" r=\"4\"/>",
  "eye": "<path d=\"M6 32q26-34 52 0-26 34-52 0Z\"/><circle cx=\"32\" cy=\"32\" r=\"10\"/><circle cx=\"32\" cy=\"32\" r=\"3\"/>",
  "music": "<path d=\"M25 43V13l25-5v30M25 21l25-5\"/><ellipse cx=\"18\" cy=\"47\" rx=\"8\" ry=\"6\"/><ellipse cx=\"43\" cy=\"42\" rx=\"8\" ry=\"6\"/>",
  "wand": "<path d=\"M10 54 43 21M15 57l33-33M39 17l5-12 5 12 11 5-11 5-5 12-5-12-11-5 11-5Z M13 10v12M7 16h12\"/>",
  "star": "<path d=\"M32 6 39 23 58 25 44 38 48 57 32 47 16 57 20 38 6 25 25 23Z\"/>",
  "orange": "<circle cx=\"32\" cy=\"38\" r=\"19\"/><path d=\"M32 19c-2-8 5-14 17-13-1 10-8 15-17 13Z M22 29q-8 6-5 14\"/>"
};

const LEGACY_SYMBOLS = [...BUSINESS_ICON_SYMBOLS, ...LEGACY_BUSINESS_ICON_SYMBOLS];
export const BUSINESS_SELECTABLE_ICON_IDS = BUSINESS_ICON_SYMBOLS.flatMap((symbol) => BUSINESS_ICON_COLORS.map((color) => `${symbol.id}_${color.id}`));
export const BUSINESS_ADMIN_ICON_IDS = [...new Set([...BUSINESS_SELECTABLE_ICON_IDS, ...LEGACY_BUSINESS_ICON_SYMBOLS.flatMap((symbol) => BUSINESS_ICON_COLORS.map((color) => `${symbol.id}_${color.id}`))])];
export const BUSINESS_ICON_RASTER_SYMBOL_IDS = [
  'nailsHandGem', 'nailsPolishRose', 'nailsHandSeal', 'nailsBrushArt',
  'hairScissorsGem', 'hairCombCurls', 'hairDryer', 'hairBarberPole',
  'massageStoneHands', 'massageHands', 'massageOil', 'massageTowels',
  'cosmeticsEye', 'cosmeticsFace', 'cosmeticsSkin', 'cosmeticsMakeup',
] as const;
const RASTER_ICON_IDS = new Set<string>(BUSINESS_ICON_RASTER_SYMBOL_IDS);
export function isBusinessAdminRasterIcon(iconId: string): boolean {
  const details = getBusinessAdminIconDetails(iconId);
  return Boolean(details && RASTER_ICON_IDS.has(details.symbol.id));
}
export function businessAdminIconId(symbolId: string, colorId: string): string { return `${symbolId}_${colorId}`; }
export function isBusinessAdminIconId(value: unknown): value is string { return typeof value === 'string' && BUSINESS_ADMIN_ICON_IDS.includes(value); }
export function getBusinessAdminIconDetails(iconId: string) {
  if (!isBusinessAdminIconId(iconId)) return null;
  const separator = iconId.lastIndexOf('_');
  const symbol = LEGACY_SYMBOLS.find((item) => item.id === iconId.slice(0, separator));
  const color = BUSINESS_ICON_COLORS.find((item) => item.id === iconId.slice(separator + 1));
  return symbol && color ? { symbol, color } : null;
}
function vectorArt(symbolId: string, color: string, width: string): string | null {
  const art = ICON_ART[symbolId];
  return art ? `<g fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" >${art}</g>` : null;
}
export function businessAdminIconPreviewSvg(symbolId: string): string | null {
  const art = vectorArt(symbolId, '#e8d7b4', '2.05');
  return art ? `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64">${art}</svg>` : null;
}
export function businessAdminIconPreviewAsset(symbolId: string): string | null {
  if (RASTER_ICON_IDS.has(symbolId)) return `/business-icon-artwork/${symbolId}.webp?v=39`;
  const svg = businessAdminIconPreviewSvg(symbolId);
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null;
}
function escapeXml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char); }
function businessNameInIcon(value: string): { label: string; fontSize: number } {
  const normalized = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return { label: '', fontSize: 0 };
  const chars = Array.from(normalized); const label = chars.length > 20 ? `${chars.slice(0, 19).join('')}…` : normalized;
  const length = Array.from(label).length; return { label: escapeXml(label), fontSize: length <= 8 ? 46 : length <= 12 ? 38 : length <= 16 ? 32 : 26 };
}
export function businessAdminIconAssetUrl(iconId: string, businessName = ''): string | null {
  if (!isBusinessAdminIconId(iconId)) return null; const label = String(businessName || '').trim();
  return `/tenant-admin-icons/${encodeURIComponent(iconId)}.svg?v=39${label ? `&name=${encodeURIComponent(label)}` : ''}`;
}
export function businessAdminIconSvg(iconId: string, businessName = '', rasterDataUri = ''): string | null {
  const details = getBusinessAdminIconDetails(iconId); if (!details) return null;
  const { symbol, color } = details; const label = businessNameInIcon(businessName); const art = vectorArt(symbol.id, '#fff7e8', '2.05');
  const picture = RASTER_ICON_IDS.has(symbol.id) && rasterDataUri
    ? `<image x="76" y="34" width="360" height="300" href="${rasterDataUri}" preserveAspectRatio="xMidYMid meet"/>`
    : art ? `<svg x="122" y="66" width="268" height="268" viewBox="0 0 64 64">${art}</svg>` : `<text x="256" y="205" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="170">${'glyph' in symbol ? symbol.glyph : '✦'}</text>`;
  const labelPanel = label.label ? `<rect x="42" y="348" width="428" height="96" rx="34" fill="#fff" fill-opacity=".16"/><text x="256" y="410" text-anchor="middle" dominant-baseline="central" direction="rtl" unicode-bidi="plaintext" font-family="Arial, Noto Sans Hebrew, sans-serif" font-size="${label.fontSize}" font-weight="800" fill="#fffdf8">${label.label}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color.value}"/><stop offset="1" stop-color="#17151b" stop-opacity=".34"/></linearGradient></defs><rect width="512" height="512" fill="url(#tile)"/><rect x="18" y="18" width="476" height="476" rx="112" fill="none" stroke="#fff" stroke-opacity=".20" stroke-width="3"/><circle cx="256" cy="202" r="133" fill="#fff" fill-opacity=".07"/>${picture}${labelPanel}</svg>`;
}

