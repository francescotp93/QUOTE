#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
OUT = '/home/user/QUOTE/rcprof_tariffe.json'
data = json.load(open(OUT, encoding='utf-8'))
fogli = data['fogli']

print('='*70)
print('VALIDAZIONE AVVOCATI')
print('='*70)
avv = fogli['AVVOCATI']['professioni']
prof = next((p for p in avv if 'AVVOCATI' in (p['nome'] or '') and 'SINDACO' not in (p['nome'] or '') and 'STUDIO' not in (p['nome'] or '')), None)
assert prof, 'profession AVVOCATI not found'
net = prof['tabella']['30000']['350000']
print(f"Professione: {prof['nome']!r}")
print(f"plus10: {prof['plus10']}")
print(f"netto (30000 x 350000) = {net}  -> arrotondato {round(net,2)}")
nr = round(net, 2)
step1 = round(nr * 1.10 * 1.2225, 2)
step2 = round(step1 * 1.10, 2)
print(f"{nr} * 1.10 * 1.2225 = {step1}")
print(f"con +10% finale (plus10) = {step2}")
ok = abs(nr-119.72) < 0.01 and abs(step1-160.99) < 0.05 and abs(step2-177.09) < 0.05
print(f"VALIDAZIONE: {'PASS' if ok else 'FAIL'}  (atteso 119.72 / 160.99 / 177.09)")

print()
print('='*70)
print('RIEPILOGO PER FOGLIO')
print('='*70)
for name, sd in fogli.items():
    modello = sd.get('modello')
    print(f"\n### {name}  [modello={modello}]")
    if modello == 'turnover':
        profs = sd.get('professioni', [])
        print(f"  professioni estratte: {len(profs)}")
        for p in profs:
            acc = list(p['accessorie'].keys())
            print(f"   - {p['nome']!r} | plus10={p['plus10']} | massimali={p['massimali']} | n_fatturati={len(p['tabella'])}")
            print(f"       accessorie: {acc}")
        if 'categorie_professioni' in sd:
            for cat, lst in sd['categorie_professioni'].items():
                print(f"  categoria {cat}: {len(lst)} professioni")
        if 'nuove_professioni_approvate' in sd:
            print(f"  nuove professioni approvate: {len(sd['nuove_professioni_approvate'])}")
        if 'blocchi_speciali_raw' in sd:
            print(f"  blocchi speciali raw: {list(sd['blocchi_speciali_raw'].keys())}")
        if 'blocco_visto_leggero_raw' in sd:
            print(f"  blocco VISTO LEGGERO raw: {len(sd['blocco_visto_leggero_raw'])} righe")
    elif modello == 'classi':
        classi = sd.get('classi', {})
        print(f"  classi estratte: {len(classi)}")
        for k, c in classi.items():
            print(f"   - classe {k}: premio_lordo={c.get('premio_lordo')} | n_spec={len(c.get('specializzazioni',[]))} | {c.get('categoria_invasivita','')}")
    elif modello == 'speciale':
        for key in ('bande', 'righe', 'fattori_massimale', 'sconti_incrementali_fatturato', 'categorie', 'suggested'):
            if key in sd:
                v = sd[key]
                if isinstance(v, list):
                    print(f"  {key}: {len(v)} voci")
                elif isinstance(v, dict):
                    print(f"  {key}: {list(v.keys())}")

print()
print('='*70)
print('ANOMALIE')
print('='*70)
an = data['note'].get('anomalie', {})
if not an:
    print('  Nessuna anomalia registrata dall\'estrattore.')
for s, msgs in an.items():
    print(f"  {s}:")
    for m in msgs:
        print(f"    - {m}")
