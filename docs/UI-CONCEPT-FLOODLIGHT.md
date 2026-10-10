# Bet Builder UI: koncept „Floodlight” (research + kierunek)

Data: 2026-10-10. Wdrożone: Coupon Lab (commit `96c2dc5`). Ten dokument opisuje kierunek dla pozostałych ekranów.

## 1. Co mówi research

| Źródło | Wniosek | Jak to stosujemy |
|---|---|---|
| Altenar, *Sportsbook UX Trends 2026* | Upraszczanie: mniej rynków na ekranie, najistotniejsze typy na górze. Animowane kursy przy zmianie, natychmiastowy feedback na kuponie. | 3 liczby na kuponie (kurs, wypłata, szansa). Kursy „flipują” przy zmianie, wypłata liczy się w górę. |
| Flat Studio, *OddsJam* | Gęste dane działają, gdy kolor i kształt niosą znaczenie (stany 5-stopniowe), a szczegóły są w arkuszu lub modalu. | „Przewaga” to zielony stan, „bez przewagi” neutralny szary. Szczegóły są w rozwijanym wierszu. |
| daisyUI, *Sports Brutalism* | Kondensowany krój dla liczb, tablica wyników jako siatka, ostre cięcia, liczniki, akcent tylko na stany LIVE/WIN. | Anton jako krój wyświetlający dla kursu i wypłaty, cyfry tabelaryczne, złoty akcent tylko na CTA i celu. |
| Pratt IxD, *FotMob critique* | Grupowanie po ligach, wyraźny stan „Dziś”, feedback po tapnięciu, przewidywalne miejsca filtrów. | Następny ekran „Dziś”: karty lig, przewijane daty, jeden pasek filtrów. |
| Software Mind, *UX/UI guidelines* | Pokazuj wypłatę przed potwierdzeniem, bez żargonu, mobile-first. | Wypłata jest widoczna od razu („Cel wygranej”). Polskie słownictwo zamiast EV/Kelly. |
| Beyond Sports, *Sports viz 2026* | Interaktywność i grywalizacja zamiast liniowej prezentacji. | Sortowalna tabela, podmiana typu jednym tapnięciem, „Losuj inny zestaw”. |
| CoderCops, *View Transitions / scroll-driven 2026* | Oba API mają ~95% wsparcia (Chrome, Firefox, Safari). Zastępują większość kodu IntersectionObserver i bibliotek. | `.fl-reveal` przez `animation-timeline: view()`. W kolejnym kroku View Transitions między ekranami. |

## 2. Zasady wizualne

1. **Scena, nie dekoracja.** Tło to nocny stadion zrobiony w CSS/SVG (reflektory, linie boiska), bez zdjęć z banków. Zgodne z AGENTS.md, lekkie na mobile.
2. **Trzy liczby.** Na kuponie są tylko kurs, wypłata i szansa („1 raz na N”). Reszta jest w „Szczegółach dla analityka”.
3. **Ruch przy zmianie.** Animujemy tylko to, co się zmieniło: kurs, wypłatę, wejście nowego typu. Wyłącznie transform/opacity, wyłączone przy `prefers-reduced-motion`.
4. **Uczciwy kolor.** Zielony oznacza wyłącznie realną przewagę. Złoty to cel i CTA, szary to brak przewagi. Czerwony tylko dla błędów.
5. **Kupon jak bilet.** Perforacja, „karnet” z wypłatą. To element wow, który jednocześnie porządkuje informacje.

## 3. Tokeny

| Token | Wartość | Użycie |
|---|---|---|
| `--fl-pitch` / `--fl-pitch-2` | `#0b2a1f` / `#0f3a2a` | poświata murawy |
| `--fl-beam` | `rgba(210,235,255,.10)` | reflektory |
| `--bb-gold` | `#f0cb7a` | cel, CTA, kurs |
| `--bb-positive` | `#5ee6a5` | przewaga |
| `--fl-display` | Anton | kurs, wypłata, nagłówki |
| Inter / JetBrains Mono | — | tekst / dane techniczne |

## 4. Następne ekrany

| Ekran | Koncept |
|---|---|
| **Dziś** (zamiast Home/Events/Live) | Pasek dat jak tablica wyników, karty lig. Każdy mecz to wiersz z 3 kursami jako przyciski „dodaj do kuponu”. Najlepszy kurs jest podświetlony. LIVE pulsuje tylko przy meczach na żywo. |
| **Mecz** | Hero ze scoreboardem (herby jako inicjały w tarczach SVG), porównanie kursów bukmacherów jako poziome słupki, „Dlaczego” w 3 zdaniach. Analityka 9 sekcji przeniesiona do zakładki. |
| **Moje kupony** | Bilety w stosie (stack cards), status meczów na żywo w kuponie, wynik i CLV. |
| **Przejścia** | View Transitions: kurs z listy „leci” do kuponu (`view-transition-name` na przycisku kursu i wierszu kuponu). |

## 5. Źródła

- https://altenar.com/blog/sportsbook-ux-trends-to-watch/
- https://www.flatstudio.co/work/oddsjam-ios
- https://trends.daisyui.com/trend/sports-brutalism/
- https://ixd.prattsi.org/2021/09/design-critique-fotmob-android-app/
- https://softwaremind.com/blog/ux-and-ui-guidelines-for-building-a-better-sports-betting-experience/
- https://www.beyondsports.nl/news/from-data-to-experience-sports-visualization-trends-to-watch-in-2026
- https://blog.codercops.com/blog/css-view-transitions-scroll-animations-2026
