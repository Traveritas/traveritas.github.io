Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CurTest {
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr LoadCursorFromFile(string lpFileName);
  [DllImport("user32.dll")]
  public static extern bool DestroyCursor(IntPtr hCursor);
}
"@

$path = Join-Path $PSScriptRoot 'star-ring.cur'
$h = [CurTest]::LoadCursorFromFile($path)
if ($h -eq [IntPtr]::Zero) {
  Write-Output ("FAIL " + [Runtime.InteropServices.Marshal]::GetLastWin32Error())
  exit 1
}
Write-Output ("OK handle=" + $h)
[void][CurTest]::DestroyCursor($h)
