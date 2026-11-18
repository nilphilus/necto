---
name: publish-necto-nuget
description: Przygotowuje wydania Necto w GitHub Releases repozytorium nilphilus/necto z paczką NuGet i archiwum skilla necto-scenarios. Użyj przy prośbach o wydanie Necto, przygotowanie jego paczek lub dołączenie ich do istniejącego wydania.
---

# Wydanie Necto na GitHubie

Domyślnym miejscem publikacji jest sekcja **Releases** repozytorium `nilphilus/necto`. Do wydania dołącz dwa pliki w sekcji **Assets**, paczkę `.nupkg` i archiwum `necto-skill.zip`, chyba że użytkownik wskaże konkretne załączniki. Prośbę o rejestr z adresem do `dotnet restore` obsłuż jako publikację w GitHub Packages, korzystając z dokumentacji rejestru. [GitHub Packages dla NuGet](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry)

## Przygotowanie załączników

1. Sprawdź `git status --short`, adres `origin`, ostatnie tagi i wydania. Ustal wersję NuGet i commit z polecenia użytkownika lub z jednoznacznego kontekstu wydania. Zachowaj istniejącą konwencję tagów, a przy jej braku użyj `v<wersja>`. Jeśli wersji lub commita nie da się ustalić, przygotuj dostępne informacje i poproś o brakującą decyzję.
2. Przy publikacji buduj z czystego checkoutu commita, który ma wskazywać tag. Jeśli robocze drzewo zawiera zmiany, użyj osobnego checkoutu i zostaw bieżące zmiany użytkownika. Commit musi być dostępny w docelowym repozytorium przed utworzeniem wydania dla jego SHA.
3. Użyj SDK .NET 10, Node.js i pnpm. Projekt `Necto/Necto.csproj` buduje i osadza Vue UI oraz pakuje generator Roslyn jako analizator. Z katalogu głównego checkoutu uruchom poniższe polecenia, podstawiając `$version` oraz `$output` wskazujący nowy katalog pod `artifacts/`. Sprawdź kod wyjścia po każdym poleceniu.

   ```powershell
   dotnet test Tests/Tests.csproj -c Release
   dotnet pack Necto/Necto.csproj -c Release -p:PackageVersion=$version -o $output
   ```

4. Otwórz `.nupkg` jako ZIP. Sprawdź identyfikator `Necto` i wersję w `.nuspec`, a także `lib/net10.0/Necto.dll`, `analyzers/dotnet/cs/Necto.Generator.dll` i `README.md`. Zasoby `Necto.UI/index.html` i `Necto.UI/assets/*` sprawdź w manifeście `Necto.dll`. Zapisz ścieżkę paczki jako `$package`.
5. Z tego samego checkoutu przygotuj skill za pomocą skryptu repozytorium. Skrypt wymaga zainstalowanych zależności `Necto.UI`, Node.js 22+ i polecenia `python3` w `PATH`.

   ```powershell
   $skillArchive = Join-Path $output 'necto-skill.zip'
   node tools/package-scenario-skill.mjs $skillArchive
   node --test tools/scenario-skill.test.mjs
   ```

   Sprawdź kody wyjścia i zawartość ZIP. Archiwum ma zawierać jeden katalog `necto-scenarios/` z `SKILL.md`, `LICENSE`, `references/`, `examples/` i `scripts/` wraz z dołączonym walidatorem. Zapisz SHA-256 obu plików. Przy prośbie o samo przygotowanie zwróć ścieżki, sumy i wyniki testów.

## Publikacja i weryfikacja

Publikuj po otrzymaniu polecenia publikacji. Sprawdź stan zdalnego taga i wydania przed zmianą. Jeśli tag wskazuje inny commit, ustal rozbieżność przed publikacją. Gdy nie ma jeszcze wydania, użyj uwierzytelnionego `gh` i jawnie wskaż repozytorium. Dla istniejącego zdalnego taga użyj `--verify-tag` w miejsce `--target $commit`. Wersję z sufiksem przedpremierowym oznacz `--prerelease`.

```powershell
gh release create $tag $package $skillArchive --repo nilphilus/necto --target $commit --title $tag --notes-file $notesFile
```

W `$notesFile` opisz zmiany dla odbiorców na podstawie historii wydania. Przy istniejącym wydaniu lub ponowieniu po błędzie odczytaj listę załączników. Dla każdego brakującego pliku użyj `gh release upload $tag $asset --repo nilphilus/necto`, podstawiając jego lokalną ścieżkę jako `$asset`. Istniejący plik pobierz i porównaj jego SHA-256 z lokalnym plikiem. Zgodna suma spełnia warunek publikacji, a przy różnych sumach zgłoś kolizję. [GitHub CLI](https://cli.github.com/manual/gh_release_create)

Jeśli `gh` jest niedostępny, użyj połączonego narzędzia GitHub lub interfejsu Releases, o ile pozwala przesłać lokalne pliki i wybrać właściwy tag. Sprawdź na GitHubie status i tag wydania oraz zgodność SHA-256 każdego pobranego załącznika z lokalnym plikiem. Zwróć link do wydania i bezpośrednie linki do opublikowanych załączników.
