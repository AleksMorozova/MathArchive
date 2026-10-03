# MathArchive Ollama Lab

Local-only proof of concept for answering one question: can a local vision model reliably extract structured mathematical educational content from MathArchive source images?

The lab stops after image analysis, JSON validation, and human review. It does not render posters, create PNG files, publish materials, upload documents, or call the production MathArchive API. It is intentionally outside `backend/MathArchive.sln`, the production Dockerfile, CI, and the frontend build.

## Architecture

```text
PNG/JPEG/WEBP
    -> local ASP.NET Core endpoint
    -> local Ollama POST /api/chat
       (image + analysis prompt + JSON Schema)
    -> typed deserialization and application validation
    -> local review UI
```

`GET /api/tags` provides the lightweight connectivity and installed-model check. Raw model output is returned to the browser only in the Development environment. Logs contain model, duration, content type, and byte count, but never the image base64 or extracted raw response.

The lab binds to `http://127.0.0.1:5198` by default. Its Ollama URL is validated as a loopback HTTP URL so this experiment does not expose or call a public Ollama endpoint.

## Selected model

Default: `qwen3-vl:8b-instruct`.

The current Ollama library lists this vision model at about **6.1 GB**, with text and image input. The explicit `instruct` tag is intentional: the shorter `qwen3-vl:8b` tag points to the thinking variant, which can spend the complete local output budget on reasoning and return empty `message.content`. The instruct model is a practical comparison point for OCR, diagrams, tables, multilingual text, and schema-constrained extraction without that reasoning overhead. Expect roughly 10–12 GB of available system memory for comfortable CPU use, or comparable available VRAM when Ollama can offload the model. This memory guidance is a practical estimate; actual use and speed depend on image size, context, Ollama version, quantization, and hardware.

Lighter alternative: `qwen3-vl:4b-instruct`, listed at about **3.3 GB**. It is more suitable for machines with limited RAM/VRAM, but formula OCR and dense diagrams should be compared carefully against the 8B result.

Official references checked for this implementation:

- [Ollama chat endpoint](https://docs.ollama.com/api/chat)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama list-models endpoint](https://docs.ollama.com/api/tags)
- [qwen3-vl model tags](https://ollama.com/library/qwen3-vl/tags)

The client sends `stream: false`, a base64 image on the user message, `temperature: 0`, and the complete JSON Schema in the `format` property. Model output is still treated as untrusted and validated locally.

## Windows setup

1. Install Ollama from [the official Windows download](https://ollama.com/download/windows), or with Windows Package Manager:

   ```powershell
   winget install Ollama.Ollama
   ```

2. Open a new PowerShell window, then pull the configured model:

   ```powershell
   ollama pull qwen3-vl:8b-instruct
   ```

3. The Windows Ollama application normally starts the local service. If it is not running, start it explicitly:

   ```powershell
   ollama serve
   ```

4. Verify Ollama and the installed model in another terminal:

   ```powershell
   curl.exe http://localhost:11434/api/tags
   ollama list
   ```

5. From the repository root, start the lab:

   ```powershell
   dotnet run --project tools/MathArchive.OllamaProcessor/MathArchive.OllamaProcessor.csproj
   ```

6. Open <http://127.0.0.1:5198>. Select a PNG, JPEG, or WEBP mathematical image, confirm that the status says `Ollama підключено`, and choose `Аналізувати`.

If `ollama serve` reports that port 11434 is already in use, the desktop Ollama service is likely already running; verify it with `/api/tags` instead of starting a second instance.

## Configuration

Change `appsettings.json`, create an untracked `appsettings.Development.json`, or use standard .NET environment variables:

```powershell
$env:Ollama__BaseUrl='http://localhost:11434'
$env:Ollama__VisionModel='qwen3-vl:4b-instruct'
$env:Ollama__TimeoutSeconds='1200'
$env:Ollama__MaximumImageBytes='10485760'
$env:Ollama__ContextWindow='4096'
$env:Ollama__MaximumOutputTokens='1536'
$env:Ollama__KeepAlive='10m'
dotnet run --project tools/MathArchive.OllamaProcessor/MathArchive.OllamaProcessor.csproj
```

The timeout accepts 30–1800 seconds and defaults to 1200 seconds because mostly-CPU vision inference can be slow. Output is bounded to 1536 tokens to prevent an unbounded local generation. The image limit accepts up to 50 MB and defaults to 10 MB. The request disables model thinking, uses a 4096-token context, and keeps the model loaded for 10 minutes so repeated comparisons do not pay the full model-load cost. No API key, database, MathArchive backend, or production configuration is used.

## Structured result

The root contract is `MathArchiveImageAnalysis`:

- title, source language, suggested grade (5–11 or null), and suggested topic;
- one or more sections;
- zero or more typed warnings.

Allowed section types are `Definition`, `FormulaGroup`, `Rule`, `Algorithm`, `Example`, `Table`, `Graph`, `NumberLine`, `Geometry`, `Text`, and `ImportantNote`. Formulas are separate strings. Tables contain headers and same-width rows. Visual data can represent a function graph, number line, or geometry relationships without encoding pixel positions. Warning types are `FormulaUncertain`, `TextUncertain`, `GraphUncertain`, `TableUncertain`, `GradeUncertain`, and `TranslationUncertain`.

Application validation checks required text, grade bounds, section identifiers, nonempty formula entries, formula groups, table dimensions, graph functions, number-line bounds, visual kinds, warning messages, and warning section references. Invalid JSON, unknown enum values, empty responses, and failed validation become understandable errors rather than publishable data.

## Tests

Run the isolated test project without adding the lab to production CI:

```powershell
dotnet test tools/MathArchive.OllamaProcessor.Tests/MathArchive.OllamaProcessor.Tests.csproj
```

The automated tests use mocked HTTP responses and never call or download a model. They cover valid structured output, formula and LaTeX backslash preservation, warnings, invalid JSON, empty results, unknown section types, malformed formula groups, table dimensions, graph structure, Ollama unavailability, and a missing configured model.

## Manual comparison set

Use the same images when comparing configured models:

1. clean Ukrainian educational poster;
2. Russian poster requiring natural Ukrainian translation;
3. Instagram/Pinterest-style screenshot with UI noise;
4. formula-heavy cheat sheet;
5. graph-heavy image;
6. geometry image;
7. table-heavy material;
8. noisy or decorated educational poster.

For each image, review title/topic/language/grade, exact formula symbols, table widths, graph or number-line semantics, ignored noise, warnings, raw response, processing time, and whether the model invented unreadable content.

## Known Phase 1 limits

- Structured output constrains shape, not mathematical truth; every result requires human review.
- Local inference can be slow without suitable acceleration.
- The browser cancel action stops this HTTP request, but an Ollama version/model may continue some local computation before releasing it.
- The raw response is intentionally available only in Development.
- The UI displays formulas as plain preserved strings; it does not render LaTeX.
- No result is saved, published, or sent to production.

## Phase 2 recommendation

The boundary is ready for a later deterministic pipeline—validated structured JSON to HTML/CSS plus KaTeX/SVG, then PNG, then an explicit reviewed MathArchive upload—provided manual trials show acceptable formula and diagram accuracy. Keep the validated intermediate contract as the boundary and do not let the model generate layout code. Before Phase 2, record failures across the eight-image comparison set and tighten the schema/prompt only where those real failures justify it.
