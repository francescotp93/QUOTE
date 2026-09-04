# I salti di scaglione, regime per regime

> Materiale di formazione. **Non si modifica a mano**: lo produce il motore.
> Per rigenerarlo: `node server/verifica/casi/genera-salti-di-scaglione.mjs`
> Una prova in `server/verifica/irpef-previdenza.test.mjs` controlla che sia
> ancora quello che il motore produce oggi.

Regole di calcolo versione **2026-09-04b**.

## La cosa da capire

Gli scaglioni IRPEF si applicano all'**imponibile**, non al lordo. E
l'imponibile è il lordo meno i contributi **a carico del lavoratore**, che
cambiano moltissimo da un regime all'altro: nove punti per un dipendente,
ventisei per un professionista con partita IVA.

Conseguenza pratica: **a parità di lordo, due clienti stanno in scaglioni
diversi**, e lo stesso versamento al fondo rende cifre diverse.

## A che lordo il versamento fa scavalcare la soglia

Con un versamento di **2.400 € l'anno** (200 € al mese).

| Regime | A carico | Fascia del salto (lordo) | Esempio al centro | Imponibile | Dopo il versamento | Risparmio | Aliquota effettiva |
|---|---|---|---|---|---|---|---|
| Dipendente privato | 9,19% | da **30.900** a **33.400 €** | 32.200 € | 29.241 € | 26.841 € | 676 € | **28,2%** |
| Dipendente pubblico | 8,80% | da **30.800** a **33.300 €** | 32.100 € | 29.275 € | 26.875 € | 680 € | **28,3%** |
| Artigiano | 24,00% | da **36.900** a **40.000 €** | 38.500 € | 29.253 € | 26.853 € | 677 € | **28,2%** |
| Commerciante | 24,48% | da **37.100** a **40.200 €** | 38.700 € | 29.219 € | 26.819 € | 674 € | **28,1%** |
| Professionista con partita IVA | 26,07% | da **37.900** a **41.100 €** | 39.500 € | 29.202 € | 26.802 € | 672 € | **28,0%** |
| Collaboratore o co.co.co. | 11,68% | da **31.800** a **34.400 €** | 33.100 € | 29.235 € | 26.835 € | 676 € | **28,1%** |

L'aliquota effettiva in quella riga **non è né 23% né 33%**: il beneficio si
spezza fra i due scaglioni, e una sola aliquota non può dirlo.

## Lo stesso lordo, sei regimi

### 30.000 € lordi, versamento 200 €/mese

| Regime | Imponibile | Detrazioni | IRPEF senza | IRPEF con | Risparmio | Aliquota effettiva |
|---|---|---|---|---|---|---|
| Dipendente privato | 27.243 € | 3.044 € | 3.222 € | 2.670 € | 552 € | 23,0% |
| Dipendente pubblico | 27.360 € | 3.034 € | 3.259 € | 2.707 € | 552 € | 23,0% |
| Artigiano | 22.793 € | 677 € | 4.565 € | 4.013 € | 552 € | 23,0% |
| Commerciante | 22.649 € | 682 € | 4.527 € | 3.975 € | 552 € | 23,0% |
| Professionista con partita IVA | 22.179 € | 698 € | 4.403 € | 3.851 € | 552 € | 23,0% |
| Collaboratore o co.co.co. | 26.497 € | 3.113 € | 2.982 € | 2.430 € | 552 € | 23,0% |

### 45.000 € lordi, versamento 200 €/mese

| Regime | Imponibile | Detrazioni | IRPEF senza | IRPEF con | Risparmio | Aliquota effettiva |
|---|---|---|---|---|---|---|
| Dipendente privato | 40.865 € | 793 € | 9.892 € | 9.100 € | 792 € | 33,0% |
| Dipendente pubblico | 41.040 € | 778 € | 9.965 € | 9.173 € | 792 € | 33,0% |
| Artigiano | 34.193 € | 359 € | 8.124 € | 7.332 € | 792 € | 33,0% |
| Commerciante | 33.977 € | 364 € | 8.048 € | 7.256 € | 792 € | 33,0% |
| Professionista con partita IVA | 33.269 € | 380 € | 7.798 € | 7.006 € | 792 € | 33,0% |
| Collaboratore o co.co.co. | 39.746 € | 922 € | 9.394 € | 8.602 € | 792 € | 33,0% |

## Due cose da spiegare al cliente

**Il collaboratore paga meno tasse di un artigiano su un imponibile più alto.**
Non è un errore: il suo reddito è assimilato a lavoro dipendente, quindi gli
spetta la detrazione dell'art. 13 comma 1, molto più alta di quella da lavoro
autonomo del comma 5.

**Il professionista arriva al salto molto più tardi.** A parità di lordo sta in
uno scaglione più basso del dipendente, perché ventisei punti di contributi
escono prima. Lo stesso versamento gli rende meno, e più a lungo.

