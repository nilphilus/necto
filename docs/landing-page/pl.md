# Necto — polska wersja do konsultacji

Publiczna strona jest po angielsku: [index.html](index.html). Poniższy tekst zachowuje polski punkt odniesienia dla propozycji.

**OpenAPI UI with a backbone.**

## Podążaj za danymi. Sprawdzaj cały przepływ.

Zaznacz obiekt. Przenieś jego wartości do kolejnego requestu. Zapisz całą drogę i uruchom ją ponownie.

- Mniej przepisywania ID
- Powtarzalne przepływy
- Więcej miejsca na odpowiedź

**Zobacz przepływ** · **Dodaj do swojego API** · **GitHub**

Dla programistów i QA pracujących z API ASP.NET Core.

## Jedna odpowiedź. Więcej kolejnych kroków.

- **Podążaj za danymi:** wybierz fakturę i wykorzystaj jej ID w powiązanym requeście. Sprawdź lub popraw dane przed wysłaniem.
- **Powtórz przepływ:** zapisz łańcuch i uruchom go z wartościami ze świeżych odpowiedzi.
- **Zbuduj scenariusz.** Połącz równoległe requesty na diagramie i wykorzystaj ich wyniki w kolejnych krokach. Współdziel zmienne, generuj dane testowe i zatrzymuj wykonanie, aby uzupełnić dane. Odpytuj API, aż odpowiedź będzie zawierać oczekiwaną wartość.
- **Znajdź obiekt:** przeszukuj całą odpowiedź, przejdź do właściwej strony i zaznacz wynik.
- **Zobacz połączenia:** poznaj graf encji lub endpointów i otwórz właściwy request.

## Od wysłania requestu do weryfikacji

- **Pracuj z chronionym API.** Otwieraj chronione dokumenty OpenAPI i wysyłaj requesty z tokenem Bearer, Basic auth, kluczem API, sesją przeglądarki lub OAuth2/OIDC z PKCE.
- **Wysyłaj pliki i przeglądaj odpowiedzi.** Wysyłaj JSON, formularze, pliki lub XML. Sprawdzaj nagłówki, zdarzenia SSE i NDJSON oraz zagnieżdżone dane JSON i XML. Pobieraj oryginalną odpowiedź.
- **Weryfikuj każdy krok.** Sprawdzaj kody statusu i wartości w odpowiedziach. Przeglądaj wysłane requesty z zamaskowanymi sekretami, porównuj odpowiedzi z historii i eksportuj zapisane łańcuchy do CI z raportami JSON i JUnit.

## Ustaw kontekst i pracuj dalej.

Presety współdzielą wartości między requestami. Połączenia zewnętrzne dodają inne API i ich mapowania. Most MCP przekazuje kontekst Twojemu agentowi, który korzysta z własnego modelu, narzędzi HTTP i poświadczeń.

## Dlaczego Necto?

Od łacińskiego [nectō](https://cld.bbaw.de/lemma/lat/necto) — „wiążę” lub „łączę”. Nazwa oddaje ideę produktu: łączenie odpowiedzi, wartości i kolejnego requestu.

## Twoje API. Jeszcze jedna przydatna ścieżka.

Interfejs jest dołączony do pakietu .NET i korzysta z dokumentu OpenAPI. Necto generuje z kodu C# mapowania i metadane kontraktów dla Minimal APIs i FastEndpoints. Oznaczone pola wrażliwe są maskowane w historii i eksportowanych fragmentach kodu. Szczegóły są na osobnej stronie technicznej.
