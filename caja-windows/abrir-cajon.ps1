# ============================================================
#  Ayudante del cajon monedero - Delicias del Rey
# ------------------------------------------------------------
#  Escucha en http://127.0.0.1:9110/kick y, cuando el sistema
#  POS imprime la FACTURA del cliente, manda al cajon la senal
#  de abrir. En la comanda el POS NO llama aqui, asi que el
#  cajon NO se abre.
#
#  No necesita instalar nada: PowerShell ya viene en Windows.
# ============================================================

# --- Configuracion ---
$Puerto = 9110
# Deja vacio para usar la impresora predeterminada de Windows.
# Si quieres forzar una, escribe el nombre exacto entre comillas, ej:
# $Impresora = "XP-80C"
$Impresora = ""
# Pin del cajon. Casi siempre 0. Si el cajon NO abre, cambia a 1.
$PinCajon = 0

# --- Codigo para mandar bytes crudos (RAW) a la impresora ---
$src = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFO di);
    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static bool Send(string printerName, byte[] bytes) {
        IntPtr h;
        if (!OpenPrinter(printerName, out h, IntPtr.Zero)) return false;
        DOCINFO di = new DOCINFO();
        di.pDocName = "CajonMonedero";
        di.pDataType = "RAW";
        bool ok = false;
        if (StartDocPrinter(h, 1, di)) {
            if (StartPagePrinter(h)) {
                int w;
                ok = WritePrinter(h, bytes, bytes.Length, out w);
                EndPagePrinter(h);
            }
            EndDocPrinter(h);
        }
        ClosePrinter(h);
        return ok;
    }
}
"@
Add-Type -TypeDefinition $src -Language CSharp

function Get-ImpresoraDestino {
    if ($script:Impresora -and $script:Impresora.Trim() -ne "") { return $script:Impresora }
    try {
        $d = Get-CimInstance -ClassName Win32_Printer -Filter "Default = True" -ErrorAction Stop
        if ($d) { return $d.Name }
    } catch {}
    return $null
}

function Abrir-Cajon {
    $imp = Get-ImpresoraDestino
    if (-not $imp) { Write-Host "[!] No hay impresora predeterminada." -ForegroundColor Red; return }
    # ESC p m t1 t2  -> abre el cajon (m = pin)
    $bytes = [byte[]](0x1B, 0x70, [byte]$PinCajon, 0x19, 0xFA)
    $ok = [RawPrinter]::Send($imp, $bytes)
    if ($ok) { Write-Host ("[OK] Cajon abierto ({0})" -f $imp) -ForegroundColor Green }
    else     { Write-Host ("[!] No se pudo enviar a '{0}'" -f $imp) -ForegroundColor Red }
}

# --- Servidor local ---
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Puerto/")
try {
    $listener.Start()
} catch {
    Write-Host "[!] No se pudo iniciar en el puerto $Puerto. Cierra otra copia de este ayudante." -ForegroundColor Red
    Read-Host "Enter para salir"
    exit 1
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Ayudante del cajon monedero ACTIVO" -ForegroundColor Cyan
Write-Host " Escuchando en http://127.0.0.1:$Puerto/" -ForegroundColor Cyan
Write-Host " Impresora: $(Get-ImpresoraDestino)" -ForegroundColor Cyan
Write-Host " Puedes minimizar esta ventana. NO la cierres." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $ruta = $ctx.Request.Url.AbsolutePath.ToLower()
        if ($ruta -eq "/kick" -or $ruta -eq "/abrir") {
            Abrir-Cajon
        }
        $resp = $ctx.Response
        $resp.Headers.Add("Access-Control-Allow-Origin", "*")
        $buf = [System.Text.Encoding]::UTF8.GetBytes("ok")
        $resp.ContentLength64 = $buf.Length
        $resp.OutputStream.Write($buf, 0, $buf.Length)
        $resp.OutputStream.Close()
    } catch {
        # cualquier error de una peticion no debe tumbar el servidor
    }
}
