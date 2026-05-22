namespace Alamida.Monitoring.Core.Models;

public sealed class AutoUpdateConfig
{
    /// <summary>Git-Update beim Start prüfen und bei Bedarf anwenden.</summary>
    public bool Enabled { get; set; } = true;

    public bool CheckOnStartup { get; set; } = true;

    /// <summary>Leer = automatisch (.git im übergeordneten Pfad suchen).</summary>
    public string RepoRoot { get; set; } = "";

    public string Branch { get; set; } = "main";
}
