// ════════════════════════════════════════════════════════════════════
//  QUOTO · API Preventivi (Supabase Edge Function "preventivo")
//  Calcola il premio di ogni prodotto quotabile.  POST JSON -> JSON.
//
//  Esempio:
//    POST https://<progetto>.supabase.co/functions/v1/preventivo
//    body: { "prodotto":"salute", "tipo":"attiva", "livello":"plus",
//            "comp":"single", "fraz":"mensile", "dob":"1985-04-12" }
//
//  Tariffe estratte direttamente dal codice di QUOTO (numeri identici).
//  Tariffe RC professionali / catastrofali lette dai JSON pubblici.
// ════════════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TAR = {
 "RCVP_PREMIO": 144,
 "INFC_PREMIO": 60,
 "SAL_PRODOTTI": {
  "attiva": {
   "nome": "Attiva",
   "etaMax": 60,
   "livelli": [
    {
     "key": "base",
     "nome": "Base",
     "single": 900,
     "nucleo": 1700,
     "gar": "Maternità 5.000 €; interventi ambulatoriali 1.000 €; prevenzione 200 €; alta diagnostica 2.000 €; visite 1.000 €; ticket SSN 100%; odontoiatriche 1.500 €; LTC 3.000 € + 500 €/mese"
    },
    {
     "key": "plus",
     "nome": "Plus",
     "single": 1460,
     "nucleo": 2600,
     "gar": "Ricovero con intervento 100.000 €; maternità 5.000 €; alta diagnostica 2.000 €; visite 1.500 €; ticket SSN 100%; LTC 6.000 € + 500 €/mese"
    },
    {
     "key": "plat",
     "nome": "Platinum",
     "single": 2800,
     "nucleo": 5400,
     "gar": "Ricovero con/senza intervento 200.000 €; grande intervento 400.000 €; maternità 4.000 €; alta diagnostica 5.000 €; visite 1.500 €; ticket SSN 100%; LTC 12.000 € + 1.000 €/mese"
    }
   ]
  },
  "protezione": {
   "nome": "Protezione",
   "etaMax": 70,
   "livelli": [
    {
     "key": "base",
     "nome": "Base",
     "single": 1300,
     "nucleo": 2500,
     "gar": "Grande intervento chirurgico 100.000 €; interventi ambulatoriali 1.000 €; diagnostica/prevenzione 150 €; alta diagnostica 2.000 €; visite 1.000 €; ticket SSN 200 €; odontoiatriche da infortunio 1.500 €"
    },
    {
     "key": "plus",
     "nome": "Plus",
     "single": 1800,
     "nucleo": 3500,
     "gar": "Ricovero con intervento 100.000 €; alta diagnostica 2.500 €; visite 1.500 €; ticket SSN 250 €; odontoiatriche da infortunio 1.500 €"
    },
    {
     "key": "plat",
     "nome": "Platinum",
     "single": 2800,
     "nucleo": 5700,
     "gar": "Ricovero con intervento 100.000 €; grande intervento 300.000 €; alta diagnostica 3.000 €; visite 2.000 €; ticket SSN 300 €"
    }
   ]
  }
 },
 "SAL_LTC": [
  {
   "key": "150",
   "nome": "Long Term Care 150",
   "premio": 150,
   "desc": "3.000 € subito + 500 €/mese a vita"
  },
  {
   "key": "200",
   "nome": "Long Term Care 200",
   "premio": 200,
   "desc": "6.000 € subito + 500 €/mese a vita"
  },
  {
   "key": "350",
   "nome": "Long Term Care 350",
   "premio": 350,
   "desc": "12.000 € subito + 1.000 €/mese a vita"
  }
 ],
 "SAL_FRAZ": [
  {
   "key": "annuale",
   "nome": "Annuale",
   "div": 1
  },
  {
   "key": "semestrale",
   "nome": "Semestrale",
   "div": 2
  },
  {
   "key": "trimestrale",
   "nome": "Trimestrale",
   "div": 4
  },
  {
   "key": "mensile",
   "nome": "Mensile",
   "div": 12
  }
 ],
 "PET_PACCHETTI": [
  {
   "key": "silver",
   "nome": "Silver",
   "premio": 95
  },
  {
   "key": "gold",
   "nome": "Gold",
   "premio": 129
  },
  {
   "key": "platinum",
   "nome": "Platinum",
   "premio": 240
  },
  {
   "key": "diamond",
   "nome": "Diamond",
   "premio": 360
  }
 ],
 "PET_RC": {
  "premio": 50,
  "persone": "150.000 € — scoperto 10%, minimo 500 €",
  "cose": "10.000 € — scoperto 10%, minimo 500 €"
 },
 "PET_TIPI": [
  {
   "key": "cane",
   "nome": "Cane",
   "icon": "ti-dog"
  },
  {
   "key": "gatto",
   "nome": "Gatto",
   "icon": "ti-cat"
  },
  {
   "key": "coniglio",
   "nome": "Coniglio",
   "icon": "ti-paw"
  }
 ],
 "VG_FASCE": [
  "1-7",
  "8-14",
  "15-24",
  "25-31",
  "32-45",
  "46-60"
 ],
 "VG_AREE": [
  {
   "key": "italia",
   "nome": "Italia",
   "base": "Italia",
   "opt": "Italia_EU"
  },
  {
   "key": "europa",
   "nome": "Europa",
   "base": "EU",
   "opt": "Italia_EU"
  },
  {
   "key": "mondo_ex",
   "nome": "Mondo (escluso USA e Canada)",
   "base": "WW_ex_USA",
   "opt": "WW_ex_USA"
  },
  {
   "key": "mondo_incl",
   "nome": "Mondo (incluso USA e Canada)",
   "base": "WW_incl_USA",
   "opt": "WW_incl_USA"
  }
 ],
 "VG_TAR": {
  "base": {
   "Large": {
    "Italia": [
     19,
     28,
     29,
     33,
     55,
     83
    ],
    "EU": [
     22,
     32,
     32,
     38,
     64,
     95
    ],
    "WW_ex_USA": [
     34,
     49,
     49,
     58,
     98,
     147
    ],
    "WW_incl_USA": [
     41,
     58,
     60,
     70,
     117,
     176
    ],
    "sett": {
     "Italia": 4,
     "EU": 5,
     "WW_ex_USA": 7,
     "WW_incl_USA": 10
    }
   },
   "Medium": {
    "Italia": [
     17.28,
     25.46,
     26.37,
     30,
     50,
     75.46
    ],
    "EU": [
     20,
     29.1,
     29.09,
     34.54,
     58.18,
     86.37
    ],
    "WW_ex_USA": [
     30.91,
     44.55,
     44.55,
     52.73,
     89.09,
     133.63
    ],
    "WW_incl_USA": [
     37.28,
     52.72,
     54.54,
     63.64,
     106.36,
     160
    ],
    "sett": {
     "Italia": 3.63,
     "EU": 4.54,
     "WW_ex_USA": 6.37,
     "WW_incl_USA": 9.1
    }
   },
   "Small": {
    "Italia": [
     16.52,
     24.35,
     25.22,
     28.69,
     47.83,
     72.17
    ],
    "EU": [
     19.13,
     27.83,
     27.83,
     33.05,
     55.65,
     82.61
    ],
    "WW_ex_USA": [
     29.57,
     42.61,
     42.61,
     50.43,
     85.22,
     127.83
    ],
    "WW_incl_USA": [
     35.66,
     50.44,
     52.18,
     60.86,
     101.74,
     153.04
    ],
    "sett": {
     "Italia": 3.48,
     "EU": 4.35,
     "WW_ex_USA": 6.08,
     "WW_incl_USA": 8.7
    }
   }
  },
  "bagaglio": {
   "Large": {
    "Italia_EU": [
     4,
     6,
     7,
     7,
     12,
     18
    ],
    "WW_ex_USA": [
     8,
     11,
     12,
     13,
     21,
     32
    ],
    "WW_incl_USA": [
     9,
     13,
     14,
     17,
     27,
     41
    ],
    "sett": {
     "Italia_EU": 1,
     "WW_ex_USA": 1,
     "WW_incl_USA": 2
    }
   },
   "Medium": {
    "Italia_EU": [
     3.7,
     5.56,
     6.48,
     6.48,
     11.11,
     16.67
    ],
    "WW_ex_USA": [
     7.41,
     10.19,
     11.11,
     12.04,
     19.44,
     29.63
    ],
    "WW_incl_USA": [
     8.33,
     12.04,
     12.96,
     15.74,
     25,
     37.96
    ],
    "sett": {
     "Italia_EU": 0.93,
     "WW_ex_USA": 0.93,
     "WW_incl_USA": 1.85
    }
   },
   "Small": {
    "Italia_EU": [
     3.57,
     5.36,
     6.25,
     6.25,
     10.71,
     16.07
    ],
    "WW_ex_USA": [
     7.14,
     9.82,
     10.71,
     11.61,
     18.75,
     28.57
    ],
    "WW_incl_USA": [
     8.04,
     11.61,
     12.5,
     15.18,
     24.11,
     36.61
    ],
    "sett": {
     "Italia_EU": 0.89,
     "WW_ex_USA": 0.89,
     "WW_incl_USA": 1.79
    }
   }
  },
  "annullamento": {
   "Italia_EU": [
    26.4,
    37.6,
    40,
    44.8,
    73.6,
    112
   ],
   "WW_ex_USA": [
    37.6,
    56,
    62.4,
    67.2,
    112,
    168
   ],
   "WW_incl_USA": [
    46.4,
    67.2,
    73.6,
    82.4,
    138.4,
    205.6
   ],
   "sett": {
    "Italia_EU": 4.8,
    "WW_ex_USA": 4.8,
    "WW_incl_USA": 4.8
   }
  },
  "rinuncia": {
   "Italia_EU": [
    3.3,
    4.7,
    5,
    5.6,
    9.2,
    14
   ],
   "WW_ex_USA": [
    4.7,
    7,
    7.8,
    8.4,
    14,
    21
   ],
   "WW_incl_USA": [
    5.8,
    8.4,
    9.2,
    10.3,
    17.3,
    25.7
   ],
   "sett": {
    "Italia_EU": 0.6,
    "WW_ex_USA": 0.6,
    "WW_incl_USA": 0.6
   }
  },
  "interruzione": {
   "Italia_EU": [
    3.3,
    4.7,
    5,
    5.6,
    9.2,
    14
   ],
   "WW_ex_USA": [
    4.7,
    7,
    7.8,
    8.4,
    14,
    21
   ],
   "WW_incl_USA": [
    5.8,
    8.4,
    9.2,
    10.3,
    17.3,
    25.7
   ],
   "sett": {
    "Italia_EU": 0.6,
    "WW_ex_USA": 0.6,
    "WW_incl_USA": 0.6
   }
  }
 },
 "RCAB_PMIN": 0.033,
 "RCRD_MASSIMALI": [
  250000,
  500000,
  1000000,
  1500000,
  2000000,
  2500000,
  3000000,
  3500000,
  5000000
 ],
 "RCRD_ATTIVITA": [
  {
   "key": "alb_somm",
   "cod": "2.18.13",
   "grp": "albergo",
   "nome": "Alberghi, hotel, ostelli, B&B, villaggi, pensioni (con somministrazione cibi e bevande)",
   "tassi": [
    3,
    3.6,
    3.75,
    3.9,
    4.05,
    4.2,
    4.35,
    4.5,
    4.8
   ],
   "rco": 50
  },
  {
   "key": "alb_res",
   "cod": "2.18.19",
   "grp": "albergo",
   "nome": "Residence, affittacamere, \"zimmer\", bagni pubblici",
   "tassi": [
    2,
    2.4,
    2.5,
    2.6,
    2.7,
    2.8,
    2.9,
    3,
    3.2
   ],
   "rco": 20
  },
  {
   "key": "alb_camp",
   "cod": "2.18.23",
   "grp": "albergo",
   "nome": "Campeggi",
   "tassi": [
    4,
    4.8,
    5,
    5.2,
    5.4,
    5.6,
    5.8,
    6,
    6.4
   ],
   "rco": 20
  },
  {
   "key": "balneari",
   "cod": "2.32.11",
   "grp": "lidi",
   "nome": "Stabilimenti balneari",
   "tassi": [
    0.45,
    0.54,
    0.56,
    0.59,
    0.61,
    0.63,
    0.65,
    0.68,
    0.72
   ],
   "rco": 20
  }
 ],
 "RCRD_ESTENSIONI": [
  {
   "key": "animali",
   "nome": "Animali",
   "perc": 50,
   "desc": "Estende la RCT ai danni causati a terzi da animali detenuti nell'ambito dell'attività (es. animali ospitati o presenti in struttura)."
  },
  {
   "key": "cose_clienti",
   "nome": "Danni/RC a cose portate o consegnate dai clienti",
   "perc": 15,
   "desc": "Copre danneggiamento, sottrazione o smarrimento delle cose (bagagli, effetti personali, beni) portate o consegnate dai clienti dell'esercizio."
  },
  {
   "key": "infortuni_sub",
   "nome": "Infortuni subappaltatori e loro dipendenti",
   "perc": 15,
   "desc": "Estende la copertura agli infortuni subiti dai subappaltatori e dai loro dipendenti durante i lavori per conto dell'assicurato."
  },
  {
   "key": "subappalto",
   "nome": "Cessione di lavori in subappalto",
   "perc": 10,
   "desc": "Copre la responsabilità dell'assicurato per i lavori affidati in subappalto a imprese terze."
  }
 ],
 "RCRD_MIN": 400,
 "FI_TASSI": {
  "furtoIncendio": [
   29.121376,
   17.0896496,
   15.18574385,
   9.4979751,
   8.5400351
  ],
  "vandalici": [
   6.322404,
   4.741803,
   4.2676227,
   4.2676227,
   3.3192621
  ],
  "eventi": [
   6.322404,
   4.741803,
   4.2676227,
   4.2676227,
   3.3192621
  ],
  "cristalli": [
   88.60945,
   66.460679775,
   66.460679775,
   66.460679775,
   66.460679775
  ],
  "kasco": [
   45.5739955,
   30.379869675,
   28.483148475,
   23.741345475,
   21.83384745
  ],
  "collisione": [
   22.78699775,
   15.19532325,
   14.24696265,
   11.865284325,
   10.916923725
  ]
 },
 "FI_AREE_PROV": {
  "1": [
   "BA",
   "BR",
   "BT",
   "CT",
   "CZ",
   "FG",
   "KR",
   "LE",
   "PA",
   "RC",
   "TA",
   "VV"
  ],
  "2": [
   "RM",
   "TO"
  ],
  "3": [
   "AG",
   "BS",
   "CA",
   "CS",
   "EN",
   "GE",
   "ME",
   "MI",
   "MT",
   "PZ",
   "SR",
   "SU"
  ],
  "4": [
   "AT",
   "BG",
   "BO",
   "CB",
   "CH",
   "CL",
   "CN",
   "CO",
   "CR",
   "FI",
   "FR",
   "IS",
   "LC",
   "LO",
   "LT",
   "MB",
   "NO",
   "NU",
   "OG",
   "OT",
   "PC",
   "PE",
   "PG",
   "RG",
   "SS",
   "TP",
   "TR",
   "VA",
   "VR",
   "VS",
   "VT"
  ],
  "5": [
   "AL",
   "AN",
   "AO",
   "AP",
   "AQ",
   "AR",
   "BI",
   "BL",
   "BZ",
   "FC",
   "FE",
   "FM",
   "GO",
   "GR",
   "IM",
   "LI",
   "LU",
   "MC",
   "MN",
   "MO",
   "MS",
   "OR",
   "PD",
   "PI",
   "PN",
   "PO",
   "PR",
   "PS",
   "PU",
   "PT",
   "PV",
   "RA",
   "RE",
   "RI",
   "RN",
   "RO",
   "SI",
   "SO",
   "SP",
   "SV",
   "TE",
   "TN",
   "TS",
   "TV",
   "UD",
   "VB",
   "VC",
   "VE",
   "VI"
  ]
 },
 "FI_ASSISTENZA": 19.9,
 "FI_DIRITTI": 15,
 "FI_CAMPANIA": [
  "NA",
  "CE",
  "SA",
  "AV",
  "BN"
 ],
 "TL_MASSIMALI": [
  10000,
  20000,
  30000,
  40000,
  50000
 ],
 "TL_MYDRIVE": {
  "10000": {
   "pfV": 41,
   "pfM": 31,
   "pgMin": 49,
   "pgMax": 64
  },
  "20000": {
   "pfV": 51,
   "pfM": 39,
   "pgMin": 61,
   "pgMax": 80
  },
  "30000": {
   "pfV": 57,
   "pfM": 43,
   "pgMin": 69,
   "pgMax": 90
  },
  "40000": {
   "pfV": 62,
   "pfM": 47,
   "pgMin": 74,
   "pgMax": 96
  },
  "50000": {
   "pfV": 66,
   "pfM": 50,
   "pgMin": 78,
   "pgMax": 102
  }
 },
 "RC_LOAD": 1.2225
};

const RC_LOAD = 1.10, RC_IMPOSTE = 1.2225;          // RC prof: netto -> lordo
const PAGES = "https://francescotp93.github.io/QUOTE/tariffe/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (msg: string, s = 400) => J({ ok: false, errore: msg }, s);

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (x: unknown) => { const v = parseFloat(String(x)); return isNaN(v) ? 0 : v; };
function eta(dob: string, at?: string): number | null {
  const d = new Date(dob); const r = at ? new Date(at) : new Date();
  if (isNaN(+d) || isNaN(+r)) return null;
  let a = r.getFullYear() - d.getFullYear();
  const m = r.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < d.getDate())) a--;
  return a;
}

// ── cache tariffe esterne ──
const _cap: any = {}, _rp: any = {}, _rn: any = {};
async function getJSON(file: string, ref: any) {
  if (ref.v) return ref.v;
  const r = await fetch(PAGES + file);
  if (!r.ok) throw new Error("Tariffa non raggiungibile: " + file);
  ref.v = await r.json();
  return ref.v;
}
const rcLordo = (netto: number, flag10: boolean) => netto * RC_LOAD * RC_IMPOSTE * (flag10 ? RC_LOAD : 1);

// ──────────────────────────── CALCOLATORI ────────────────────────────

async function calcSalute(b: any) {
  const tipo = b.tipo || "attiva";
  const fraz = TAR.SAL_FRAZ.find((f: any) => f.key === (b.fraz || "annuale")) || TAR.SAL_FRAZ[0];
  let premio: number, prodotto: string, etaMax: number, garanzie: string[];
  if (tipo === "ltc") {
    const l = TAR.SAL_LTC.find((x: any) => x.key === String(b.ltc)) || TAR.SAL_LTC[1];
    premio = l.premio; prodotto = "Aglea Salus · " + l.nome; etaMax = 60; garanzie = [l.desc];
  } else {
    const prod = TAR.SAL_PRODOTTI[tipo];
    if (!prod) throw new Error("tipo non valido (attiva | protezione | ltc)");
    const liv = prod.livelli.find((x: any) => x.key === (b.livello || "plus")) || prod.livelli[1];
    const comp = b.comp === "nucleo" ? "nucleo" : "single";
    premio = comp === "nucleo" ? liv.nucleo : liv.single;
    prodotto = "Aglea Salus · " + prod.nome + " " + liv.nome + " (" + (comp === "nucleo" ? "Nucleo" : "Singolo") + ")";
    etaMax = prod.etaMax; garanzie = liv.gar.split(";").map((s: string) => s.trim());
  }
  if (b.dob) { const a = eta(b.dob, b.dataEffetto); if (a != null && a > etaMax) throw new Error("Età non ammessa: " + a + " anni (massimo " + etaMax + ")."); }
  return {
    ok: true, modulo: "salute", compagnia: "Aglea Salus", prodotto,
    premio_annuo: r2(premio), frazionamento: fraz.key, numero_rate: fraz.div, rata: r2(premio / fraz.div),
    garanzie, note: fraz.key === "mensile" ? "Mensile: prime 3 rate alla firma" : undefined,
  };
}

function calcRcVitaPrivata() {
  return { ok: true, modulo: "persona", compagnia: "HDI Assicurazioni", prodotto: "RC Vita Privata · HDI",
    premio_annuo: TAR.RCVP_PREMIO, frazionamento: "mensile", numero_rate: 12, rata: 12,
    garanzie: ["RC vita privata", "Tutela legale vita privata", "Assistenza Digital"] };
}

const INFC_TARIFFE = [
  { premio: 60,  morte: 50000,  ip: 50000,  ricovero: 25, ingessatura: 25 },
  { premio: 90,  morte: 75000,  ip: 75000,  ricovero: 25, ingessatura: 25 },
  { premio: 120, morte: 100000, ip: 100000, ricovero: 30, ingessatura: 30 },
  { premio: 180, morte: 150000, ip: 150000, ricovero: 35, ingessatura: 35 },
  { premio: 200, morte: 200000, ip: 200000, ricovero: 40, ingessatura: 40 },
];
function calcInfCirc(b: any) {
  // opzione: indice 0..4 oppure premio (60|90|120|180|200)
  let i = 0;
  if (b.opzione != null) i = parseInt(b.opzione) || 0;
  else if (b.premio != null) { const k = INFC_TARIFFE.findIndex((t) => t.premio === parseInt(b.premio)); if (k >= 0) i = k; }
  const t = INFC_TARIFFE[i] || INFC_TARIFFE[0];
  const eur = (n: number) => n.toLocaleString("it-IT") + " €";
  return { ok: true, modulo: "persona", compagnia: "Protezione Circolare", prodotto: "Infortuni Circolazione · Protezione Circolare (" + t.premio + " €/anno)",
    premio_annuo: t.premio, frazionamento: "annuale", numero_rate: 1, rata: t.premio,
    garanzie: ["Morte " + eur(t.morte), "Invalidità Permanente " + eur(t.ip), "Indennità ricovero " + t.ricovero + " €/gg", "Ingessatura " + t.ingessatura + " €/gg", "Assistenza"] };
}

function calcAnimali(b: any) {
  const pack = TAR.PET_PACCHETTI.find((p: any) => p.key === (b.pacchetto || "silver"));
  if (!pack) throw new Error("pacchetto non valido (silver | gold | platinum | diamond)");
  const tipo = TAR.PET_TIPI.find((x: any) => x.key === b.tipo);
  if (b.dob_animale) { const a = eta(b.dob_animale, b.dataEffetto); if (a != null && a >= 8) throw new Error("Animale non assicurabile: età " + a + " anni (max < 8)."); }
  const rc = !!b.rc;
  const premio = pack.premio + (rc ? TAR.PET_RC.premio : 0);
  const prodotto = "Dottorpet " + pack.nome + (tipo ? " · " + tipo.nome : "") + (rc ? " + RC danni a terzi" : "");
  return { ok: true, modulo: "animali", compagnia: "CNP Assurances Iard", prodotto,
    premio_annuo: r2(premio), frazionamento: "annuale", numero_rate: 1, rata: r2(premio) };
}

function calcViaggio(b: any) {
  const area = TAR.VG_AREE.find((a: any) => a.key === (b.dest || "italia"));
  if (!area) throw new Error("destinazione non valida (italia | europa | mondo_ex | mondo_incl)");
  let giorni = b.giorni != null ? parseInt(b.giorni) : null;
  if (giorni == null) {
    if (!b.dataPartenza || !b.dataRientro) throw new Error("Indica dataPartenza e dataRientro (oppure giorni)");
    giorni = Math.round((+new Date(b.dataRientro) - +new Date(b.dataPartenza)) / 86400000) + 1;
  }
  if (!(giorni > 0)) throw new Error("Durata non valida");
  const level = ["Small", "Medium", "Large"].includes(b.livello) ? b.livello : "Medium";
  const n = Math.max(1, parseInt(b.nAssicurati) || 1);
  const idx = (d: number) => d <= 7 ? 0 : d <= 14 ? 1 : d <= 24 ? 2 : d <= 31 ? 3 : d <= 45 ? 4 : 5;
  const comp = (tbl: any, k: string) => giorni! <= 60 ? tbl[k][idx(giorni!)] : tbl[k][5] + Math.ceil((giorni! - 60) / 7) * tbl.sett[k];
  const perPersona =
    comp(TAR.VG_TAR.base[level], area.base) +
    comp(TAR.VG_TAR.bagaglio[level], area.opt) +
    comp(TAR.VG_TAR.annullamento, area.opt) +
    comp(TAR.VG_TAR.rinuncia, area.opt) +
    comp(TAR.VG_TAR.interruzione, area.opt);
  const tot = perPersona * n;
  return { ok: true, modulo: "viaggio", compagnia: "HDI Assicurazioni", prodotto: "HDI Viaggio Singolo " + level + " · " + area.nome,
    premio_annuo: r2(tot), frazionamento: "annuale", numero_rate: 1, rata: r2(tot),
    dettagli: { giorni, assicurati: n, premio_per_persona: r2(perPersona) } };
}

async function calcCatastrofali(b: any) {
  const CAP = await getJSON("catastrofali_cap.json", _cap);
  const cap = String(b.cap || "").padStart(5, "0");
  const valore = num(b.valore);
  const row = CAP[cap];
  if (!row) throw new Error("CAP non presente in tariffa: " + cap);
  if (!(valore > 0)) throw new Error("Indica il valore di ricostruzione del fabbricato (> 0)");
  if (valore > 1100000) throw new Error("Valore massimo 1.100.000 €");
  const [tTerr, tAllu] = row;
  const terrCont = !!b.terrCont, alluFabb = !!b.alluFabb, alluCont = !!b.alluCont;
  const pTerrFabb = tTerr * valore / 1000;
  const pTerrCont = terrCont ? tTerr * (0.20 * valore) / 1000 : 0;
  const pAlluFabb = alluFabb ? tAllu * valore / 1000 : 0;
  const pAlluCont = (terrCont && alluFabb && alluCont) ? tAllu * (0.20 * valore) / 1000 : 0;
  let base = pTerrFabb + pTerrCont + pAlluFabb + pAlluCont;
  if (base < 60) base = 60;
  base = Math.floor(base);
  let premio = base, frazionamento = "annuale", numero_rate = 1, rata = base;
  if (b.frazionamento === "Semestrale" && base >= 120) { premio = base * 1.02; frazionamento = "semestrale"; numero_rate = 2; rata = premio / 2; }
  return { ok: true, modulo: "beni", compagnia: "HDI Assicurazioni", prodotto: "Rischi Catastrofali Abitazione (HDI)",
    premio_annuo: r2(premio), frazionamento, numero_rate, rata: r2(rata) };
}

function calcRcrd(b: any) {
  const att = TAR.RCRD_ATTIVITA.find((a: any) => a.key === b.attivita);
  if (!att) throw new Error("attivita non valida. Disponibili: " + TAR.RCRD_ATTIVITA.map((a: any) => a.key).join(" | "));
  const mass = parseInt(b.massimale) || 1000000;
  const i = TAR.RCRD_MASSIMALI.indexOf(mass);
  if (i < 0) throw new Error("massimale non valido. Disponibili: " + TAR.RCRD_MASSIMALI.join(" | "));
  const fatt = num(b.fatturato);
  if (!(fatt > 0)) throw new Error("Indica il fatturato annuo (> 0)");
  const rct = att.tassi[i] * fatt / 1000;
  let perc = 0;
  const est = Array.isArray(b.estensioni) ? b.estensioni : [];
  for (const e of est) { const x = TAR.RCRD_ESTENSIONI.find((z: any) => z.key === e); if (x) perc += x.perc; }
  if (b.rco) perc += att.rco;
  let p = Math.floor(rct * (1 + perc / 100));
  const premio = Math.max(p, TAR.RCRD_MIN);
  return { ok: true, modulo: "beni", compagnia: "HDI Assicurazioni", prodotto: "RC " + att.nome + " (HDI Rischi Diversi)",
    premio_annuo: premio, frazionamento: "annuale", numero_rate: 1, rata: premio };
}

function calcFurtoIncendio(b: any) {
  const prov = String(b.provincia || "").toUpperCase();
  if (!prov) throw new Error("Indica la provincia (sigla, es. RM)");
  if (TAR.FI_CAMPANIA.includes(prov)) throw new Error("Provincia non assicurabile (Campania)");
  let area = 5;
  for (const k of Object.keys(TAR.FI_AREE_PROV)) { if (TAR.FI_AREE_PROV[k].includes(prov)) { area = parseInt(k); break; } }
  const ai = area - 1;
  const valore = num(b.valore);
  if (!(valore > 0)) throw new Error("Indica il valore del veicolo (> 0)");
  if (valore > 80000) throw new Error("Valore massimo 80.000 €");
  let tot = TAR.FI_TASSI.furtoIncendio[ai] * valore / 1000;
  const valid = ["vandalici", "eventi", "cristalli", "kasco", "collisione"];
  const opts = Array.isArray(b.garanzie) ? b.garanzie : [];
  for (const o of opts) { if (valid.includes(o)) tot += TAR.FI_TASSI[o][ai] * valore / 1000; }
  if (b.assistenza !== false) tot += TAR.FI_ASSISTENZA;
  tot += TAR.FI_DIRITTI;
  return { ok: true, modulo: "rca", compagnia: "NOBIS", prodotto: "CVT Furto ed Incendio (NOBIS)",
    premio_annuo: r2(tot), frazionamento: "annuale", numero_rate: 1, rata: r2(tot), dettagli: { area } };
}

function calcTutelaLegale(b: any) {
  const sub = b.prodotto_tl || "mydrive";
  let premio: number, label: string;
  if (sub === "mydrive") {
    const mass = parseInt(b.massimale) || 10000;
    const row = TAR.TL_MYDRIVE[mass] || TAR.TL_MYDRIVE[10000];
    const base = b.intestatario === "PG" ? (b.mdQuintali === "max" ? row.pgMax : row.pgMin) : (b.mdTarga === "moto" ? row.pfM : row.pfV);
    premio = b.sconto15 ? r2(base * 0.85) : base; label = "Tutela Legale My Drive";
  } else if (sub === "myway") {
    let base = b.mwFormula === "famiglia" ? 154 : 113;
    if (b.sconto15) base = r2(base * 0.85);
    premio = r2(base + (b.mwPerdite ? 11.50 : 0)); label = "Tutela Legale My Way";
  } else if (sub === "utenze") {
    premio = b.utFormula === "PLUS" ? 60 : 36; label = "Rimborso Utenze";
  } else throw new Error("prodotto_tl non valido (mydrive | myway | utenze)");
  return { ok: true, modulo: "tutela", compagnia: "Tutela Legale S.p.A.", prodotto: label,
    premio_annuo: r2(premio), frazionamento: "annuale", numero_rate: 1, rata: r2(premio) };
}

async function calcRcProf(b: any) {
  const RP = await getJSON("rc_professionale.json", _rp);
  const c = RP[b.categoria];
  if (!c) throw new Error("categoria non valida. Disponibili: " + Object.keys(RP).join(" | "));
  const idx = parseInt(b.sotto) || 0;
  const s = c.sottocategorie[idx];
  if (!s) throw new Error("sottocategoria non valida (0.." + (c.sottocategorie.length - 1) + ")");
  if (!s.massimali.includes(b.massimale)) throw new Error("massimale non valido. Disponibili: " + s.massimali.join(" | "));
  const fatt = num(b.fatturato);
  let band = s.righe.find((r: any) => r.t >= fatt); let overflow = false;
  if (!band) { band = s.righe[s.righe.length - 1]; overflow = true; }
  const netto = band.p[b.massimale];
  if (netto == null) throw new Error("tariffa non disponibile per questo massimale");
  const lordo = rcLordo(netto, s.flag10);
  return { ok: true, modulo: "rcprof", compagnia: "—", prodotto: "RC " + b.categoria + " · " + s.nome,
    premio_annuo: r2(lordo), frazionamento: "annuale", numero_rate: 1, rata: r2(lordo),
    dettagli: { franchigia: s.franchigie ? s.franchigie[b.massimale] : null, overflow } };
}

async function calcRcNonReg(b: any) {
  const RN = await getJSON("rc_non_regolamentate.json", _rn);
  let cat = b.categoria;
  if (!cat && b.professione) { const pr = RN.professioni.find((p: any) => p.nome.toLowerCase() === String(b.professione).toLowerCase()); if (pr) cat = pr.cat; }
  const c = RN.categorie[cat];
  if (!c) throw new Error("categoria/professione non valida");
  if (!c.massimali.includes(b.massimale)) throw new Error("massimale non valido. Disponibili: " + c.massimali.join(" | "));
  const fatt = num(b.fatturato);
  const band = c.righe.find((r: any) => r.t >= fatt) || c.righe[c.righe.length - 1];
  const netto = band.p[b.massimale];
  if (netto == null) throw new Error("tariffa non disponibile per questo massimale");
  const lordo = rcLordo(netto, c.flag10);
  return { ok: true, modulo: "rcprof", compagnia: "—", prodotto: "RC Professioni non regolamentate · " + (b.professione || cat),
    premio_annuo: r2(lordo), frazionamento: "annuale", numero_rate: 1, rata: r2(lordo) };
}

const ROUTER: Record<string, (b: any) => any> = {
  salute: calcSalute,
  rc_vita_privata: calcRcVitaPrivata,
  inf_circolazione: calcInfCirc,
  animali: calcAnimali,
  viaggio: calcViaggio,
  catastrofali: calcCatastrofali,
  albergo: calcRcrd,
  lidi: calcRcrd,
  rcrd: calcRcrd,
  furto_incendio: calcFurtoIncendio,
  tutela_legale: calcTutelaLegale,
  rc_professionale: calcRcProf,
  rc_non_regolamentate: calcRcNonReg,
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Usa una richiesta POST con corpo JSON.", 405);
  let body: any;
  try { body = await req.json(); } catch { return fail("Corpo JSON non valido."); }
  const p = String(body?.prodotto || "");
  if (p === "_catalogo" || p === "") return J({ ok: true, prodotti: Object.keys(ROUTER) });
  const fn = ROUTER[p];
  if (!fn) return fail("Prodotto sconosciuto: '" + p + "'. Disponibili: " + Object.keys(ROUTER).join(", "));
  try { return J(await fn(body)); }
  catch (e) { return fail((e as Error).message || String(e), 422); }
});
