# Bet Builder: analiza UX (warstwa doświadczenia, bez UI)

Data: 2026-10-10 · zakres: przepływy, architektura informacji, model mentalny, język, stany. Wygląd (kolory, typografia, komponenty) jest poza zakresem, to etap UI.

## 1. Diagnoza w jednym akapicie

Produkt ma trzy niezależne „silniki kuponu”:

- Coupon Lab (`/builder`): `couponEngine`;
- klasyczny Builder (`/builder/classic`): `dailyCoupon` + optimizer;
- Approval Gate: `mockCoreEngine`.

Do tego dochodzi 8 pozycji w nawigacji, z czego 3 robią w praktyce to samo (Analiza, AI Cockpit, Sports → analiza wydarzenia). Użytkownik nie wie, gdzie „zrobić kupon”, a każde miejsce daje inny wynik dla tych samych danych. Interfejs mówi językiem systemu (Decision Packet, Evidence Graph, Mission, Approval Gate, Kelly, EV), a nie językiem gracza (chcę kupon za ~10, który ma sens). Zgłoszony błąd („kurs 5/10/50 daje ten sam kupon”) był bezpośrednim skutkiem: cel kursu nie sterował wyborem, a UI nie mówiło dlaczego.

## 2. Kim jest użytkownik i czego chce (jobs-to-be-done)

| Persona | Zadanie | Co dziś przeszkadza |
|---|---|---|
| **Kuponowiec** (główny ruch) | „Złóż mi kupon na dziś za ~x10, u STS/Superbet, za 20 zł” | 3 miejsca na kupon, wynik się nie zmienia, żargon, brak wyjaśnienia „czemu te mecze” |
| **Analityk** | „Czy ten mecz ma wartość? Gdzie najlepszy kurs?” | Analiza rozbita na Analiza / AI Cockpit / Sports / Live; brak porównania kursów jako głównego widoku |
| **Zdyscyplinowany gracz** | „Pilnuj mnie: limity, historia, czy wygrywam długoterminowo” | Historia i Misje zbudowane wokół „misji Core Engine”, a nie wokół „moje kupony i wynik (CLV/ROI)” |

Rekomendacja: projektować pod **Kuponowca** jako ścieżkę główną, a Analityka traktować jako pogłębienie tej ścieżki, nie osobny produkt.

## 3. Ustalenia (wg wpływu)

| # | Waga | Ustalenie | Dowód w kodzie | Rekomendacja |
|---|---|---|---|---|
| U1 | KRYTYCZNA | Cel kursu nie zmieniał kuponu. Szybkie przyciski x5/x10/x50 nie generowały ponownie, a silnik brał tylko typy z EV>0 (pula ~4). | `CouponLabPage`, `couponEngine` | ✅ **Naprawione**: cel steruje doborem, przycisk celu od razu przelicza, pokazana pula. |
| U2 | KRYTYCZNA | Trzy silniki kuponu dają różne wyniki dla tych samych danych. | `couponEngine`, `dailyCoupon`, `mockCoreEngine.optimize` | Jeden silnik, jedno miejsce „Kupon”. Klasyczny builder zostaje jako „tryb ręczny” tego samego ekranu. |
| U3 | WYSOKA | Nawigacja: 8 pozycji, duplikaty tras (`/` = `/events`, `/builder` = `/coupon`, `/sports/:id` = `/analysis/:id`), martwy `DashboardPage`. | `App.tsx`, `AppShell` | 4 pozycje: **Dziś** (wydarzenia + kursy) · **Kupon** · **Moje kupony** · **Wyniki**. Live jako filtr w „Dziś”, AI Cockpit jako zakładka analizy meczu. |
| U4 | WYSOKA | Żargon systemowy w ścieżce głównej: „Decision Packet”, „Evidence Graph”, „Mission”, „Approval Gate”, „Kelly”, „Deep Analyze”, „Optimize”. | `BuilderPanel`, `DecisionCenter`, `MissionBuilder` | Słownik produktu (§5). Terminy techniczne tylko w „Szczegółach” dla Analityka. |
| U5 | WYSOKA | Mieszanka PL/EN w tej samej ścieżce (EventsPage ~28 etykiet EN, Builder ~13). AGENTS.md wymaga polskiego. | grep etykiet w `src/pages` | Pełna polonizacja ścieżki głównej i wspólne `i18n.ts` dla wszystkich etykiet. |
| U6 | WYSOKA | Brak odpowiedzi na pytanie „dlaczego ten typ?”. Kupon pokazuje EV i conf., ale nie powód zrozumiały dla gracza. | `CouponLabPage` legs | Na każdym typie jedno zdanie: „Najlepszy kurs (Superbet 2.10) vs rynek 1.98 → +6%” albo „Brak przewagi, wybrany bo najbliżej celu”. |
| U7 | WYSOKA | Stany puste i błędy pokazywane jako kody (`NO_QUALIFIED_SELECTIONS`, `TARGET_NOT_REACHED`, `BLOCKED`). | `CouponLabPage`, `BuilderPage` | ✅ Częściowo naprawione w Coupon Lab (polskie komunikaty + co zrobić). To samo w Builderze i Misjach. |
| U8 | ŚREDNIA | „Approval Gate → Misja → Pomiar → Learning” to proces dla agenta, nie dla gracza. Kupon wymaga 5 kroków i checklisty, zanim stanie się „zapisany”. | `ApprovalGate`, `MissionDetailPage` | Dla gracza: **Zapisz kupon** (1 klik) + opcjonalne „Postaw w STS” (deeplink). Bramka zatwierdzeń zostaje jako funkcja dla automatyzacji. |
| U9 | ŚREDNIA | Brak kontroli nad doborem: nie można wykluczyć meczu, ligi ani godziny ani podmienić jednego typu. | `CouponLabPage` | Na typie: „Podmień” (następny najlepszy dla tego celu) i „Usuń”. Filtry: ligi, godziny, bukmacher. ✅ „Losuj inny zestaw” dodane. |
| U10 | ŚREDNIA | Stawka i wypłata są widoczne, ale brak kontekstu ryzyka w języku gracza (szansa 8% = „wygrywa ~1 na 12”). | aside wypłaty | Szansa jako częstość + „oczekiwany wynik na 100 takich kuponów”. |
| U11 | ŚREDNIA | Dane i świeżość: badge LIVE/DEGRADED jest, ale nie mówi, co to znaczy dla kuponu. | `providerHealth` | Jedno zdanie: „Kursy sprzed 4 min z 3 bukmacherów”. Przy STALE blokada z przyciskiem „Odśwież”. |
| U12 | NISKA | Odpowiedzialna gra: brak 18+, limitów, przerwy, linku do pomocy. | cała aplikacja | Bramka 18+, dzienny limit stawek, link do pomocy. Wymóg przed monetyzacją (F2). |

## 4. Docelowa ścieżka główna (Kuponowiec)

```
Dziś ──► Kupon ───────────────────────────────► Moje kupony ──► Wyniki
         1. cel: x5 / x10 / x50 / własny       zapis 1 klik     trafność, ROI,
         2. stawka, bukmacherzy, filtry        status meczu     CLV (czy biłem rynek)
         3. [Generuj] → kupon + „dlaczego”
         4. per typ: Podmień · Usuń · Analiza meczu
         5. Losuj inny · Tylko z przewagą
```

Zasady:

1. **Jedno miejsce, jeden silnik.**
2. **Każda zmiana parametru od razu przelicza wynik.** Nie ma stanu „wynik nieaktualny”.
3. **Przy każdym typie jest powód w jednym zdaniu.**
4. **Brak przewagi jest wyświetlany jako informacja, a nie ukrywany.**
5. **Szczegóły dla Analityka są o jedno kliknięcie dalej, nie w ścieżce głównej.**

## 5. Słownik produktu (UI ↔ system)

| System | W UI dla gracza |
|---|---|
| EV | Przewaga nad rynkiem (+6% / brak) |
| Fair probability / consensus | Szansa wg rynku |
| Decision Packet / Portfolio | Kupon |
| Mission | Zapisany kupon |
| Approval Gate | Potwierdzenie (tylko automatyzacje) |
| Evidence Graph / Deep Research | Dlaczego ten typ / Newsy o meczu |
| Optimize | Dopasuj do celu |
| Provider DEGRADED / STALE | Kursy mogą być nieaktualne (sprzed X min) |
| Kelly | (ukryć przed graczem; tylko tryb Analityka) |

## 6. Plan wdrożenia UX (przed etapem UI)

| Krok | Zakres | Status |
|---|---|---|
| UX-1 | Cel kursu steruje kuponem, przeliczanie na zmianę celu, tryby, „Losuj inny”, polskie komunikaty | ✅ zrobione (ten commit) |
| UX-2 | „Dlaczego ten typ” + Podmień/Usuń per typ | następny |
| UX-3 | Jeden silnik: Builder klasyczny używa `couponEngine`, `dailyCoupon` tylko jako adapter API | |
| UX-4 | Nawigacja 4-pozycyjna, usunięcie duplikatów tras, martwy Dashboard out | |
| UX-5 | Słownik + polonizacja ścieżki głównej | |
| UX-6 | „Moje kupony” zamiast Misji dla gracza: zapis 1 klik, status, wynik | |
| UX-7 | Wyniki: trafność, ROI, CLV | wymaga F3 (snapshoty zamknięcia) |
| UX-8 | Odpowiedzialna gra: 18+, limity | wymóg przed monetyzacją |

Kryterium sukcesu ścieżki głównej: od wejścia do zapisanego kuponu ≤ 3 kliknięcia i ≤ 30 s. Zmiana celu zawsze zmienia wynik albo mówi dlaczego nie może.
