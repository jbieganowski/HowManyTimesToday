# How Many Times Today

Integracja Home Assistant + karta Lovelace do śledzenia czynności wykonywanych
cyklicznie w ciągu dnia (leki, karmienie zwierząt, picie wody itp.).

## Status

Projekt w fazie projektowania — szkielet repozytorium, implementacja w toku.

## Koncepcja

Każda zdefiniowana czynność (np. "tabletka 2x dziennie o 9:00 i 22:00") tworzy
niezależne "sloty" — osobny przycisk na każde oczekiwane wystąpienie w ciągu dnia.

Przycisk zmienia kolor w czasie (zielony → czerwony → brązowy) w miarę zbliżania
się i mijania oczekiwanej godziny, a w skrajnym przypadku zaczyna migać.
Naciśnięcie resetuje slot i zapisuje wpis w historii.

Pełna specyfikacja funkcjonalna: [docs/SPECYFIKACJA.md](docs/SPECYFIKACJA.md)

## Dokumentacja i śledzenie zadań

- Confluence: przestrzeń `HMTT` na jacekbieganowski.atlassian.net
- Jira: projekt `HMTT`

## Instalacja

Docelowo przez [HACS](https://hacs.xyz/) jako custom repository (status: jeszcze
niegotowe do użycia).

## Licencja

MIT — patrz [LICENSE](LICENSE).
