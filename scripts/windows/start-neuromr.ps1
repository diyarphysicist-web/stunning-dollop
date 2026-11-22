param([switch]$Phase1)
$ErrorActionPreference = "Continue"
$od  = "$HOME\Projects\open-design"
$app = "$HOME\Projects\NeuroMR-PRO"
$log = "$env:TEMP\open-design.log"

if (-not (Test-Path (Join-Path $app "CLAUDE.md"))) {
    Write-Host "CLAUDE.md not found in $app. Clone the repo first:" -ForegroundColor Red
    Write-Host "  git clone --branch claude/new-session-eartr5 https://github.com/diyarphysicist-web/stunning-dollop.git `"$app`""
    Read-Host "Press Enter to close"; exit 1
}
Write-Host "Updating project from GitHub..." -ForegroundColor Cyan
git -C $app pull --ff-only

Write-Host "Stopping any earlier Open Design session..." -ForegroundColor Cyan
cmd /c "cd /d `"$od`" && pnpm tools-dev stop >nul 2>&1"

Write-Host "Starting Open Design..." -ForegroundColor Cyan
Remove-Item $log -ErrorAction SilentlyContinue
$proc = Start-Process cmd -PassThru -WindowStyle Minimized `
    -ArgumentList "/c", "cd /d `"$od`" && pnpm tools-dev run web > `"$log`" 2>&1"

$port = $null
$web  = $null
for ($i = 0; $i -lt 90 -and -not ($port -and $web); $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $log) {
        $text = (Get-Content $log -Raw -ErrorAction SilentlyContinue) -replace "\x1b\[[0-9;]*m", ""
        if ($text -match "Web:\s+(http://127\.0\.0\.1:\d+/?)")  { $web  = $Matches[1] }
        if ($text -match "Daemon:\s+http://127\.0\.0\.1:(\d+)") { $port = $Matches[1] }
    }
    if ($proc.HasExited) {
        Start-Sleep -Seconds 1
        $text = (Get-Content $log -Raw -ErrorAction SilentlyContinue) -replace "\x1b\[[0-9;]*m", ""
        if ($text -match "Web:\s+(http://127\.0\.0\.1:\d+/?)")  { $web  = $Matches[1] }
        if ($text -match "Daemon:\s+http://127\.0\.0\.1:(\d+)") { $port = $Matches[1] }
        break
    }
}

if (-not $port) {
    Write-Host "Open Design did not start. Last lines of the log:" -ForegroundColor Red
    Get-Content $log -Tail 20 -ErrorAction SilentlyContinue
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "Open Design is running (daemon port $port). Connecting it to Claude Code..." -ForegroundColor Cyan
cmd /c "claude mcp remove open-design --scope user >nul 2>&1"

# Project-level MCP config (.mcp.json) with the current daemon port
$mcp = [ordered]@{
    mcpServers = [ordered]@{
        "open-design" = [ordered]@{
            command = "cmd"
            args    = @("/c", "pnpm", "--dir", $od, "exec", "od", "mcp", "--daemon-url", "http://127.0.0.1:$port")
        }
    }
}
$mcp | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $app ".mcp.json") -Encoding Ascii

# Pre-approve the open-design server for this project
$settingsDir  = Join-Path $app ".claude"
$settingsFile = Join-Path $settingsDir "settings.local.json"
if (-not (Test-Path $settingsDir)) { New-Item -ItemType Directory -Path $settingsDir | Out-Null }
$settings = [pscustomobject]@{}
if (Test-Path $settingsFile) {
    try { $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json } catch { $settings = [pscustomobject]@{} }
}
$enabled = @()
if ($settings.PSObject.Properties.Name -contains "enabledMcpjsonServers") { $enabled = @($settings.enabledMcpjsonServers) }
if ($enabled -notcontains "open-design") { $enabled += "open-design" }
$settings | Add-Member -NotePropertyName enabledMcpjsonServers -NotePropertyValue $enabled -Force
$settings | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsFile -Encoding Ascii

# Keep the machine-specific port file out of git
$gi = Join-Path $app ".gitignore"
if (-not (Select-String -Path $gi -Pattern '^\.mcp\.json$' -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -Path $gi -Value ".mcp.json"
}

Push-Location $app
claude mcp get open-design
Pop-Location

if ($web) { Start-Process $web }

Write-Host ""
Write-Host "Claude Code is starting. Paste your Phase 1 message, or to resume later type:" -ForegroundColor Green
Write-Host "  Resume from CLAUDE.md. Use the Open Design MCP tools (load them with ToolSearch)." -ForegroundColor Green
Write-Host ""
Set-Location $app
if ($Phase1) {
    $promptFile = Join-Path $app "docs\PHASE1_PROMPT.md"
    @'
# Phase 1 instructions (written by the launcher)

Resume NeuroMR-PRO from CLAUDE.md and run Phase 1 (Design) with Open Design.

Environment status:
- Folder permissions are fixed; the project folder is writable.
- Open Design is running locally and registered as the MCP server "open-design".
- The Open Design skills design-md, design-brief, high-end-visual-design and web-design-guidelines are installed in .claude/skills.

Rules:
1. Do not use the in-repo HTML design fallback. Phase 1 must be done in Open Design.
2. The Open Design MCP tools may be deferred. Run ToolSearch for "open-design", load all of its tools, then list Open Design projects and confirm the project "NeuroMR-PRO" exists. If it does not exist, create it.
3. If no Open Design tools are available after ToolSearch, stop and report exactly what `claude mcp get open-design` shows. Do not fall back.

Then do Phase 1 in this order:
1. Commit .claude/skills/ in its own commit, and add .agents/ to .gitignore.
2. Run pnpm install and generate the phantoms, so the screens can use real synthetic brain slices.
3. Write the design brief (design-brief skill) to design/BRIEF.md, from sections 4 and 5 of docs/PROMPT.md and from FUNCTIONAL_SPEC.md.
4. Create the NeuroMR-PRO design system in Open Design (design-md skill) at design-systems/neuromr-pro/DESIGN.md, implementing every token in section 4, and set it as the project's active design system.
5. Generate every screen in section 5.2 in Open Design as high-fidelity desktop prototypes, plus the extra screens required by FUNCTIONAL_SPEC.md: the 4-study longitudinal layout and the extended lesion types (cavernoma, bleeding, edema). Use real map names, parameters, units and DICOM tags, and use grayscale slices rendered from the phantoms.
6. Run a self-critique pass on every screen against the UX laws in section 4.6 and revise in Open Design until all of them pass.
7. Export each screen as HTML + PNG to design/screens/.
8. Export the tokens to packages/ui/src/tokens/tokens.css and packages/ui/src/tokens/tokens.ts.
9. Write design/COMPONENTS.md: every component with its variants, states and keyboard behavior.
10. Lock the design: update CLAUDE.md to say design work is done in Open Design and Phase 1 is complete, run all tests and lint, commit, and push to claude/new-session-eartr5.
11. Post the Phase 1 report: what was built, test results, the list of screen PNGs, and known limits.
'@ | Set-Content -Path $promptFile -Encoding UTF8
    Write-Host "Phase 1 instructions written to docs\PHASE1_PROMPT.md. Claude Code will start on them now." -ForegroundColor Green
    claude "Read docs/PHASE1_PROMPT.md and carry it out exactly."
} else {
    claude
}
