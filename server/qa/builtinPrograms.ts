/* The two built-in programs, as plain data (generated from src/lib/data.ts BUILTIN: `npx tsx scripts/qa-builtin-programs.mjs`). server/ may not import src/lib (ADR 015), so the QA seed reads this copy; src/lib/qaBuiltinPrograms.test.ts fails when it drifts from BUILTIN. */
export const BUILTIN_PROGRAMS: Record<'A' | 'B', { days: { slots: { items: { ex: string; [k: string]: unknown }[]; [k: string]: unknown }[]; [k: string]: unknown }[]; [k: string]: unknown }> = {
 "A": {
  "days": [
   {
    "title": "Day 1",
    "slots": [
     {
      "id": "A-sled1",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sledlat",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "latpd",
        "ph": "hyp",
        "w": 45
       }
      ],
      "id": "A-d1s1"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "wristpd",
        "ph": "hyp",
        "w": 33
       }
      ],
      "id": "A-d1s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "platerot",
        "ph": "strength",
        "w": 10
       }
      ],
      "id": "A-d1s3"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "innerthigh",
        "ph": "strength",
        "w": 180
       }
      ],
      "id": "A-d1s4"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "romanadd",
        "ph": null,
        "w": null,
        "bw": true,
        "note": "On the back-extension bench"
       }
      ],
      "id": "A-d1s5"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "chestpress",
        "ph": "strength",
        "w": 35
       },
       {
        "ex": "zercher",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "A-d1s6"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "zottman",
        "ph": "hyp",
        "w": 15,
        "rx": "3 × 15"
       },
       {
        "ex": "kbleg",
        "ph": "iso",
        "w": 15,
        "rx": "3 × 15 s hold"
       }
      ],
      "id": "A-d1s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "A-d1s8"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "canoe",
        "ph": null,
        "w": 10,
        "note": "With a stick or barbell"
       }
      ],
      "id": "A-d1s9"
     }
    ]
   },
   {
    "title": "Day 2",
    "slots": [
     {
      "id": "A-sled2",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sledlat",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "suitcase",
        "ph": null,
        "w": 20,
        "rx": "3 × 4 each arm"
       }
      ],
      "id": "A-d2s1"
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Accessory",
      "items": [
       {
        "ex": "reardelt",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 15 s per arm"
       },
       {
        "ex": "facepull",
        "ph": "strength",
        "w": 30
       }
      ],
      "note": "Whichever is free",
      "id": "A-d2s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "legext",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 30 s"
       }
      ],
      "id": "A-d2s3"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "cablecrunch",
        "ph": "strength",
        "w": 60
       }
      ],
      "id": "A-d2s4"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "hipthrust",
        "ph": "strength",
        "w": 320
       },
       {
        "ex": "chestpress",
        "ph": "hyp",
        "w": 25
       }
      ],
      "id": "A-d2s5"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "dip",
        "ph": "strength",
        "w": null,
        "bw": true,
        "note": "Bodyweight, working toward +10 lb"
       },
       {
        "ex": "kneeraise",
        "ph": "strength",
        "w": null,
        "bw": true
       }
      ],
      "id": "A-d2s6"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "A-d2s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "db6",
        "ph": "strength",
        "w": 10,
        "rx": "2 × 6"
       }
      ],
      "id": "A-d2s8"
     }
    ]
   },
   {
    "title": "Day 3",
    "slots": [
     {
      "id": "A-sled3",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sledlat",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "hack",
        "ph": "hyp",
        "w": 270,
        "note": "Feet low on the plate, narrow stance for quads"
       }
      ],
      "id": "A-d3s1"
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "latpd",
        "ph": "hyp",
        "w": 45
       }
      ],
      "id": "A-d3s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "wristpd",
        "ph": "hyp",
        "w": 33
       }
      ],
      "id": "A-d3s3"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "platerot",
        "ph": "strength",
        "w": 10
       }
      ],
      "id": "A-d3s4"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "legext",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 30 s"
       }
      ],
      "id": "A-d3s5"
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Accessory",
      "items": [
       {
        "ex": "reardelt",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 15 s per arm"
       },
       {
        "ex": "facepull",
        "ph": "strength",
        "w": 30
       }
      ],
      "note": "Whichever is free",
      "id": "A-d3s6"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "pallof",
        "ph": "strength",
        "w": 30
       },
       {
        "ex": "cablerow",
        "ph": "exp",
        "w": 30
       }
      ],
      "id": "A-d3s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "A-d3s8"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "deskbands",
        "ph": null,
        "w": null,
        "note": "With a resistance band"
       }
      ],
      "id": "A-d3s9"
     }
    ]
   },
   {
    "title": "Day 4",
    "slots": [
     {
      "id": "A-sled4",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sledlat",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "suitcase",
        "ph": null,
        "w": 20,
        "rx": "3 × 4 each arm"
       }
      ],
      "id": "A-d4s1"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "innerthigh",
        "ph": "strength",
        "w": 180
       }
      ],
      "id": "A-d4s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "romanadd",
        "ph": null,
        "w": null,
        "bw": true,
        "note": "On the back-extension bench"
       }
      ],
      "id": "A-d4s3"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "arnold",
        "ph": "strength",
        "w": 35
       },
       {
        "ex": "zercher",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "A-d4s4"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "hipthrust",
        "ph": "strength",
        "w": 320
       },
       {
        "ex": "chestpress",
        "ph": "hyp",
        "w": 25
       }
      ],
      "id": "A-d4s5"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "zottman",
        "ph": "hyp",
        "w": 15,
        "rx": "3 × 15"
       },
       {
        "ex": "kbleg",
        "ph": "iso",
        "w": 15,
        "rx": "3 × 15 s hold"
       }
      ],
      "id": "A-d4s6"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "A-d4s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "deskbands",
        "ph": null,
        "w": null,
        "note": "With a resistance band"
       }
      ],
      "id": "A-d4s8"
     }
    ]
   },
   {
    "title": "Day 5",
    "makeup": true,
    "slots": [
     {
      "id": "A-sled5",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sledlat",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "items": [
       {
        "ex": "cablecrunch",
        "ph": "strength",
        "w": 60
       }
      ],
      "id": "A-d5s1"
     },
     {
      "sec": "Regular",
      "items": [
       {
        "ex": "dbclean",
        "ph": "exp",
        "w": 20
       }
      ],
      "id": "A-d5s2"
     },
     {
      "sec": "Regular",
      "items": [
       {
        "ex": "hack",
        "ph": "hyp",
        "w": 270,
        "note": "Feet low on the plate, narrow stance for quads"
       }
      ],
      "id": "A-d5s3"
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Accessory",
      "items": [
       {
        "ex": "reardelt",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 15 s per arm"
       },
       {
        "ex": "facepull",
        "ph": "strength",
        "w": 30
       }
      ],
      "note": "Whichever is free",
      "id": "A-d5s4"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "trxpike",
        "ph": "exp",
        "w": null,
        "bw": true
       }
      ],
      "id": "A-d5s5"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "trxrow",
        "ph": "exp",
        "w": null,
        "bw": true
       }
      ],
      "id": "A-d5s6"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "medball",
        "ph": "exp",
        "w": null
       }
      ],
      "id": "A-d5s7"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "latwall",
        "ph": "exp",
        "w": null,
        "bw": true
       }
      ],
      "id": "A-d5s8"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "db6",
        "ph": "strength",
        "w": 10,
        "rx": "2 × 6"
       }
      ],
      "id": "A-d5s9"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "spinal",
        "ph": null,
        "w": null,
        "note": "Standing, no equipment"
       }
      ],
      "id": "A-d5s10"
     }
    ]
   },
   {
    "title": "Day 6",
    "slots": [
     {
      "id": "A-sled6",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sledlat",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "pogo",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "3 × 10"
       }
      ],
      "id": "A-d6s1"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "skater",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "3 × 5, hold 3 s"
       }
      ],
      "id": "A-d6s2"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "splitjump",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "3 × 5",
        "note": "Vertical drive, soft landings"
       }
      ],
      "id": "A-d6s3"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "depthcombo",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "4 × 5",
        "note": "Controlled landings"
       }
      ],
      "id": "A-d6s4"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "arnold",
        "ph": "strength",
        "w": 35
       },
       {
        "ex": "zercher",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "A-d6s5"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "pallof",
        "ph": "strength",
        "w": 30
       },
       {
        "ex": "cablerow",
        "ph": "exp",
        "w": 30
       }
      ],
      "id": "A-d6s6"
     }
    ]
   },
   {
    "title": "Day 7",
    "slots": []
   }
  ],
  "key": "A",
  "sledAdded": true,
  "sledTop": true
 },
 "B": {
  "days": [
   {
    "title": "Day 1",
    "slots": [
     {
      "id": "B-sled1",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sled",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "latpdbi",
        "ph": "hyp",
        "w": 45
       }
      ],
      "id": "B-d1s1"
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "hack",
        "ph": "hyp",
        "w": 270,
        "note": "Feet low on the plate, narrow stance for quads"
       }
      ],
      "id": "B-d1s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "wristpd",
        "ph": "hyp",
        "w": 33
       }
      ],
      "id": "B-d1s3"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "platerot",
        "ph": "strength",
        "w": 10
       }
      ],
      "id": "B-d1s4"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "innerthigh",
        "ph": "strength",
        "w": 180
       }
      ],
      "id": "B-d1s5"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "outerthigh",
        "ph": "strength",
        "w": 160
       }
      ],
      "id": "B-d1s6"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "qlext",
        "ph": null,
        "w": null,
        "bw": true
       }
      ],
      "id": "B-d1s7"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "chestpress",
        "ph": "strength",
        "w": 35
       },
       {
        "ex": "zercher",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "B-d1s8"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "zottman",
        "ph": "hyp",
        "w": 15,
        "rx": "3 × 15"
       },
       {
        "ex": "kbleg",
        "ph": "iso",
        "w": 15,
        "rx": "3 × 15 s hold"
       }
      ],
      "id": "B-d1s9"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "B-d1s10"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "canoe",
        "ph": null,
        "w": 10,
        "note": "With a stick or barbell"
       }
      ],
      "id": "B-d1s11"
     }
    ]
   },
   {
    "title": "Day 2",
    "slots": [
     {
      "id": "B-sled2",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sled",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Primary",
      "items": [
       {
        "ex": "farmers",
        "ph": "strength",
        "w": 40
       },
       {
        "ex": "dblunge",
        "ph": "strength",
        "w": 40
       }
      ],
      "note": "Whichever is free",
      "id": "B-d2s1"
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "ohtri",
        "ph": "strength",
        "w": 17
       }
      ],
      "id": "B-d2s2"
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Accessory",
      "items": [
       {
        "ex": "reardelt",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 15 s per arm"
       },
       {
        "ex": "facepull",
        "ph": "strength",
        "w": 30
       }
      ],
      "note": "Whichever is free",
      "id": "B-d2s3"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "cablecrunch",
        "ph": "strength",
        "w": 60
       }
      ],
      "id": "B-d2s4"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "hipthrust",
        "ph": "strength",
        "w": 320
       },
       {
        "ex": "chestpress",
        "ph": "hyp",
        "w": 25
       }
      ],
      "id": "B-d2s5"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "bss",
        "ph": "strength",
        "w": 40
       },
       {
        "ex": "legcurl",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "B-d2s6"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "B-d2s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "db6",
        "ph": "strength",
        "w": 10,
        "rx": "2 × 6"
       }
      ],
      "id": "B-d2s8"
     }
    ]
   },
   {
    "title": "Day 3",
    "slots": [
     {
      "id": "B-sled3",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sled",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "hack",
        "ph": "hyp",
        "w": 270,
        "note": "Feet low on the plate, narrow stance for quads"
       }
      ],
      "id": "B-d3s1"
     },
     {
      "sec": "Regular",
      "tier": "Primary",
      "items": [
       {
        "ex": "latpdbi",
        "ph": "hyp",
        "w": 45
       }
      ],
      "id": "B-d3s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "wristpd",
        "ph": "hyp",
        "w": 33
       }
      ],
      "id": "B-d3s3"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "platerot",
        "ph": "strength",
        "w": 10
       }
      ],
      "id": "B-d3s4"
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Accessory",
      "items": [
       {
        "ex": "reardelt",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 15 s per arm"
       },
       {
        "ex": "facepull",
        "ph": "strength",
        "w": 30
       }
      ],
      "note": "Whichever is free",
      "id": "B-d3s5"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "cablepunch",
        "ph": "iso",
        "w": 30,
        "rx": "4 × 30 s hold"
       },
       {
        "ex": "cablerow",
        "ph": "exp",
        "w": 30
       }
      ],
      "id": "B-d3s6"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "B-d3s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "deskbands",
        "ph": null,
        "w": null,
        "note": "With a resistance band"
       }
      ],
      "id": "B-d3s8"
     }
    ]
   },
   {
    "title": "Day 4",
    "slots": [
     {
      "id": "B-sled4",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sled",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Primary",
      "items": [
       {
        "ex": "farmers",
        "ph": "strength",
        "w": 40
       },
       {
        "ex": "dblunge",
        "ph": "strength",
        "w": 40
       }
      ],
      "note": "Whichever is free",
      "id": "B-d4s1"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "innerthigh",
        "ph": "strength",
        "w": 180
       }
      ],
      "id": "B-d4s2"
     },
     {
      "sec": "Regular",
      "tier": "Accessory",
      "items": [
       {
        "ex": "outerthigh",
        "ph": "strength",
        "w": 160
       }
      ],
      "id": "B-d4s3"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "arnold",
        "ph": "strength",
        "w": 35
       },
       {
        "ex": "zercher",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "B-d4s4"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "hipthrust",
        "ph": "strength",
        "w": 320
       },
       {
        "ex": "chestpress",
        "ph": "hyp",
        "w": 25
       }
      ],
      "id": "B-d4s5"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "bss",
        "ph": "strength",
        "w": 40
       },
       {
        "ex": "legcurl",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "B-d4s6"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "zottman",
        "ph": "hyp",
        "w": 15,
        "rx": "3 × 15"
       },
       {
        "ex": "kbleg",
        "ph": "iso",
        "w": 15,
        "rx": "3 × 15 s hold"
       }
      ],
      "id": "B-d4s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "grip",
        "ph": "strength",
        "w": 200,
        "note": "With a grip trainer"
       }
      ],
      "id": "B-d4s8"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "deskbands",
        "ph": null,
        "w": null,
        "note": "With a resistance band"
       }
      ],
      "id": "B-d4s9"
     }
    ]
   },
   {
    "title": "Day 5",
    "makeup": true,
    "slots": [
     {
      "id": "B-sled5",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sled",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Regular",
      "items": [
       {
        "ex": "cablecrunch",
        "ph": "strength",
        "w": 60
       }
      ],
      "id": "B-d5s1"
     },
     {
      "sec": "Regular",
      "items": [
       {
        "ex": "dbclean",
        "ph": "exp",
        "w": 20
       }
      ],
      "id": "B-d5s2"
     },
     {
      "sec": "Regular",
      "type": "either",
      "tier": "Accessory",
      "items": [
       {
        "ex": "reardelt",
        "ph": "iso",
        "w": 50,
        "rx": "4 × 15 s per arm"
       },
       {
        "ex": "facepull",
        "ph": "strength",
        "w": 30
       }
      ],
      "note": "Whichever is free",
      "id": "B-d5s3"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "trxpike",
        "ph": "exp",
        "w": null,
        "bw": true
       }
      ],
      "id": "B-d5s4"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "trxrow",
        "ph": "exp",
        "w": null,
        "bw": true
       }
      ],
      "id": "B-d5s5"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "medball",
        "ph": "exp",
        "w": null
       }
      ],
      "id": "B-d5s6"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "latwall",
        "ph": "exp",
        "w": null,
        "bw": true
       }
      ],
      "id": "B-d5s7"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "db6",
        "ph": "strength",
        "w": 10,
        "rx": "2 × 6"
       }
      ],
      "id": "B-d5s8"
     },
     {
      "sec": "Home",
      "items": [
       {
        "ex": "spinal",
        "ph": null,
        "w": null,
        "note": "Standing, no equipment"
       }
      ],
      "id": "B-d5s9"
     }
    ]
   },
   {
    "title": "Day 6",
    "slots": [
     {
      "id": "B-sled6",
      "sec": "Optional",
      "note": "Optional",
      "items": [
       {
        "ex": "sled",
        "ph": "exp",
        "w": null,
        "rx": "1 × 3"
       }
      ]
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "pogo",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "3 × 10"
       }
      ],
      "id": "B-d6s1"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "skater",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "3 × 5, hold 3 s"
       }
      ],
      "id": "B-d6s2"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "splitjump",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "3 × 5",
        "note": "Vertical drive, soft landings"
       }
      ],
      "id": "B-d6s3"
     },
     {
      "sec": "Plyometric",
      "items": [
       {
        "ex": "depthcombo",
        "ph": "exp",
        "w": null,
        "bw": true,
        "rx": "4 × 5",
        "note": "Controlled landings"
       }
      ],
      "id": "B-d6s4"
     },
     {
      "sec": "Supersets",
      "tier": "Primary",
      "type": "superset",
      "items": [
       {
        "ex": "arnold",
        "ph": "strength",
        "w": 35
       },
       {
        "ex": "zercher",
        "ph": "strength",
        "w": 50
       }
      ],
      "id": "B-d6s5"
     },
     {
      "sec": "Supersets",
      "tier": "Accessory",
      "type": "superset",
      "items": [
       {
        "ex": "cablepunch",
        "ph": "iso",
        "w": 30,
        "rx": "4 × 30 s hold"
       },
       {
        "ex": "cablerow",
        "ph": "exp",
        "w": 30
       }
      ],
      "id": "B-d6s6"
     }
    ]
   },
   {
    "title": "Day 7",
    "slots": []
   }
  ],
  "key": "B",
  "sledAdded": true,
  "sledTop": true
 }
};
