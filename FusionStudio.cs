using System;
using System.Diagnostics;
using System.IO;

// Fusion Studio launcher — starts the web server and opens the browser.
class FusionStudio
{
    static string Repo;
    static int Main()
    {
        try { Repo = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory); }
        catch { Repo = AppDomain.CurrentDomain.BaseDirectory; }

        if (!File.Exists(Path.Combine(Repo, "server", "index.js")))
        {
            Console.WriteLine("ERROR: keep FusionStudio.exe in the fusion-studio folder (where server/index.js is).");
            Pause();
            return 1;
        }

        Console.WriteLine("=== FUSION STUDIO ===");
        Console.WriteLine("Starting web server at http://127.0.0.1:3090");
        Console.WriteLine("A terminal opens with the server. Close it to stop.");
        Console.WriteLine();

        try
        {
            ProcessStartInfo server = new ProcessStartInfo("cmd.exe", "/k cd /d \"" + Repo + "\" && node server/index.js");
            server.UseShellExecute = true;
            server.WorkingDirectory = Repo;
            Process.Start(server);

            System.Threading.Thread.Sleep(2000);
            Process.Start(new ProcessStartInfo("http://127.0.0.1:3090") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Console.WriteLine("Could not start: " + ex.Message);
            Pause();
            return 1;
        }
        return 0;
    }
    static void Pause() { Console.WriteLine("Press any key..."); try { Console.ReadKey(); } catch { } }
}
