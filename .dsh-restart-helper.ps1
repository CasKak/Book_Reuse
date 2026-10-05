# One-shot DSH web restart helper — activates the dshmarket plugin.
# Started via WMI (Win32_Process.Create) so it survives the DSH process it replaces.
$ErrorActionPreference = 'Continue'

$log = Join-Path $env:USERPROFILE '.dsh\dsh-restart.log'
function Note($m) {
    try { Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8 } catch {}
}

Note "=== helper start pid=$PID ==="

# Grace period: let the in-flight turn flush to the browser before the host goes away.
Start-Sleep -Seconds 20
Note "grace period elapsed; stopping old host"

# 22868 = node .../@deepseek-ai/dsh/lib/bin.js web   (the server)
# 12000 = node .../npx-cli.js @deepseek-ai/dsh web   (the npx wrapper)
# 8768  = cmd.exe shim between npx and the server
# Deliberately NOT killed: 22352, the user's own terminal shell.
foreach ($procId in 22868, 12000, 8768) {
    try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Note "stopped pid $procId"
    } catch {
        Note "stop pid $procId failed: $($_.Exception.Message)"
    }
}

# Wait until nothing is listening on 3080, or the replacement dies with EADDRINUSE.
$free = $false
for ($i = 0; $i -lt 90; $i++) {
    $listening = netstat -ano | Select-String ':3080 ' | Select-String 'LISTENING'
    if (-not $listening) { $free = $true; break }
    Start-Sleep -Seconds 1
}
Note "port 3080 free=$free after ${i}s"

$node = 'C:\Program Files\nodejs\node.exe'
$bin  = 'C:\Users\Chero\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js'

Set-Location 'F:\Working\Book_Reuse'
Note "launching replacement: $node $bin web"
& $node $bin web *>> $log
Note "replacement exited code=$LASTEXITCODE"
