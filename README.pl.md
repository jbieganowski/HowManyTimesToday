<p align="center">
  <img src="docs/images/banner.pl.svg" alt="How Many Times Today" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.pl.md"><b>Polski</b></a>
</p>

# How Many Times Today

Integracja Home Assistant + karta Lovelace do śledzenia czynności wykonywanych
cyklicznie w ciągu dnia (leki, karmienie zwierząt, picie wody itp.).

## Status

Projekt w fazie projektowania — szkielet repozytorium i silnik backendu
gotowe, karta Lovelace jeszcze niezbudowana.

## Koncepcja

Każda zdefiniowana czynność (np. "tabletka 2x dziennie o 9:00 i 22:00") tworzy
niezależne **sloty** — osobny przycisk na każde oczekiwane wystąpienie w ciągu
dnia.

Przycisk zmienia kolor w czasie (zielony → czerwony → brązowy) w miarę
zbliżania się i mijania oczekiwanej godziny, a w skrajnym przypadku zaczyna
migać (zapomniano / znaczne spóźnienie). Naciśnięcie resetuje slot i zapisuje
wpis w historii.

Pełna specyfikacja funkcjonalna: [docs/SPECYFIKACJA.md](docs/SPECYFIKACJA.md)
([wersja angielska](docs/SPECIFICATION.md))

<p align="center">
  <img src="docs/images/card-states.pl.png" alt="Stany przycisku slotu" width="100%">
</p>
<p align="center">
  <img src="docs/images/config-menu.pl.png" alt="Menu konfiguracji" width="70%">
</p>

> To ilustracje poglądowe zbudowane na bazie faktycznego kodu karty/kolorów,
> nie prawdziwe zrzuty ekranu — w tym środowisku nie mam jeszcze automatyzacji
> przeglądarki, żeby przechwycić działający interfejs Home Assistant.

## Dokumentacja i śledzenie zadań

- Confluence: przestrzeń `HMTT` na jacekbieganowski.atlassian.net
- Jira: projekt `HMTT`

## Instalacja

Docelowo przez [HACS](https://hacs.xyz/) jako custom repository (status:
jeszcze niegotowe do użycia). Karta Lovelace jest dołączona wewnątrz integracji
i rejestruje się sama — bez ręcznego dodawania zasobu.

Dodanie slotu do pulpitu (jedna karta na jeden sensor slotu):

```yaml
type: custom:how-many-times-today-card
entity: sensor.karma_dla_kota_1_status
```

## Licencja

MIT — patrz [LICENSE](LICENSE).
