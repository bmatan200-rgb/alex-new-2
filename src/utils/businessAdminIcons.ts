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

// Twenty-four crisp, scalable Lucide vector symbols per service category.

export const BUSINESS_ICON_SYMBOLS = [
  {
    "id": "nails",
    "label": "מניקור",
    "category": "nails"
  },
  {
    "id": "nailpolish",
    "label": "בקבוק לק",
    "category": "nails"
  },
  {
    "id": "nailhand",
    "label": "יד וציפורניים",
    "category": "nails"
  },
  {
    "id": "nailfile",
    "label": "פצירה",
    "category": "nails"
  },
  {
    "id": "naillamp",
    "label": "מנורת ייבוש",
    "category": "nails"
  },
  {
    "id": "naildrop",
    "label": "טיפות טיפוח",
    "category": "nails"
  },
  {
    "id": "nailbrush",
    "label": "מברשת ציפורניים",
    "category": "nails"
  },
  {
    "id": "nailcolor",
    "label": "פלטת צבעים",
    "category": "nails"
  },
  {
    "id": "nailgem",
    "label": "עיטור יהלום",
    "category": "nails"
  },
  {
    "id": "nailflower",
    "label": "פרח עדין",
    "category": "nails"
  },
  {
    "id": "nailsparkles",
    "label": "נצנוץ",
    "category": "nails"
  },
  {
    "id": "nailheart",
    "label": "טיפוח באהבה",
    "category": "nails"
  },
  {
    "id": "nailwand",
    "label": "קישוט ועיצוב",
    "category": "nails"
  },
  {
    "id": "nailleaf",
    "label": "טיפוח טבעי",
    "category": "nails"
  },
  {
    "id": "nailcircle",
    "label": "טבעת עיצוב",
    "category": "nails"
  },
  {
    "id": "nailbadge",
    "label": "טיפול מקצועי",
    "category": "nails"
  },
  {
    "id": "nailfan",
    "label": "ייבוש מהיר",
    "category": "nails"
  },
  {
    "id": "nailshape",
    "label": "צורות ועיטורים",
    "category": "nails"
  },
  {
    "id": "nailmirror",
    "label": "טיפוח ויופי",
    "category": "nails"
  },
  {
    "id": "nailsun",
    "label": "זוהר",
    "category": "nails"
  },
  {
    "id": "nailpipette",
    "label": "סרום לציפורן",
    "category": "nails"
  },
  {
    "id": "naillayers",
    "label": "שכבות לק",
    "category": "nails"
  },
  {
    "id": "nailhandheart",
    "label": "טיפול לידיים",
    "category": "nails"
  },
  {
    "id": "nailglow",
    "label": "ברק",
    "category": "nails"
  },
  {
    "id": "scissors",
    "label": "מספריים",
    "category": "hair"
  },
  {
    "id": "comb",
    "label": "מסרק",
    "category": "hair"
  },
  {
    "id": "hairdryer",
    "label": "מייבש שיער",
    "category": "hair"
  },
  {
    "id": "hairbrush",
    "label": "מברשת שיער",
    "category": "hair"
  },
  {
    "id": "barberpole",
    "label": "מספרת גברים",
    "category": "hair"
  },
  {
    "id": "hairwaves",
    "label": "שיער גלי",
    "category": "hair"
  },
  {
    "id": "hairspray",
    "label": "ספריי לשיער",
    "category": "hair"
  },
  {
    "id": "hairmirror",
    "label": "מראה וסידור",
    "category": "hair"
  },
  {
    "id": "hairface",
    "label": "עיצוב שיער",
    "category": "hair"
  },
  {
    "id": "hairlayers",
    "label": "שכבות ותספורת",
    "category": "hair"
  },
  {
    "id": "hairshine",
    "label": "ברק לשיער",
    "category": "hair"
  },
  {
    "id": "hairstraightener",
    "label": "החלקה ועיצוב",
    "category": "hair"
  },
  {
    "id": "haircurl",
    "label": "תלתלים",
    "category": "hair"
  },
  {
    "id": "hairtrim",
    "label": "דילול ועיצוב",
    "category": "hair"
  },
  {
    "id": "haircolor",
    "label": "צבע לשיער",
    "category": "hair"
  },
  {
    "id": "haircare",
    "label": "טיפוח שיער",
    "category": "hair"
  },
  {
    "id": "hairfan",
    "label": "ייבוש ועיצוב",
    "category": "hair"
  },
  {
    "id": "hairflower",
    "label": "תסרוקת ואירוע",
    "category": "hair"
  },
  {
    "id": "hairstyle",
    "label": "עיצוב מקצועי",
    "category": "hair"
  },
  {
    "id": "hairpart",
    "label": "חלוקת שיער",
    "category": "hair"
  },
  {
    "id": "hairclip",
    "label": "סיכות ועיצוב",
    "category": "hair"
  },
  {
    "id": "hairwash",
    "label": "חפיפה",
    "category": "hair"
  },
  {
    "id": "haircurlers",
    "label": "עיצוב תלתלים",
    "category": "hair"
  },
  {
    "id": "hairglow",
    "label": "גימור מבריק",
    "category": "hair"
  },
  {
    "id": "massagehands",
    "label": "עיסוי ידיים",
    "category": "massage"
  },
  {
    "id": "massagestones",
    "label": "אבני עיסוי",
    "category": "massage"
  },
  {
    "id": "massageoil",
    "label": "שמן טיפולי",
    "category": "massage"
  },
  {
    "id": "candle",
    "label": "נר ספא",
    "category": "massage"
  },
  {
    "id": "lotus",
    "label": "לוטוס",
    "category": "massage"
  },
  {
    "id": "massgewaves",
    "label": "רוגע וזרימה",
    "category": "massage"
  },
  {
    "id": "spaBath",
    "label": "אמבט ספא",
    "category": "massage"
  },
  {
    "id": "spaShower",
    "label": "מקלחת מרעננת",
    "category": "massage"
  },
  {
    "id": "spaBubbles",
    "label": "בועות וספא",
    "category": "massage"
  },
  {
    "id": "spaLeaf",
    "label": "טיפול טבעי",
    "category": "massage"
  },
  {
    "id": "spaHeart",
    "label": "רוגע ואיזון",
    "category": "massage"
  },
  {
    "id": "spaFan",
    "label": "אוויר צח",
    "category": "massage"
  },
  {
    "id": "spaMoon",
    "label": "טיפול ערב",
    "category": "massage"
  },
  {
    "id": "spaSun",
    "label": "חום ורוגע",
    "category": "massage"
  },
  {
    "id": "spaHands",
    "label": "טיפול בכפות ידיים",
    "category": "massage"
  },
  {
    "id": "spaFace",
    "label": "טיפול פנים",
    "category": "massage"
  },
  {
    "id": "spaWater",
    "label": "מים וטיפוח",
    "category": "massage"
  },
  {
    "id": "spaGlow",
    "label": "זוהר ורוגע",
    "category": "massage"
  },
  {
    "id": "spaAroma",
    "label": "ארומתרפיה",
    "category": "massage"
  },
  {
    "id": "spaRoom",
    "label": "חדר טיפולים",
    "category": "massage"
  },
  {
    "id": "spaCare",
    "label": "טיפול מקצועי",
    "category": "massage"
  },
  {
    "id": "spaCup",
    "label": "תה מרגיע",
    "category": "massage"
  },
  {
    "id": "spaNatural",
    "label": "טבע ושלווה",
    "category": "massage"
  },
  {
    "id": "spaBalance",
    "label": "איזון",
    "category": "massage"
  },
  {
    "id": "face",
    "label": "טיפולי פנים",
    "category": "cosmetics"
  },
  {
    "id": "lashes",
    "label": "ריסים",
    "category": "cosmetics"
  },
  {
    "id": "brow",
    "label": "עיצוב גבות",
    "category": "cosmetics"
  },
  {
    "id": "makeupbrush",
    "label": "מברשת איפור",
    "category": "cosmetics"
  },
  {
    "id": "lipstick",
    "label": "איפור מקצועי",
    "category": "cosmetics"
  },
  {
    "id": "skincare",
    "label": "טיפוח עור",
    "category": "cosmetics"
  },
  {
    "id": "mirror",
    "label": "מראה",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticEye",
    "label": "טיפוח עיניים",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticPalette",
    "label": "פלטת איפור",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticWand",
    "label": "איפור ויופי",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticFlower",
    "label": "יופי טבעי",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticGem",
    "label": "זוהר ויוקרה",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticBrush",
    "label": "מברשת קוסמטית",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticBottle",
    "label": "תכשיר טיפוח",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticSerum",
    "label": "סרום",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticFace",
    "label": "טיפול עור פנים",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticSparkles",
    "label": "זוהר",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticHand",
    "label": "טיפול עדין",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticLeaf",
    "label": "רכיבים טבעיים",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticHeart",
    "label": "טיפוח אישי",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticSun",
    "label": "עור זוהר",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticCheck",
    "label": "טיפול מקצועי",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticShapes",
    "label": "עיצוב ודיוק",
    "category": "cosmetics"
  },
  {
    "id": "cosmeticDrop",
    "label": "לחות לעור",
    "category": "cosmetics"
  },
  {
    "id": "classicMirror",
    "label": "מראה אלגנטית",
    "category": "classic"
  },
  {
    "id": "flower",
    "label": "פרח",
    "category": "classic"
  },
  {
    "id": "classicLotus",
    "label": "לוטוס אלגנטי",
    "category": "classic"
  },
  {
    "id": "diamond",
    "label": "יהלום",
    "category": "classic"
  },
  {
    "id": "sparkle",
    "label": "ניצוץ",
    "category": "classic"
  }
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
  "nails": "<path d=\"m14.622 17.897-10.68-2.913\" /><path d=\"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z\" /><path d=\"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15\" />",
  "nailpolish": "<path d=\"M10 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a6 6 0 0 0 1.2 3.6l.6.8A6 6 0 0 1 17 13v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a6 6 0 0 1 1.2-3.6l.6-.8A6 6 0 0 0 10 5z\" /><path d=\"M17 13h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4\" />",
  "nailhand": "<path d=\"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2\" /><path d=\"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2\" /><path d=\"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8\" /><path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\" />",
  "nailfile": "<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /><path d=\"M14 2v4a2 2 0 0 0 2 2h4\" />",
  "naillamp": "<path d=\"M12 12v6\" /><path d=\"M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23Z\" /><path d=\"M8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z\" />",
  "naildrop": "<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\" />",
  "nailbrush": "<path d=\"m11 10 3 3\" /><path d=\"M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z\" /><path d=\"M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031\" />",
  "nailcolor": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" /><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />",
  "nailgem": "<path d=\"M10.5 3 8 9l4 13 4-13-2.5-6\" /><path d=\"M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z\" /><path d=\"M2 9h20\" />",
  "nailflower": "<path d=\"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1\" /><circle cx=\"12\" cy=\"8\" r=\"2\" /><path d=\"M12 10v12\" /><path d=\"M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z\" /><path d=\"M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z\" />",
  "nailsparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "nailheart": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />",
  "nailwand": "<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /><path d=\"m14 7 3 3\" /><path d=\"M5 6v4\" /><path d=\"M19 14v4\" /><path d=\"M10 2v2\" /><path d=\"M7 8H3\" /><path d=\"M21 16h-4\" /><path d=\"M11 3H9\" />",
  "nailleaf": "<path d=\"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z\" /><path d=\"M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12\" />",
  "nailcircle": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><circle cx=\"12\" cy=\"12\" r=\"1\" />",
  "nailbadge": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /><path d=\"m9 12 2 2 4-4\" />",
  "nailfan": "<path d=\"M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z\" /><path d=\"M12 12v.01\" />",
  "nailshape": "<path d=\"M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z\" /><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" /><circle cx=\"17.5\" cy=\"17.5\" r=\"3.5\" />",
  "nailmirror": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />",
  "nailsun": "<circle cx=\"12\" cy=\"12\" r=\"4\" /><path d=\"M12 2v2\" /><path d=\"M12 20v2\" /><path d=\"m4.93 4.93 1.41 1.41\" /><path d=\"m17.66 17.66 1.41 1.41\" /><path d=\"M2 12h2\" /><path d=\"M20 12h2\" /><path d=\"m6.34 17.66-1.41 1.41\" /><path d=\"m19.07 4.93-1.41 1.41\" />",
  "nailpipette": "<path d=\"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12\" /><path d=\"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z\" /><path d=\"m2 22 .414-.414\" />",
  "naillayers": "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" /><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" /><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" />",
  "nailhandheart": "<path d=\"M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16\" /><path d=\"m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95\" /><path d=\"m2 15 6 6\" /><path d=\"m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91\" />",
  "nailglow": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" />",
  "scissors": "<circle cx=\"6\" cy=\"6\" r=\"3\" /><path d=\"M8.12 8.12 12 12\" /><path d=\"M20 4 8.12 15.88\" /><circle cx=\"6\" cy=\"18\" r=\"3\" /><path d=\"M14.8 14.8 20 20\" />",
  "comb": "<path d=\"M2 5h20\" /><path d=\"M6 12h12\" /><path d=\"M9 19h6\" />",
  "hairdryer": "<path d=\"M12.8 19.6A2 2 0 1 0 14 16H2\" /><path d=\"M17.5 8a2.5 2.5 0 1 1 2 4H2\" /><path d=\"M9.8 4.4A2 2 0 1 1 11 8H2\" />",
  "hairbrush": "<path d=\"m11 10 3 3\" /><path d=\"M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z\" /><path d=\"M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031\" />",
  "barberpole": "<rect width=\"14\" height=\"6\" x=\"5\" y=\"16\" rx=\"2\" /><rect width=\"10\" height=\"6\" x=\"7\" y=\"2\" rx=\"2\" /><path d=\"M2 12h20\" />",
  "hairwaves": "<path d=\"M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\" /><path d=\"M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\" /><path d=\"M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\" />",
  "hairspray": "<path d=\"M3 3h.01\" /><path d=\"M7 5h.01\" /><path d=\"M11 7h.01\" /><path d=\"M3 7h.01\" /><path d=\"M7 9h.01\" /><path d=\"M3 11h.01\" /><rect width=\"4\" height=\"4\" x=\"15\" y=\"5\" /><path d=\"m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2\" /><path d=\"m13 14 8-2\" /><path d=\"m13 19 8-2\" />",
  "hairmirror": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />",
  "hairface": "<circle cx=\"12\" cy=\"8\" r=\"5\" /><path d=\"M20 21a8 8 0 0 0-16 0\" />",
  "hairlayers": "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" /><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" /><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" />",
  "hairshine": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "hairstraightener": "<path d=\"m18 8 4 4-4 4\" /><path d=\"M2 12h20\" /><path d=\"m6 8-4 4 4 4\" />",
  "haircurl": "<path d=\"M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2\" /><path d=\"m15.194 13.707 3.814 1.86-1.86 3.814\" /><path d=\"M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4\" />",
  "hairtrim": "<path d=\"M5.42 9.42 8 12\" /><circle cx=\"4\" cy=\"8\" r=\"2\" /><path d=\"m14 6-8.58 8.58\" /><circle cx=\"4\" cy=\"16\" r=\"2\" /><path d=\"M10.8 14.8 14 18\" /><path d=\"M16 12h-2\" /><path d=\"M22 12h-2\" />",
  "haircolor": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" /><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />",
  "haircare": "<path d=\"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z\" /><path d=\"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97\" />",
  "hairfan": "<path d=\"M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z\" /><path d=\"M12 12v.01\" />",
  "hairflower": "<path d=\"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1\" /><circle cx=\"12\" cy=\"8\" r=\"2\" /><path d=\"M12 10v12\" /><path d=\"M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z\" /><path d=\"M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z\" />",
  "hairstyle": "<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /><path d=\"m14 7 3 3\" /><path d=\"M5 6v4\" /><path d=\"M19 14v4\" /><path d=\"M10 2v2\" /><path d=\"M7 8H3\" /><path d=\"M21 16h-4\" /><path d=\"M11 3H9\" />",
  "hairpart": "<path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\" /><path d=\"m14.5 12.5 2-2\" /><path d=\"m11.5 9.5 2-2\" /><path d=\"m8.5 6.5 2-2\" /><path d=\"m17.5 15.5 2-2\" />",
  "hairclip": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><circle cx=\"12\" cy=\"12\" r=\"1\" />",
  "hairwash": "<path d=\"m4 4 2.5 2.5\" /><path d=\"M13.5 6.5a4.95 4.95 0 0 0-7 7\" /><path d=\"M15 5 5 15\" /><path d=\"M14 17v.01\" /><path d=\"M10 16v.01\" /><path d=\"M13 13v.01\" /><path d=\"M16 10v.01\" /><path d=\"M11 20v.01\" /><path d=\"M17 14v.01\" /><path d=\"M20 11v.01\" />",
  "haircurlers": "<path d=\"M10.1 2.182a10 10 0 0 1 3.8 0\" /><path d=\"M13.9 21.818a10 10 0 0 1-3.8 0\" /><path d=\"M17.609 3.721a10 10 0 0 1 2.69 2.7\" /><path d=\"M2.182 13.9a10 10 0 0 1 0-3.8\" /><path d=\"M20.279 17.609a10 10 0 0 1-2.7 2.69\" /><path d=\"M21.818 10.1a10 10 0 0 1 0 3.8\" /><path d=\"M3.721 6.391a10 10 0 0 1 2.7-2.69\" /><path d=\"M6.391 20.279a10 10 0 0 1-2.69-2.7\" />",
  "hairglow": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" />",
  "massagehands": "<path d=\"M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16\" /><path d=\"m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95\" /><path d=\"m2 15 6 6\" /><path d=\"m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91\" />",
  "massagestones": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><circle cx=\"12\" cy=\"12\" r=\"1\" />",
  "massageoil": "<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\" />",
  "candle": "<path d=\"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4\" />",
  "lotus": "<path d=\"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1\" /><circle cx=\"12\" cy=\"8\" r=\"2\" /><path d=\"M12 10v12\" /><path d=\"M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z\" /><path d=\"M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z\" />",
  "massgewaves": "<path d=\"M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\" /><path d=\"M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\" /><path d=\"M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1\" />",
  "spaBath": "<path d=\"M10 4 8 6\" /><path d=\"M17 19v2\" /><path d=\"M2 12h20\" /><path d=\"M7 19v2\" /><path d=\"M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5\" />",
  "spaShower": "<path d=\"m4 4 2.5 2.5\" /><path d=\"M13.5 6.5a4.95 4.95 0 0 0-7 7\" /><path d=\"M15 5 5 15\" /><path d=\"M14 17v.01\" /><path d=\"M10 16v.01\" /><path d=\"M13 13v.01\" /><path d=\"M16 10v.01\" /><path d=\"M11 20v.01\" /><path d=\"M17 14v.01\" /><path d=\"M20 11v.01\" />",
  "spaBubbles": "<path d=\"M7.2 14.8a2 2 0 0 1 2 2\" /><circle cx=\"18.5\" cy=\"8.5\" r=\"3.5\" /><circle cx=\"7.5\" cy=\"16.5\" r=\"5.5\" /><circle cx=\"7.5\" cy=\"4.5\" r=\"2.5\" />",
  "spaLeaf": "<path d=\"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z\" /><path d=\"M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12\" />",
  "spaHeart": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />",
  "spaFan": "<path d=\"M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z\" /><path d=\"M12 12v.01\" />",
  "spaMoon": "<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\" />",
  "spaSun": "<circle cx=\"12\" cy=\"12\" r=\"4\" /><path d=\"M12 2v2\" /><path d=\"M12 20v2\" /><path d=\"m4.93 4.93 1.41 1.41\" /><path d=\"m17.66 17.66 1.41 1.41\" /><path d=\"M2 12h2\" /><path d=\"M20 12h2\" /><path d=\"m6.34 17.66-1.41 1.41\" /><path d=\"m19.07 4.93-1.41 1.41\" />",
  "spaHands": "<path d=\"M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14\" /><path d=\"m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9\" /><path d=\"m2 13 6 6\" />",
  "spaFace": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />",
  "spaWater": "<path d=\"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z\" /><path d=\"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97\" />",
  "spaGlow": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "spaAroma": "<path d=\"M12.8 19.6A2 2 0 1 0 14 16H2\" /><path d=\"M17.5 8a2.5 2.5 0 1 1 2 4H2\" /><path d=\"M9.8 4.4A2 2 0 1 1 11 8H2\" />",
  "spaRoom": "<path d=\"M11 20H2\" /><path d=\"M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z\" /><path d=\"M11 4H8a2 2 0 0 0-2 2v14\" /><path d=\"M14 12h.01\" /><path d=\"M22 20h-3\" />",
  "spaCare": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /><path d=\"m9 12 2 2 4-4\" />",
  "spaCup": "<path d=\"m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8\" /><path d=\"M5 8h14\" /><path d=\"M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0\" /><path d=\"m12 8 1-6h2\" />",
  "spaNatural": "<circle cx=\"12\" cy=\"12\" r=\"3\" /><path d=\"M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5\" /><path d=\"M12 7.5V9\" /><path d=\"M7.5 12H9\" /><path d=\"M16.5 12H15\" /><path d=\"M12 16.5V15\" /><path d=\"m8 8 1.88 1.88\" /><path d=\"M14.12 9.88 16 8\" /><path d=\"m8 16 1.88-1.88\" /><path d=\"M14.12 14.12 16 16\" />",
  "spaBalance": "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />",
  "face": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />",
  "lashes": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />",
  "brow": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><circle cx=\"12\" cy=\"12\" r=\"1\" /><path d=\"M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0\" />",
  "makeupbrush": "<path d=\"m14.622 17.897-10.68-2.913\" /><path d=\"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z\" /><path d=\"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15\" />",
  "lipstick": "<path d=\"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12\" /><path d=\"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z\" /><path d=\"m2 22 .414-.414\" />",
  "skincare": "<path d=\"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z\" /><path d=\"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97\" />",
  "mirror": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />",
  "cosmeticEye": "<path d=\"m15 18-.722-3.25\" /><path d=\"M2 8a10.645 10.645 0 0 0 20 0\" /><path d=\"m20 15-1.726-2.05\" /><path d=\"m4 15 1.726-2.05\" /><path d=\"m9 18 .722-3.25\" />",
  "cosmeticPalette": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" /><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />",
  "cosmeticWand": "<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /><path d=\"m14 7 3 3\" /><path d=\"M5 6v4\" /><path d=\"M19 14v4\" /><path d=\"M10 2v2\" /><path d=\"M7 8H3\" /><path d=\"M21 16h-4\" /><path d=\"M11 3H9\" />",
  "cosmeticFlower": "<path d=\"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1\" /><circle cx=\"12\" cy=\"8\" r=\"2\" /><path d=\"M12 10v12\" /><path d=\"M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z\" /><path d=\"M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z\" />",
  "cosmeticGem": "<path d=\"M10.5 3 8 9l4 13 4-13-2.5-6\" /><path d=\"M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z\" /><path d=\"M2 9h20\" />",
  "cosmeticBrush": "<path d=\"m11 10 3 3\" /><path d=\"M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z\" /><path d=\"M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031\" />",
  "cosmeticBottle": "<path d=\"M10 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a6 6 0 0 0 1.2 3.6l.6.8A6 6 0 0 1 17 13v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a6 6 0 0 1 1.2-3.6l.6-.8A6 6 0 0 0 10 5z\" /><path d=\"M17 13h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4\" />",
  "cosmeticSerum": "<path d=\"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12\" /><path d=\"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z\" /><path d=\"m2 22 .414-.414\" />",
  "cosmeticFace": "<circle cx=\"12\" cy=\"8\" r=\"5\" /><path d=\"M20 21a8 8 0 0 0-16 0\" />",
  "cosmeticSparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "cosmeticHand": "<path d=\"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2\" /><path d=\"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2\" /><path d=\"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8\" /><path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\" />",
  "cosmeticLeaf": "<path d=\"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z\" /><path d=\"M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12\" />",
  "cosmeticHeart": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />",
  "cosmeticSun": "<circle cx=\"12\" cy=\"12\" r=\"4\" /><path d=\"M12 2v2\" /><path d=\"M12 20v2\" /><path d=\"m4.93 4.93 1.41 1.41\" /><path d=\"m17.66 17.66 1.41 1.41\" /><path d=\"M2 12h2\" /><path d=\"M20 12h2\" /><path d=\"m6.34 17.66-1.41 1.41\" /><path d=\"m19.07 4.93-1.41 1.41\" />",
  "cosmeticCheck": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /><path d=\"m9 12 2 2 4-4\" />",
  "cosmeticShapes": "<path d=\"M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z\" /><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" /><circle cx=\"17.5\" cy=\"17.5\" r=\"3.5\" />",
  "cosmeticDrop": "<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\" />",
  "classicMirror": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />",
  "flower": "<circle cx=\"12\" cy=\"12\" r=\"3\" /><path d=\"M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5\" /><path d=\"M12 7.5V9\" /><path d=\"M7.5 12H9\" /><path d=\"M16.5 12H15\" /><path d=\"M12 16.5V15\" /><path d=\"m8 8 1.88 1.88\" /><path d=\"M14.12 9.88 16 8\" /><path d=\"m8 16 1.88-1.88\" /><path d=\"M14.12 14.12 16 16\" />",
  "classicLotus": "<path d=\"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1\" /><circle cx=\"12\" cy=\"8\" r=\"2\" /><path d=\"M12 10v12\" /><path d=\"M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z\" /><path d=\"M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z\" />",
  "diamond": "<path d=\"M10.5 3 8 9l4 13 4-13-2.5-6\" /><path d=\"M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z\" /><path d=\"M2 9h20\" />",
  "sparkle": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" />"
};

const LEGACY_SYMBOLS = [...BUSINESS_ICON_SYMBOLS, ...LEGACY_BUSINESS_ICON_SYMBOLS];
export const BUSINESS_SELECTABLE_ICON_IDS = BUSINESS_ICON_SYMBOLS.flatMap((symbol) => BUSINESS_ICON_COLORS.map((color) => `${symbol.id}_${color.id}`));
export const BUSINESS_ADMIN_ICON_IDS = [...new Set([...BUSINESS_SELECTABLE_ICON_IDS, ...LEGACY_BUSINESS_ICON_SYMBOLS.flatMap((symbol) => BUSINESS_ICON_COLORS.map((color) => `${symbol.id}_${color.id}`))])];
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
  const art = vectorArt(symbolId, '#e8d7b4', '1.7');
  return art ? `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24">${art}</svg>` : null;
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
  return `/tenant-admin-icons/${encodeURIComponent(iconId)}.svg${label ? `?name=${encodeURIComponent(label)}` : ''}`;
}
export function businessAdminIconSvg(iconId: string, businessName = ''): string | null {
  const details = getBusinessAdminIconDetails(iconId); if (!details) return null;
  const { symbol, color } = details; const label = businessNameInIcon(businessName); const art = vectorArt(symbol.id, '#fff7e8', '1.65');
  const picture = art ? `<svg x="168" y="84" width="176" height="176" viewBox="0 0 24 24">${art}</svg>` : `<text x="256" y="205" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="170">${'glyph' in symbol ? symbol.glyph : '✦'}</text>`;
  const labelPanel = label.label ? `<rect x="42" y="348" width="428" height="96" rx="34" fill="#fff" fill-opacity=".16"/><text x="256" y="410" text-anchor="middle" dominant-baseline="central" direction="rtl" unicode-bidi="plaintext" font-family="Arial, Noto Sans Hebrew, sans-serif" font-size="${label.fontSize}" font-weight="800" fill="#fffdf8" textLength="376" lengthAdjust="spacingAndGlyphs">${label.label}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color.value}"/><stop offset="1" stop-color="#17151b" stop-opacity=".34"/></linearGradient></defs><rect width="512" height="512" fill="url(#tile)"/><rect x="18" y="18" width="476" height="476" rx="112" fill="none" stroke="#fff" stroke-opacity=".20" stroke-width="3"/><circle cx="256" cy="202" r="133" fill="#fff" fill-opacity=".07"/>${picture}${labelPanel}</svg>`;
}

